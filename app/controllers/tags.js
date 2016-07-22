//var helpers = require( './helpers' );

var mongoose = require('mongoose');
var Tag = mongoose.model( 'Tag' );

var tagsController = function( router ) {

  this.getTags = function( req, res, next ) {
    Tag.find(function(err, tags) {
      if(err || !tags) {
        console.log( err );
        res.json( [] );
      }
      res.json( tags );
    });
  }

}

module.exports = new tagsController();
