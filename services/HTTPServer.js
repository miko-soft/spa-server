import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { JSDOM } from 'jsdom';

const fsp = fs.promises;


/**
 * HTTP Server for serving single page applications.
 * Conditions for serving SPA:
 * - when URL doesn't contain file extension => open "indexFile" (by defult it is index.html)
 * - when URL contains file extension (for example .js, .css, .html, .jpg, ...) => open the requested file
 */
class HTTPServer {

  /**
   ** httpOpts:
   * - staticDir:string, - directory with static, frontend files (path relative to process.cwd())
   * - indexFile:string, - root HTML file (in the staticDir)
   * - urlRewrite:object, - map URLs to directory: {url1: dir1, url2:dir2} NOTICE:The url i.e. the object key can contain regex chars like ^ $ * ...
   * - port:number - HTTP Server port number
   * - timeout:number - ms to wait for response. If 0 then the HTTP connection will never close. Default is 5 minute
   * - acceptEncoding:string - gzip or deflate
   * - headers:object - custom server response headers
   * - ssr:'all'|'botsonly'|'none' - server side rendering
   * - ssrConsole:boolean - show frontend JS logs on the backend terminal
   * - ssrModifier:null|Function - modify document on the server side
   * - debug:boolean - print debug messages
   * - debugHTML:boolean - debug initial and postrender HTML
   *
   * OPTS EXAMPLE::
const httpOpts = {
  staticDir: 'dist',
  indexFile: 'index.html',
  urlRewrite: {}, // map URLs to directory: {url1: dir1, url2:dir2} NOTICE:The url i.e. the object key can contain regex chars like ^ $ * ...
  port: process.env.PORT || 3000,
  timeout: 5 * 60 * 1000, // if 0 never timeout
  acceptEncoding: 'gzip', // gzip, deflate or ''
  headers: {
    // CORS Response Headers
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, Content-Type, Accept, Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS, GET', // 'Access-Control-Allow-Methods': 'OPTIONS, GET, POST, PUT, PATCH, DELETE, HEAD',
    'Access-Control-Max-Age': '3600'
  },
  ssr: 'all', // none, all, botsonly
  ssrConsole: false, // frontend JS logs in the backend
  ssrModifier: (document) => { // modify document on the server side
    document.title = 'Modified title';
    const script = document.createElement('script');
    script.textContent = "console.log('Dynamic script executed!')";
    document.body.appendChild(script);
  },
  debug: false,
  debugHTML: true
};
   * @param  {object} httpOpts
   * @returns {void}
   */
  constructor(httpOpts) {
    // HTTP server options
    if (!!httpOpts) {
      this.httpOpts = httpOpts;
      if (!this.httpOpts.staticDir) { this.httpOpts.staticDir = 'dist'; }
      if (!this.httpOpts.indexFile) { this.httpOpts.indexFile = 'index.html'; }
      if (!this.httpOpts.urlRewrite) { this.httpOpts.urlRewrite = {}; }
      if (!this.httpOpts.port) { throw new Error('The server port is not defined.'); }
      if (this.httpOpts.timeout === undefined) { this.httpOpts.timeout = 5 * 60 * 1000; }
      if (!this.httpOpts.acceptEncoding) { this.httpOpts.acceptEncoding = ''; }
      if (!this.httpOpts.responseHeaders) { this.httpOpts.responseHeaders = {}; } // custom response headers
      if (!this.httpOpts.ssr) { this.httpOpts.ssr = 'none'; } // all, bots-only, none
      if (!this.httpOpts.ssrModifier) { this.httpOpts.ssrModifier = null; } // null, Function -- modify document on the server side
      if (!this.httpOpts.ssrConsole) { this.httpOpts.ssrConsole = false; } // show logs from the frontend JS file in the terminal where the NodeJS instance is running
      if (!this.httpOpts.debug) { this.httpOpts.debug = false; }
      if (!this.httpOpts.debugHTML) { this.httpOpts.debugHTML = false; }
    } else {
      throw new Error('HTTP Server options are not defined.');
    }
    this.httpServer = null;
  }



