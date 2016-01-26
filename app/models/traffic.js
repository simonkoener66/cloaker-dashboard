var mongoose = require( 'mongoose' );
var mongoosePaginate = require( 'mongoose-paginate' );

var trafficSchema = new mongoose.Schema( {
	ip: { type: String, match: /[0-9\:\.]*/ },
	link_generated: String,
	used_real: Boolean,
	link_real: String,
	link_safe: String,
	geolocation: String,
	access_time: Date
} );
trafficSchema.plugin( mongoosePaginate );

mongoose.model( 'Traffic', trafficSchema );