/*!
 * wwwdude.js an abstraction layer for http client stuff
 *
 * Copyright(c) 2011 Sven Pfleiderer.
 * MIT Licensed
 *
 * @author pfleidi
 */

/* Module dependencies */

var Url = require('url');
var EventEmitter = require('events').EventEmitter;

var Util = require('./util');
var statusCodes = Util.codes;
var nodeVersion = process.version.slice(0, 6).replace(/\d$/, 'x');
var NodeWrapper = require('./node-versions/' + nodeVersion);

var defaultHeaders = {
  'User-Agent': 'node-wwwdude'
};

exports.version = '0.0.7';
exports.parsers = require('./parsers');
exports.statusCodes = statusCodes;

/**
 * Factory method to create a client
 *
 * @return {Object}
 * @api public
 */
var createClient = exports.createClient = function createClient(clientOptions) {
  clientOptions = clientOptions || {};

  var encoding = clientOptions.encoding || 'utf8';
  var clientHeaders = Util.mergeHeaders(defaultHeaders, clientOptions.headers);

//  if (clientOptions.gzip) {
//    clientHeaders['Accept-Encoding'] = 'gzip';
//  }

  /**
   * Execute HTTP request
   *
   * @param {String} method
   * @param {String} url
   * @param {Object} options
   *
   * @return {EventEmitter}
   * @api private
   */
  function makeRequest(method, url, options) {

    var parsedUrl = Util.parseUrl(url);
    var emitter = new EventEmitter();

    /**
     * Emit events to the correct request object
     *
     * @param {Object} type
     * @param {Object} data
     * @param {Object} response
     * @return {undefined}
     * @api private
     */
    function _respond(type, data, response) {
      if (options.originalRequest) {
        options.originalRequest.emit(type, data, response);
      } else {
        emitter.emit(type, data, response);
      }
    }

    /**
     * Redirect to next location if feature is enabled
     *
     * @param {Object} response
     * @return {undefined}
     * @api private
     */
    function _redirect(response, method) {
      if (clientOptions.followRedirect !== false) {     // TODO: why "!== false"?
        var nextLocation = Url.resolve(url, response.headers.location);
        // BUG: storing original url and request is fine, but redirects often come in series;
        //  earlier requests are overwritten then
        options.originalUrl = url;
        options.originalRequest = emitter;
        makeRequest(method, nextLocation, options);
      }
    }

    /**
     * Emit events based on HTTP status codes
     *
     * @param {Object} response
     * @return {undefined}
     * @api private
     */
    function _dispatchResponse(response) {
      var code = response.statusCode;
      var data = response.data || response.rawData;

      _respond(code.toString().replace(/\d{2}$/, 'XX'), data, response);
      _respond(code.toString(), data, response);
      _respond(statusCodes[code.toString()], data, response);

      if (code >= 400) {
        _respond('http-error', data, response);
        if (code < 500) {
          _respond('http-client-error', data, response);
        } else {
          _respond('http-server-error', data, response);
        }
      } else if (code >= 300) {
        _respond('redirect', data, response);
        if (code === 301 || code === 302) {
          _redirect(response, method);
        } else if (code === 303) {      // TODO: and 307?
          _redirect(response, 'get');
        }
      } else if (code >= 200) {
        _respond('success', data, response);
      }

      _respond('complete', data, response);
    }


    /**
     * Parse retrieved content and delegate to _dispatchResponse
     *
     * @param {Object} response
     * @return {undefined}
     * @api private
     */
    function _parseContent(response) {
      var parser = clientOptions.contentParser;

      parser(response.rawData, function (err, parsed) {
          if (err) {
            _respond('error', err);
          } else {
            response.data = parsed;
            _dispatchResponse(response);
          }
        });
    }

    /**
     * Handle incoming response.
     * Delegate if parser is set.
     *
     * @param {Object} response
     * @return {undefined}
     * @api private
     */
    function _handleResponse(response) {
      if (clientOptions.contentParser) {
        _parseContent(response);
      } else {
        _dispatchResponse(response);
      }
    }


    /**
     * Handle responses of executed HTTP requests
//     * delegate to request._decodeGzip() if needed
     *
     * @param {Object} response
     * @return {undefined}
     * @api private
     */
    function _responseHandler(response) {
      var body = '';
      var useGzip = /gzip/.test(response.headers['content-encoding']);


        // TODO: we should emit a general 'response' event, which signals that any response
        //  is about to arrive; this would complete the philosophy seen in _dispatchResponse() to
        //  emit numerous redundant events of different flavours

      if (useGzip) {
throw new Error("wwwdude can't handle gzip encoded content for the time being");
        // TODO: 'binary' encoding is deprecated, use buffers instead
        response.setEncoding('binary');
      } else {
        // BUG: there's no indication that the encoding set by the caller (in clientOptions) is the same
        //  encoding actually sent in the response; in fact, the request subroutine does not even /request/
        //  the server to use this encoding (via Accept-Charset header)
        //  see <http://www.w3.org/TR/html401/charset.html#h-5.2.2> and
        //  <http://www.w3.org/TR/html401/charset.html#h-5.2.2> for specs on how to determine the charset of
        //  an entity
        response.setEncoding(encoding);
      }

      response.on('data', function (chunk) {
        // TODO: does this work reliably? A more plausible approach would be to gather the chunks,
        //  eventually concat them and then decode according to the charset option of the Content-Type
        //  header sent by the server.
        //  Indeed, a guy named 4z3 has observed problems with binary files and already provided a
        //  patch in his fork of wwwdude.
        //  <https://github.com/4z3/node-wwwdude/commit/06cf778f1a6fd76ede9cfccdbff910ea4058cf71>
          body += chunk;
        });

      response.on('end', function () {
          if (useGzip) {
//            Util.decodeGzip(body, function (err, data) {
//                response.rawData = data;
//                _handleResponse(response);
//              });
          } else {
            response.rawData = body;
            _handleResponse(response);
          }
        });

        // TODO: response.on('close', ...
        //  TODO: rumors are, sometimes only a 'close' event is emitted and no 'end' event
        close
        // TODO: response.on('error', ...
    }

    NodeWrapper.request({
        method: method,
        url: parsedUrl,
        options: options,
        respond: _respond,
        encoding: encoding,
        timeout: clientOptions.timeout,
        handler: _responseHandler
      });

    return emitter;
  }

  /* return the actual API */
  return {

    /**
     * HTTP GET request
     *
     * @param {String} url
     * @param {Object} opts
     * @return {EventEmitter}
     * @api public
     */
    get: function get(url, opts) {
      opts = opts || {};
      opts.headers = Util.mergeHeaders(clientHeaders, opts.headers);
      return makeRequest('GET', url, opts);
    },

    /**
     * HTTP PUT request
     *
     * @param {String} url
     * @param {Object} opts
     * @return {EventEmitter}
     * @api public
     */
    put: function put(url, opts) {
      opts = opts || {};
      opts.headers = Util.mergeHeaders(clientHeaders, opts.headers);
      return makeRequest('PUT', url, opts);
    },

    /**
     * HTTP POST request
     *
     * @param {String} url
     * @param {Object} opts
     * @return {EventEmitter}
     * @api public
     */
    post: function post(url, opts) {
      opts = opts || {};
      opts.headers = Util.mergeHeaders(clientHeaders, opts.headers);
      return makeRequest('POST', url, opts);
    },

    /**
     * HTTP DELETE request
     *
     * @param {String} url
     * @param {Object} opts
     * @return {EventEmitter}
     * @api public
     */
    del: function del(url, opts) {
      opts = opts || {};
      opts.headers = Util.mergeHeaders(clientHeaders, opts.headers);
      return makeRequest('DELETE', url, opts);
    },

    /**
     * HTTP DELETE request
     *
     * @param {String} url
     * @param {Object} opts
     * @return {Object} client
     * @return {EventEmitter}
     * @api public
     */
    head: function head(url, opts) {
      opts = opts || {};
      opts.headers = Util.mergeHeaders(clientHeaders, opts.headers);
      return makeRequest('HEAD', url, opts);
    }

  };

};
