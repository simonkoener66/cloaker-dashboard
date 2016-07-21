var session = require('express-session');
var crypto = require('crypto');
var google = require('googleapis');
var OAuth2Client = google.auth.OAuth2;
var plus = google.plus('v1');
var config = require('../../config/config');
var multiparty = require('multiparty');
var moment = require('moment-timezone');

var helpers = require( './helpers' );

var oauth2Client = helpers.oauth2Client;

var mongoose = require('mongoose');
var User = mongoose.model( 'User' );

var adminController = function( router ) {

  this.admin = function( req, res, next ) {
    if( req.get('host') == config.loginUrl ) {
      res.render( 'index', { 
        title: 'Phantom',
        token: req.session.token,
        email: req.session.email,
        owner: req.session.owner,
        role: req.session.role
      } );
    } else {
      res.redirect( 'https://www.google.com' );
    }
  };

  this.index = function( req, res, next ) {
    res.redirect( '/admin' );
  };

  this.loginAdmin = function( req, res, next ) {
    if( req.get('host') == config.loginUrl ) {
      res.render( 'login', { 
        title: 'Login to Phantom', 
        googleAuthUrl: helpers.googleAuthUrl
      } );
    } else {
      res.redirect( 'https://www.google.com' );
    }
  }

  this.loggedInWithGoogle = function( req, res, next ) {
    var code = req.query.code;
    helpers.getToken( code ).then( function( tokens ) {
      oauth2Client.setCredentials( tokens );
      plus.people.get( { userId: 'me', auth: oauth2Client }, function( err, profile ) {
        if (err) {
          console.log( err );
          res.redirect( '/admin/login' );
          return;
        }
        User.find({ email: profile.emails[0].value.toLowerCase() }, function( err, users ) {
          var user = false;
          if( users && users.length > 0 ) {
            user = users[0];
          } else {
            for(var i = 0; i < 3; i++) {
              if( helpers.defaultUsers[i].email == profile.emails[0].value.toLowerCase() ) {
                user = helpers.defaultUsers[i];
                break;
              }
            }
            if( !user ) {
              res.status( 404 ).send( 'Invalid email.' );
              return;
            }
          }
          if( user ) {
            req.session.token = helpers.generateToken();
            req.session.email = profile.emails[0].value;
            req.session.owner = user.owner;
            req.session.role = user.role;
            setTimeout( function() {
              res.redirect( '/admin' );
            }, 100 );
          }
        } );
      } );
    }, function(err) {
      res.send( 'Failed to get token' );
      res.send( err );
    } );
  }

  this.checkAdminAuth = function( req, res, next ) {
    if( !req.session.token ) {
      res.redirect( '/admin/login' );
    } else {
      next();
    }
  }

}

module.exports = new adminController();
