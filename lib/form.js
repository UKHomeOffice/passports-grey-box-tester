const debug = require('debug')('hmpo:journey-runner:form');

class Form {

    async submit(page, routing) {
        debug('submit');
        let submit;
        let links = routing && routing.links;

        // Use submit from links if provided
        if (links && links.submit) {
            debug(`links.submit: ${links.submit}`);
            submit = await page.$(links.submit);
        }

        // Otherwise default to input
        if (!submit) {
            debug('input[submit]');
            submit = await page.$('input[type="submit"]');
        }

        // Or a link
        if (!submit) {
            debug('a.button');
            submit = await page.$('a.button');
        }


        if (submit) {
            await submit.click();
            // await page.waitForNavigation({waitUntil: 'networkidle'});
            await page.waitForNavigation({timeout: 30000});
            // await page.waitForNavigation();
        } else {
            debug('no link');
        }
    }

    async genericFormFiller(page) {
        debug('genericFormFiller');
        try {
            page.click('input[type="radio"]');
        } catch (e) {
            // ignore errors
        }

    }

    async customFormFiller(page, fields) {
        debug('customFormFiller');
        for (let field of Object.keys(fields)) {
            debug(`field: ${field}`);
            let value = fields[field];

            try {
                let inputType = await page.$eval(field, input => input.type);

                let element;
                element = await page.$(field);
                await page.focus(field);

                if (inputType === 'radio' || inputType === 'checkbox') {
                    await element.click();
                } else if (inputType === 'text' || inputType === 'email' || inputType === 'tel') {
                    await element.type(value);
                } else if (inputType === 'file') {
                    debug(value);
                    await element.uploadFile(value);
                } else if (inputType === 'select-one') {
                    await page.select(field, value);
                } else if (inputType === 'select-multiple') {
                    debug('Select Multiple not supported');
                }
                await element.dispose();
            } catch (e) {
                debug(e.message);
            }

        }
    }
}

module.exports = Form;