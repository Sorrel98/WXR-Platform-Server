const fs = require('fs');

const express = require('express');
const app = express();
const session = require('express-session');
const sharedSession = require('express-socket.io-session');
const http = require('http');
const https = require('https');

const SqlError = require('mariadb').SqlError;
const DBError = require('./lib/errors').DBError;


// httpsOptions
const httpsOptions = {
	key: fs.readFileSync("cert/server.key"),	// server's private key
    cert: fs.readFileSync("cert/server.crt"), // server's certificate
	ca : fs.readFileSync("cert/rootca.crt"), 		// CA's certificate
	agent: false
}

// parse application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
// parse application/json
app.use(express.json());
app.session = session({
    secret: '@dFaL^ASdD!*',
    resave: false,
    saveUninitialized: true
});
app.use(app.session);
app.use(express.static(__dirname + '/public'));


// add routers
app.use('/', require('./routes/root'));
app.use('/', require('./routes/workspace'));
app.use('/', require('./routes/asset'));


//For redirect http to https, Check the redirect location
const httpServer = http.createServer(function (request, response) {
	response.writeHead(302, {'Location': 'https://192.168.1.51'});
	response.end();
}).listen(80, function() {
	console.log('Redirect server running');
});

const httpsServer = https.createServer(httpsOptions, app).listen(443, function() {
    console.log('https server is running');
});

const io = require('socket.io')(httpsServer);
io.use(sharedSession(app.session, { autosave: true }));
const sessionManager = require('./session').sessionManager.init(io);


// Error Handling
// **************************************************************************** //

app.use(function dbErrorHandler(error, request, response, next){

    if(!(error instanceof DBError)){
        return next(error);
    }

    response.status(error.statusCode).end(error.message);
    // if (process.env.DEBUG){
    //     console.log(error);
    // }
    console.log(error);
})

app.use(function dbPoolAPIErrorHandler(error, request, response, next) {
    
    if(!(error instanceof SqlError)){
        return next(error);
    }
    
    const { errno } = error;
    switch(errno) {
        case 1152:
        case 45028:
            // Fail to connect DB
            response.status(500).end(`Fail to connect DB (errno : ${errno})`);
            break;

        case 1205:  // DB Transaction error
            response.status(500).end(`DB Transaction error  (errno : ${errno})`);
            break;

        case 1062:  // Duplicate name or email
            response.status(500).end(`Duplicate name or email (errno : ${errno})`);
            break;

        // case ???:   // DB query error
        //     response.end(`DB query error (errno : ${error.errno})`);
        //     break;

        default:    // Other errors...
            response.status(500).end(`Maybe DB error or not (errno : ${errno})`);
    }

    // if (process.env.DEBUG){
    //     console.log(error);
    // }
    console.log(error.lineNumber);
    console.log(error);
});

app.use(function generalErrorHandler(error, request, response, next) {
    // response.status(500).end(error.message);
    // if (process.env.DEBUG){
    //     console.log(error);
    // }
    response.status(error.statusCode).end();
    console.log(error);
});