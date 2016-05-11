var mongoose = require( 'mongoose' );
var mongoosePaginate = require( 'mongoose-paginate' );

var geoBlacklistSchema = new mongoose.Schema( {
  country: String,
  region: String,
  city: String,
  description: String,
} );
geoBlacklistSchema.plugin( mongoosePaginate );

mongoose.model( 'GeoBlacklist', geoBlacklistSchema );