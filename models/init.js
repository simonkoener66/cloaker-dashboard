var mongoose = require( 'mongoose' );
var Link = require( './link' );
var Traffic = require( './traffic' );

mongoose.connect( 'mongodb://localhost/cloaker' );