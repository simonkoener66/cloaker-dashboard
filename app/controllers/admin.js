var session = require('express-session');
var crypto = require('crypto');
var google = require('googleapis');
var OAuth2Client = google.auth.OAuth2;
var plus = google.plus('v1');

var CLIENT_ID = '794547063462-klinv1to3d5fk5uatrk7g97o5lkhi17e.apps.googleusercontent.com';
var CLIENT_SECRET = '5ZL9WC3xLmZWQRBhHJZiVq4X';
var REDIRECT_URL = 'http://localhost:3000/admin/googlelogin';

var oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);
var q = require('q');

/**
* Get oAuth2 Token
*/
function getToken(code) {
	var deferred = q.defer();

	oauth2Client.getToken( code, function( err, tokens ) {
		if (err) {
			deferred.reject(err);
			return;
		}
		deferred.resolve(tokens);
    } );

    return deferred.promise;
}

var adminController = function( router ) {

	var googleAuthUrl = oauth2Client.generateAuthUrl( {
		access_type: 'offline',
		scope: [
			'https://www.googleapis.com/auth/userinfo.profile',
			'https://www.googleapis.com/auth/userinfo.email'
		]
	} );

	function generateToken() {
		var sha = crypto.createHash( 'sha256' );
		sha.update( Math.random().toString() );
		return sha.digest( 'hex' );
	}
	
	this.admin = function( req, res, next ) {
		res.render( 'index', { title: 'Cloaker' });
	};

	this.index = function( req, res, next ) {
		res.redirect( '/admin' );
	};

	this.login = function( req, res, next ) {
		res.render( 'login', { title: 'Login to Cloaker', googleAuthUrl: googleAuthUrl } );
	}

	this.loggedInWithGoogle = function( req, res, next ) {
		var code = req.query.code;
		getToken( code ).then( function( tokens ) {
			oauth2Client.setCredentials( tokens );
			plus.people.get( { userId: 'me', auth: oauth2Client }, function( err, profile ) {
				if (err) {
					res.redirect( '/admin/login' );
					return;
				}
				req.session.token = generateToken();	/// email comparison must be done 
				req.session.email = profile.emails[0].value;
				res.redirect( '/admin/#/login/' + req.session.token );
			} );
		}, function(err) {
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
