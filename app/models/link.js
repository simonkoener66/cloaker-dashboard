var mongoose = require('mongoose');

var linkSchema = new mongoose.Schema( {
	link_generated: String,
	link_real: String,
	link_safe: String
} );

mongoose.model( 'Link', linkSchema );