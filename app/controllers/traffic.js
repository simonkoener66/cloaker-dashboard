var mongoose = require('mongoose');
var Traffic = mongoose.model( 'Traffic' );

var trafficController = function( router ) {

	this.get = function( req, res, next ) {
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

}

module.exports = new trafficController();