  /*** HTTP SERVER COMMANDS ***/
  /**
   * Start the HTTP Server
   */
  start() {
    // listen for incoming requests and send response
    this.httpServer = http.createServer((req, res) => {
      const reqURL = req.url;
      const reqURL_noquery = reqURL.trim().replace(/\?.+/, ''); // URL where query is removed, for example for example ?v=4.7.0
      this.httpOpts.debug && console.log('\nrequested URL::', reqURL, ', reqURL_noquery::', reqURL_noquery);

      const contentType = this._solveContentType(reqURL_noquery);
      const filePath = this._solveFilePath(reqURL_noquery); // map url to file path

      this._sendResponse(res, req, contentType, filePath); // send response to the client

      // handle request timeout
      if (this.httpOpts.timeout > 0) {
        const timeoutId = setTimeout(() => {
          const errMsg = `408 Request Timeout: ${req.url}`;
          this._handleError(res, errMsg);
        }, this.httpOpts.timeout);
        res.on('finish', () => clearTimeout(timeoutId));
        res.on('close', () => clearTimeout(timeoutId));
      }

    });


    // configure HTTP Server
    this.httpServer.listen(this.httpOpts.port);
    this.httpServer.timeout = this.httpServer.timeout > 0 ? this.httpOpts.timeout + 100 : 0; // built-in feature provided by Node.js, which can be handy for ensuring that connections don't hang indefinitely due to network issues or unresponsive clients


    // listen for server events
    this._onListening();
    this._onClose();
    this._onKILL();
    this._onError();
  }



  /**
   * Stop the HTTP Server
   */
  stop() {
    this.httpServer.close();
  }



  /**
   * Restart the HTTP Server
   */
  async restart() {
    this.stop();
    await new Promise(resolve => setTimeout(resolve, 2100));
    this.start();
  }




  /******* RESPONSE SENDERS *******/

  /**
   * Send HTTP response to the client.
   * @param {object} res - NodeJS response object
   * @param {object} req - NoedJS request object
   * @param {object} contentType - mime type: 'text/html', 'application/json'
   * @param {string} filePath - the file location (absolute path)
   */
  async _sendResponse(res, req, contentType, filePath) {
    if (!fs.existsSync(filePath)) {
      const errMsg = `404 File Not Found: "${filePath}"`;
      this._handleError(res, errMsg);
      return;
    }

    try {
      /*** A) Set response headers ***/
      for (const [headerProp, headerValue] of Object.entries(this.httpOpts.responseHeaders)) { res.setHeader(headerProp, headerValue); }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Server', '@mikosoft/spa-server');

      /*** B) Send response ***/
      const acceptEncodingBrowser = req.headers['accept-encoding'] || '';
      if (contentType === 'text/html') { // HTML files
        const initialHTML = await fsp.readFile(filePath, 'utf8');
        this.httpOpts.debugHTML && console.log('\n\n++++++++++++initialHTML++++++++++++\n', initialHTML, '\n++++++++++++initialHTML++++++++++++');

        const doSSR = (
          this.httpOpts.ssr !== 'none' &&
          (this.httpOpts.ssr === 'all' || (this.httpOpts.ssr === 'botsonly' && this._isBot(req)))
        );

        const url = `http://${req.headers.host}${req.url}`;
        const finalHTML = doSSR ? await this._ssrExe(url, initialHTML) : initialHTML;
        this.httpOpts.debugHTML && console.log('\n\n++++++++++++finalHTML++++++++++++\n', finalHTML, '\n++++++++++++finalHTML++++++++++++');

        this._sendCompressedResponse(res, finalHTML, acceptEncodingBrowser);

      } else { // JS, CSS, IMG, ... files
        const raw = fs.createReadStream(filePath);
        this._sendCompressedResponse(res, raw, acceptEncodingBrowser);
      }

    } catch (err) {
      const errMsg = err.message;
      this._handleError(res, errMsg);
    }

  }


