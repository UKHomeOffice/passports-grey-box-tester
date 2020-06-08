'use strict';

const debug = require('debug')('hmpo:journey-tester:config');
const path = require('path');
const fs = require('fs');
const deepCloneMerge = require('deep-clone-merge');
const JSON5 = require('json5');

async function loadConfig(filenames) {
    let basePath;

    const reviverFn = (key, value) =>
        typeof value === 'string' && value.startsWith('file://')
            ? path.join(basePath, value.slice(7))
            : value;

    const config = {};
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
