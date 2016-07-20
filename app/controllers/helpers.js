var session = require('express-session');
var crypto = require('crypto');
var google = require('googleapis');
var OAuth2Client = google.auth.OAuth2;
var plus = google.plus('v1');
var config = require('../../config/config');
var multiparty = require('multiparty');
var moment = require('moment-timezone');

var mongoose = require('mongoose');
var Link = mongoose.model( 'Link' );
var Tag = mongoose.model( 'Tag' );
var Traffic = mongoose.model( 'Traffic' );
var BlacklistedIP = mongoose.model( 'BlacklistedIP' );
var Network = mongoose.model( 'Network' );
var GeoBlacklist = mongoose.model( 'GeoBlacklist' );
var User = mongoose.model( 'User' );

var oauth2Client = new OAuth2Client(
	config.googleClientID, 
	config.googleClientSecret, 
	config.googleLoginRedirectUrl
);
var q = require('q');



/**
 * Unexported functions 
 */

function dateFromMmddyyyy( mdy, endtime ) {
	if( endtime ) {
		return new Date(
			parseInt( mdy.substr( 4 ) ),
			parseInt( mdy.substr( 0, 2 ) ),
			parseInt( mdy.substr( 2, 2 ) ),
			23, 59, 59
		);
	} else {
		return new Date(
			parseInt( mdy.substr( 4 ) ),
			parseInt( mdy.substr( 0, 2 ) ),
			parseInt( mdy.substr( 2, 2 ) ),
			0, 0, 0
		);
	}
}



/**
 * Exported functions and variables
 */

module.exports.googleAuthUrl = oauth2Client.generateAuthUrl( {
	access_type: 'offline',
	scope: [
		'https://www.googleapis.com/auth/userinfo.profile',
		'https://www.googleapis.com/auth/userinfo.email'
	]
} );

module.exports.defaultUsers = [
	{ email: 'themeparadise06@gmail.com', owner: 'Simon', role: 'admin' },
	{ email: 'stevenngobui@gmail.com', owner: 'Steven', role: 'admin' },
	{ email: 'dho8461@gmail.com', owner: 'Dennis', role: 'admin' },
	{ email: 'leon.tan3@gmail.com', owner: 'Leon', role: 'user' },
	{ email: 'calvinchan90@gmail.com', owner: 'Calvin', role: 'user' },
	{ email: 'xjunanguyen@gmail.com', owner: 'Juna Nguyen', role: 'user' },
	{ email: 'abdulmalekali17@gmail.com', owner: 'Ali', role: 'user' },
	{ email: 'caseylui511@gmail.com', owner: 'Casey', role: 'user' },
	{ email: 'neil.bnfaw@gmail.com', owner: 'Neil', role: 'user' },
	{ email: 'viccyran@gmail.com', owner: 'Viccyran', role: 'user' }
];

/**
 * Get oAuth2 Token
 */
module.exports.getToken = function(code) {
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

module.exports.generateToken = function() {
	var sha = crypto.createHash( 'sha256' );
	sha.update( Math.random().toString() );
	return sha.digest( 'hex' );
}

module.exports.formFromToQuery = function( from, to ) {
	var query = {};
	var condition_exists = false;
	var condition = {};
	if( from && from != '0' ) {
		var fromDate = dateFromMmddyyyy( from );
		condition_exists = true;
		condition['$gte'] = fromDate;
	}
	if( to && to != '0' ) {
		var toDate = dateFromMmddyyyy( to, true );
		condition_exists = true;
		condition['$lte'] = toDate;
	}
	if( condition_exists ) {
		query = {
			access_time: condition
		}
	}
	return query;
}

module.exports.formSearchQuery = function( keyword, field, query ) {
	if( !query ) {
		query = {};
	}
	if( keyword ) {
		var or_conditions = [];
		if(query['$or']) {
			or_conditions = query['$or'];
		}
		var condition = {};
		condition[field] = new RegExp( ".*" + keyword + ".*", "i" );
		or_conditions.push(condition);
		query = {
			'$or': or_conditions
		};
	}
	return query;
}

module.exports.updateTagsIfRequired = function( tags ) {
	tags.forEach(function(tag) {
		Tag.findOne({ tag: tag }, function(err, doc) {
			if(err) {
				console.log(err);
				return;
			}
			if(doc) {
				return;
			}
			Tag.create( { tag: tag }, function( err, tagDoc ) {} );
		});
	});
}

module.exports.copyLinkRegions = function( original_criteria ) {
  var criteria = [];
  if( original_criteria ) {
    original_criteria.forEach( function( criterion ) {
      criteria.push( {
        country: ( criterion.country ) ? criterion.country : '',
        region: ( criterion.region ) ? criterion.region : '',
        city: ( criterion.city ) ? criterion.city : ''
      } );
    } );
  }
  return criteria;
}

module.exports.generateUTM = function(prevUtm) {
  if (prevUtm) {
    return prevUtm;
  } else {
    return parseInt(10000000 + (99999999 - 10000000) * Math.random()).toString();
  }
}

module.exports.escapeUndefined = function(val) {
	if(typeof val === 'undefined') {
		return '';
	}
	return val;
}

module.exports.removeQuotes = function(str) {
	if(!str) {
		return '';
	}
	str = str.trim();
	if(str.substr(0,1) == '"') {
		str = str.substr(1);
	}
	if(str && str.substr(str.length - 1, 1) == '"') {
		str = str.substr(0, str.length - 1);
	}
	return str;
}

module.exports.checkApiAuth = function( req, res, next ) {
	if( req.headers.token == req.session.token && req.session.token ) {
		next();
	} else {
		res.status( 401 ).json( { 'message': 'API access unauthorized' } );
	}
}

module.exports.initIPBlacklist = function() {
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
