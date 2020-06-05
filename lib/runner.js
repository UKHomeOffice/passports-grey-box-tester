'use strict';

const debug = require('debug')('hmpo:journey-runner');

const puppeteer = require('puppeteer');
const url = require('url');
const path = require('path');
const fs = require('fs');
const deepCloneMerge = require('deep-clone-merge');

const Lifecycle = require('./lifecycle');

function loadConfig(filenames) {
    let basePath;

    let config = filenames.reduce((config, filename) => {
        filename = path.resolve(filename);
        basePath = path.posix.dirname(path.posix.resolve(filename));
        try {
            let fileData = fs.readFileSync(filename);
            return deepCloneMerge(config, JSON.parse(fileData, (key, value) =>
                typeof value === 'string' && value.startsWith('file://')
                    ? path.join(basePath, value.slice(7))
                    : value
            ));
        } catch (e) {
            throw new Error('Error reading config file: ' + filename + ':\n' + e.message);
        }
    }, {});

    config.basePath = basePath;
    return config;
}

async function report(filename, page, data) {
    let type = data.error ? 'error' : 'success';

    debug('Writing data to file');
    if (data.error instanceof Error) data.error = data.error.message;
    fs.writeFileSync(`${filename}-${type}.json`, JSON.stringify(data, null, 2), { encoding: 'utf8' });

    if (type === 'error') {
        debug('Writing failed page HTML to file');
        let html = await page.content();
        fs.writeFileSync(`${filename}-${type}.html`, html, { encoding: 'utf8' });
    }

    debug('Capturing screenshot');
    await page.screenshot({path: `${filename}-${type}.png`, fullPage: true});
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
        if (!fs.existsSync(config.reportsDirectory)) {
            fs.mkdirSync(config.reportsDirectory);
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

    let data;
    try {
        await lifecycle.run();
    } finally {
        data = lifecycle.toJSON();

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

    return data;
}

module.exports = runner;
module.exports.runner = runner;
module.exports.loadConfig = loadConfig;
