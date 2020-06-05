#!/usr/bin/env node
'use strict';

/* eslint no-console: off */

const debug = require('debug')('hmpo:journey-runner:cli');

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const deepCloneMerge = require('deep-clone-merge');
const runner = require('./lib/runner');

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

const argv = require('yargs')
    .usage('Usage: $0 [options] config1.json [ config2.json ... ]')
    .option('url', {
        alias: 'u',
        describe: 'Base URL to run against',
        type: 'string'
    })
    .option('headless', {
        alias: 'h',
        describe: 'Run in headless mode',
        type: 'boolean'
    })
    .option('slowmo', {
        alias: 's',
        describe: 'Slow motion delay in ms',
        type: 'number'
    })
    .option('report', {
        alias: 'r',
        describe: 'Report filename',
        type: 'string',
    })
    .option('axe', {
        alias: 'a',
        describe: 'Run axe report on each page',
        type: 'boolean'
    })
    .option('verbose', {
        alias: 'v',
        describe: 'Verbose errors',
        type: 'boolean'
    })
    .demandCommand(1)
    .argv;

(async function main() {
    let config = {};
    try {
        // load config from file
        config = await loadConfig(argv._);

        // override config with cli options
        if (argv.url !== undefined) _.set(config, 'url', String(argv.url));
        if (argv.headless !== undefined) _.set(config, 'browser.headless', Boolean(argv.headless));
        if (argv.slowmo !== undefined) _.set(config, 'browser.slowMo', Number(argv.slowmo) || 0);
        if (argv.axe !== undefined) _.set(config, 'axe', Boolean(argv.axe));
        if (argv.report) config.reportFilename = path.resolve(config.basePath, String(argv.report));
        if (argv.verbose) config.verbose = argv.verbose;

        await runner(config, console);
    } catch (e) {
        debug('Catching cli error', e);
        console.error('CLI:', config.verbose ? e : e.message);
        process.exit(1);
    }
})();

