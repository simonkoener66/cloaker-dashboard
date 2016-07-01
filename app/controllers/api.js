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

	this.getUsers = function( req, res, next ) {
		var users = [];
		allowedEmails.forEach( function( user ) {
			users.push( user.owner );
		} );
		res.json( {
			admin: ( req.session.role == 'admin' ),
			users: users
		} );
	}

	this.getLinks = function( req, res, next ) {
		var page = req.body.page;
		var pagesize = req.body.pagesize;
		var keyword = req.body.keyword;
		var params = { 
			page: parseInt( page ), 
			limit: parseInt( pagesize ),
			sort: '-created_time'
		};
		if( req.body.sort ) {
			params.sort = req.body.sort;
		}
		var query = formSearchQuery( keyword, 'link_generated' );
		query = formSearchQuery( keyword, 'link_real', query );
		query = formSearchQuery( keyword, 'link_safe', query );
		query = formSearchQuery( keyword, 'tags', query );
		query = formSearchQuery( keyword, 'description', query );
		query = formSearchQuery( keyword, 'owner', query );
		// owner
		if( req.session.role == 'admin' ) {
			if(req.body.ownerFilter && !keyword) {
				query = formSearchQuery( req.body.ownerFilter, 'owner', query );
			}
		} else {
			query = formSearchQuery( req.session.owner, 'owner', query );
		}
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

	function generateUTM(prevUtm) {
		if (prevUtm) {
			return prevUtm;
		} else {
			return parseInt(10000000 + (99999999 - 10000000) * Math.random()).toString();
		}
	}

	this.newOrUpdateLink = function( req, res, next ) {
		var updated_link = {
			link_generated: req.body.link_generated,
			utm: req.body.use_utm ? generateUTM( req.body.utm ) : "",
			link_real: req.body.link_real,
			link_safe: req.body.link_safe,
			description: req.body.description,
			owner: req.session.owner,
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
    if (updated_link.utm) {
    	dupCriteria.utm = updated_link.utm;
    } else {
    	dupCriteria.utm = "";
    }
    if (req.body._id) {
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
				updated_link.created_time = new Date();
		  	updated_link.total_hits = 0;
		  	updated_link.real_hits = 0;
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
				email: req.session.email,
				owner: req.session.owner
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
				allowedEmails.every( function( record ) {
					if( record.email.toLowerCase() == profile.emails[0].value.toLowerCase() ) {
						allowed = true;
						req.session.token = generateToken();
						req.session.email = profile.emails[0].value;
						req.session.owner = record.owner;
						req.session.role = record.role;
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
		// owner
		if( req.session.role == 'admin' ) {
			if(req.query.ownerFilter && !keyword) {
				query = formSearchQuery( req.query.ownerFilter, 'owner', query );
			}
		} else {
			query = formSearchQuery( req.session.owner, 'owner', query );
		}
		// sort
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
      // from/to date query
      var query = formFromToQuery( req.params.from, req.params.to );
      // owner
      query = formOwnerQuery( query, req.session.owner );
      var page = 1, pagesize = 1000, data = '';
      // Sendout file header and column header first
      res.setHeader( 'Content-disposition', 'attachment; filename=traffics.csv' );
      res.setHeader( 'Content-Type', 'text/plain' );
      res.setHeader( 'Transfer-Encoding', 'chunked' );
      res.flushHeaders();

      res.write('IP,Generated Link,Allowed Real Link,Real Link,Safe Link,Geolocation,Access Time,Blacklisted IP,Network,Location' + "\n");

      // Start with timer and load page by page
      var timer;
      function stopTimer() {
        res.end();
        clearInterval(timer);
      }

      function loadCycle() {
      	Traffic.paginate( query, { page: parseInt(page), limit: parseInt(pagesize), sort: '-access_time' }, function( err, result ) {
          if( result ) {
            data = '';
            result.docs.forEach( function( traffic ) {
              data += traffic.ip + ',';
              data += traffic.link_generated + ',';
              data += traffic.used_real + ',';
              data += traffic.link_real + ',';
              data += traffic.link_safe + ',';
              data += '"' + traffic.geolocation + '",';
              var format = 'YYYY-MM-DD HH:mm:ss';
              data += moment(traffic.access_time).tz('EST').format(format) + ',';
              data += traffic.blacklisted + ',';
              data += '"' + traffic.bl_network + '",';
              data += '"' + traffic.bl_location + '"\n';
            } );
            res.write( data );
            if(page < result.pages) {
              page++;
              setTimeout( loadCycle, 20 );
            } else {
            	res.end();
            }
          } else {
          	res.end();
          }
        } );
      }
      
      // Start timer
      setTimeout( loadCycle, 20 );
      
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

	function escapeUndefined(val) {
		if(typeof val === 'undefined') {
			return '';
		}
		return val;
	}

	this.exportBlacklist = function( req, res, next ) {
		if( req.session.token ) {
			BlacklistedIP.find( {}, function( err, docs ) {
				res.setHeader( 'Content-disposition', 'attachment; filename=ipblacklist.csv' );
				var data = 'IP,Description,Network,Location' + "\n";
				docs.forEach( function( ip ) {
					data += ip.ip + ',';
					data += '"' + escapeUndefined(ip.description) + "\",";
					data += '"' + escapeUndefined(ip.network) + "\",";
					data += '"' + escapeUndefined(ip.location) + "\"\n";
				} );
				res.write( data );
				res.end();
			} );
		} else {
			res.status( 404 ).json( { message: 'API access unauthorized' } );
		}
	}

	function removeQuotes(str) {
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
				fields[0] = fields[0].trim();
				if( fields[0] && /^[0-9\:\.]*$/.test( fields[0] ) ) {
					dupCriteria = { 
			      ip: fields[0]
			    };
			    BlacklistedIP.findOne(dupCriteria, function(err, doc) {
			      if(!err && doc) {
			        return;
			      }
						var new_ip = {
							ip: fields[0],
							description: removeQuotes(fields[1]),
							network: removeQuotes(fields[2]),
							location: removeQuotes(fields[3])
						};
						BlacklistedIP.create( new_ip, function( err, doc ) {} );
					});
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
		query = formSearchQuery( keyword, 'description', query );
		query = formSearchQuery( keyword, 'network', query );
		query = formSearchQuery( keyword, 'location', query );

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
		Network.find(function(err, nets) {
			if(err || !nets) {
				nets = [];
			}
			BlacklistedIP.findById( id, function( err, doc ) {
				if( err ) {
					console.log( err );
					res.json( { id: false } );
					return;
				}
				res.json( {
					blacklisted: doc,
					networks: nets
				} );
			} );
		});
	}

	function updateExistingBlacklistedIP( res, id, editingIP ) {
		// Duplication check is added
    dupCriteria = { 
      ip: editingIP.ip
    };
    dupCriteria._id = { '$ne': id };
    BlacklistedIP.findOne(dupCriteria, function(err, doc) {
      if(!err && doc) {
        res.json( {
          id: false,
          result: false,
          duplicated: true
        } );
        return;
      }
			BlacklistedIP.findByIdAndUpdate( id, editingIP, function( err, doc ) {
				if( err ) {
					console.log( err );
					res.json( { 
						id: false,
						result: false
					} );
					return;
				}
				res.json( {
					result: true,
					ip: doc
				} );
			} );
		});
	}

	function addIPtoBlacklist( res, editingIP ) {
		var ips = editingIP.ip.split(',');
		var dup = false, result = false;
		var ipCount = ips.length, doneCount = 0;
		ips.forEach( function(ip) {
			ip = ip.trim();
	    dupCriteria = { 		// Duplication check criteria
	      ip: ip
	    };
	    BlacklistedIP.findOne(dupCriteria, function(err, doc) {
	      if(!err && doc) {
	        dup = true;
	        doneCount++;
	        if(doneCount >= ipCount) {
						res.json({ result: result, duplicated: dup });
					}
	        return;
	      }
	      editingIP.ip = ip;
				BlacklistedIP.create( editingIP, function( err, doc ) {
					doneCount++;
					if( err ) {
						console.log( err );
					} else {
						result = true;
					}
					if(doneCount >= ipCount) {
						res.json({ result: result, duplicated: dup });
					}
				} );
			});
		});
	}

	this.editBlacklistIP = function( req, res, next ) {
		var editingIP = {
			ip: req.body.ip,	// req.body.ip can be multiple ips separated by comma when adding to list
			description: req.body.description,
			network: req.body.network,
			location: req.body.location
		};
		if(req.body._id) {
			updateExistingBlacklistedIP( res, req.body._id, editingIP );
		} else {
			addIPtoBlacklist( res, editingIP );
		}
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

	this.getNetworks = function( req, res, next ) {
		var page = req.body.page;
		var pagesize = req.body.pagesize;
		var params = { 
			page: parseInt( page ), 
			limit: parseInt( pagesize )
		};
		if( req.body.sort ) {
			params.sort = req.body.sort;
		}
		var query = {};
		Network.paginate( query, params, function( err, result ) {
			var return_value = {};
			if( result ) {
				return_value.networks = result.docs;
				return_value.total = result.total;
				return_value.limit = result.limit;
				return_value.page = result.page;
				return_value.pages = result.pages;
			} else {
				return_value.networks = [];
				return_value.total = 0;
				return_value.limit = pagesize;
				return_value.page = 1;
				return_value.pages = 0;
			}
			res.json( return_value );
		} );
	}

	this.getNetwork = function( req, res, next ) {
		var id = req.params.id;
		Network.findById( id, function( err, doc ) {
			if( err ) {
				console.log( err );
				res.json( { id: false } );
				return;
			}
			res.json( doc );
		} );
	};

	this.deleteNetwork = function( req, res, next ) {
		var rst = { result: false };
		if( req.body._id ) {
			Network.findByIdAndRemove( req.body._id, function( err, doc ) {
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

	this.newOrUpdateNetwork = function( req, res, next ) {
		var updated_network = {
			network: req.body.network,
			description: req.body.description
		};
    // Duplication check is added
    dupCriteria = { 
    	network: updated_network.network
    };
    if(req.body._id) {
    	dupCriteria._id = { '$ne': req.body._id };
    }
    Network.findOne(dupCriteria, function(err, doc) {
    	if(!err && doc) {
				res.json( {
					id: false,
					duplicated: true
				} );
				return;
    	}
    	// Update or create
    	if( req.body._id ) {
				Network.findByIdAndUpdate( req.body._id, updated_network, function( err, doc ) {
					if( err ) {
						console.log( err );
						res.json( { id: false } );
						return;
					}
					res.json( doc );
				} );
			} else {
				Network.create( updated_network, function( err, doc ) {
					if( err ) {
						console.log( err );
						res.json( { id: false } );
						return;
					}
					res.json( doc );
				} );
			}
    });
	};

	this.exportGeoBlacklist = function( req, res, next ) {
    if( req.session.token ) {
      GeoBlacklist.find( {}, function( err, docs ) {
        res.setHeader( 'Content-disposition', 'attachment; filename=geoblacklist.csv' );
        var data = 'Country,Region,City,Description' + "\n";
        docs.forEach( function( geo ) {
          data += '"' + escapeUndefined(geo.country) + "\",";
          data += '"' + escapeUndefined(geo.region) + "\",";
          data += '"' + escapeUndefined(geo.city) + "\",";
          data += '"' + escapeUndefined(geo.description) + "\"\n";
        } );
        res.write( data );
        res.end();
      } );
    } else {
      res.status( 404 ).json( { message: 'API access unauthorized' } );
    }
  }

  this.importGeoBlacklist = function( req, res, next ) {
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
        if( fields[0] === "Country" || !fields[0] ) {
        	return;
        }
        var newRecord = {
          country: removeQuotes(fields[0]),
          region: removeQuotes(fields[1]),
          city: removeQuotes(fields[2]),
          location: removeQuotes(fields[3])
        };
        GeoBlacklist.create( newRecord, function( err, doc ) {} );
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

  this.getGeoBlacklist = function( req, res, next ) {
    var page = req.body.page;
    var pagesize = req.body.pagesize;
    var params = { 
      page: parseInt( page ), 
      limit: parseInt( pagesize )
    };
    if( req.body.sort ) {
      params.sort = req.body.sort;
    }
    var query = {};
    /*var keyword = req.body.keyword;
    var query = formSearchQuery( keyword, 'country' );
    query = formSearchQuery( keyword, 'description', query );
    query = formSearchQuery( keyword, 'network', query );
    query = formSearchQuery( keyword, 'location', query );*/

    GeoBlacklist.paginate( query, params, function( err, result ) {
      var return_value = {};
      if( result ) {
        return_value.items = result.docs;
        return_value.total = result.total;
        return_value.limit = result.limit;
        return_value.page = result.page;
        return_value.pages = result.pages;
      } else {
        return_value.items = [];
        return_value.total = 0;
        return_value.limit = pagesize;
        return_value.page = 1;
        return_value.pages = 0;
      }
      res.json( return_value );
    } );
  }

  this.getGeoBlacklistItem = function( req, res, next ) {
    var id = req.params.id;
    GeoBlacklist.findById( id, function( err, doc ) {
      if( err ) {
        console.log( err );
        res.json( { id: false } );
        return;
      }
      res.json( {
        item: doc
      } );
    } );
  }

  function updateExistingGeoBlacklistItem( res, id, editingIP ) {
    GeoBlacklist.findByIdAndUpdate( id, editingIP, function( err, doc ) {
      if( err ) {
        console.log( err );
        res.json( { 
          id: false,
          result: false
        } );
        return;
      }
      res.json( {
        result: true,
        item: doc
      } );
    } );
  }

  function addGeoBlacklistItem( res, data ) {
    GeoBlacklist.create( data, function( err, doc ) {
      if( err ) {
        res.json({ result: false });
      }
      res.json({ result: true });
    } );
  }

  this.editGeoBlacklistItem = function( req, res, next ) {
    var data = {
      country: req.body.country,
      region: req.body.region,
      city: req.body.city.toLowerCase(),
      description: req.body.description
    };
    if(req.body._id) {
      updateExistingGeoBlacklistItem( res, req.body._id, data );
    } else {
      addGeoBlacklistItem( res, data );
    }
  }

  this.deleteGeoBlacklistItem = function( req, res, next ) {
    var rst = { result: false };
    if( req.body._id ) {
      GeoBlacklist.findByIdAndRemove( req.body._id, function( err, link ) {
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

  this.getUsersByPage = function( req, res, next ) {
    // only admins can access this api
    if( req.session.role != 'admin' ) {
      res.abort(404);
    }
    var page = req.query.page;
    var pagesize = req.query.pagesize;
    var params = { 
      page: parseInt( page ), 
      limit: parseInt( pagesize ),
      sort: 'role'
    };
    if( req.query.sort ) {
      params.sort = req.query.sort;
    }
    /* // Search not needed yet
    var keyword = req.query.keyword;
    var query = formSearchQuery( keyword, 'owner' );
    */
    User.find({}, function( err, users ) {
    	if( users.length == 0 ) {
    		allowedEmails.forEach( function(user) {
    			User.create( user, function( err, doc ) {} );
    		} );
    	}
    });
    var query = {};
    User.paginate( query, params, function( err, result ) {
      var return_value = {};
      if( result ) {
        return_value.docs = result.docs;
        return_value.total = result.total;
        return_value.limit = result.limit;
        return_value.page = result.page;
        return_value.pages = result.pages;
      } else {
        return_value.docs = [];
        return_value.total = 0;
        return_value.limit = pagesize;
        return_value.page = 1;
        return_value.pages = 0;
      }
      res.json( return_value );
    } );
  }

  this.getUser = function( req, res, next ) {
    var id = req.params.id;
    User.findById( id, function( err, user ) {
      if( err ) {
        console.log( err );
        res.json( { id: false } );
        return;
      }
      res.json( user );
    });
  };

  this.deleteUser = function( req, res, next ) {
    var rst = { result: false };
    if( req.body._id ) {
      User.findByIdAndRemove( req.body._id, function( err, user ) {
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

  this.newOrUpdateUser = function( req, res, next ) {
    var updated_user = {
      email: req.body.email,
      owner: req.body.owner,
      role: req.body.role,
    };
    // Duplication check is added
    dupCriteria = { 
      email: updated_user.email,
      owner: updated_user.owner
    };
    if (req.body._id) {
      dupCriteria._id = { '$ne': req.body._id };
    }
    User.findOne(dupCriteria, function(err, doc) {
      if(!err && doc) {
        res.json( {
          id: false,
          duplicated: true
        } );
        return;
      }
      // Update or create
      if( req.body._id ) {
        User.findByIdAndUpdate( req.body._id, updated_user, function( err, user ) {
          if( err ) {
            console.log( err );
            res.json( { id: false } );
            return;
          }
          res.json( user );
        } );
      } else {
        User.create( updated_user, function( err, user ) {
          if( err ) {
            console.log( err );
            res.json( { id: false } );
            return;
          }
          res.json( user );
        } );
      }
    });
  };

}

module.exports = new apiController();
