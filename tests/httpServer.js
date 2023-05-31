import { HTTPServer } from '../index.js';


const httpOpts = {
  staticDir: 'dist',
  indexFile: 'page.html',
  urlRewrite: {
    '^/image': '/public/img'
  },
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
  debug: true
};
const httpServer = new HTTPServer(httpOpts);
httpServer.start();


/*
To test open:
http://127.0.0.1:9000  --> should open page.html
http://127.0.0.1:9000/pets  --> should open page.html
http://127.0.0.1:9000/star.jpeg  --> should open image
http://127.0.0.1:9000/assets/page.css  --> should open CSS file
http://127.0.0.1:9000/assets/page.js  --> should open JS file
http://127.0.0.1:9000/image/balls.webp  --> should open image
 */

