var mongoose = require( 'mongoose' );
var mongoosePaginate = require( 'mongoose-paginate' );

var ipSchema = new mongoose.Schema( {
	ip: { type: String, match: /[0-9]{1-3}.[0-9]{1-3}.[0-9]{1-3}.[0-9]{1-3}/, unique: true },
	description: String
} );
ipSchema.plugin( mongoosePaginate );

mongoose.model( 'BlacklistedIP', ipSchema );