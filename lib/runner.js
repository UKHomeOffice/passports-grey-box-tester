'use strict';

const debug = require('debug')('hmpo:journey-tester:runner');
const url = require('url');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const deepCloneMerge = require('deep-clone-merge');
const pathToRegExp = require('path-to-regexp').pathToRegexp;
const Lifecycle = require('./lifecycle');

class Runner {
    constructor(logger) {
        this.logger = logger || console;
    }

    async create(config) {
        await this.destroy();

        if (config.browser.puppeteer) {
            const PuppeteerDriver = require('./puppeteer');
            this.driver = new PuppeteerDriver(config.browser, this.logger);
        }

        if (config.browser.webdriver) {
            const WebDriver = require('./webdriver');
            this.driver = new WebDriver(config.browser, this.logger);
        }

        if (!this.driver) throw new Error('No browser driver specified');

        await this.driver.create();
    }

    async report(reportPrefix, data) {
        debug('Writing data to file');
        const errorEncoder = (k, v) => v instanceof Error ? v.message : v;
        await fs.promises.writeFile(reportPrefix + '.json', JSON.stringify(data, errorEncoder, 2), { encoding: 'utf8' });
    }

    async run(config) {

        // allow specifying a list of static pages and build pages object from the array
        if (config.staticPages) {
            let page = config.staticPages.shift();
            config.start = page;
            while (page) {
                config.final = page;
                let nextPage = config.staticPages.shift() || false;
                config.pages[page] = deepCloneMerge({
                    navigate: nextPage
                }, config.pages[page]);
                page = nextPage;
            }
        }

        // process urls
        config.url = url.parse(config.url);
        config.start = url.parse(url.resolve(config.url.href, config.start));
        config.final = url.parse(url.resolve(config.url.href, config.final));

        // allow origin host
        config.allowedHosts.push(config.url.host);

        // create report directory
        if (config.reportDir) {
            await mkdirp(config.reportDir);
            config.reportPrefix = path.resolve(config.reportDir, new Date().toISOString().replace(/([-:Z]|\..*)/g, '').replace('T', '-'));
        }

        // compile paths
        for (let key in config.pages) {
            config.pages[key].pagePattern = key;
            config.pages[key].pageRegExp = pathToRegExp(key);
        }
        config.exitPaths = config.exitPaths.map(path => {
            var pathUrl = url.parse(path);
            return {
                host: pathUrl.host,
                path: pathUrl.path,
                pathRe: pathToRegExp(pathUrl.path)
            };
        });

        const lifecycle = new Lifecycle(config, this.driver, this.logger);

        let data;
        try {
            debug('Running');
            await lifecycle.run();
        } finally {
            debug('Finally');
            data = lifecycle.toJSON();

            if (data.errors) this.logger.error(config.verbose ? data.errors : data.errors.map(v => v.message));

            if (config.reportDir) await this.report(config.reportPrefix, data);

            // if not in headless mode, pause on last screen
            if (!config.browser.headless && config.lastPagePause) {
                debug('Pausing on last page');
                await (() => new Promise(resolve => setTimeout(resolve, config.lastPagePause)))();
            }
        }
        return data;
    }

    async destroy() {
        debug('Destroy');
        if (!this.driver) return;
        await this.driver.destroy();
        this.driver = null;
    }
}

module.exports = Runner;
