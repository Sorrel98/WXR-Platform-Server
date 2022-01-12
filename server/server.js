var http = require('http');
var https = require('https');
var fs = require('fs');
var express = require('express');

var app = express();

//server certification
var httpOptions = {
	key: fs.readFileSync("server/certificate/server.key"), // 서버키
    cert: fs.readFileSync("server/certificate/server.crt"), // 서버인증서
	ca : fs.readFileSync("server/rootCA/rootca.crt"), // ca 인증서
	agent: false
}

//For redirect http to https, Check the redirect location
var httpServer = http.createServer(function (request, response) {
	response.writeHead(302, {'Location': 'https://192.168.1.51'});
	response.end();
}).listen(80, function() {
	console.log('Redirect server running');
});

var httpsServer = https.createServer(httpOptions, app).listen(443, function() {
    console.log('https server is running');
});

exports.app = app;
exports.express = express;