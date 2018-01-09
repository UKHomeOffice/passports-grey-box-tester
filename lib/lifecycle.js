'use strict';

const url = require('url');
const _ = require('lodash');

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
    }

    delay(timeout) {
        debug('delay', timeout);
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
        let pageConfig = _.find(this.config.pages, (value, key) => {
            return pathToRegExp(key).exec(pageUrl.path);
        });
        return _.extend(
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
        debug('checkIfMaxTriesReached tries:', tries.length);
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

    async processPage(finished) {
        try {
            let pageUrl = url.parse(await this.page.url());

            let timestamp = new Date();
            let time = this.lastTimestamp ? timestamp - this.lastTimestamp : 0;
            this.lastTimestamp = timestamp;

            console.log(`${time}ms\t${pageUrl.href}`);

            // add to report
            let report = {
                time,
                url: pageUrl.href,
            };
            this.report.push(report);

            // get config for this page
            let pageConfig = this.findPageConfig(pageUrl);

            // delay if we are still on the same page
            if (pageConfig.url.href === _.last(this.history)) {
                await this.delay(pageConfig.retryTimeout);
            }

            // check if we have fallen off the allowed hosts
            this.checkAllowedHost(pageConfig);

            // collect data from this page
            let collectedValues = await this.collectValues(pageConfig);
            report.collect = collectedValues;
            _.extend(this.values, collectedValues);

            // check if we have reached the final page
            if (this.isFinalPage(pageConfig)) {
                debug('FINAL PAGE');
                return finished();
            }

            // check if we need to abort
            this.checkIfExitPage(pageConfig);
            this.checkIfMaxTriesReached(pageConfig);

            // fill and submit
            let form = new Form(this.page);

            if (pageConfig.slowMo) await this.delay(pageConfig.slowMo / 2);
            await form.fill(pageConfig.fields);

            if (pageConfig.slowMo) await this.delay(pageConfig.slowMo / 2);
            await form.submit(pageConfig.submit, pageConfig.submitTimeout);

            // add this page visit to history
            this.history.push(pageUrl.href);
        } catch (e) {
            debug('Catching lifecycle error', e);
            this.error = e;
            return finished();
        }
    }

    run() {
        return new Promise(resolve => {
            debug('Run', this.config.start.href);

            try {
                this.page.on('load', () => this.processPage(resolve) );

                this.page.goto(this.config.start.href);

            } catch (e) {
                debug('Catching lifecycle error', e);
                this.error = e;
            }
        });
    }
}

module.exports = LifeCycle;