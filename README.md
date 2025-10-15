# @mikosoft/spa-server
> HTTP server for serving single page applications ([dodo](http://dodo.mikosoft.com), angular, vue, react, svelte, etc).

This Node.js HTTP server is designed to serve Single Page Applications (SPAs) efficiently.
It handles various types of static files and provides server-side rendering (SSR) capabilities based on configuration options.


## Installation
```bash
$ npm install --save @mikosoft/spa-server
```

## Features
- very fast &amp; simple to use
- **Static File Serving:** Serves static files like HTML, CSS, JavaScript, images, fonts, etc., from a specified directory (*staticDir*).
- **Index File Handling:** Serves a default *index.html* file when the URL does not contain a file extension.
- **URL Rewrite:** Maps specific URLs to different directories based on configurable rules (*urlRewrite*).
- **Server-Side Rendering (SSR):** Optionally modifies HTML content on the server before serving, useful for SEO or initial page rendering (*ssr*).
- **Compression:** Supports *gzip* and *deflate* compression for optimizing data transfer.
- **Customizable Response Headers:** Allows customization of HTTP response headers, including CORS headers.
- **Timeout Handling:** Automatically handles request timeouts to prevent hanging connections.
- **Debugging:** Provides optional debug logs to track server activity and HTML content.



## HTTP Server
Serve single page application on the HTTP server.
```js
import { HTTPServer } from '@mikosoft/spa-server';

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
    'Access-Control-Allow-Methods': 'OPTIONS, GET',
    'Access-Control-Max-Age': '3600'
  },
  ssr: 'all', // none, all, botsonly
  ssrDomMutuationTimeout: 2000, // ms to wait for DOM mutations, increase if your single page app is slow
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
const httpServer = new HTTPServer(httpOpts);
httpServer.start();
```


### OPTIONS (httpOpts)
- *staticDir*:string, - directory with static, frontend files (path relative to process.cwd())
- *indexFile*:string, - root HTML file (in the staticDir)
- *urlRewrite*:object, - map URLs to directory: {url1: dir1, url2:dir2} NOTICE:The url i.e. the object key can contain regex chars like ^ $ * ...
- *port*:number - HTTP Server port number
- *timeout*:number - ms to wait for response. If 0 then the HTTP connection will never close. Default is 5 minute
- *acceptEncoding*:string - gzip or deflate
- *headers*:object - custom server response headers
- *ssr*:'all'|'botsonly'|'none' - server side rendering
- *ssrDomMutuationTimeout*:number - ms to wait for DOM mutations, default is 2000ms; increase if your single page app is slow
- *ssrConsole*:boolean - show frontend JS logs on the backend terminal
- *ssrModifier*:null|Function - modify document on the server side
- *debug*:boolean - print debug messages
- *debugHTML*:boolean - debug initial and postrender HTML


## HTTP Server methods
- **start()** - start the HTTP server
- **stop()** - stop the HTTP server
- **restart()** - restart the HTTP server

#### Events
**listening**: Event emitted when the HTTP server starts listening for connections.
**close**: Event emitted when the HTTP server closes.
**error**: Event emitted when an error occurs in the HTTP server.



## Contributing
Feel free to contribute by submitting issues and pull requests on [GitHub](https://github.com/miko-soft/spa-server.git).


## Support
Contact on [www.mikosoft.info](https://www.mikosoft.info/)



### Licence
Copyright (C) 2023-present MikoSoft licensed under [MIT](./LICENSE) .
