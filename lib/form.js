'use strict';

const debug = require('debug')('hmpo:journey-tester:form');

class Form {
    constructor(driver) {
        this.driver = driver;
    }

    async navigate(navigateSelectors) {
        if (!navigateSelectors) return;

        debug('navigate');

        if (Array.isArray(navigateSelectors)) navigateSelectors = navigateSelectors.join(', ');

        debug('navigating by clicking', navigateSelectors);
        try {
            await this.driver.clickElement(navigateSelectors);
        } catch (e) {
            debug('navigation click error', navigateSelectors, e);
        }
    }

    async fill(fields, values) {
        debug('fill');
        for (let field of Object.keys(fields)) {
            let value = fields[field];

            if (value === null) continue;

            try {
                // use collected value if placehoder is specified
                if (typeof value === 'string') {
                    value.replace(/\{\{\s([^\s}]+)*\s*\}\}/g, (match, name) => values[name]);
                }

                if (typeof value !== 'string') {
                    field = field + '-' + value;
                }

                await this.driver.setElementValue(field, value);
                debug('fill field', field, value);

            } catch (e) {
                //
            }

        }
    }
}

module.exports = Form;