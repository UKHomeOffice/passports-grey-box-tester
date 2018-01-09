# passports-grey-box-tester
An ultra lightweight smoke tester for GDS based forms

This is an ultra lightweight smoke tester allowing you to run through multiple parts of your journey and validate that the end point was reached.

It assumes a number of defaults but can be overridden as required on a page/step basis. 

It is explicitly intended to be flexible - the same configuration should be run against multiple stages of deployment, e.g `integration`, `staging` and `production` without requiring any changes. This enables you to ensure that even with many microservices involved, that your key journey is still functional. Consider this your 100 000 feet view - anything more complicated than successfully reaching the end path should be considered for a more low level test. 

It is designed to target `passports-form-wizard` forms, but can be applied to similar GDS style pages.

# Technology
- Google Puppeteer    


# Config
A journey is a JSON file containing the following sections:

* `pages`
    - this is a keyed object with the key representing the path of a page
        - `fields` - this is a keyed object with selectors and values for those fields
            - `radiobuttons` & `checkboxes` ignore the value
            - `file inputs` use the value as a filename to upload, this is relative to the journey JSON file.
        - `submit`
            - submit button or continuation link selectors. If this is `false` the journey will wait to automatically navigate to the next page. This can also be an array of selectors or `false` to try in sequence.
        - `maxRetries`
            - The maximum number of times this path can be visited.
        - `retryTimeout`
            - Delay in miliseconds to wait if the new page is the same url as the old page. Defaults to 1 second.
        - `collect`
            - a keyed object mapping identifiers in the page to property values to be stored.
        - `navigationTimeout`
            - the maximum time in milliseconds to wait to progress to the next page. Defaults to 30 seconds.
        - slowMo
            - Delay in milliseconds around form filling and submission. Can help with seeing what is going on in non-headless mode. Can be overridden with the `--slowmo` command line option.
* host
    - A default hostname for the start and final paths. Defaults to `http://localhost`. Can be overridden with the `--host` command line option.
* start
    - the start path. Defaults to '/'
* final
    - the successful final path. Defaults to '/'
* `exitPaths`
    - if you have pages that are considered an error state, but are still on your site, define them here.
* `allowedHosts`
    - if you have any other hosts that are accessed as part of your journey (e.g. payment gateways)
* `defaults`
    - Any options you define here will apply to all `pages` unless overridden per page.
* headless
    - Run in headless mode. Can be overridden with `--headless` and `--no-headless`
* lastPagePause
    - Length of time in milliseconds to pause on the last page in non-headless mode
    
#Example Config
```
{
    "host": "http://www.myhost.com",
    "start": "/first-service/start",
    "final":"/end-service/confirmation"
    "pages": {
        "/start-service/page3": {
            "fields": {
                "#is-uk-application-false": "selected",
                "#country-of-application": "SY"
            }
        },
        "/middle-service/upload": {
            "fields": {
                "#filename":
                    "file://image.jpg"
            },
            "submit": false
        },
        "/middle-service/lots-of-buttons": {
            "submit": [
                "a.button-1",
                "input[type='submit']",
                false
            ]
        },
    },
    "allowedHosts": [
        "payment.int.example.org",
        "payment.staging.example.org",
        "offical-payment-provider.example.net"
    ],
    "defaults": {
        "maxRetries": 3,
        "retryTimeout": 10000,
        "slowMo": 500,
    }
}
``` 
    
# Usage
```
./cli.js --headless --slowmo 500 --journey ../scenarios/journey.json --host https://www.example.com
```

# TO DO

- run multiple journeys
