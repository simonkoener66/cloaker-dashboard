var geoip = require('geoip-lite');
var mongoose = require('mongoose');
var q = require('q');

var Link = mongoose.model( 'Link' );
var Traffic = mongoose.model( 'Traffic' );
var Blacklist = mongoose.model( 'BlacklistedIP' );

var urlFilterController = function( router ) {

	var links = [];

	this.processUrl = function( req, res, next ) {
		var path = req.originalUrl;

		function processTraffic( ip, use_real_link, link, geolocation ) {
			var new_traffic = {
				ip: ip,
				link_generated: link.link_generated,
				used_real: use_real_link,
				link_real: link.link_real,
				link_safe: link.link_safe,
				geolocation: geolocation,
				access_time: new Date()
			}
			Traffic.create( new_traffic, function( err, traffic ){
				if( err ) {
					console.log( err );
				}
			} );
			res.json( new_traffic );
		}

		Link.findOne( { 'link_generated': path }, function( err, link ) {
			if( err ) {
				res.json( { message: 'Error occurred.' } );
			}
			if( link ) {
				var use_real_link = false;
				var ip = req.headers['x-forwarded-for'] ||
					req.connection.remoteAddress ||
					req.socket.remoteAddress ||
					req.connection.socket.remoteAddress ||
					'127.0.0.1';
				var geo = geoip.lookup( ip );
				var geolocation = '(Unavailable)';
				/// for testing
				if( !geo ) {
					geo = {};
					geo.country='BE';geo.region=geo.city='';
				}
				// Geolocation filter
				if( geo ) {
					geolocation = geo.city + ', ' + geo.region + ', ' + geo.country;
					link.criteria.forEach( function( criterion ) {
						if( ( criterion.city && criterion.city.toLowerCase() != geo.city.toLowerCase() )
							|| ( criterion.region && criterion.region.toLowerCase() != geo.region.toLowerCase() )
							|| ( criterion.country && criterion.country.toLowerCase() != geo.country.toLowerCase() ) ) {
							return;
						}
						use_real_link = true;
					} );
				}
				// Blacklisted IP filter
				if( use_real_link && link.use_ip_blacklist ) {
					Blacklist.find( { ip: ip }, function( err, ip_record ) {
						if( err ) {
							console.log( err );
							res.json( { message: 'Error occurred.' } );
						}
						if( ip_record.length > 0 && ip_record[0].ip ) {
							use_real_link = false;
						}
						processTraffic( ip, use_real_link, link, geolocation );
					} );
				} else {
					processTraffic( ip, use_real_link, link, geolocation );
				}
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
