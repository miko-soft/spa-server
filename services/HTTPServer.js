import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';


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
   * - openDirs:string, - dirs which will be served by the server. For example it's 'node_modules' the URL /node_modules/... will serve everything from this folder. This field is a string which represent regular expression ('node_modules\/dodo').
   * - port:number - HTTP Server port number
   * - timeout:number - ms of inactivity after ws will be closed. If 0 then the ws will never close. Default is 5 minute
   * - acceptEncoding:string - gzip or deflate
   * - headers:object - custom headers
   * - debug:boolean - print debug messages
   * @param  {object} httpOpts - options {port, timeout, acceptEncoding, headers, debug}
   * @returns {void}
   */
  constructor(httpOpts) {
    // HTTP server options
    if (!!httpOpts) {
      this.httpOpts = httpOpts;
      if (!this.httpOpts.staticDir) { this.httpOpts.staticDir = 'src'; }
      if (!this.httpOpts.indexFile) { this.httpOpts.indexFile = 'index.html'; }
      if (!this.httpOpts.openDirs) { this.httpOpts.openDirs = ''; }
      if (!this.httpOpts.port) { throw new Error('The server port is not defined.'); }
      if (this.httpOpts.timeout === undefined) { this.httpOpts.timeout = 5 * 60 * 1000; }
      if (!this.httpOpts.acceptEncoding) { this.httpOpts.acceptEncoding = 'gzip'; }
      if (!this.httpOpts.headers) { this.httpOpts.headers = []; }
    } else {
      throw new Error('HTTP Server options are not defined.');
    }
    this.httpServer;
  }



  /*** HTTP SERVER COMMANDS ***/
  /**
   * Start the HTTP Server
   */
  start() {
    this.httpServer = http.createServer((req, res) => {
      const reqURL = req.url;
      const reqURL_noquery = reqURL.trim().replace(/\?.+/, ''); // URL where query is removed, for example for example ?v=4.7.0

      // define "Content-Type" header and "encoding" according to file extension - https://www.iana.org/assignments/media-types/media-types.xhtml
      const mime = {
        html: 'text/html',
        txt: 'text/plain',
        css: 'text/css',
        gif: 'image/gif',
        jpg: 'image/jpeg',
        png: 'image/png',
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
      let encoding = 'utf8';

      const matched = reqURL_noquery.match(/\.([^.]+)$/i);
      const matched2 = reqURL_noquery.match(/\.([^.]+)\.[^.]+$/i);

      const fileExt = !!matched ? matched[1] : ''; // html, txt, css, js, png, ...
      const fileExt2 = !!matched2 ? matched2[1] : ''; // on js.map or css.map

      if (/^html$/.test(fileExt)) { contentType = mime.html; encoding = 'utf8'; }
      else if (/^htm$/.test(fileExt)) { contentType = mime.html; encoding = 'utf8'; }
      else if (/^txt$/.test(fileExt)) { contentType = mime.txt; encoding = 'utf8'; }
      else if (/^css$/.test(fileExt)) { contentType = mime.css; encoding = 'utf8'; }
      else if (/^gif$/.test(fileExt)) { contentType = mime.gif; encoding = 'binary'; }
      else if (/^jpg$/.test(fileExt)) { contentType = mime.jpg; encoding = 'binary'; }
      else if (/^jpeg$/.test(fileExt)) { contentType = mime.jpg; encoding = 'binary'; }
      else if (/^svg$/.test(fileExt)) { contentType = mime.svg; encoding = 'binary'; }
      else if (/^png$/.test(fileExt)) { contentType = mime.png; encoding = 'binary'; }
      else if (/^ico$/.test(fileExt)) { contentType = mime.ico; encoding = 'binary'; }
      else if (/^js$/.test(fileExt)) { contentType = mime.js; encoding = 'utf8'; }
      else if (/^json$/.test(fileExt)) { contentType = mime.json; encoding = 'utf8'; }
      else if (/^mp4$/.test(fileExt)) { contentType = mime.mp4; encoding = 'binary'; }
      else if (/^woff$/.test(fileExt)) { contentType = mime.woff; encoding = 'binary'; }
      else if (/^woff2$/.test(fileExt)) { contentType = mime.woff2; encoding = 'binary'; }
      else if (/^ttf$/.test(fileExt)) { contentType = mime.ttf; encoding = 'binary'; }
      else if (/^map$/.test(fileExt) && /^css$/.test(fileExt2)) { contentType = mime.js_map; encoding = 'utf8'; }
      else if (/^map$/.test(fileExt) && /^js$/.test(fileExt2)) { contentType = mime.css_map; encoding = 'utf8'; }


      // define file path
      let filePath;
      if (!!fileExt) {
        /* - requests with file extension
           - for example: /frontend/views/pages/home/layout.html */
        const reg = new RegExp(this.httpOpts.openDirs, 'i');
        filePath = reg.test(reqURL_noquery) ?
          path.join(process.cwd(), reqURL_noquery) :
          path.join(process.cwd(), this.httpOpts.staticDir, reqURL_noquery);
      } else {
        /* - if request doesn't contain file extension (browser bar request) then send app.html
           - for example: / or /playground/model */
        filePath = path.join(process.cwd(), this.httpOpts.staticDir, this.httpOpts.indexFile);
      }


      // debugging
      if (this.httpOpts.debug) {
        console.log('\nrequested URL::', reqURL, ', reqURL_noquery::', reqURL_noquery);
        console.log('fileExt::', fileExt, ', fileExt2::', fileExt2, ', contentType::', contentType, ', encoding::', encoding, ', acceptEncoding:: ', this.httpOpts.acceptEncoding);
        console.log('filePath:: ', filePath);
      }

      // send response to the client
      this.sendResponse(res, req, contentType, filePath);

    });


    // configure HTTP Server
    this.httpServer.listen(this.httpOpts.port);
    this.httpServer.timeout = this.httpOpts.timeout;


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


  /**
   * Send HTTP response to the client.
   * @param {object} res - NodeJS response object
   * @param {object} req - NoedJS request object
   * @param {string} contentType - mime type: 'text/html', 'application/json
   * @param {string} filePath - the file location (absolute path)
   */
  async sendResponse(res, req, contentType, filePath) {
    if (fs.existsSync(filePath)) {
      try {
        /*** A) set headers defined in the httpOpts ***/
        const headerProps = Object.keys(this.httpOpts.headers);
        for (const headerProp of headerProps) {
          res.setHeader(headerProp, this.httpOpts.headers[headerProp]);
        }
        res.setHeader('Content-Type', contentType);

        // set Server header
        res.setHeader('Server', '@mikosoft/spa-server');



        /*** B) compress response ***/
        let acceptEncodingBrowser = req.headers['accept-encoding']; // defines what browser can accept
        if (!acceptEncodingBrowser) { acceptEncodingBrowser = ''; }

        const raw = fs.createReadStream(filePath);


        // http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.3
        if (acceptEncodingBrowser.match(/\bgzip\b/) && this.httpOpts.acceptEncoding === 'gzip') {
          res.writeHead(200, { 'Content-Encoding': 'gzip' });
          raw.pipe(zlib.createGzip()).pipe(res);
        } else if (acceptEncodingBrowser.match(/\bdeflate\b/) && this.httpOpts.acceptEncoding === 'deflate') {
          res.writeHead(200, { 'Content-Encoding': 'deflate' });
          raw.pipe(zlib.createDeflate()).pipe(res);
        } else {
          res.writeHead(200);
          raw.pipe(res);
        }


      } catch (err) {
        console.log(err);
      }

    } else { // file doesn't exist
      const errMsg = `NOT FOUND: "${filePath}"`;
      console.log('\x1b[31m' + errMsg + '\x1b[0m');
      res.writeHead(404, { 'X-Error': errMsg });
      res.end();
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
      switch (error.code) {
        case 'EACCES':
          console.log(this.httpOpts.port + ' permission denied');
          console.log(error);
          break;
        case 'EADDRINUSE':
          console.log(this.httpOpts.port + ' already used');
          break;
        default:
          console.log(error);
      }
      process.exit(1);
    });
  }



}



export default HTTPServer;
