import puppeteer from 'puppeteer';
import { ProxyServer } from '../index.js';


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

  await proxyServer.injectPuppeteer(puppeteer); // defines this.puppeteer
  await proxyServer.openBrowser();
  proxyServer.start();
};

main();

/*
To test the proxy server properly:
1) start the HTTP Server with: $ node httpServer.js
2) start the Proxy Server in another terminal with: $ node proxyServer.js
*/

