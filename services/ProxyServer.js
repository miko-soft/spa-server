import http from 'http';
import os from 'os';




/**
 * The Proxy Server which is standing between client (browser) and HTTPServer and in that way boosts the website SEO.
 * It converts Single Page Application to Server Side Rendered (SSR) Application.
 * NOTICE: Install puppeteer $ npm install puppeteer
 */
class ProxyServer {

  /**
   ** proxyOpts::
   * - port:number - proxy server port number
   * - request_host:string - HTTP server host, 127.0.0.1 or some domain
   * - request_port:number - HTTP server port, 4401
   * - regexpUA:RegExp - open URL via browser when user agent contains this regular expression, for example /Googlebot/ or /Googlebot|Mozilla/i
   * - debug:boolean - print debug messages
   * @param  {object} proxyOpts - proxy server options
   * @param {object} browserOpts - puppeteer options {headless:boolean, width:number, height:number, position:string} - {headless:true, width:1300, height:900, position:'700,20'}
   * @returns {void}
   */
  constructor(proxyOpts, browserOpts) {
    // options
    if (!proxyOpts) { throw new Error('Proxy Server options are not defined.'); }
    else if (!!proxyOpts && !proxyOpts.port) { throw new Error('The server "port" is not defined.'); }
    else if (!!proxyOpts && !proxyOpts.request_host) { proxyOpts.request_port = '127.0.0.1'; }
    else if (!!proxyOpts && !proxyOpts.request_port) { proxyOpts.request_port = 80; }
    else if (!!proxyOpts && !proxyOpts.regexpUA) { proxyOpts.regexpUA = /bot|spider|crawl|curl|lynx|wget/i; }
    this.proxyOpts = proxyOpts;

    this.browserOpts = browserOpts || { headless: true, width: 1300, height: 900, position: '0,0' };

    this.proxyServer;
    this.puppeteer;
  }


  /*** PROXY SERVER COMMANDS ***/
  /**
   * Start the HTTP Server
   */
  start() {
    // start Proxy Server and listen requests
    this.proxyServer = http.createServer(async (req, res) => {
      // get file extension
      const reqURL = req.url;
      const urlNoQuery = reqURL.trim().replace(/\?.+/, ''); // URL where query is removed, for example for example ?v=4.7.0
      const matched = urlNoQuery.match(/\.([^.]+)$/i);
      const fileExt = !!matched ? matched[1] : ''; // html, txt, css, js, png, ...

      // get useragent
      const userAgent = req.headers['user-agent'];

      let viaBrowser = false;
      if (!fileExt && this.proxyOpts.regexpUA.test(userAgent)) { // only when file extension doesn't exist for example /shop/product/21 AND when user-agent matched this.proxyOpts.regexp
        viaBrowser = true;

        // open URL in the proxy browser's tab
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: this.browserOpts.width, height: this.browserOpts.height });
        const url = `http://${this.proxyOpts.request_host}:${this.proxyOpts.request_port}${req.url}?fromproxy=yes`;
        await this.page.goto(url);
        const html = await this.page.content();
        await this.page.close();

        // send response to the client
        res.write(html, 'utf8');
        res.end();

        // close the proxy browser tab
        await new Promise(r => setTimeout(r, 400));
        // await this.page.close();

      } else {
        const requestOpts = {
          host: this.proxyOpts.request_host,
          port: this.proxyOpts.request_port,
          path: req.url,
          method: req.method,
          headers: req.headers
        };

        http.request(requestOpts, res2 => {
          res.writeHead(res2.statusCode, res2.headers);
          res2.pipe(res);
        }).end();
      }

      this._debugRequest(req, viaBrowser);
    });


    // configure Proxy Server
    this.proxyServer.listen(this.proxyOpts.port);


    // listen for server events
    this._onListening();
    this._onClose();
    this._onKILL();
    this._onError();
  }



  /**
   * Stop the Proxy Server
   */
  stop() {
    this.proxyServer.close();
    this.browser.close();
  }



  /**
   * Restart the Proxy Server
   */
  async restart() {
    this.stop();
    await new Promise(resolve => setTimeout(resolve, 2100));
    this.start();
  }



  /***** PUPPETEER - BROWSER *****/
  /**
   * Fetch puppeteer dynamically because we don't weant to install heavy puppetter lib if only HTTPServer is required.
   */
  async injectPuppeteer(puppeteer) {
    this.puppeteer = puppeteer;
  }

  /**
   * Open the browser via puppeteer
   */
  async openBrowser() {
    await this.closeBrowser(); // close already opened browser

    // define chrome executable path
    const osPlatform = os.platform(); // possible values are: 'darwin', 'freebsd', 'linux', 'sunos' or 'win32'
    let executablePath;
    if (/^win/i.test(osPlatform)) {
      executablePath = '';
    } else if (/^linux/i.test(osPlatform)) {
      executablePath = '/usr/bin/google-chrome';
      // executablePath = '/usr/bin/chromium-browser';
    }

    const opts = {
      executablePath,
      headless: this.browserOpts.headless || false,
      devtools: false,  // Open Chrome devtools at the beginning of the test
      dumpio: false,
      slowMo: 130,  // Wait 130 ms each step of execution, for example chars typing

      // list of all args https://peter.sh/experiments/chromium-command-line-switches/
      args: this.browserOpts.args || [
        '--disable-dev-shm-usage',
        '--ash-host-window-bounds=1300x900',
        `--window-size=${this.browserOpts.width},${this.browserOpts.height}`,
        `--window-position=${this.browserOpts.position}`,

        // required for iframe
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    };
    this.browser = await this.puppeteer.launch(opts);

    // prevent closing of the browser
    this.browser.on('disconnected', async () => {
      await this.openBrowser();
    });
  }


  async closeBrowser() {
    if (!this.browser) { return; }
    await this.browser.close();
    this.browser.disconnect;
    delete this.browser;
  }



  /*** HTTP SERVER EVENTS ***/
  _onListening() {
    this.proxyServer.on('listening', () => {
      const addr = this.proxyServer.address();
      const ip = addr.address === '::' ? '127.0.0.1' : addr.address;
      const port = addr.port;
      console.log(`👌  Proxy Server is started on http://${ip}:${port}`);
    });
  }


  _onClose() {
    this.proxyServer.on('close', async () => {
      console.log(`✋  Proxy Server is stopped.`);
      await this.closeBrowser();
    });
  }


  // on CTRL-C or gulp serverNode::stop()
  _onKILL() {
    process.on('SIGINT', () => {
      console.log('💥  Proxy Server is killed');
      this.stop();
    });
  }


  _onError() {
    this.proxyServer.on('error', error => {
      switch (error.code) {
        case 'EACCES':
          console.error(this.proxyOpts.port + ' permission denied');
          console.error(error);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          console.error(this.proxyOpts.port + ' already used');
          process.exit(1);
          break;
        default:
          throw error;
      }
    });
  }


  /*** DEBUGGER ***/
  _debugRequest(req, viaBrowser) {
    if (this.proxyOpts.debug) {
      console.log('\nurl::', req.url);
      console.log('user-agent::', req.headers['user-agent']);
      console.log('viaBrowser::', viaBrowser);
    }
  }



}



export default ProxyServer;
