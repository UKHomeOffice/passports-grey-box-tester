'use strict';

const debug = require('debug')('hmpo:journey-runner');

const puppeteer = require('puppeteer');
const url = require('url');
const path = require('path');
const _ = require('lodash');
const fs = require('fs');
const promisify = require('util').promisify;
const writeFile = promisify(fs.writeFile);
const exists = promisify(fs.exists);
const mkdir = promisify(fs.mkdir);

const Lifecycle = require('./lib/lifecycle');

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

module.exports = async config => {
    _.defaults(config, {
        logger: { log: () => {}, error: () => {} },
        host: 'http://localhost',
        start: '/',
        final: '/',
        lastPagePause: 3000,
        exitPaths: [],
        allowedHosts: [],
        viewport: { width: 1000, height: 3000 },
        browser: {},
        defaults: {}
    });
    _.defaults(config.defaults, {
        maxRetries: 0,
        navigateTimeout: 30000,
        waitFor: 'load',
        fields: {
            'input[type="radio"]': 'selected'
        },
        navigate: [
            'button[type="submit"]',
            'input[type="submit"]',
            'a.button'
        ]
    });
    _.defaults(config.browser, {
        headless: false
    });

    // resolve urls
    config.host = url.parse(config.host);
    config.start = url.parse(url.resolve(config.host.href, config.start));
    config.final = url.parse(url.resolve(config.host.href, config.final));

    // allow origin host
    config.allowedHosts.push(config.host.host);

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

    const lifecycle = new Lifecycle(config, page);

    try {
        await lifecycle.run();
    } finally {
        let data = lifecycle.toJSON();

        if (data.error) config.logger.error(data.error);

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
