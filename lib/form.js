'use strict';

const debug = require('debug')('hmpo:journey-runner:form');

class Form {
    constructor(page) {
        this.page = page;
    }

    async submit(submitSelectors, timeout) {
        debug('submit');
        let submit;

        if (typeof submitSelectors === 'string' || typeof submitSelectors === 'boolean') {
            submitSelectors = [ submitSelectors ];
        }

        let submitSelector;
        for (submitSelector of submitSelectors) {
            if (submitSelector === false) {
                submit = false;
                break;
            }

            if (submitSelector) {
                debug('trying submit selector', submitSelector);
                submit = await this.page.$(submitSelector);
                if (submit) break;
            }
        }

        if (submit === undefined) {
            throw 'No continuation button or link found';
        }

        if (typeof submit === 'object') {
            debug('clicking');
            try {
                await submit.click();
            } catch (e) {
                debug('submit click error', e);
            }
            debug('navigating...');
        }

        await this.page.waitForNavigation({timeout: timeout || 30000});
    }

    async fill(fields) {
        debug('fill');
        for (let field of Object.keys(fields)) {
            let value = fields[field];
            debug('fill field', field, value);

            try {

                let element = await this.page.$(field);

                let inputType = await this.page.$eval(field, input => input.type);

                await this.page.focus(field);

                if (inputType === 'radio' || inputType === 'checkbox') {
                    await element.click();
                } else if (inputType === 'text' || inputType === 'email' || inputType === 'tel') {
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