var mongoose = require('mongoose');
var mongoosePaginate = require( 'mongoose-paginate' );

var linkSchema = new mongoose.Schema( {
	link_generated: String,
	utm: String,
	link_real: String,
	link_safe: String,
	description: String,
	owner: String,
	tags: [String],
	use_ip_blacklist: Boolean,
	status: Boolean,
	criteria: [ {} ],
	criteria_disallow: [ {} ],
	total_hits: { type: Number, min: 0 },
	real_hits: { type: Number, min: 0 },
	ip_count_to_auto_blacklist: Number,
	ip_auto_blacklisted: [String],
	created_time: Date
} );
linkSchema.plugin( mongoosePaginate );

mongoose.model( 'Link', linkSchema );