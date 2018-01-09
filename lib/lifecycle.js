'use strict';

const url = require('url');
const _ = require('lodash');

const debug = require('debug')('hmpo:journey-runner:lifecycle');
const Form = require('./form');
const form = new Form;
const pathToRegExp = require('path-to-regexp');

class LifeCycle {
    analyseForAllowedHosts(page, origin, currentHost, allowedHosts) {
        debug('analyseForAllowedHosts');

        if (currentHost !== origin && !allowedHosts.includes(currentHost)) {
            throw new Error('Wrong host');
        }
    }

    isFinalStep(pageUrl, config) {
        debug('isFinalPage');
        debug(`${pageUrl.path} : ${config.endPath}, ${pageUrl.path === config.endPath}`);
        return pageUrl.path === config.endPath;
    }

    isExitStep(path, exitPaths) {
        debug('isExitPage');
        return exitPaths.includes(path);
    }

    async analyseForStuckStep(page, config, maxRetries, history) {
        debug('analyseForStuckPage');

        if (this.maxRetriesReached(config, maxRetries, history)) {
            throw new Error('Returned to page');
        }

        // let thisPagePolling = _.get(config, 'routing.polling', false);
        //
        // if (!thisPagePolling && history.filter(path => path === config.url.path).length > maxRetries)  {
        //     debug(JSON.stringify(config.history));
        //     throw new Error('Returned to page');
        // }
    }

    maxRetriesReached(config, maxRetries, history) {
        let thisPagePolling = _.get(config, 'routing.polling', false);

        if (!thisPagePolling && history.filter(path => path === config.url.path).length > maxRetries)  {
            return true;
        }

        return false;
    }

    async findRoutingConfig(page, routing) {
        let pageUrl = url.parse(await page.url());

        return _.find(routing.pages, (value, key) => {
            return pathToRegExp(key).exec(pageUrl.path);
        });
    }

    async collect(page, pageConfig) {
        return {};
    }

    async fill(page, pageConfig) {
        debug('fill');
        debug(pageConfig.fields);
        if (pageConfig.routing && pageConfig.routing.fields) {
            await form.customFormFiller(page, pageConfig.routing.fields);
        } else {
            await form.genericFormFiller(page);
        }

    }

    async submit(page, config, maxRetries, history) {
        try {
            await form.submit(page, config.routing);
        } catch (e) {
            if (this.maxRetriesReached(config, maxRetries, history)) {
                throw new Error('Returned to page via submit');
            }
        }
    }

    async start(routing, page, origin, startPath, endPath) {
        debug('start');
        let continueRun = true;
        let originHost = url.parse(origin).host;

        debug(originHost);

        let history = [];
        let collection = [];

        while (continueRun) {
            let data = {
                url: page.url(),
            };

            debug(data.url);
            collection.push(data);

            // console.log(data.url.path);
            history.push(url.parse(data.url).path);

            let config = {
                routing: await this.findRoutingConfig(page, routing),
                url: url.parse(await page.url())
            };

            this.analyseForAllowedHosts(page, originHost, config.url.host, routing.allowedHosts);

            await this.analyseForStuckStep(page, config, routing.defaults.maxRetries, history);

            if ( this.isExitStep(config.url.path, routing.exitPaths) ) {
                throw new Error(`Exit page found at ${config.url.path}`);
            }

            data.collect = await this.collect(config);

            if (await this.isFinalStep(url.parse(await page.url()), {endPath})) {
                debug('FINAL PAGE');
                return collection;
            }

            data.submit = await this.fill(page, config);
            await this.submit(page, config, routing.defaults.maxRetries, history);

            await this.delayIfRequired(page, config, routing.defaults.retryTimeout);
        }
    }

    async delayIfRequired(page, config, retryTimeout) {
        debug('delayIfRequired');

        let thisPagePolling = _.get(config, 'routing.polling', false);

        if (!thisPagePolling) return;

        debug(`delaying for ${retryTimeout}`);
        let delay = time =>
            new Promise(resolve =>
                setTimeout(resolve, time)
            );

        return delay(retryTimeout);
    }
}

module.exports = LifeCycle;