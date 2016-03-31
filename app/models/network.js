var mongoose = require( 'mongoose' );
var mongoosePaginate = require( 'mongoose-paginate' );

var networkSchema = new mongoose.Schema( {
  network: String,
  description: String,
} );
networkSchema.plugin( mongoosePaginate );

mongoose.model( 'Network', networkSchema );