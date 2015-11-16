/**
 * @file 本地开发时的mock请求拦截处理
 * @author zhangshaolong
 */

'use strict';

var queryString = require('querystring');

var URL = require('url');

var http = require('http');

var pathNormalize = require('path').normalize;

var formDataReg = /multipart\/form-data/;

var proxyInfo;

module.exports = function (req, res, next) {

    if (req.url.indexOf('.ajax') > 0) {

        var getProxyInfo = function () {
            var pageUrl = req.headers.referer;

            var query = URL.parse(pageUrl, true).query;

            if (query && query.proxy) {
                var pair = query.proxy.split(':');
                return {
                    host: pair[0],
                    port: pair[1] || 80
                }
            }
            return false;
        };

        var doProxy = function () {
            var options = {
                host: proxyInfo.host,
                port: proxyInfo.port,
                path: req.url,
                method: req.method,
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8'
                }
                // headers: {
                //   // 如果代理服务器需要认证
                //   'Proxy-Authentication': 'Base ' + new Buffer('user:password').toString('base64')    // 替换为代理服务器用户名和密码
                // }
            };

            var proxyReq = http.request(options, function(proxyRes) {
                res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
                proxyRes.pipe(res);
            });

            req.on('data', function (data) {
                proxyReq.write(data);
            });

            req.on('end', function () {
                proxyReq.end();
            });
        };

        if (proxyInfo === undefined) {
            proxyInfo = getProxyInfo();
        }

        if (proxyInfo) {
            doProxy();
            return ;
        }

        var doMock = function (params, pathName) {
            res.writeHead(200, {'Content-Type': 'application/json;charset=UTF-8'});
            try {
                var path = require.resolve(pathNormalize('../mock/' + pathName.replace(/\.ajax$/, '')));
                delete require.cache[path];
                var result = require(path);
                if (typeof result === 'function') {
                    result = result(params);
                }
                if (!isNaN(result.sleep) && result.sleep > 0) {
                    setTimeout(function () {
                        //delete result.sleep;
                        res.end(JSON.stringify(result));
                    }, result.sleep);
                } else {
                    res.end(JSON.stringify(result));
                }
            } catch (e) {
                console.log(e);
                res.end(JSON.stringify({
                    status: 500
                }));
            }
        };
        var method = req.method.toUpperCase();
        var urlInfo = URL.parse(req.url, true);
        var contentType = req.headers['content-type'];
        if (formDataReg.test(contentType)) {
            req.once('data', function(data) {
                doMock(queryString.parse(String(data, 'UTF-8')), urlInfo.pathname);
            });
            return;
        }
        var params = '';
        if (method === 'POST') {
            req.on('data', function (data) {
                params += data;
            });
            req.on('end', function () {
                doMock(queryString.parse(params), urlInfo.pathname);
            });
        } else if (method === 'GET') {
            params = urlInfo.query;
            doMock(params, urlInfo.pathname);
        }
    } else {
        return next();
    }
}