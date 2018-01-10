'use strict';

const url = require('url');
const _ = require('lodash');
const path = require('path');

const debug = require('debug')('hmpo:journey-runner:lifecycle');
const Form = require('./form');
const pathToRegExp = require('path-to-regexp');

class LifeCycle {
    constructor(config, page) {
        this.config = config;
        this.page = page;
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

        pageConfig = _.extend(
            {
                url: pageUrl
            },
            this.config.defaults,
            pageConfig
        );

        debug('findPageConfig found', pageConfig.pagePattern);

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
        let exitPage = _.find(this.config.exitPaths, value => {
            if (value === pageConfig.url.href) return true;
            if (this.config.host.host !== pageConfig.url.host) return false;
            let exitPath = url.parse(value).path;
            if (pathToRegExp(exitPath).exec(pageConfig.url.path)) return true;
        });
        if (exitPage) {
            throw new Error(`Exit page found at ${pageConfig.url.href}`);
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

    async processPage() {
        let pageUrl = url.parse(await this.page.url());

        let timestamp = new Date();
        let time = this.lastTimestamp ? timestamp - this.lastTimestamp : 0;
        this.lastTimestamp = timestamp;

        this.config.logger.log(`${time}ms\t${pageUrl.href}`);

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

        // collect data from this page
        let collectedValues = await this.collectValues(pageConfig);
        report.collect = collectedValues;
        _.extend(this.values, collectedValues);

        if (pageConfig.screenshot && this.config.reportFilename) {
            let screenshotFilename = this.config.reportFilename + pageUrl.path.replace(/[/:?$\\]/g, '-') + '.png';
            await this.page.screenshot({path: screenshotFilename, fullPage: false});
        }

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
            throw e;
        }
    }
}

module.exports = LifeCycle;