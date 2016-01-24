var mongoose = require( 'mongoose' );
var Link = require( './link' );
var Traffic = require( './traffic' );
var BlacklistedIP = require( './blacklistedip' );

mongoose.connect( 'mongodb://localhost/cloaker' );