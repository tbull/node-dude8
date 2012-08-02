/*!
 * v0.8.x.js request implementation for Node 0.8.x
 *
 * Copyright(c) 2011 Sven Pfleiderer.
 * MIT Licensed
 *
 * @author pfleidi
 */

/* Module dependencies */

var Http = require('http');
var Https = require('https');

/**
 * Make the actual request for Node v0.8.x
 *
 * @param {Object} context
 * @return {undefined}
 * @api public
 */
exports.request = function (context) {
  var url = context.url;
  var headers = context.options.headers;
  var payload = context.options.payload;
  var request, timeoutId;

  var options = {
    host: url.hostname,
    port: url.port,
    path: url.path,
    method: context.method,
    headers: headers
  };

  if (payload) {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    // BUG: payload may actually be a Buffer itself, in which case payload.length is to be used
    //  Buffer.byteLength() is used only for strings
    // BUG: Buffer.byteLength() is sensitive to the requested target encoding
    headers['Content-Length'] = Buffer.byteLength(payload);
  }

  function handlerWrapper(response) {
    clearTimeout(timeoutId);
    context.handler(response);
  }

  if (url.protocol === 'https:') {
    request = Https.request(options, handlerWrapper);
  } else {
    request = Http.request(options, handlerWrapper);
  }

  request.on('error', function (err) {
      clearTimeout(timeoutId);
      context.respond('error', err);
    });

  if (payload) {
    // BUG: http.ClientRequest.write() is sensitive to the requested target encoding
    //  at the very least, we have to tell the server that we speak utf-8 in a Content-Type header
    request.write(payload);
  }

  if (context.timeout) {
    timeoutId = setTimeout(function () {
      request.abort();
      context.respond('error', new Error('HTTP Timeout was triggered!'));
      // TODO: perhaps we should emit a separate timeout event, or
      //    throw a more specific TimeoutError which also includes the timeout value
    }, context.timeout);
  }

  request.end();
};
