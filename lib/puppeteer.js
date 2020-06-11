'use strict';

const debug = require('debug')('hmpo:journey-tester:puppeteer');
const fs = require('fs');

class PuppeteerDriver {
    constructor(config) {
        this.config = config;
    }

    async create() {
        debug('Creating browser');
        const puppeteer = require('puppeteer');
        this.browser = await puppeteer.launch(this.config);
        const pages = await this.browser.pages();
        this.page = pages.length ? pages[0] : await this.browser.newPage();

        await this.page.setBypassCSP(true);

        if (this.config.disableImages || this.config.disableCSS || this.config.disableAnalytics) {
            await this.page.setRequestInterception(true);
            this.page.on('request', req => {
                if (this.config.disableImages && req.url.match(/\.(png|jpg|svg)(\?|$)/)) return req.abort();
                if (this.config.disableCSS && req.url.match(/\.css(\?|$)/)) return req.abort();
                if (this.config.disableAnalytics && req.url.match(/\/collect(\?|$)/)) return req.abort();
                req.continue();
            });
        }

        if (this.config.disableJavascript) {
            await this.page.setJavaScriptEnabled(false);
        }
    }

    async captureHtml(filename) {
        debug('Writing page HTML to file');
        let html = await this.page.content();
        await fs.promises.writeFile(filename, html, { encoding: 'utf8' });
    }

    async captureScreenshot(filename) {
        debug('Capturing screenshot');
        let pageSize = await this.page.evaluate(() => {
            /* global document */
            var html = document.getElementsByTagName('html')[0];
            return {
                height: html.offsetHeight,
                width: html.offsetWidth
            };
        });
        await this.page.setViewport(pageSize);
        await this.page.screenshot({path: filename, fullPage: true});
    }

    async getElementValue(selector) {
        return await this.page.$eval(selector, el => el.value !== undefined ? el.value : el.innerText);
    }

    async getElementExists(selector) {
        const element = await this.page.$(selector);
        if (element) {
            element.dispose();
            return true;
        }
    }

    async setElementValue(selector, value, selectBox) {
        const element = await this.page.$(selector);

        if (typeof value === 'boolean') {
            await element.click();
        } else if (selectBox) {
            await element.select(value);
        } else {
            const inputType = await this.page.$eval(selector, input => input.type);
            if (inputType === 'file') {
                await element.uploadFile(value);
            } else {
                await this.page.focus(selector);
                await element.type(value);
            }
        }
        await element.dispose();
    }

    async clickElement(selector) {
        const element = await this.page.$(selector);
        await element.click();
    }

    async axe(options) {
        debug('Running Axe');
        const { AxePuppeteer } = require('axe-puppeteer');
        return await new AxePuppeteer(this.page)
            .options(options)
            .analyze();
    }

    async setViewport(viewport) {
        await this.page.setViewport(viewport);
    }

    async goto(url) {
        await this.page.goto(url);
    }

    async getUrl() {
        return await this.page.url();
    }

    async waitFor(type = 'load', timeout = 30000) {
        switch (type) {
        case 'load':
        case 'navigate':
            debug('Waiting for page load');
            await this.page.waitForNavigation({ timeout, waitUntil: 'load' });
            break;
        case 'idle':
            debug('Waiting for network idle');
            await this.page.waitForNavigation({ timeout, waitUntil: 'networkidle2' });
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
        if (!this.browser) return;
        debug('Closing browser');
        await this.browser.close();
    }
}

module.exports = PuppeteerDriver;