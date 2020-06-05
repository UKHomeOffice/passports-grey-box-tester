'use strict';

const debug = require('debug')('hmpo:journey-runner:form');

class Form {
    constructor(page) {
        this.page = page;
    }

    async navigate(navigateSelectors) {
        debug('navigate');
        let navigate;

        if (typeof navigateSelectors === 'string' || typeof navigateSelectors === 'boolean') {
            navigateSelectors = [ navigateSelectors ];
        }

        let selector;
        for (selector of navigateSelectors) {
            if (selector === false) {
                debug('no navigation click');
                return;
            }

            if (selector) {
                debug('looking for navigation selector', selector);
                navigate = await this.page.$(selector);
                if (navigate) break;
            }
        }

        if (!navigate) {
            throw new Error('No navigation selector found');
        }

        debug('navigating by clicking', selector);
        try {
            await navigate.click();
        } catch (e) {
            debug('navigation click error', selector, e);
        }
    }

    async fill(fields, values) {
        debug('fill');
        for (let field of Object.keys(fields)) {
            let value = fields[field];

            if (value === null) continue;

            debug('fill field', field, value);

            try {

                // use collected value if placehoder is specified
                if (typeof value === 'string') {
                    value.replace(/\{\{\s([^\s}]+)*\s*\}\}/g, (match, name) => values[name]);
                }

                if (typeof value !== 'string') {
                    field = field + '-' + value;
                }

                let element = await this.page.$(field);

                let inputType = await this.page.$eval(field, input => input.type);

                await this.page.focus(field);

                if (inputType === 'radio' || inputType === 'checkbox') {
                    await element.click();
                } else if (inputType === 'text' || inputType === 'email' || inputType === 'tel' || inputType == 'number') {
                    await element.type(value);
                } else if (inputType === 'file') {
                    await element.uploadFile(value);
                } else if (inputType === 'select-one') {
                    await this.page.select(field, value);
                } else if (inputType === 'select-multiple') {
                    debug('Select Multiple not supported');
                }
                await element.dispose();
            } catch (e) {
                debug('Unable to set form value', field, value);
            }

        }
    }
}

module.exports = Form;