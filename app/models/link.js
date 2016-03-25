var mongoose = require('mongoose');
var mongoosePaginate = require( 'mongoose-paginate' );

var linkSchema = new mongoose.Schema( {
	link_generated: { type: String, unique: true },
	link_real: String,
	link_safe: String,
	description: String,
	owner: String,
	tags: [],
	use_ip_blacklist: Boolean,
	status: Boolean,
	criteria: [ {} ],
	criteria_disallow: [ {} ],
	total_hits: { type: Number, min: 0 },
	real_hits: { type: Number, min: 0 }
} );
linkSchema.plugin( mongoosePaginate );

mongoose.model( 'Link', linkSchema );