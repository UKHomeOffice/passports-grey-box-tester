'use strict';

const debug = require('debug')('hmpo:journey-tester:selenium');

const {Builder, By} = require('selenium-webdriver');
const fs = require('fs');
const url = require('url');
const http = require('http');
const https = require('https');

class WebDriver {
    constructor(config, logger = console) {
        this.config = config;
        this.logger = logger;
    }

    async create() {
        debug('Creating browser');
        if (this.config.startBrowserStackLocal) {
            this.bsLocal = await require('./browserstack').start(this.config);
        }

        let server = this.config.server;
        let agent;
        if (server) {
            server = url.parse(server);
            if (this.config.user) server.auth = this.config.user + (this.config.key ? ':' + this.config.key : '');
            server.protocol = this.config.protocol || server.protocol || 'https';
            agent = server.protocol === 'https' ? new https.Agent({ keepAlive: true }) : new http.Agent({ keepAlive: true });
            server.slashes = true;
            server = url.format(server);
        }

        let builder = new Builder();
        builder.withCapabilities(this.config.capabilities);
        if (server) {
            builder.usingHttpAgent(agent);
            builder.usingServer(server);
        }
        if (this.config.proxy) builder.usingWebDriverProxy(this.config.proxy);

        debug('Building driver');
        this.driver = await builder.build();
        debug('Driver built', this.driver);

        await this.driver.manage().setTimeouts({
            implicit: this.config.timeout || 30000,
            pageLoad: this.config.pageLoadTimeout || this.config.timeout || 30000,
            script: this.config.scriptTimeout || this.config.timeout || 30000
        });
        await this.driver.manage().deleteAllCookies();
        await this.driver.manage().window().maximize();

        const remote = require('selenium-webdriver/remote');
        this.driver.setFileDetector(new remote.FileDetector);
    }

    async captureHtml(filename) {
        debug('Writing page HTML to file');
        let html = await this.driver.getPageSource();
        await fs.promises.writeFile(filename, html, { encoding: 'utf8' });
    }
    async captureScreenshot(filename) {
        debug('Capturing screenshot');
        let base64Screenshot = await this.driver.takeScreenshot();
        await fs.promises.writeFile(filename, Buffer.from(base64Screenshot, 'base64'));
    }

    async getElementValue(selector) {
        const element = await this.driver.findElement(By.css(selector));
        return await element.getAttribute('value') || await element.getText();
    }

    async getElementExists(selector) {
        try {
            debug('getElementExists', selector);
            const elements = await this.driver.findElements(By.css(selector));
            return !!elements.length;
        } catch (e) {
            this.logger.error('getElementExists ERROR' + e);
        }
    }

    async setElementValue(selector, value, selectBox) {
        if (selectBox) {
            if (typeof value === 'number') {
                selector += ' option:nth-child(' + value + ')';
            } else {
                selector += ' option[value=' + JSON.stringify(String(value)) + ']';
            }
            value = true;
        }
        const element = (await this.driver.findElements(By.css(selector)))[0];
        if (!element) throw new Error('Element not found: ' + selector);
        debug('Setting element', selector, value);

        if (typeof value === 'boolean') {
            await element.click();
        } else {
            await element.sendKeys(value);
        }
    }

    async clickElement(selector) {
        const element = (await this.driver.findElements(By.css(selector)))[0];
        if (!element) throw new Error('Element not found to click: ' + selector);
        await element.click();
    }

    async axe(options) {
        debug('Running Axe');
        const AxeBuilder = require('axe-webdriverjs');
        return await AxeBuilder(this.driver)
            .options(options)
            .analyze();
    }

    async setViewport(viewport) {
        await this.driver.manage().window().setRect(viewport);
    }

    async goto(url) {
        await this.driver.get(url);
        await this.waitFor();
    }

    async getUrl() {
        return this.currentUrl = await this.driver.getCurrentUrl();
    }

    async waitFor(type = 'load', timeout = 30000) {
        switch (type) {
        case 'load':
        case 'idle':
            debug('Waiting for page load');
            await this.driver.wait(() => this.driver.executeScript(
                'return document.readyState === "complete" && ' +
                '!!document.body.innerHTML'), timeout);
            break;
        case 'navigate':
            debug('Waiting for page navigate');
            await this.driver.wait(() => this.driver.executeScript(
                'return document.readyState === "complete" && ' +
                'window.location.href !== ' + JSON.stringify(this.currentUrl) + '&& ' +
                '!!document.body.innerHTML'), timeout);
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
        if (this.driver) this.driver.quit();
        if (this.bsLocal) await this.bsLocal.stop();
    }
}

module.exports = WebDriver;