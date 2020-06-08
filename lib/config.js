'use strict';

const debug = require('debug')('hmpo:journey-tester:config');
const path = require('path');
const fs = require('fs');
const deepCloneMerge = require('deep-clone-merge');
const JSON5 = require('json5');

async function loadConfig(filenames) {

    // set config defaults
    const config = {
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
    };

    let basePath;

    const reviverFn = (key, value) =>
        typeof value === 'string' && value.startsWith('file://')
            ? path.join(basePath, value.slice(7))
            : value;

    for (let filename of filenames) {
        filename = path.resolve(filename);
        debug('Loading config file', filename);
        basePath = path.posix.dirname(path.posix.resolve(filename));
        try {
            let fileData = await fs.promises.readFile(filename);
            let configData = JSON5.parse(fileData, reviverFn);
            deepCloneMerge.extend(config, configData);
        } catch (e) {
            throw new Error('Error reading config file: ' + filename + ':\n' + e.message);
        }
    }

    config.basePath = basePath;

    return config;
}

module.exports = loadConfig;
