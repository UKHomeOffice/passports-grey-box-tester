const browserstack = require('browserstack-local');


module.exports = {
    bsLocal: null,

    start(config) {
        console.log('Connecting browserstack local');
        return new Promise((resolve, reject) => {
            if (this.bsLocal) return resolve(this);
            this.bsLocal = new browserstack.Local();
            this.bsLocal.start({ key: config.key }, error => {
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
                resolve();
            });
        });
    }
};
