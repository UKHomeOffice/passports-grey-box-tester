module.exports = async function axeWebdriverIO(driver, options, config) {
    config = config || {
        branding: 'hmpo-journey-tester'
    };

    const axeScript = `(function(context, options, config) {
        var callback = arguments[arguments.length - 1];

        try {
            var script = document.createElement('script');
            script.setAttribute('crossorigin', 'anonymous');
            script.setAttribute('integrity', 'sha256-XDhCakYtcQtOpujvhE876/a4fUyZjiKtNn8xniP03Ek');
            script.setAttribute('src', 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/3.5.4/axe.min.js');
            document.head.appendChild(script);
        } catch(e) {
            return callback({ error: 'Error adding Axe script: ' + e.message });
        }

        function run() {
            try {
                if (config) window.axe.configure(config);
                window.axe.run(context || document, options || {}).then(callback);
            } catch (e) {
                return callback({ error: 'Error running Axe analyze: ' + e.message });
            }
        }

        var POLL = 100;
        var MAXPOLL = 10000;
        var time = 0;
        (function wait() {
            if (window.axe) return run();
            if (time > MAXPOLL) return callback({ error: 'Timeout waiting for Axe' });
            time += POLL;
            setTimeout(wait, POLL);
        })();
    }).apply(window, arguments);`;

    await driver.switchToFrame(null);
    let result = await driver.executeAsyncScript(axeScript, [undefined, options, config]);
    if (!result || result.error) throw new Error('Unable to run Axe:' + (result && result.error));
    return result;
};