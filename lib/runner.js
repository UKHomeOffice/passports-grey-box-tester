'use strict';

const debug = require('debug')('hmpo:journey-tester:runner');
const puppeteer = require('puppeteer');
const url = require('url');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const deepCloneMerge = require('deep-clone-merge');
const Lifecycle = require('./lifecycle');

function report(reportPrefix, data) {
    debug('Writing data to file');
    const errorEncoder = (k, v) => v instanceof Error ? v.message : v;
    fs.writeFileSync(reportPrefix + '.json', JSON.stringify(data, errorEncoder, 2), { encoding: 'utf8' });
}

async function runner(config, logger = { log: () => {}, error: () => {} }) {
    // set config defaults
    config = deepCloneMerge({
        url: 'http://localhost',
        start: '/',
        final: '/',
        axe: false,
        lastPagePause: 3000,
        exitPaths: [],
        allowedHosts: [],
        browser: {
            headless: false
        },
        defaults: {
            viewport: { width: 1024, height: 1000 },
            maxRetries: 0,
            navigateTimeout: 30000,
            waitFor: 'load',
            fields: {
                'input[type="radio"]': 'selected'
            },
            navigate: [
                'button[type="submit"]',
                'input[type="submit"]',
                'a.button',
                'button'
            ],
            axe: {
                run: true,
                stopOnFail: false,
                simple: true,
                ignore: {}
            }
        },
        pages: {}
    }, config);

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

    debug('Creating browser');
    const browser = await puppeteer.launch(config.browser);
    const pages = await browser.pages();
    const page = pages.length ? pages[0] : await browser.newPage();

    await page.setBypassCSP(true);

    if (config.disableImages || config.disableCSS || config.disableAnalytics) {
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (config.disableImages && req.url.match(/\.(png|jpg|svg)(\?|$)/)) return req.abort();
            if (config.disableCSS && req.url.match(/\.css(\?|$)/)) return req.abort();
            if (config.disableAnalytics && req.url.match(/\/collect(\?|$)/)) return req.abort();
            req.continue();
        });
    }

    if (config.disableJavascript) {
        await this.page.setJavaScriptEnabled(false);
    }

    const lifecycle = new Lifecycle(config, page, logger);

    let data;
    try {
        await lifecycle.run();
    } finally {
        data = lifecycle.toJSON();

        if (data.errors) logger.error(config.verbose ? data.errors : data.errors.map(v => v.message));

        if (config.reportDir) report(config.reportPrefix, data);

        // if not in headless mode, pause on last screen
        if (!config.browser.headless) {
            await (() => new Promise(resolve => setTimeout(resolve, config.lastPagePause)))();
        }

        debug('Closing browser');
        await browser.close();
    }

    return data;
}

module.exports = runner;
