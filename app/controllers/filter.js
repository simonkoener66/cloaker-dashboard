var geoip = require('geoip-lite');
var mongoose = require('mongoose');
var q = require('q');

var helpers = require( './helpers' );

var Link = mongoose.model( 'Link' );
var Traffic = mongoose.model( 'Traffic' );
var Blacklist = mongoose.model( 'BlacklistedIP' );
var Whitelist = mongoose.model( 'WhitelistedIP' );
var GeoBlacklist = mongoose.model( 'GeoBlacklist' );

var urlFilterController = function( router ) {

	var links = [];

	this.processUrl = function( req, res, next ) {
		var path = req.originalUrl;
        var queryPos = path.indexOf('?');
        if (queryPos >= 0) {
            path = path.substr(0, queryPos);
        }

        function esc_url( url ) {
            var schema = '';
            var schpos = url.indexOf( '://' );
            if( schpos >= 0 ) {
                schema = url.substr( 0, schpos );
                url = url.substr( schpos + 3 );
                if( !schema ) {
                    schema = 'http';
                }
            } else {
                schema = 'http';
            }
            return schema + '://' + url;
        }

		function processTraffic( ip, use_real_link, link, geolocation, blacklisted, autoblacklisting ) {
            // Disable real link if status is overrided
            if( !link.status ) {
                use_real_link = false;
            }
            var link_generated_path = link.link_generated;
            if( link.utm ) {
                link_generated_path += ("?utm=" + link.utm);
            }
            // Traffic record
			var new_traffic = {
				ip: ip,
				link_generated: link_generated_path,
				used_real: use_real_link,
				link_real: link.link_real,
				link_safe: link.link_safe,
				geolocation: geolocation,
				access_time: new Date(),
                blacklisted: false,
                bl_network: '',
                bl_location: '',
                owner: link.owner
			}
            if(blacklisted) {
                new_traffic.blacklisted = true;
                new_traffic.bl_network = blacklisted.network;
                new_traffic.bl_location = blacklisted.location;
            }
            Traffic.create( new_traffic, function( err, traffic ){
				if( err ) {
					console.log( err );
				}
			} );
            // Link hits
            link.total_hits++;
            if( use_real_link ) {
                link.real_hits++;
            }
            // Link auto blacklisted ips
            if(autoblacklisting) {
                // Update link IP blacklist
                link.ip_auto_blacklisted.push( ip );
            }
            // Update link
            Link.findByIdAndUpdate( link._id, link, function( err, doc ) {
                if( err ) console.log( err );
            } );
            var url = '';
            if( use_real_link ) {
                url = link.link_real;
            } else {
                url = link.link_safe;
            }
            // Url redirect
            res.redirect( esc_url( url ) );
		}

        var condition = {
            link_generated: path,
            utm: ""
        }
        if (req.query.utm) {
            condition.utm = req.query.utm;
        }

		Link.findOne( condition, function( err, link ) {
			if( err ) {
				res.json( { message: 'Error occurred.' } );
			}
			if( link ) {
				var use_real_link = false;
				var ip = req.headers['x-forwarded-for'] ||
					req.connection.remoteAddress ||
					req.socket.remoteAddress ||
					req.connection.socket.remoteAddress;

                // Check if IP is v4 in v6 form
                if( ip.indexOf( '::ffff:' ) >= 0 ) {
                    ip = ip.substr( 7 );
                }

                // Get geolocation
				var geo = geoip.lookup( ip );
				var geolocation = '(Unavailable)';
                var country;
                if( geo ) {
                    country = helpers.getCountry( geo.country );
                }
                if( geo && country ) {
                    geolocation = '';
                    if( geo.city ) {
                        geolocation += geo.city + ', ';
                    }
                    if( geo.region ) {
                        var region_num = parseInt( geo.region );
                        if( region_num < country.regions.length ) {
                            geolocation += country.regions[region_num].longname + ', ';
                        }
                    }
                    geolocation += country.longname;
                }

                // Check if link still has IP count to auto blacklist left
                link.ip_count_to_auto_blacklist = link.ip_count_to_auto_blacklist ? link.ip_count_to_auto_blacklist : 0;
                link.ip_auto_blacklisted = link.ip_auto_blacklisted ? link.ip_auto_blacklisted : [];
                if( link.ip_count_to_auto_blacklist > 0 && link.ip_auto_blacklisted.length < link.ip_count_to_auto_blacklist ) {
                    // Add IP to auto blacklisted IP list of the link and IP blacklist if not already in
                    var newIp = true;
                    link.ip_auto_blacklisted.every( function( auto_bl_ip ) {
                        if( ip == auto_bl_ip ) {
                            newIp = false;
                            return false;
                        }
                        return true;
                    } );
                    if( newIp ) {
                        // Check blacklist first if already added
                        Blacklist.find( { ip: ip }, function( err, ipRecord ) {
                            if( !ipRecord || !ipRecord.length ) {
                                // Update global IP blacklist
                                var link_url = link.link_generated;
                                if( link.utm ) {
                                    link_url += "?utm=" + link.utm;
                                }
                                var newBlacklistIP = {
                                    ip: ip,
                                    description: 'Auto blacklisted from link: ' + link_url,
                                    network: '',
                                    location: geolocation
                                };
                                Blacklist.create( newBlacklistIP, function( err, doc ) {} );
                            }
                        } );
                    }
                    processTraffic( ip, false, link, geolocation, false, newIp );
                    return;
                }

                /*
                 * Filtering: IP whitelist -> link geolocation criteria -> IP blacklist -> geolocation blacklist
                 */
                // IP Whitelist check first
                Whitelist.find( { ip: ip }, function( err, ipRecord_white ) {
                    if( !err && ipRecord_white.length > 0 && ipRecord_white[0].ip ) {
                        use_real_link = true;
                        processTraffic( ip, use_real_link, link, geolocation, false );
                    } else {
        				// Geolocation filter
                        if(!link.criteria || link.criteria.length == 0) {
                            use_real_link = true;
                        } else {
            				if( geo && country ) {
                                geo.city = geo.city.toLowerCase();
                                geo.region = geo.region.toLowerCase();
                                geo.country = geo.country.toLowerCase();
            					link.criteria.every( function( criterion ) {
            						if( ( criterion.city && criterion.city.toLowerCase() != geo.city )
            							|| ( criterion.region && criterion.region.toLowerCase() != geo.region )
            							|| ( criterion.country && criterion.country.toLowerCase() != geo.country ) ) {
            							return true;
            						}
            						use_real_link = true;
                                    return false;
            					} );
                                link.criteria_disallow.every( function( criterion ) {
                                    if( ( !criterion.city || criterion.city.toLowerCase() == geo.city )
                                        && ( !criterion.region || criterion.region.toLowerCase() == geo.region )
                                        && ( criterion.country && criterion.country.toLowerCase() == geo.country ) ) {
                                        use_real_link = false;
                                        return false;
                                    }
                                    return true;
                                } );
            				}
                        }

        				// Blacklisted IP filter
        				if( use_real_link && link.use_ip_blacklist ) {
        					Blacklist.find( { ip: ip }, function( err, ipRecord ) {
        						if( err ) {
        							console.log( err );
        							res.json( { message: 'Error occurred.' } );
        						}
        						if( ipRecord.length > 0 && ipRecord[0].ip ) {
        							use_real_link = false;
                                    processTraffic( ip, use_real_link, link, geolocation, ipRecord[0] );
        						} else {
                                    // Geolocation blacklist filter
                                    if( geo ) {
                                        geo.country = geo.country.toUpperCase();
                                        geo.region = geo.region.toUpperCase();
                                        var orCondition = [
                                            { country: geo.country, region: '', city: '' }
                                        ];
                                        if( geo.region ) {
                                            orCondition.push( { country: geo.country, region: geo.region, city: '' } );
                                        }
                                        if( geo.city ) {
                                            orCondition.push( { country: geo.country, region: geo.region, city: geo.city } );
                                        }
                                        var condition = {
                                            $or: orCondition
                                        };
                                        GeoBlacklist.find( condition, function(err, geoRecord) {
                                            if( err ) {
                                                console.log( err );
                                                res.json( { message: 'Error occurred.' } );
                                            }
                                            if( geoRecord.length > 0 ) {
                                                use_real_link = false;
                                            } else {
                                                use_real_link = true;
                                            }
                                            processTraffic( ip, use_real_link, link, geolocation );
                                        } );
                                    } else {
                                        processTraffic( ip, false, link, geolocation );
                                    }
                                }
        					} );
        				} else {
        					processTraffic( ip, use_real_link, link, geolocation );
        				}
                    }
                });
			} else {
				res.json( { message: 'Link not found.' } );
			}
		} );
	};

	function refreshLinks() {
		Link.find( function( err, _links ) {
			if( err ) {
				console.log( err );
			}
			links = _links;
		} );
	}

	function _init() {
		refreshLinks();
		setTimeout( refreshLinks, 20000 );
	}

	_init();

}

module.exports = new urlFilterController();

