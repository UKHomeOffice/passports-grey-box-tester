'use strict';

const url = require('url');
const _ = require('lodash');
const deepCloneMerge = require('deep-clone-merge');
const debug = require('debug')('hmpo:journey-runner:lifecycle');
const Form = require('./form');
const pathToRegExp = require('path-to-regexp').pathToRegexp;
const { AxePuppeteer } = require('axe-puppeteer');

class LifeCycle {
    constructor(config, page, logger) {
        this.config = config;
        this.page = page;
        this.logger = logger;
        this.history = [];
        this.report = [];
        this.values = {};
        this.error = null;

        // compile paths
        _.each(this.config.pages, (value, key) => {
            value.pagePattern = key;
            value.pageRegExp = pathToRegExp(key);
        });
    }

    delay(timeout) {
        return new Promise(resolve =>
            setTimeout(resolve, timeout)
        );
    }

    toJSON() {
        return {
            report: this.report,
            values: this.values,
            error: this.error
        };
    }

    findPageConfig(pageUrl) {
        debug('findPageConfig', pageUrl.path);
        let pageConfig = _.find(this.config.pages, value => value.pageRegExp.exec(pageUrl.path));

        return deepCloneMerge(
            {
                url: pageUrl
            },
            this.config.defaults,
            pageConfig
        );
    }

    checkAllowedHost(pageConfig) {
        debug('checkAllowedHost');
        if (!this.config.allowedHosts.includes(pageConfig.url.host)) {
            throw new Error(`Host not allowed: ${pageConfig.url.href}`);
        }
    }

    isFinalPage(pageConfig) {
        let isFinal = pageConfig.url.href === this.config.final.href;
        debug('isFinalPage', isFinal);
        return isFinal;
    }

    checkIfMaxTriesReached(pageConfig) {
        debug('checkIfMaxTriesReached');

        if (pageConfig.pagePolling) return;

        let tries = this.history.filter(href => href === pageConfig.url.href);
        debug('checkIfMaxTriesReached tries:', tries.length, 'of', pageConfig.maxRetries);
        if (tries.length <= pageConfig.maxRetries) return;

        throw new Error(`Max tries reached at ${pageConfig.url.href}`);
    }

    checkIfExitPage(pageConfig) {
        debug('checkIfExitPage');
        let exitPage = _.find(this.config.exitPaths, value => {
            if (value === pageConfig.url.href) return true;
            if (this.config.url.host !== pageConfig.url.host) return false;
            let exitPath = url.parse(value).path;
            if (pathToRegExp(exitPath).exec(pageConfig.url.path)) return true;
        });
        if (exitPage) {
            throw new Error(`Exit page found at ${pageConfig.url.href}`);
        }
    }

    async checkIfErrorPage(pageConfig) {
        debug('checkIfErrorPage');
        for (let selector of pageConfig.errorPages) {
            let element = await this.page.$(selector);
            if (element) throw new Error(`Error element ${selector} found at ${pageConfig.url.href}`);
        }
    }

    async collectValues(pageConfig) {
        let collect = pageConfig.collect;
        if (!collect) return;
        debug('collecting', collect);

        let result = {};
        let key;
        for (key in collect) {
            result[key] = await this.page.$eval(collect[key], el => el.value !== undefined ? el.value : el.innerText);
            debug('collected', key, result[key]);
        }

        return result;
    }

    async axe(pageConfig, report) {
        debug('Running Axe');
        const results = await new AxePuppeteer(this.page)
            .options(pageConfig.axe.options)
            .analyze();
        let errors = results.violations;

        // filter out ignored errors
        errors = errors.filter(e => {
            let ignore = pageConfig.axe.ignore[e.id];
            if (!ignore) return true;
            let reHtml = ignore.html && new RegExp(ignore.html);
            let reSummary = ignore.summary && new RegExp(ignore.summary);
            let reTarget = ignore.target && new RegExp(ignore.target);
            e.nodes = e.nodes.filter(node =>
                (!reHtml || !reHtml.test(node.html)) &&
                (!reSummary || !reSummary.test(node.failureSummary)) &&
                (!reTarget || !reTarget.test(node.target.join(',')))
            );
            if (e.nodes.length) return true;
            debug('Ignoring axe error ' + e.id);
            return false;
        });

        // simplify errors
        if (pageConfig.axe.simple) {
            errors = errors.reduce((errors, error) => {
                error.nodes.forEach(node => {
                    errors.push({
                        id: error.id,
                        impact: error.impact,
                        summary: node.failureSummary.replace(/^Fix any of the following:\s+/, ''),
                        target: node.target.join(','),
                        html: node.html
                    });
                });
                return errors;
            }, []);
        }

        // log errors
        if (errors.length) {

            this.logger.error('Axe analysis errors:', errors);
            report.axe = errors;

            if (pageConfig.axe.stopOnFail) {
                throw new Error('Axe analysis failed for page ' + results.url);
            }
        }
    }

    async processPage() {
        let pageUrl = url.parse(await this.page.url());

        let timestamp = new Date();
        let time = this.lastTimestamp ? timestamp - this.lastTimestamp : 0;
        this.lastTimestamp = timestamp;

        this.logger.log(`${time}ms\t${pageUrl.href}`);

        // add to report
        let report = {
            time,
            url: pageUrl.href,
        };
        this.report.push(report);

        // get config for this page
        let pageConfig = this.findPageConfig(pageUrl);

        // check if we have fallen off the allowed hosts
        this.checkAllowedHost(pageConfig);

        // check if we have hit an error
        await this.checkIfErrorPage(pageConfig);

        // collect data from this page
        let collectedValues = await this.collectValues(pageConfig);
        report.collect = collectedValues;
        _.extend(this.values, collectedValues);

        // collect page screenshot
        if (pageConfig.screenshot && this.config.reportFilename) {
            let screenshotFilename = this.config.reportFilename + '-' + pageUrl.path.replace(/[/:?$\\]/g, '-') + '.png';
            await this.page.screenshot({path: screenshotFilename, fullPage: false});
        }

        // run axe on this page
        if (this.config.axe && pageConfig.axe.run) await this.axe(pageConfig, report);

        // check if we have reached the final page
        if (this.isFinalPage(pageConfig)) {
            debug('FINAL PAGE');
            return false;
        }

        // check if we need to abort
        this.checkIfExitPage(pageConfig);
        this.checkIfMaxTriesReached(pageConfig);

        // add this page visit to history
        this.history.push(pageUrl.href);

        let form = new Form(this.page);

        // fill form
        await form.fill(pageConfig.fields);

        // navigate
        await form.navigate(pageConfig.navigate);

        switch (pageConfig.waitFor) {
        case 'load':
            debug('Waiting for page load');
            await this.page.waitForNavigation({ timeout: pageConfig.navigateTimeout, waitUntil: 'load' });
            break;
        case 'idle':
            debug('Waiting for network idle');
            await this.page.waitForNavigation({ timeout: pageConfig.navigateTimeout, waitUntil: 'networkidle2' });
            break;
        default:
            debug(`Waiting ${pageConfig.waitFor}ms`);
            await this.delay(pageConfig.waitFor);
        }

        return true;
    }

    async run() {
        debug('Run', this.config.start.href);

        try {
            await this.page.goto(this.config.start.href);
            while (await this.processPage());
        } catch (e) {
            debug('Catching lifecycle error', e);
            this.error = e;
        }
    }
}

module.exports = LifeCycle;