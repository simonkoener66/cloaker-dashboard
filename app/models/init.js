var mongoose = require( 'mongoose' );
var Link = require( './link' );
var Traffic = require( './traffic' );
var BlacklistedIP = require( './blacklistedip' );

//mongoose.connect( 'mongodb://localhost/cloaker' );
/// for test
mongoose.connect( 'mongodb://cloakertester:dkagh123@ds047865.mongolab.com:47865/cloakerdb' );