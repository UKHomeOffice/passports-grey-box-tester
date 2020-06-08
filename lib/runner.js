'use strict';

const debug = require('debug')('hmpo:journey-tester:runner');
const url = require('url');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const deepCloneMerge = require('deep-clone-merge');
const pathToRegExp = require('path-to-regexp').pathToRegexp;
const Lifecycle = require('./lifecycle');

function report(reportPrefix, data) {
    debug('Writing data to file');
    const errorEncoder = (k, v) => v instanceof Error ? v.message : v;
    fs.writeFileSync(reportPrefix + '.json', JSON.stringify(data, errorEncoder, 2), { encoding: 'utf8' });
}

async function runner(config, logger = { log: () => {}, error: () => {} }) {
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

    const PuppeteerDriver = require('./puppeteer');
    const driver = new PuppeteerDriver(config.browser);
    const lifecycle = new Lifecycle(config, driver, logger);

    let data;
    try {
        await driver.create();
        await lifecycle.run();
    } finally {
        data = lifecycle.toJSON();

        if (data.errors) logger.error(config.verbose ? data.errors : data.errors.map(v => v.message));

        if (config.reportDir) report(config.reportPrefix, data);

        // if not in headless mode, pause on last screen
        if (!config.browser.headless) {
            await (() => new Promise(resolve => setTimeout(resolve, config.lastPagePause)))();
        }

        await driver.destroy();
    }

    return data;
}

module.exports = runner;
