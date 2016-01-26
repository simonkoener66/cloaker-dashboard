var mongoose = require( 'mongoose' );
var config = require('../../config/config');
var Link = require( './link' );
var Traffic = require( './traffic' );
var BlacklistedIP = require( './blacklistedip' );

mongoose.connect( config.databaseConnection );