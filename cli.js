#!/usr/bin/env node
'use strict';

/* eslint no-console: off */

const debug = require('debug')('hmpo:journey-runner:cli');

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const promisify = require('util').promisify;
const readFile = promisify(fs.readFile);

const runner = require('./runner');

async function loadConfig(filename) {
    filename = path.resolve(filename);
    let basePath = path.posix.dirname(filename);
    let fileData = await readFile(filename);
    let config = JSON.parse(fileData, (key, value) =>
        typeof value === 'string' && value.startsWith('file://')
            ? path.join(basePath, value.slice(7))
            : value
    );
    return config;
}

async function main() {
    let argv = require('yargs')
        .command('--journey <config>', 'specify the config', (yargs) => {
            yargs.positional('journey');
        })
        .command('--host <host>', 'specify a host to run again', (yargs) => {
            yargs.positional('host');
        })
        .command('--headless', 'run in headless mode')
        .command('--slowmo <delay>', 'delay each action by this number of milliseconds', (yargs) => {
            yargs.positional('slowmo');
        })
        .argv;

    try {
        // load config from file
        let config = await loadConfig(argv.journey);

        // override config with cli options
        if (argv.host !== undefined) _.set(config, 'host', String(argv.host));
        if (argv.headless !== undefined) _.set(config, 'browser.headless', Boolean(argv.headless));
        if (argv.slowmo !== undefined) _.set(config, 'browser.slowMo', Number(argv.slowmo) || 0);

        const timestamp = new Date().toISOString().replace(/:/g, '-');
        config.reportFilename = argv.report ? String(argv.report) : `reports/${timestamp}`;

        // set console logger
        config.logger = console;

        await runner(config);
    } catch (e) {
        debug('Catching cli error', e);
        process.exit(1);
    }
}

main();
