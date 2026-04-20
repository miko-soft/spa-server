# @mikosoft/spa-server

> Lightweight Node.js HTTP server for serving Single Page Applications with optional Server-Side Rendering.

Works with any SPA framework — [Dodo](http://dodo.mikosoft.info), Angular, Vue, React, Svelte, and others.


## Installation

```bash
npm install --save @mikosoft/spa-server
```


## Features

- **Zero-config static serving** — serves HTML, CSS, JS, images, fonts and more from a single directory
- **SPA routing** — any URL without a file extension returns `index.html`, letting the client-side router take over
- **URL rewrite** — map URL patterns to different directories using regex-capable rules
- **Server-Side Rendering (SSR)** — executes your SPA scripts inside JSDOM on the server, returning fully-rendered HTML; great for SEO without a separate SSR build
- **Bot-only SSR** — optionally apply SSR only to recognised search-engine crawlers
- **Compression** — gzip or deflate support negotiated per-request
- **Custom response headers** — full control over CORS and any other headers
- **Puppeteer proxy** — alternative SEO strategy that renders pages in a real Chromium browser for bots (`ProxyServer`)
- **Timeout protection** — configurable request timeout; hanging connections are cleaned up automatically
- **Debug helpers** — optional console logging of requests and raw/rendered HTML


## Exports

```js
import { HTTPServer, HTTPServer_noSSR, ProxyServer } from '@mikosoft/spa-server';
```

| Export | Description |
|--------|-------------|
| `HTTPServer` | Full-featured server with built-in JSDOM SSR |
| `HTTPServer_noSSR` | Lightweight server without SSR (no `jsdom` dependency used) |
| `ProxyServer` | Puppeteer-based proxy for bot rendering in front of `HTTPServer_noSSR` |


---


## HTTPServer

The main server class. Serves static files and can optionally execute your SPA in JSDOM on the server before responding, producing fully-rendered HTML for crawlers and improving Time-to-First-Byte perceived by users.

```js
import { HTTPServer } from '@mikosoft/spa-server';

const httpServer = new HTTPServer({
  staticDir: 'dist',
  indexFile: 'index.html',
  urlRewrite: {}, // { '/api': '../api-mock' } — keys support regex chars
  port: process.env.PORT || 3000,
  timeout: 1 * 60 * 1000, // ms; 0 = never
  acceptEncoding: 'gzip', // 'gzip' | 'deflate' | ''
  responseHeaders: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, Content-Type, Accept, Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS, GET',
    'Access-Control-Max-Age': '3600'
  },
  ssr: 'all', // 'none' | 'all' | 'botsonly'
  ssrConsole: false,
  ssrModifier: (document) => {
    document.title = 'My App';
  },
  debug: false,
  debugHTML: false
});

httpServer.start();
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `staticDir` | string | `'dist'` | Directory of built frontend files, relative to `process.cwd()` |
| `indexFile` | string | `'index.html'` | HTML file returned for any extensionless URL |
| `urlRewrite` | object | `{}` | URL-to-directory map; keys are regex-capable strings |
| `port` | number | — **required** | Port to listen on |
| `timeout` | number | `60000` | Request timeout in ms. `0` disables timeout |
| `acceptEncoding` | string | `''` | Response compression: `'gzip'`, `'deflate'`, or `''` |
| `responseHeaders` | object | `{}` | Headers added to every response (CORS, caching, etc.) |
| `ssr` | string | `'none'` | SSR mode: `'none'`, `'all'`, or `'botsonly'` |
| `ssrConsole` | boolean | `false` | Forward frontend `console.*` output to the Node.js terminal |
| `ssrModifier` | Function\|null | `null` | Receives the JSDOM `document` object; mutate it before the HTML is serialised |
| `debug` | boolean | `false` | Log each request, resolved file path, and content-type |
| `debugHTML` | boolean | `false` | Print raw and post-render HTML to the terminal |

### SSR — SPA requirement

When `ssr` is `'all'` or `'botsonly'`, your SPA **must** dispatch a `ssr-ready` window event once the DOM is fully rendered. The server waits for this event before serialising the document.

```js
// Call this at the end of your app's render lifecycle
window.dispatchEvent(new Event('ssr-ready'));
```

If the event is never fired, the server falls back and responds after `timeout` ms.

### Methods

| Method | Description |
|--------|-------------|
| `start()` | Start listening for connections |
| `stop()` | Close the server |
| `restart()` | Stop, wait ~2 s, then start again |

### Events

| Event | Description |
|-------|-------------|
| `listening` | Server is ready and accepting connections |
| `close` | Server has closed |
| `error` | A server-level error occurred (port in use, permission denied, etc.) |


---


## HTTPServer_noSSR

A stripped-down version of `HTTPServer` with no SSR logic and no dependency on `jsdom`. Use it when you handle SSR at build time or through a separate proxy.

```js
import { HTTPServer_noSSR } from '@mikosoft/spa-server';

const httpServer = new HTTPServer_noSSR({
  staticDir: 'dist',
  indexFile: 'index.html',
  urlRewrite: {},
  port: process.env.PORT || 3000,
  timeout: 5 * 60 * 1000,
  acceptEncoding: 'gzip',
  responseHeaders: {                         // Note: 'headers', not 'responseHeaders'
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, Content-Type, Accept, Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS, GET',
    'Access-Control-Max-Age': '3600'
  },
  debug: false
});

httpServer.start();
```

Methods and events are identical to `HTTPServer`.


---


## ProxyServer

An alternative SEO approach for SPAs that do not use server-side rendering.

`ProxyServer` sits in front of `HTTPServer_noSSR` and splits incoming traffic by `User-Agent`:

- **Regular browsers** — the request is forwarded as-is to the inner HTTP server. The client receives the bare `index.html` shell and runs the JavaScript itself, exactly as normal.
- **Bots and crawlers** — the request is intercepted, opened in a headless Chromium instance via Puppeteer, and the proxy waits for the JavaScript to finish rendering. The fully-rendered HTML (with all dynamic content already in the DOM) is then returned to the bot.

```
                         ┌─────────────────────────────────────────────────┐
                         │                    ProxyServer :3000             │
                         │                                                  │
  Browser ──────────────►│  User-Agent: Chrome/124  → forward transparently │──► HTTPServer_noSSR :4401
                         │                                                  │
  Googlebot ────────────►│  User-Agent: Googlebot   → open in Chromium      │
                         │                            wait for JS render     │
                         │                            return full HTML  ◄───│──► HTTPServer_noSSR :4401
                         └─────────────────────────────────────────────────┘
```

**Example:** a Vue/React SPA normally sends an empty `<div id="app"></div>` to Googlebot, giving it nothing to index. With `ProxyServer`, Googlebot receives the page after JavaScript has populated the DOM — headings, text, links — making the content fully crawlable without modifying the SPA itself.

**Peer dependency — install separately:**

```bash
npm install puppeteer
# or, if you manage the Chrome binary yourself:
npm install puppeteer-core
```

```js
import puppeteer from 'puppeteer';
import { HTTPServer_noSSR, ProxyServer } from '@mikosoft/spa-server';

// 1. Start the inner HTTP server on a private port
const httpServer = new HTTPServer_noSSR({ staticDir: 'dist', port: 4401 });
httpServer.start();

// 2. Start the proxy on the public port
const proxyServer = new ProxyServer(
  {
    port: 3000,
    request_host: '127.0.0.1',
    request_port: 4401,
    regexpUA: /bot|spider|crawl|googlebot/i,
    debug: false
  },
  { headless: true, width: 1300, height: 900, position: '0,0' }
);

await proxyServer.injectPuppeteer(puppeteer);
await proxyServer.openBrowser();
proxyServer.start();
```

### Options (proxyOpts)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | — **required** | Public-facing proxy port |
| `request_host` | string | `'127.0.0.1'` | Upstream HTTP server host |
| `request_port` | number | `80` | Upstream HTTP server port |
| `regexpUA` | RegExp | `/bot|spider|crawl|curl|lynx|wget/i` | Requests whose `User-Agent` matches are rendered via Chromium |
| `debug` | boolean | `false` | Log each proxied request and whether it went through the browser |

### Browser options (browserOpts)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headless` | boolean | `true` | Run Chromium without a visible window |
| `width` | number | `1300` | Viewport width in px |
| `height` | number | `900` | Viewport height in px |
| `position` | string | `'0,0'` | Window position — only relevant when `headless` is `false` |

### Methods

| Method | Description |
|--------|-------------|
| `injectPuppeteer(puppeteer)` | Pass in the puppeteer instance before calling `start()` |
| `openBrowser()` | Launch the Chromium browser |
| `closeBrowser()` | Close the Chromium browser |
| `start()` | Start listening for connections |
| `stop()` | Stop the proxy and close the browser |
| `restart()` | Stop, wait ~2 s, then start again |


---


## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/miko-soft/spa-server).


## Support

[www.mikosoft.info](https://www.mikosoft.info/)


## Licence

Copyright (C) 2023-present MikoSoft — [MIT](./LICENSE)
