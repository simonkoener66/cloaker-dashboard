var mongoose = require('mongoose');
var mongoosePaginate = require( 'mongoose-paginate' );

var userSchema = new mongoose.Schema( {
  email: String,
  owner: String,
  role: String
} );
userSchema.plugin( mongoosePaginate );

mongoose.model( 'User', userSchema );