var mongoose = require( 'mongoose' );
var mongoosePaginate = require( 'mongoose-paginate' );

var ipSchema = new mongoose.Schema( {
	ip: String,
	description: String
} );
ipSchema.plugin( mongoosePaginate );

mongoose.model( 'BlacklistedIP', ipSchema );