'use strict';

const debug = require('debug')('hmpo:journey-tester:webdriver');

const fs = require('fs');
const axeWebDriverIO = require('./axe-webdriverio');

class WebDriver {
    constructor(config, logger = console) {
        this.config = config;
        this.logger = logger;
    }

    async create() {
        debug('Creating browser');
        const WebDriverIO = require('webdriverio');
        this.browser = await WebDriverIO.remote(this.config);
    }

    async captureHtml(filename) {
        debug('Writing page HTML to file');
        let html = await this.browser.getPageSource();
        await fs.promises.writeFile(filename, html, { encoding: 'utf8' });
    }

    async captureScreenshot(filename) {
        debug('Capturing screenshot');
        let pageSize = await this.browser.execute(function () {
            /* global document */
            var html = document.getElementsByTagName('html')[0];
            return {
                height: html.offsetHeight,
                width: html.offsetWidth
            };
        });
        let originalSize = await this.browser.getWindowSize();
        await this.browser.setWindowSize(pageSize.width, pageSize.height);
        await this.browser.saveScreenshot(filename);
        await this.browser.setWindowSize(originalSize.width, originalSize.height);
    }

    async getElementValue(selector) {
        const element = await this.browser.$(selector);
        return await element.getValue() || await element.getText();
    }

    async getElementExists(selector) {
        try {
            debug('getElementExists', selector);
            const elements = await this.browser.$$(selector);
            return !!elements.length;
        } catch (e) {
            this.logger.error('getElementExists ERROR' + e);
        }
    }

    async setElementValue(selector, value) {
        const element = (await this.browser.$$(selector))[0];
        if (!element) throw new Error('Element not found: ' + selector);
        const inputType = await element.getProperty('type').toLowerCase();

        await this.page.focus(selector);
        if (inputType === 'radio' || inputType === 'checkbox') {
            await element.click();
        } else if (inputType === 'text' || inputType === 'email' || inputType === 'tel' || inputType == 'number') {
            await element.setValue(value);
        } else if (inputType === 'file') {
            const remoteFileName = await this.browser.uploadFile(value);
            await element.setValue(remoteFileName);
        } else if (inputType === 'select-one') {
            await element.selectByAttribute('value', value);
        } else {
            debug('Input type not supported:', selector, inputType);
        }
    }

    async clickElement(selector) {
        const element = await this.browser.$$(selector)[0];
        if (!element) throw new Error('Element not found to click: ' + selector);
        await element.click();
    }

    async axe(options, config) {
        debug('Running Axe');
        return await axeWebDriverIO(this.browser, options, config);
    }

    async setViewport(viewport) {
        await this.browser.setWindowSize(viewport.width, viewport.height);
    }

    async goto(url) {
        await this.browser.url(url);
        await this.waitFor('load');
    }

    async getUrl() {
        return await this.browser.getUrl();
    }

    async waitFor(type = 'load', timeout = 30000) {
        switch (type) {
        case 'load':
        case 'idle':
            debug('Waiting for page load');
            await this.browser.waitUntil(() => this.getElementExists('body'), { timeout });
            break;
        default:
            timeout = type;
            debug(`Waiting ${timeout}ms`);
            await new Promise(resolve =>
                setTimeout(resolve, timeout)
            );
        }
    }

    async destroy() {
        debug('Closing browser');
        if (this.browser && this.browser.closeWindow) await this.browser.closeWindow();
    }
}

module.exports = WebDriver;