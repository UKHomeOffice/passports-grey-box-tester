const puppeteer = require('puppeteer');
const debug = require('debug')('hmpo:journey-runner');
const Lifecycle = require('./lib/lifecycle');
const lifecycle = new Lifecycle;
const path = require('path');

const fs = require('fs');
const promisify = require('util').promisify;
const readFile = promisify(fs.readFile);

module.exports = async (routingFilename, host) => {

    let basePath = path.posix.dirname(path.posix.resolve(routingFilename));
    let fileData = await readFile(path.posix.resolve(routingFilename));
    let routing = JSON.parse(fileData, (key, value) =>
        typeof value === 'string' && value.startsWith('file://')
            ? path.join(basePath, value.slice(7))
            : value
    );

    const startPath = routing.defaults.startPath;
    const endPath = routing.defaults.endPath;


    const config = {headless: false, slowMo: 0};
    const browser = await puppeteer.launch(config);

    if (!fs.existsSync('reports')) {
        fs.mkdirSync('reports');
    }

    const page = await browser.newPage();

    try {
        await page.goto(`${host}${startPath}`);

        let data = await lifecycle.start(routing, page, host, startPath, endPath);

        debug(`Data: ${JSON.stringify(data)}`);

        await page.screenshot({path: `reports/final-${new Date().toISOString()}.png`, fullPage: true});
    } catch (e) {
        debug('catching...');
        debug(e);
        await page.screenshot({path: `reports/error-${new Date().toISOString()}.png`, fullPage: true});
    }
    await browser.close();
};
