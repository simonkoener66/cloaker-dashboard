var session = require('express-session');
var crypto = require('crypto');
var google = require('googleapis');
var OAuth2Client = google.auth.OAuth2;
var plus = google.plus('v1');
var config = require('../../config/config');

var mongoose = require('mongoose');
var Link = mongoose.model( 'Link' );
var Traffic = mongoose.model( 'Traffic' );
var BlacklistedIP = mongoose.model( 'BlacklistedIP' );

var oauth2Client = new OAuth2Client(
	config.googleClientID, 
	config.googleClientSecret, 
	config.googleLoginRedirectUrl
);
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

var apiController = function( router ) {

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

	this.checkApiAuth = function( req, res, next ) {
		if( req.headers.token == req.session.token && req.session.token ) {
			next();
		} else {
			res.status( 401 ).json( { 'message': 'API access unauthorized' } );
		}
	}

	this.getLink = function( req, res, next ) {
		var id = req.params.id;
		Link.findById( id, function( err, link ) {
			if( err ) {
				console.log( err );
				res.json( { id: false } );
			}
			res.json( link );
		} );
	};

	this.getLinks = function( req, res, next ) {
		Link.find( function( err, links ) {
			if( err ) {
				console.log( err );
				res.json( [] );
			}
			res.json( links );
		} );
	};

	this.deleteLink = function( req, res, next ) {
		var rst = { result: false };
		if( req.body._id ) {
			Link.findByIdAndRemove( req.body._id, function( err, link ) {
				if( err ) {
					console.log( err );
					res.json( rst );
				}
				rst.result = true;
				res.json( rst );
			} );
		} else {
			res.json( rst );
		}
	};

	function copyLinkRegions( original_criteria ) {
		var criteria = [];
		original_criteria.forEach( function( criterion ) {
			criteria.push( {
				country: ( criterion.country ) ? criterion.country : '',
				region: ( criterion.region ) ? criterion.region : '',
				city: ( criterion.city ) ? criterion.city : ''
			} );
		} );
		return criteria;
	}

	this.editLink = function( req, res, next ) {
		var updated_link = {
			link_generated: req.body.link_generated,
			link_real: req.body.link_real,
			link_safe: req.body.link_safe,
			total_hits: req.body.total_hits,
			real_hits: req.body.real_hits,
			use_ip_blacklist: req.body.use_ip_blacklist,
			criteria: copyLinkRegions( req.body.criteria )
		};
		if( req.body._id ) {
			Link.findByIdAndUpdate( req.body._id, updated_link, function( err, link ) {
				if( err ) {
					console.log( err );
					res.json( { id: false } );
				}
				res.json( link );
			} );
		} else {
			Link.create( updated_link, function( err, link ) {
				if( err ) {
					console.log( err );
					res.json( { id: false } );
				}
				res.json( link );
			} );
		}
	};

	this.admin = function( req, res, next ) {
		res.render( 'index', { title: 'Cloaker' });
	};

	this.index = function( req, res, next ) {
		res.redirect( '/admin' );
	};

	this.loginAdmin = function( req, res, next ) {
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
				if( profile.emails[0].value == 'hakim.jaya666@gmail.com' || profile.emails[0].value == 'stevenngobui@gmail.com' ) {
					req.session.token = generateToken();	/// email comparison must be done 
					req.session.email = profile.emails[0].value;
					res.redirect( '/admin#/login/' + req.session.token + '/' + req.session.email );
				} else {
					res.status( 404 ).send( 'Invalid credential.' );
				}
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

	this.getTraffics = function( req, res, next ) {
		var page = req.params.page;
		var pagesize = req.params.pagesize;
		Traffic.paginate( {}, { page: parseInt( page ), limit: parseInt( pagesize ) }, function( err, result ) {
			var return_value = {};
			if( result ) {
				return_value.traffics = result.docs;
				return_value.total = result.total;
				return_value.limit = result.limit;
				return_value.page = result.page;
				return_value.pages = result.pages;
			} else {
				return_value.traffics = [];
			}
			res.json( return_value );
		} );
	};

	function initIPBlacklist() {
		var initialList = [
			{ ip: '0.0.0.0', description: 'Reserved Address. Must not be used' },
			{ ip: '127.0.0.1', description: 'Loopback Address. Must not be used' },
			{ ip: '255.255.255.255', description: 'Reserved Address. Must not be used' }
		];
		BlacklistedIP.count( {}, function( err, count ) {
			if( count == 0 ) {
				initialList.forEach( function( iprecord ) {
					BlacklistedIP.create( iprecord, function( err, link ) {
					} );
				} );
			}
		} );
	}

	this.getIPBlacklist = function( req, res, next ) {
		var page = req.params.page;
		var pagesize = req.params.pagesize;
		initIPBlacklist();
		BlacklistedIP.paginate( {}, { page: parseInt( page ), limit: parseInt( pagesize ) }, function( err, result ) {
			var return_value = {};
			if( result ) {
				return_value.ips = result.docs;
				return_value.total = result.total;
				return_value.limit = result.limit;
				return_value.page = result.page;
				return_value.pages = result.pages;
			} else {
				return_value.ips = [];
			}
			res.json( return_value );
		} );
	}

	this.getIPBlacklistSingle = function( req, res, next ) {
		var id = req.params.id;
		BlacklistedIP.findById( id, function( err, doc ) {
			if( err ) {
				console.log( err );
				res.json( { id: false } );
			}
			res.json( doc );
		} );
	}

	this.editBlacklistIP = function( req, res, next ) {
		if( req.body._id ) {
			var updated_ip = {
				'ip': req.body.ip,
				'description': req.body.description
			};
			BlacklistedIP.findByIdAndUpdate( req.body._id, updated_ip, function( err, doc ) {
				if( err ) {
					console.log( err );
					res.json( { id: false } );
				}
				res.json( doc );
			} );
		} else {
			BlacklistedIP.create( req.body, function( err, doc ) {
				if( err ) {
					console.log( err );
					res.json( { id: false } );
				}
				res.json( doc );
			} );
		}
	}

	this.deleteBlacklistIP = function( req, res, next ) {
		var rst = { result: false };
		if( req.body._id ) {
			BlacklistedIP.findByIdAndRemove( req.body._id, function( err, link ) {
				if( err ) {
					console.log( err );
					res.json( rst );
				}
				rst.result = true;
				res.json( rst );
			} );
		} else {
			res.json( rst );
		}
	}
}

module.exports = new apiController();
