var mongoose = require('mongoose');
var mongoosePaginate = require( 'mongoose-paginate' );

var linkSchema = new mongoose.Schema( {
	link_generated: { type: String, unique: true },
	link_real: String,
	link_safe: String,
	total_hits: { type: Number, min: 0 },
	real_hits: { type: Number, min: 0 },
	use_ip_blacklist: Boolean,
	criteria: [ {} ]
} );
linkSchema.plugin( mongoosePaginate );

mongoose.model( 'Link', linkSchema );