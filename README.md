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
        - `fields`- this is a keyed object with identifiers and values for those fields
            - `radiobuttons` & `checkboxes` ignore the value
            - `file inputs` use the value as a filename to upload, this is relative to the journey JSON file
        - `links`
            - submit links can be override here from the defaults
        - `polling`
            - enables / disables polling
        - `extract`
            - a keyed object mapping identifiers in the page to property values to be stored
* `exitPaths`
    - if you have pages that are considered the end of the journey, but are still on your site, define them here
* `allowedHosts`
    - if you have any other hosts that are accessed as part of your journey (e.g. payment gateways)
* `defaults`
    - `maxRetries`
    - `retryTimeout`
    - `startPath`
    - `endPath`
    
#Example Config
```
{
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
            "polling": true
                        
        },

    "allowedHosts": [
        "payment.int.example.org",
        "payment.staging.example.org",
        "offical-payment-provider.example.net"
    ],
    "defaults": {
        "maxRetries": 3,
        "retryTimeout": 10000,
        "startPath": "/first-service/start",
        "endPath":"/end-service/confirmation"
    }
}
``` 
    
# Usage
```
./cli.js --journey ../scenarios/journey.json --host https://www.example.com
```

# Glossary
- A step is a page with a number of fields
- A journey is a number of steps through a system. Journeys can be made up of other hourneys.

# TO DO

- run multiple journeys
- stuck page check
- retry check
- generate report
- cli
  - check config
  - run journey with config
