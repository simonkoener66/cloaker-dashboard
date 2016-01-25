var geoip = require('geoip-lite');
var mongoose = require('mongoose');

var Link = mongoose.model( 'Link' );
var Traffic = mongoose.model( 'Traffic' );

var urlFilterController = function( router ) {

	var links = [];

	this.processUrl = function( req, res, next ) {
		var path = req.originalUrl;
		Link.findOne( { 'link_generated': path }, function( err, link ) {
			if( err ) {
				res.json( { message: 'Error occurred.' } );
			}
			if( link ) {
				var use_real_link = false;
				var ip = req.headers['x-forwarded-for'] ||
					req.connection.remoteAddress ||
					req.socket.remoteAddress ||
					req.connection.socket.remoteAddress;
				var geo = geoip.lookup( ip );
				var geo_address = '(Unavailable)';
				if( geo ) {
					geo_address = geo.city + ', ' + geo.region + ', ' + geo.country;
					console.log(geo_address);
					use_real_link = true;	///
				}
				var new_traffic = {
					ip: req.ip,
					link_generated: link.link_generated,
					used_real: use_real_link,
					link_real: link.link_real,
					link_safe: link.link_safe,
					geo_address: geo_address
				}
				Traffic.create( new_traffic, function( err, traffic ){
					if( err ) {
						console.log( err );
					}
				} );
				geo.ip = ip;
				res.json( geo );
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