  _sendCompressedResponse(res, data, acceptEncodingBrowser) {
    if (typeof data === 'string') {
      // Handle string data (HTML string)
      if (acceptEncodingBrowser.match(/\bgzip\b/) && this.httpOpts.acceptEncoding === 'gzip') {
        res.writeHead(200, { 'Content-Encoding': 'gzip' });
        zlib.gzip(data, (err, compressedData) => {
          if (err) { return this._handleError(res, err.message); }
          res.end(compressedData);
        });
      } else if (acceptEncodingBrowser.match(/\bdeflate\b/) && this.httpOpts.acceptEncoding === 'deflate') {
        res.writeHead(200, { 'Content-Encoding': 'deflate' });
        zlib.deflate(data, (err, compressedData) => {
          if (err) { return this._handleError(res, err.message); }
          res.end(compressedData);
        });
      } else {
        res.writeHead(200);
        res.end(data);
      }
    } else {
      // Handle stream data (raw file streams)
      if (acceptEncodingBrowser.match(/\bgzip\b/) && this.httpOpts.acceptEncoding === 'gzip') {
        res.writeHead(200, { 'Content-Encoding': 'gzip' });
        data.pipe(zlib.createGzip()).pipe(res);
      } else if (acceptEncodingBrowser.match(/\bdeflate\b/) && this.httpOpts.acceptEncoding === 'deflate') {
        res.writeHead(200, { 'Content-Encoding': 'deflate' });
        data.pipe(zlib.createDeflate()).pipe(res);
      } else {
        res.writeHead(200);
        data.pipe(res);
      }
    }
  }




  /*** HTTP SERVER EVENTS ***/
  _onListening() {
    this.httpServer.on('listening', () => {
      const addr = this.httpServer.address();
      const ip = addr.address === '::' ? '127.0.0.1' : addr.address;
      const port = addr.port;
      console.log(`👌  HTTP Server is started on http://${ip}:${port}`);
    });
  }


  _onClose() {
    this.httpServer.on('close', () => {
      console.log(`✋  HTTP Server is stopped.`);
    });
  }


  // on CTRL-C or gulp serverNode::stop()
  _onKILL() {
    process.on('SIGINT', () => {
      console.log('💥  HTTP Server is killed');
      this.stop();
      process.exit();
    });
  }


  _onError() {
    this.httpServer.on('error', error => {
      if (error.code === 'EACCES') {
        console.log(this.httpOpts.port + ' permission denied');
      } else if (error.code === 'EADDRINUSE') {
        console.log(this.httpOpts.port + ' already used');
      }
      console.log(error);
      process.exit(1);
    });
  }



  /******* MISC *******/
  /**
   * Analyse requested URL and get the file extension.
   * @param {string} reqURL_noquery - a requested URL without query string ?v=0.4
   * @returns {string} - html, js, css, js.map, css.map
   */
  _solveFileExtension(reqURL_noquery) {
    const filename = reqURL_noquery.split('/').pop(); // Extract the filename from the URL or path
    const parts = filename.split('.'); // Split the filename by the dots
    if (parts.length === 1) { return ''; } // If there's only one part, there's no extension, for example README file
    const fileExt = parts.length > 2 ? parts.slice(-2).join('.') : parts[parts.length - 1]; // Join the last two parts for extensions like 'js.map', otherwise just return the last part
    return fileExt;
  }


