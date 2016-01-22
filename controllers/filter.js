var mongoose = require('mongoose');
var Link = mongoose.model( 'Link' );
var Traffic = mongoose.model( 'Traffic' );

var urlFilterController = function( router ) {

	var links = [];

	router.get( '/*', function( req, res, next ) {
		var path = req.originalUrl;
		Link.findOne( { 'link_generated': path }, function( err, link ) {
			if( err ) {
				res.json( { message: 'Error occurred.' } );
			}
			if( link ) {
				var new_traffic = {
					link_generated: link.link_generated,
					used_real: false,
					link_real: link.link_real,
					link_safe: link.link_safe
				}
				Traffic.create( new_traffic, function( err, traffic ){
					if( err ) {
						console.log( err );
					}
				} );
				res.json( link );
			} else {
				res.json( { message: 'Link not found.' } );
			}
		} );
	} );

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

module.exports = urlFilterController;