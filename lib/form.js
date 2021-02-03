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

        // use collected value if placehoder is specified
        const c = v => typeof v === 'string' ?
            v.replace(/\{\{\s*([^\s}]+)\s*\}\}/g, (match, name) => values[name]) : v;

        let filled = {};
        for (let field of Object.keys(fields)) {
            let selectBox = false;
            let value = fields[field];

            if (value === null) continue;

            try {
                if (typeof value === 'string') {
                    value = c(value);
                } else if (Array.isArray(value)) {
                    // field = field + '-' + c(value[0]) + '-label';
                    field = 'input[name=' + JSON.stringify(field.replace('#', '')) + ']' +
                        '[value=' + JSON.stringify(c(value[0])) + ']+label';
                    value = true;
                } else if (typeof value === 'object') {
                    let target = Object.keys(value)[0];
                    value = c(value[target]);
                    if (target === 'select') {
                        selectBox = true;
                    } else {
                        field = field + '[' + target + '=' + JSON.stringify(String(value)) + ']';
                        value = true;
                    }
                }

                debug('fill field', field, value);
                await this.driver.setElementValue(field, value, selectBox);
                debug('field filled', field, value);

                filled[field] = value;
            } catch (e) {
                debug('Unable to fill', field, value, e);
            }

        }
        return filled;
    }
}

module.exports = Form;