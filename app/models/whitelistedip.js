var mongoose = require( 'mongoose' );
var mongoosePaginate = require( 'mongoose-paginate' );

var ipSchema = new mongoose.Schema( {
  ip: { type: String, match: /^[0-9\:\.]*$/, unique: true },
  description: String,
  network: String,
  location: String
} );
ipSchema.plugin( mongoosePaginate );

mongoose.model( 'WhitelistedIP', ipSchema );