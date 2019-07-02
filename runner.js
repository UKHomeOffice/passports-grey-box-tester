'use strict';

const puppeteer = require('puppeteer');
const debug = require('debug')('hmpo:journey-runner');
const Lifecycle = require('./lib/lifecycle');
const path = require('path');
const url = require('url');
const _ = require('lodash');

const fs = require('fs');
const promisify = require('util').promisify;
const readFile = promisify(fs.readFile);

async function report(filename, page, data) {
    let type = data.error ? 'error' : 'success';

    debug('Capturing screenshot');
    await page.screenshot({path: `${filename}-${type}.png`, fullPage: true});

    if (type === 'error') {
        debug('Writing failed page HTML to file');
        let html = await page.$eval('html', el => el.outerHTML);
        fs.writeFileSync(`${filename}-${type}.html`, html, { encoding: 'utf8' });
    }

    debug('Writing data to file');
    if (data.error instanceof Error) data.error = data.error.message;
    fs.writeFileSync(`${filename}-${type}.json`, JSON.stringify(data, null, 2), { encoding: 'utf8' });
}

module.exports = async options => {
    let timestamp = new Date().toISOString().replace(/:/g, '-');

    // load config from file
    let basePath = path.posix.dirname(path.posix.resolve(options.journey));
    let fileData = await readFile(path.posix.resolve(options.journey));
    let config = JSON.parse(fileData, (key, value) =>
        typeof value === 'string' && value.startsWith('file://')
            ? path.join(basePath, value.slice(7))
            : value
    );

    // set config defaults
    _.defaults(config, {
        host: 'http://localhost',
        start: '/',
        final: '/',
        headless: false,
        viewport: { width: 1000, height: 3000 },
        lastPagePause: 3000,
        exitPaths: [],
        allowedHosts: [],
        defaults: {},
        reportDir: path.resolve(path.dirname(options.journey), 'reports/'),
        reportFilename: timestamp
    });
    _.defaults(config.defaults, {
        retryTimeout: 1000,
        slowMo: 0,
        fields: {
            'input[type="radio"]': 'selected'
        },
        submit: [
            'button[type="submit"]',
            'input[type="submit"]',
            'a.button'
        ]
    });

    // override config with cli options
    if (options.headless !== undefined) config.headless = Boolean(options.headless);
    if (options.slowmo !== undefined) config.defaults.slowMo = Number(options.slowmo);
    if (options.host !== undefined) config.host = String(options.host);
    if (options.report !== undefined) config.reportFilename = String(options.report);

    config.host = url.parse(config.host);
    config.start = url.parse(url.resolve(config.host.href, config.start));
    config.final = url.parse(url.resolve(config.host.href, config.final));

    // allow origin host
    config.allowedHosts.push(config.host.host);

    // create reports directory
    config.reportDir = path.resolve(__dirname, config.reportDir);
    if (!fs.existsSync(config.reportDir)) {
        fs.mkdirSync(config.reportDir);
    }

    const browser = await puppeteer.launch({
        headless: config.headless,
        slowMo: config.slowMo
    });

    const page = await browser.newPage();
    await page.setViewport(config.viewport);
    const lifecycle = new Lifecycle(config, page);

    let data = {};

    try {
        debug('Lifecycle starting');
        await lifecycle.run();
        data = lifecycle.toJSON();

        // throw if there was a lifecycle error
        if (data.error) throw data.error;
    } catch (e) {
        if (e !== data.error) data.error = e;
        debug('Catching runner error', e);
    }

    let reportFilename = path.resolve(config.reportDir, config.reportFilename);
    console.log('Writing report to:', reportFilename);
    await report(reportFilename, page, data);

    // if not in headless mode, pause on last screen
    if (!config.headless) await (() => new Promise(resolve => setTimeout(resolve, config.lastPagePause)))();

    debug('Closing browser');
    await browser.close();

    return data;
};
