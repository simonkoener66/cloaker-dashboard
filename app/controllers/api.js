var session = require('express-session');
var crypto = require('crypto');
var google = require('googleapis');
var OAuth2Client = google.auth.OAuth2;
var plus = google.plus('v1');
var config = require('../../config/config');
var multiparty = require('multiparty');

var mongoose = require('mongoose');
var Link = mongoose.model( 'Link' );
var Tag = mongoose.model( 'Tag' );
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
	var allowedEmails = [
		'themeparadise06@gmail.com',
		'stevenngobui@gmail.com',
		'leon.tan3@gmail.com',
		'dho8461@gmail.com'
	];

	function generateToken() {
		var sha = crypto.createHash( 'sha256' );
		sha.update( Math.random().toString() );
		return sha.digest( 'hex' );
	}

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

	function formFromToQuery( from, to ) {
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

	this.checkApiAuth = function( req, res, next ) {
		if( req.headers.token == req.session.token && req.session.token ) {
			next();
		} else {
			res.status( 401 ).json( { 'message': 'API access unauthorized' } );
		}
	}

	function formSearchQuery( keyword, field, query ) {
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

	function updateTagsIfRequired( tags ) {
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

	this.getLinks = function( req, res, next ) {
		var page = req.body.page;
		var pagesize = req.body.pagesize;
		var keyword = req.body.keyword;
		var params = { 
			page: parseInt( page ), 
			limit: parseInt( pagesize )
		};
		if( req.body.sort ) {
			params.sort = req.body.sort;
		}
		var query = formSearchQuery( keyword, 'link_generated' );
		query = formSearchQuery( keyword, 'link_real', query );
		query = formSearchQuery( keyword, 'link_safe', query );
		query = formSearchQuery( keyword, 'tags', query );
		query = formSearchQuery( keyword, 'description', query );
		Link.paginate( query, params, function( err, result ) {
			var return_value = {};
			if( result ) {
				return_value.links = result.docs;
				return_value.total = result.total;
				return_value.limit = result.limit;
				return_value.page = result.page;
				return_value.pages = result.pages;
			} else {
				return_value.links = [];
				return_value.total = 0;
				return_value.limit = pagesize;
				return_value.page = 1;
				return_value.pages = 0;
			}
			res.json( return_value );
		} );
	}

	this.getLink = function( req, res, next ) {
		var id = req.params.id;
		Tag.find(function(err, tags) {
			if(err || !tags) {
				tags = [];
			}
			Link.findById( id, function( err, link ) {
				if( err ) {
					console.log( err );
					res.json( { id: false } );
					return;
				}
				res.json( {
					link: link,
					alltags: tags
				} );
			} );
		});
	};

	this.toggleLink = function( req, res, next ) {
		Link.findById( req.body._id, function( err, link ) {
			if( err ) {
				console.log( err );
				res.json( { result: false } );
				return;
			}
			link.status = !link.status;
			link._id = false;
			Link.findByIdAndUpdate( req.body._id, link, function( err, doc ) {
				if( err ) {
					console.log( err );
					res.json( { result: false } );
					return;
				}
				res.json( { result: true, status: link.status } );
			} );
		} );
	}

	this.deleteLink = function( req, res, next ) {
		var rst = { result: false };
		if( req.body._id ) {
			Link.findByIdAndRemove( req.body._id, function( err, link ) {
				if( err ) {
					console.log( err );
					res.json( rst );
					return;
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

	this.newOrUpdateLink = function( req, res, next ) {
		var updated_link = {
			link_generated: req.body.link_generated,
			link_real: req.body.link_real,
			link_safe: req.body.link_safe,
			description: req.body.description,
			owner: req.body.owner,
			tags: req.body.tags,
			status: true,
			total_hits: req.body.total_hits,
			real_hits: req.body.real_hits,
			use_ip_blacklist: req.body.use_ip_blacklist,
			criteria: copyLinkRegions( req.body.criteria ),
			criteria_disallow: copyLinkRegions( req.body.criteria_disallow )
		};
		if( updated_link.link_generated.substr( 0, 1 ) != '/' ) {
      updated_link.link_generated = '/' + updated_link.link_generated;
    }
    // Duplication check is added
    dupCriteria = { 
    	link_generated: updated_link.link_generated
    };
    if(req.body._id) {
    	dupCriteria._id = { '$ne': req.body._id };
    }
    Link.findOne(dupCriteria, function(err, doc) {
    	if(!err && doc) {
				res.json( {
					id: false,
					duplicated: true
				} );
				return;
    	}
    	// Update or create
    	if( req.body._id ) {
				Link.findByIdAndUpdate( req.body._id, updated_link, function( err, link ) {
					if( err ) {
						console.log( err );
						res.json( { id: false } );
						return;
					}
					updateTagsIfRequired(req.body.tags);
					res.json( link );
				} );
			} else {
				Link.create( updated_link, function( err, link ) {
					if( err ) {
						console.log( err );
						res.json( { id: false } );
						return;
					}
					updateTagsIfRequired(req.body.tags);
					res.json( link );
				} );
			}
    });
	};

	this.admin = function( req, res, next ) {
		if( req.get('host') == config.loginUrl ) {
			res.render( 'index', { 
				title: 'Phantom',
				token: req.session.token,
				email: req.session.email
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
				googleAuthUrl: googleAuthUrl
			} );
		} else {
			res.redirect( 'https://www.google.com' );
		}
	}

	this.loggedInWithGoogle = function( req, res, next ) {
		var code = req.query.code;
		getToken( code ).then( function( tokens ) {
			oauth2Client.setCredentials( tokens );
			plus.people.get( { userId: 'me', auth: oauth2Client }, function( err, profile ) {
				if (err) {
					console.log( err );
					res.redirect( '/admin/login' );
					return;
				}
				var allowed = false;
				allowedEmails.every( function( email ) {
					if( email == profile.emails[0].value ) {
						allowed = true;
						req.session.token = generateToken();
						req.session.email = profile.emails[0].value;
						setTimeout( function() {
							res.redirect( '/admin' );
						}, 100 );
						return false;
					}
					return true;
				} );
				if( !allowed ) {
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
		var keyword = req.params.keyword;
		var query = formSearchQuery( keyword, 'link_generated' );
		var sortField = '-access_time';
		if( req.params.sort ) {
			sortField = req.params.sort;
		}
		Traffic.paginate( query, { page: parseInt( page ), limit: parseInt( pagesize ), sort: sortField }, function( err, result ) {
			var return_value = {};
			if( result ) {
				return_value.traffics = result.docs;
				return_value.total = result.total;
				return_value.limit = result.limit;
				return_value.page = result.page;
				return_value.pages = result.pages;
			} else {
				return_value.traffics = [];
				return_value.total = 0;
				return_value.limit = pagesize;
				return_value.page = 1;
				return_value.pages = 0;
			}
			res.json( return_value );
		} );
	};

	this.exportTraffics = function( req, res, next ) {
		if( req.session.token ) {
			var query = formFromToQuery( req.params.from, req.params.to );
			console.log(query);
			Traffic.find( query, function( err, docs ) {
				res.setHeader( 'Content-disposition', 'attachment; filename=traffics.csv' );
				var data = 'IP,Generated Link,Allowed Real Link,Real Link,Safe Link,Geolocation,Access Time' + "\n";
				docs.forEach( function( traffic ) {
					data += traffic.ip + ',';
					data += traffic.link_generated + ',';
					data += traffic.used_real + ',';
					data += traffic.link_real + ',';
					data += traffic.link_safe + ',';
					data += '"' + traffic.geolocation + '",';
					data += traffic.access_time + "\n";
				} );
				res.write( data );
				res.end();
			} );
		} else {
			res.status( 404 ).json( { message: 'API access unauthorized' } );
		}
	}

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

	this.exportBlacklist = function( req, res, next ) {
		if( req.session.token ) {
			BlacklistedIP.find( {}, function( err, docs ) {
				res.setHeader( 'Content-disposition', 'attachment; filename=ipblacklist.csv' );
				var data = 'IP,Description' + "\n";
				docs.forEach( function( ip ) {
					data += ip.ip + ',';
					data += '"' + ip.description + "\"\n";
				} );
				res.write( data );
				res.end();
			} );
		} else {
			res.status( 404 ).json( { message: 'API access unauthorized' } );
		}
	}

	this.importBlacklist = function( req, res, next ) {
		if( !req.session.token ) {
			res.status( 404 ).json( { message: 'API access unauthorized' } );
		}
		var form = new multiparty.Form();
		var data = '';
		form.on( 'close', function() {
			var records = data.split( "\n" );
			var first = true;
			records.forEach( function( record ) {
				var fields = record.split( ',' );
				if( fields[0] && /^[0-9\:\.]*$/.test( fields[0] ) ) {
					var new_ip = {
						ip: fields[0],
						description: fields[1]
					};
					BlacklistedIP.create( new_ip, function( err, doc ) {
						if( err ) console.log( err );
					} );
				}
			} );
			res.status( 200 ).json( { message: 'Done' } );
		} );
		form.on( 'part', function( part ){
			if( part.name !== 'file' ) {
				return part.resume();
			}
			part.on( 'data', function( buf ){
				data += buf.toString();
			} );
		} );
		form.parse(req);
	}

	this.getIPBlacklist = function( req, res, next ) {
		var page = req.body.page;
		var pagesize = req.body.pagesize;
		var params = { 
			page: parseInt( page ), 
			limit: parseInt( pagesize )
		};
		if( req.body.sort ) {
			params.sort = req.body.sort;
		}
		var keyword = req.body.keyword;
		var query = formSearchQuery( keyword, 'ip' );

		initIPBlacklist();

		BlacklistedIP.paginate( query, params, function( err, result ) {
			var return_value = {};
			if( result ) {
				return_value.ips = result.docs;
				return_value.total = result.total;
				return_value.limit = result.limit;
				return_value.page = result.page;
				return_value.pages = result.pages;
			} else {
				return_value.ips = [];
				return_value.total = 0;
				return_value.limit = pagesize;
				return_value.page = 1;
				return_value.pages = 0;
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
				return;
			}
			res.json( doc );
		} );
	}

	this.editBlacklistIP = function( req, res, next ) {
		var editingIP = {
			ip: req.body.ip,
			description: req.body.description
		};
		// Duplication check is added
    dupCriteria = { 
      ip: editingIP.ip
    };
    if(req.body._id) {
      dupCriteria._id = { '$ne': req.body._id };
    }
    BlacklistedIP.findOne(dupCriteria, function(err, doc) {
      if(!err && doc) {
        res.json( {
          id: false,
          duplicated: true
        } );
        return;
      }
			if( req.body._id ) {
				BlacklistedIP.findByIdAndUpdate( req.body._id, editingIP, function( err, doc ) {
					if( err ) {
						console.log( err );
						res.json( { id: false } );
						return;
					}
					res.json( doc );
				} );
			} else {
				BlacklistedIP.create( editingIP, function( err, doc ) {
					if( err ) {
						console.log( err );
						res.json( { id: false } );
						return;
					}
					res.json( doc );
				} );
			}
		});
	}

	this.deleteBlacklistIP = function( req, res, next ) {
		var rst = { result: false };
		if( req.body._id ) {
			BlacklistedIP.findByIdAndRemove( req.body._id, function( err, link ) {
				if( err ) {
					console.log( err );
					res.json( rst );
					return;
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
