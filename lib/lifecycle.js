'use strict';

const debug = require('debug')('hmpo:journey-tester:lifecycle');
const url = require('url');
const _ = require('lodash');
const deepCloneMerge = require('deep-clone-merge');
const Form = require('./form');

class LifeCycle {
    constructor(config, driver, logger) {
        this.config = config;
        this.driver = driver;
        this.logger = logger;
        this.history = [];
        this.report = [];
        this.values = config.values || {};
        this.errors = [];
    }

    async capture(pageUrl) {
        if (!this.config.reportPrefix) return;

        let filename = this.config.reportPrefix + pageUrl.pathname.replace(/[/:?$\\]/g, '-');

        await this.driver.captureHtml(filename + '.html');
        await this.driver.captureScreenshot(filename + '.png');
    }

    toJSON() {
        return {
            report: this.report,
            values: this.values,
            errors: this.errors.length ? this.errors : null
        };
    }

    findPageConfig(pageUrl) {
        debug('findPageConfig', pageUrl.pathname);
        let pageConfig = _.find(this.config.pages, value => value.pageRegExp.test(pageUrl.pathname));
        pageConfig = deepCloneMerge.extend(
            {
                url: pageUrl
            },
            this.config.defaults,
            pageConfig
        );
        return pageConfig;
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
        let exitPage = _.find(this.config.exitPaths, path => {
            return pageConfig.url.host === path.host && path.pathRe.test(pageConfig.url.pathname);
        });
        if (exitPage) {
            throw new Error(`Exit page found at ${pageConfig.url.href}`);
        }
    }

    async checkIfErrorPage(pageConfig) {
        debug('checkIfErrorPage');
        for (let selector of pageConfig.errorPages) {
            let isError = await this.driver.getElementExists(selector);
            if (isError) throw new Error(`Error element ${selector} found at ${pageConfig.url.href}`);
        }
    }

    async collectValues(pageConfig) {
        let collect = pageConfig.collect;
        if (!collect) return;
        debug('collecting', collect);

        let result = {};
        let key;
        for (key in collect) {
            result[key] = await this.driver.getElementValue(collect[key]);
            debug('collected', key, result[key]);
        }

        return result;
    }

    async axe(pageConfig, report) {
        debug('Running Axe');
        const results = await this.driver.axe(pageConfig.axe.options);
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
                        summary: node.failureSummary.replace(/^Fix .* of the following:\s+/, ''),
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

            var err = new Error('Axe analysis failed for page ' + results.url);
            if (pageConfig.axe.stopOnFail) throw err;

            this.errors.push(err);

            return errors;
        }
    }

    async processPage(pageUrl) {
        let pageConfig = this.findPageConfig(pageUrl);
        debug('processPage', pageConfig.url.pathname);

        let timestamp = new Date;
        let time = this.lastTimestamp ? timestamp - this.lastTimestamp : 0;
        this.lastTimestamp = timestamp;

        this.logger.log(`${time}ms\t${pageUrl.href}`);

        // add to report
        let report = {
            time,
            url: pageUrl.href,
        };
        this.report.push(report);

        // collect page screenshot
        if (pageConfig.screenshot) {
            await this.capture(pageUrl);
        }

        // check if we have fallen off the allowed hosts
        this.checkAllowedHost(pageConfig);

        // check if we need to abort
        this.checkIfExitPage(pageConfig, pageUrl);
        this.checkIfMaxTriesReached(pageConfig);

        // check if we have hit an error
        await this.checkIfErrorPage(pageConfig);

        // collect data from this page
        let collectedValues = await this.collectValues(pageConfig);
        report.collect = collectedValues;
        _.extend(this.values, collectedValues);

        // fun page function
        if (typeof pageConfig.fn === 'function') {
            await pageConfig.fn.call(this, pageConfig, this);
        }

        // run axe on this page
        if (this.config.axe && pageConfig.axe.run) {
            let axeErrors = await this.axe(pageConfig, report);
            if (axeErrors && pageConfig.axe.screenshot) await this.capture(pageUrl);
        }

        // check if we have reached the final page
        if (this.isFinalPage(pageConfig)) {
            debug('FINAL PAGE');
            return false;
        }

        // add this page visit to history
        this.history.push(pageUrl.href);

        // navigate to new page if specified
        if (typeof pageConfig.navigate === 'string') {
            let nextURL = url.parse(url.resolve(this.config.url.href, pageConfig.navigate));
            await this.driver.goto(nextURL.href);
            return true;
        }

        // fill form
        let form = new Form(this.driver);
        report.fields = await form.fill(pageConfig.fields, this.values);

        // navigate
        await form.navigate(pageConfig.navigate);

        // wait to complete navigation
        await this.driver.waitFor(pageConfig.waitFor);

        return true;
    }

    async run() {
        debug('Run', this.config.start.href);

        let pageUrl = this.config.start;

        try {
            if (this.config.browser.viewport) {
                await this.driver.setViewport(this.config.browser.viewport);
            }
            await this.driver.goto(this.config.start.href);
            pageUrl = url.parse(await this.driver.getUrl());
            while (await this.processPage(pageUrl)) {
                pageUrl = url.parse(await this.driver.getUrl());
            }
        } catch (e) {
            debug('Catching lifecycle error', e);
            this.errors.push(e);

            await this.capture(pageUrl);
        }
    }

}

module.exports = LifeCycle;