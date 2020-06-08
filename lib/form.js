'use strict';

const debug = require('debug')('hmpo:journey-tester:form');

class Form {
    constructor(driver) {
        this.driver = driver;
    }

    async navigate(navigateSelectors) {
        if (!navigateSelectors) return;

        debug('navigate');
        let navigate;

        if (!Array.isArray(navigateSelectors)) {
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
                navigate = await this.driver.getElementExists(selector);
                if (navigate) break;
            }
        }

        if (!navigate) {
            throw new Error('No navigation selector found');
        }

        debug('navigating by clicking', selector);
        try {
            await this.driver.clickElement(selector);
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

                await this.driver.setElementValue(field, value);

            } catch (e) {
                debug('Unable to set form value', field, value);
            }

        }
    }
}

module.exports = Form;