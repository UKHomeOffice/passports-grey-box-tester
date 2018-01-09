#!/usr/bin/env node
'use strict';

const debug = require('debug')('hmpo:journey-runner:cli');
const runner = require('./runner');

let argv = require('yargs')
    .command('--headless', 'Run in headless mode')
    .command('--journey <config>', 'specify the config', (yargs) => {
        yargs.positional('config', {
            describe: 'config file'
        });
    })
    .command('--host <host>', 'specify a host to run again', (yargs) => {
        yargs.positional('host', {
            describe: 'host',
            default: 'http://localhost:9001'
        });
    })
    .argv;

(async function run() {
    try {
        let data = await runner(argv);
        if (data.error) throw data.error;
    } catch (e) {
        debug('Catching cli error', e);
        console.error(e);
        process.exit(1);
    }

})();
