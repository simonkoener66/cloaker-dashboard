var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var session = require('express-session');
var crypto = require('crypto');

// db init
require('./app/models/init');

// controllers init
var routes = require('./config/routes');

var app = express();

var port = process.env.PORT || 3000;

// view engine setup
app.set('views', path.join(__dirname, 'app/views'));
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// setup session
app.use( session( {
  genid: function( req ) {
    var sha = crypto.createHash( 'sha256' );
    sha.update( Math.random().toString() );
    return sha.digest( 'hex' );
  },
  secret: 'si8gyw45ytwb45nw5',
  resave: false,
  saveUninitialized: false
} ) );

app.use('/', routes);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  res.status(err.status);
  res.render('404', {
    message: err.message,
    error: err
  });
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

console.log('App will listen at port ' + port);
var server = app.listen( port );

module.exports = app;
