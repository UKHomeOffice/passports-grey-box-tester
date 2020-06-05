'use strict';

const debug = require('debug')('hmpo:journey-runner');

const puppeteer = require('puppeteer');
const url = require('url');
const path = require('path');
const fs = require('fs');
const promisify = require('util').promisify;
const writeFile = promisify(fs.writeFile);
const exists = promisify(fs.exists);
const mkdir = promisify(fs.mkdir);
const deepCloneMerge = require('deep-clone-merge');

const Lifecycle = require('./lifecycle');

async function report(filename, page, data) {
    let type = data.error ? 'error' : 'success';

    debug('Writing data to file');
    if (data.error instanceof Error) data.error = data.error.message;
    await writeFile(`${filename}-${type}.json`, JSON.stringify(data, null, 2), { encoding: 'utf8' });

    if (type === 'error') {
        debug('Writing failed page HTML to file');
        let html = await page.content();
        await writeFile(`${filename}-${type}.html`, html, { encoding: 'utf8' });
    }

    debug('Capturing screenshot');
    await page.screenshot({path: `${filename}-${type}.png`, fullPage: true});
}

module.exports = async (config, logger = { log: () => {}, error: () => {} }) => {
    // set config defaults
    config = deepCloneMerge({
        url: 'http://localhost',
        start: '/',
        final: '/',
        axe: false,
        lastPagePause: 3000,
        exitPaths: [],
        allowedHosts: [],
        viewport: { width: 1000, height: 3000 },
        browser: {
            headless: false
        },
        defaults: {
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
                stopOnFail: true,
                simple: true,
                ignore: {}
            }
        }
    }, config);

    config.url = url.parse(config.url);
    config.start = url.parse(url.resolve(config.url.href, config.start));
    config.final = url.parse(url.resolve(config.url.href, config.final));

    // allow origin host
    config.allowedHosts.push(config.url.host);

    // create report directory
    if (config.reportFilename) {
        // create reports directory
        config.reportsDirectory = path.dirname(config.reportFilename);
        if (! await exists(config.reportsDirectory)) {
            await mkdir(config.reportsDirectory);
        }
    }

    debug('Creating browser');
    const browser = await puppeteer.launch(config.browser);
    const pages = await browser.pages();
    const page = pages.length ? pages[0] : await browser.newPage();

    await page.setViewport(config.viewport);
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

    try {
        await lifecycle.run();
    } finally {
        let data = lifecycle.toJSON();

        if (data.error) logger.error(config.verbose ? data.error : data.error.message);

        if (config.reportFilename) {
            await report(config.reportFilename, page, data);
        }

        // if not in headless mode, pause on last screen
        if (!config.browser.headless) {
            await (() => new Promise(resolve => setTimeout(resolve, config.lastPagePause)))();
        }

        debug('Closing browser');
        await browser.close();
    }
};
