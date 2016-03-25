var mongoose = require('mongoose');
var mongoosePaginate = require( 'mongoose-paginate' );

var tagSchema = new mongoose.Schema( {
  tag: String
} );
tagSchema.plugin( mongoosePaginate );

mongoose.model( 'Tag', tagSchema );