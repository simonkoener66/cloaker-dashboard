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
var Network = mongoose.model( 'Network' );

var networksController = function( router ) {

  this.getNetworks = function( req, res, next ) {
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
    Network.paginate( query, params, function( err, result ) {
      var return_value = {};
      if( result ) {
        return_value.networks = result.docs;
        return_value.total = result.total;
        return_value.limit = result.limit;
        return_value.page = result.page;
        return_value.pages = result.pages;
      } else {
        return_value.networks = [];
        return_value.total = 0;
        return_value.limit = pagesize;
        return_value.page = 1;
        return_value.pages = 0;
      }
      res.json( return_value );
    } );
  }

  this.getNetwork = function( req, res, next ) {
    var id = req.params.id;
    Network.findById( id, function( err, doc ) {
      if( err ) {
        console.log( err );
        res.json( { id: false } );
        return;
      }
      res.json( doc );
    } );
  };

  this.deleteNetwork = function( req, res, next ) {
    var rst = { result: false };
    if(req.session.role != 'admin') {
      res.status( 401 ).json( { 'message': 'API access unauthorized' } );
      return;
    }
    if( req.body._id ) {
      Network.findByIdAndRemove( req.body._id, function( err, doc ) {
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
  };

  this.newOrUpdateNetwork = function( req, res, next ) {
    var updated_network = {
      network: req.body.network,
      description: req.body.description
    };
    // Duplication check is added
    dupCriteria = { 
      network: updated_network.network
    };
    if(req.body._id) {
      dupCriteria._id = { '$ne': req.body._id };
    }
    Network.findOne(dupCriteria, function(err, doc) {
      if(!err && doc) {
        res.json( {
          id: false,
          duplicated: true
        } );
        return;
      }
      // Update or create
      if( req.body._id ) {
        if(req.session.role == 'admin') {
          Network.findByIdAndUpdate( req.body._id, updated_network, function( err, doc ) {
            if( err ) {
              console.log( err );
              res.json( { id: false } );
              return;
            }
            res.json( doc );
          } );
        } else {
          res.status( 401 ).json( { 'message': 'API access unauthorized' } );
          return;
        }
      } else {
        Network.create( updated_network, function( err, doc ) {
          if( err ) {
            console.log( err );
            res.json( { id: false } );
            return;
          }
          res.json( doc );
        } );
      }
    });
  };

}

module.exports = new networksController();
