var mongoose = require('mongoose');

var linkSchema = new mongoose.Schema( {
	link_generated: String,
	link_private: String,
	link_public: String
} );

mongoose.model( 'Link', linkSchema );