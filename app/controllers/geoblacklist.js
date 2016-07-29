var session = require('express-session');
var crypto = require('crypto');
var google = require('googleapis');
var OAuth2Client = google.auth.OAuth2;
var plus = google.plus('v1');
var config = require('../../config/config');
var multiparty = require('multiparty');
var moment = require('moment-timezone');

var helpers = require( './helpers' );

var mongoose = require('mongoose');
var GeoBlacklist = mongoose.model( 'GeoBlacklist' );

var geoBlacklistController = function( router ) {

  this.exportGeoBlacklist = function( req, res, next ) {
    if( req.session.token ) {
      GeoBlacklist.find( {}, function( err, docs ) {
        res.setHeader( 'Content-disposition', 'attachment; filename=geoblacklist.csv' );
        var data = 'Country,Region,City,Description' + "\n";
        docs.forEach( function( geo ) {
          data += '"' + helpers.escapeUndefined(geo.country) + "\",";
          data += '"' + helpers.escapeUndefined(geo.region) + "\",";
          data += '"' + helpers.escapeUndefined(geo.city) + "\",";
          data += '"' + helpers.escapeUndefined(geo.description) + "\"\n";
        } );
        res.write( data );
        res.end();
      } );
    } else {
      res.status( 404 ).json( { message: 'API access unauthorized' } );
    }
  }

  this.importGeoBlacklist = function( req, res, next ) {
    if( !req.session.token ) {
      res.status( 404 ).json( { message: 'API access unauthorized' } );
      return;
    }
    var form = new multiparty.Form();
    var data = '';
    form.on( 'close', function() {
      var records = data.split( "\n" );
      var first = true;
      records.forEach( function( record ) {
        var fields = record.split( ',' );
        if( fields[0] === "Country" || !fields[0] ) {
          return;
        }
        var newRecord = {
          country: helpers.removeQuotes(fields[0]),
          region: helpers.removeQuotes(fields[1]),
          city: helpers.removeQuotes(fields[2]),
          location: helpers.removeQuotes(fields[3])
        };
        GeoBlacklist.create( newRecord, function( err, doc ) {} );
      } );
      res.status( 200 ).json( { message: 'Done' } );
    } );
    form.on( 'part', function( part ){
      if( part.name !== 'file' ) {
        return part.resume();
      }
      part.on( 'data', function( buf ){
        data += buf.toString();
      } );
    } );
    form.parse(req);
  }

  this.getGeoBlacklist = function( req, res, next ) {
    var page = req.body.page;
    var pagesize = req.body.pagesize;
    var params = { 
      page: parseInt( page ), 
      limit: parseInt( pagesize )
    };
    if( req.body.sort ) {
      params.sort = req.body.sort;
    }
    var query = {};
    /*var keyword = req.body.keyword;
    var query = helpers.formSearchQuery( keyword, 'country' );
    query = helpers.formSearchQuery( keyword, 'description', query );
    query = helpers.formSearchQuery( keyword, 'network', query );
    query = helpers.formSearchQuery( keyword, 'location', query );*/

    GeoBlacklist.paginate( query, params, function( err, result ) {
      var return_value = {};
      if( result ) {
        return_value.items = result.docs;
        return_value.total = result.total;
        return_value.limit = result.limit;
        return_value.page = result.page;
        return_value.pages = result.pages;
      } else {
        return_value.items = [];
        return_value.total = 0;
        return_value.limit = pagesize;
        return_value.page = 1;
        return_value.pages = 0;
      }
      res.json( return_value );
    } );
  }

  this.getGeoBlacklistItem = function( req, res, next ) {
    var id = req.params.id;
    GeoBlacklist.findById( id, function( err, doc ) {
      if( err ) {
        console.log( err );
        res.json( { id: false } );
        return;
      }
      res.json( {
        item: doc
      } );
    } );
  }

  function updateExistingGeoBlacklistItem( res, id, editingIP ) {
    GeoBlacklist.findByIdAndUpdate( id, editingIP, function( err, doc ) {
      if( err ) {
        console.log( err );
        res.json( { 
          id: false,
          result: false
        } );
        return;
      }
      res.json( {
        result: true,
        item: doc
      } );
    } );
  }

  function addGeoBlacklistItem( res, data ) {
    GeoBlacklist.create( data, function( err, doc ) {
      if( err ) {
        res.json({ result: false });
      }
      res.json({ result: true });
    } );
  }

  this.editGeoBlacklistItem = function( req, res, next ) {
    var data = {
      country: req.body.country,
      region: req.body.region,
      city: req.body.city.toLowerCase(),
      description: req.body.description
    };
    if(req.body._id) {
      if(req.session.role == 'admin') {
        updateExistingGeoBlacklistItem( res, req.body._id, data );
      } else {
        res.status( 401 ).json( { 'message': 'API access unauthorized' } );
      }
    } else {
      addGeoBlacklistItem( res, data );
    }
  }

  this.deleteGeoBlacklistItem = function( req, res, next ) {
    var rst = { result: false };
    if(req.session.role != 'admin') {
      res.status( 401 ).json( { 'message': 'API access unauthorized' } );
      return;
    }
    if( req.body._id ) {
      GeoBlacklist.findByIdAndRemove( req.body._id, function( err, link ) {
        if( err ) {
          console.log( err );
          res.json( rst );
          return;
        }
        rst.result = true;
        res.json( rst );
      } );
    } else {
      res.json( rst );
    }
  }

}

module.exports = new geoBlacklistController();
