"use strict";
var config = require('./config/config');

global.config = config;

var express = require('express');

var app = express();

// all environments
app.set('port', config.web.node.port);
app.set('host', config.web.node.host);
app.use(express.logger('dev'));

// development only
if ('development' === app.get('env')) {
    app.use(express.errorHandler());
}

var server = http.createServer(app);

server.listen(app.get('port'), app.get('host'), function(){
    logger.info(
        'Express server listening on %s:%s, %s mode',
        app.get('host'),
        app.get('port'),
        app.get('env')
    );
});

var nodeUniqueId = '{'+app.get('host')+':'+app.get('port')+'}';

var io = require('socket.io').listen(server);