  /**
   * Analyse requested URL and get response headers:
   * - content type
   * - encoding
   * @param {string} reqURL_noquery - a requested URL without query string ?v=0.4
   * @returns {string} - 'text/html', 'text/css', 'application/javascript', ...
   */
  _solveContentType(reqURL_noquery) {
    const fileExt = this._solveFileExtension(reqURL_noquery);

    // define "Content-Type" header and "encoding" according to file extension - https://www.iana.org/assignments/media-types/media-types.xhtml
    const mime = {
      html: 'text/html',
      txt: 'text/plain',
      css: 'text/css',
      gif: 'image/gif',
      jpg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      ico: 'image/x-icon',
      svg: 'image/svg+xml',
      js: 'application/javascript',
      json: 'application/json',
      mp4: 'video/mp4',
      woff: 'font/woff',
      woff2: 'font/woff2',
      ttf: 'font/ttf',
      js_map: 'application/json',
      css_map: 'application/octet-stream',
    };
    let contentType = mime.html;
    let fileEncoding = 'utf8';

    if (/^html$/.test(fileExt)) { contentType = mime.html; fileEncoding = 'utf8'; }
    else if (/^htm$/.test(fileExt)) { contentType = mime.html; fileEncoding = 'utf8'; }
    else if (/^txt$/.test(fileExt)) { contentType = mime.txt; fileEncoding = 'utf8'; }
    else if (/^css$/.test(fileExt)) { contentType = mime.css; fileEncoding = 'utf8'; }
    else if (/^gif$/.test(fileExt)) { contentType = mime.gif; fileEncoding = 'binary'; }
    else if (/^jpg$/.test(fileExt)) { contentType = mime.jpg; fileEncoding = 'binary'; }
    else if (/^jpeg$/.test(fileExt)) { contentType = mime.jpg; fileEncoding = 'binary'; }
    else if (/^svg$/.test(fileExt)) { contentType = mime.svg; fileEncoding = 'binary'; }
    else if (/^png$/.test(fileExt)) { contentType = mime.png; fileEncoding = 'binary'; }
    else if (/^webp$/.test(fileExt)) { contentType = mime.webp; fileEncoding = 'binary'; }
    else if (/^ico$/.test(fileExt)) { contentType = mime.ico; fileEncoding = 'binary'; }
    else if (/^js$/.test(fileExt)) { contentType = mime.js; fileEncoding = 'utf8'; }
    else if (/^json$/.test(fileExt)) { contentType = mime.json; fileEncoding = 'utf8'; }
    else if (/^mp4$/.test(fileExt)) { contentType = mime.mp4; fileEncoding = 'binary'; }
    else if (/^woff$/.test(fileExt)) { contentType = mime.woff; fileEncoding = 'binary'; }
    else if (/^woff2$/.test(fileExt)) { contentType = mime.woff2; fileEncoding = 'binary'; }
    else if (/^ttf$/.test(fileExt)) { contentType = mime.ttf; fileEncoding = 'binary'; }
    else if (/^css\.map$/.test(fileExt)) { contentType = mime.js_map; fileEncoding = 'utf8'; }
    else if (/^js\.map$/.test(fileExt)) { contentType = mime.js_map; fileEncoding = 'utf8'; }

    this.httpOpts.debug && console.log('fileExt::', fileExt, ', contentType::', contentType, ', fileEncoding::', fileEncoding);

    return contentType;
  }



  /**
   * Analyse requested URL and get file path.
   * @param {string} reqURL_noquery - a requested URL without query string ?v=0.4
   * @returns {string}
   */
  _solveFilePath(reqURL_noquery) {
    const fileExt = this._solveFileExtension(reqURL_noquery);

    // define file path
    let filePath;
    if (!!fileExt) {
      /* - requests with file extension */
      filePath = path.join(process.cwd(), this.httpOpts.staticDir, reqURL_noquery); // url: /views/pages/home/layout.html -> dir: .../src/views/pages/home/layout.html

      // url rewrite -> replace part of the requested URL with another URL part to get correct filePath
      for (const [key, val] of Object.entries(this.httpOpts.urlRewrite)) {
        const reg = new RegExp(key, 'i'); // the key can containg regex chars like ^ $ * ...
        if (reg.test(reqURL_noquery)) {
          const reqURL_noquery_rewrited = reqURL_noquery.replace(reg, val);
          filePath = path.join(process.cwd(), reqURL_noquery_rewrited);
        }
      }

    } else {
      /* - if request doesn't contain file extension (browser bar request) then send app.html
         - for example: / or /playground/model */
      filePath = path.join(process.cwd(), this.httpOpts.staticDir, this.httpOpts.indexFile);
    }

    this.httpOpts.debug && console.log('filePath:: ', filePath);

    return filePath;
  }


