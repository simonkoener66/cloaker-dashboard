var mongoose = require( 'mongoose' );
var mongoosePaginate = require( 'mongoose-paginate' );

var trafficSchema = new mongoose.Schema( {
	ip: { type: String, match: /^[0-9\:\.]*$/ },
	link_generated: String,
	used_real: Boolean,
	link_real: String,
	link_safe: String,
	geolocation: String,
	access_time: Date,
  blacklisted: Boolean,
  bl_network: String,
  bl_location: String
} );
trafficSchema.plugin( mongoosePaginate );

mongoose.model( 'Traffic', trafficSchema );