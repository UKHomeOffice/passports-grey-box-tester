#!/usr/bin/env node
'use strict';
const debug = require('debug')('hmpo:journey-runner:cli');
const runner = require('./runner');

let argv = require('yargs')
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
        await runner(argv.journey, argv.host);
    } catch (e) {
        debug(e);
    }
})();