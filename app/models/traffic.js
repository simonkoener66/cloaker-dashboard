var mongoose = require( 'mongoose' );
var mongoosePaginate = require( 'mongoose-paginate' );

var trafficSchema = new mongoose.Schema( {
	link_generated: String,
	used_real: Boolean,
	link_real: String,
	link_safe: String
} );
trafficSchema.plugin( mongoosePaginate );

mongoose.model( 'Traffic', trafficSchema );