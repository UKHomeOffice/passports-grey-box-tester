#!/usr/bin/env node
'use strict';

/* eslint no-console: off */

const debug = require('debug')('hmpo:journey-runner:cli');

const _ = require('lodash');
const path = require('path');
const runner = require('./lib/runner');
const yargs = require('yargs');

(async function main() {
    let config = {};
    try {
        const argv = yargs
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
            .option('axe-abort', {
                alias: 'f',
                describe: 'Stop test as soon as there is an Axe error',
                type: 'boolean'
            })
            .option('verbose', {
                alias: 'v',
                describe: 'Verbose errors',
                type: 'boolean'
            })
            .demandCommand(1)
            .argv;

        // load config from file
        config = runner.loadConfig(argv._);

        // override config with cli options
        if (argv.url !== undefined) _.set(config, 'url', String(argv.url));
        if (argv.headless !== undefined) _.set(config, 'browser.headless', Boolean(argv.headless));
        if (argv.slowmo !== undefined) _.set(config, 'browser.slowMo', Number(argv.slowmo) || 0);
        if (argv.axe !== undefined) _.set(config, 'axe', Boolean(argv.axe));
        if (argv['axe-abort'] !== undefined) _.set(config, 'defaults.axe.stopOnFail', Boolean(argv['axe-abort']));
        if (argv.report) config.reportFilename = path.resolve(config.basePath, String(argv.report));
        if (argv.verbose) config.verbose = argv.verbose;

        let result = await runner(config, console);

        if (!result || result.error) process.exit(1);
    } catch (e) {
        debug('Catching cli error', e);
        console.error('CLI:', config.verbose ? e : e.message);
        process.exit(1);
    }
})();

