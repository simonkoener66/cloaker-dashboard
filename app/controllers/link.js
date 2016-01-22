var mongoose = require('mongoose');
var Link = mongoose.model( 'Link' );

var linkController = function( router ) {

	this.get = function( req, res, next ) {
		var id = req.params.id;
		Link.findById( id, function( err, link ) {
			if( err ) {
				console.log( err );
				res.json( { id: false } );
			}
			res.json( link );
		} );
	};

	this.getAll = function( req, res, next ) {
		Link.find( function( err, links ) {
			if( err ) {
				console.log( err );
				res.json( [] );
			}
			res.json( links );
		} );
	};

	this.delete = function( req, res, next ) {
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

	this.edit = function( req, res, next ) {
		if( req.body._id ) {
			var updated_link = {
				'link_generated': req.body.link_generated,
				'link_real': req.body.link_real,
				'link_safe': req.body.link_safe
			};
			Link.findByIdAndUpdate( req.body._id, updated_link, function( err, link ) {
				if( err ) {
					console.log( err );
					res.json( { id: false } );
				}
				res.json( link );
			} );
		} else {
			Link.create( req.body, function( err, link ) {
				if( err ) {
					console.log( err );
					res.json( { id: false } );
				}
				res.json( link );
			} );
		}
	};
}

module.exports = new linkController();
