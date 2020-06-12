const browserstack = require('browserstack-local');


module.exports = {
    bsLocal: null,

    start(config) {
        console.log('Connecting browserstack local');
        return new Promise((resolve, reject) => {
            if (this.bsLocal) return resolve(this);
            let options = Object.assign({
                key: config.key,
                force: true,
                forceLocal: true
            }, config.bsLocalOptions);
            this.bsLocal = new browserstack.Local();
            this.bsLocal.start(options, error => {
                if (error) return reject(error);
                console.log('Connected browserstack local');
                resolve(this);
            });
        });
    },

    stop() {
        return new Promise(resolve => {
            if (!this.bsLocal) return resolve();
            this.bsLocal.stop(() => {
                this.bsLocal = null;
                console.log('Disconnected browserstack local');
                resolve();
            });
        });
    }
};