  /**
   * Execute Server Side Rendering - Parse initial HTML to get rendered HTML - Load dynamic HTML content generated with JS
   * @param {string} url - requested URL, for example http://127.0.0.1:3000/ , or http://127.0.0.1:3000/page1
   * @param {string} initialHTML - HTML before rendering
   * @returns {string}
   */
  async _ssrExe(url, initialHTML) {
    const jsdomOpts = {
      url,
      // referrer: 'https://example.com/',
      contentType: 'text/html',
      // includeNodeLocations: true,
      // storageQuota: 10000000,
      runScripts: 'dangerously'
    };
    const dom = new JSDOM(initialHTML, jsdomOpts);
    const window = dom.window;
    const document = window.document;

    // Override console methods in the JSDOM window
    !this.httpOpts.ssrConsole && this._disableConsoleLogs(dom);

    // Modify the document
    this.httpOpts.ssrModifier && this.httpOpts.ssrModifier(document);

    // Execute inline and external scripts (only external scripts from the same hostname where is index.html)
    const url_obj = new URL(url);
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      this.httpOpts.debug && console.log(' script.src::', script.src);
      if (script.src && script.src.includes(url_obj.hostname)) { // srcipt.src -> http://127.0.0.1:3000/dodoBuild/index-8f91b719.js ; url_obj.hostname -> 127.0.0.1
        const scriptSrc_obj = new URL(script.src);
        const scriptFilePath = path.join(process.cwd(), this.httpOpts.staticDir, scriptSrc_obj.pathname); // /web/node/@mikosoft/dodo-framework/create-dodo-boilerplates/dist/dodoBuild/index-8f91b719.js
        const scriptContent = await fsp.readFile(scriptFilePath, 'utf-8');
        dom.window.eval(scriptContent);
      } else {
        dom.window.eval(script.innerHTML);
      }
    }

    // Wait for any DOM mutations to settle -mututations due to script executions
    await new Promise((resolve) => {
      const observer = new window.MutationObserver(() => { });
      observer.observe(document, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 100); // adjust timeout as needed
    });

    const renderedHTML = dom.serialize(); // retreive HTML from dom

    return renderedHTML;
  }


  _isBot(req) {
    const botUserAgents = [
      // specific names
      /googlebot/i,
      /bingbot/i,
      /slurp/i,
      /duckduckbot/i,
      /baiduspider/i,
      /yandexbot/i,
      /sogou/i,
      /exabot/i,
      /facebot/i,
      /ia_archiver/i,
      /twitterbot/i,
      /linkedinbot/i,
      /redditbot/i,
      /applebot/i,
      /discordbot/i,
      /telegrambot/i,
      /whatsapp/i,
      /pingdom/i,
      /SemrushBot/i,
      /DotBot/i,
      /BLEXBot/i,
      /Barkrowler/i,

      // general names
      /bot|crawler|spider|robot|crawling/i
    ];

    const userAgent = req.headers['user-agent'];
    this.httpOpts.debug && console.log('user agent::', userAgent);
    if (!userAgent) { return false; }
    return botUserAgents.some(botRegex => botRegex.test(userAgent));
  }


  /**
   * Disable showing frontend JS logs in the backend (i.e. in the terminal where NodeJS instance is started)
   * @param {DOM} dom - HTML dom instance
   */
  _disableConsoleLogs(dom) {
    dom.window.console.log = () => { };
    dom.window.console.info = () => { };
    dom.window.console.warn = () => { };
    dom.window.console.error = () => { };
    dom.window.console.debug = () => { };
  }

  /**
   * Print error message in the console (red color) and send it to the client.
   * @param {object} res - response object
   * @param {string} errMsg - the message
   */
  _handleError(res, errMsg) {
    console.log('\x1b[31m' + errMsg + '\x1b[0m');
    res.writeHead(404, { 'Content-Type': 'text/plain', 'X-Error': errMsg });
    res.end(errMsg);
  }



}



export default HTTPServer;
