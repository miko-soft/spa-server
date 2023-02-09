# @mikosoft/spa-server
> - HTTP server for single page applications (angular, vue, react).
> - Proxy server to boost website SEO.


## Installation
```bash
$ npm install --save @mikosoft/spa-server
```

## Features
- no dependencies
- very fast
- simple to use
- define custom HTTP response headers (solve CORS)
- compress HTTP response (gzip or deflate)


## HTTP Server
Serve single page application on the HTTP server.
```js
const httpOpts = {
  staticDir: '/dist/angular-project',
  indexFile: 'index.html',
  port: process.env.PORT || 9000,
  timeout: 5 * 60 * 1000, // if 0 never timeout
  acceptEncoding: 'gzip', // gzip, deflate or ''
  headers: {
    // CORS Headers
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    'Access-Control-Allow-Methods': 'GET', // 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD',
    'Access-Control-Max-Age': '3600'
  },
  debug: false
};
const httpServer = new HTTPServer(httpOpts);
httpServer.start();
```


#### HTTP Server methods
- **start()** - start the HTTP server
- **stop()** - stop the HTTP server
- **restart()** - restart the HTTP server


## Proxy Server
Serve single page application via proxy server and boost the SEO.
Proxy Server is placed between client (browser) and HTTPServer.
```js
const main = async () => {
  const proxyOpts = {
    port: process.env.PORT || 9001,
    request_host: 'localhost',
    request_port: 9000,
    regexpUA: /Mozilla/,
    debug: true
  };
  const browserOpts = {
    headless: false,
    width: 1300,
    height: 900,
    position: '700,20'
  };

  const proxyServer = new ProxyServer(proxyOpts, browserOpts);

  await proxyServer.fetchPuppeteer(); // defines this.puppeteer
  await proxyServer.openBrowser();
  proxyServer.start();
};

main();
```


#### Proxy Server methods
- **fetchPuppeteer()** - get puppeteer npm library
- **openBrowser()** - open browser via the puppeteer
- **closeBrowser()** - close browser
- **start()** - start the Proxy server
- **stop()** - stop the Proxy server
- **restart()** - restart the Proxy server



### Licence
Copyright (C) 2023-present MikoSoft licensed under [MIT](./LICENSE) .
