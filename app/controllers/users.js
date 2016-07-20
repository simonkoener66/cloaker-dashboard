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
var User = mongoose.model( 'User' );

var usersController = function( router ) {

  this.getUsers = function( req, res, next ) {
    User.find({}, function( err, docs ) {
      var users = [];
      docs.forEach( function ( user ) {
        users.push( user.owner );
      } );
      res.json( {
        admin: ( req.session.role == 'admin' ),
        users: users
      } );
    } );
  }

  this.getUsersByPage = function( req, res, next ) {
    // only admins can access this api
    if( req.session.role != 'admin' ) {
      res.status( 404 ).send( 'Invalid request.' );
      return;
    }
    var page = req.query.page;
    var pagesize = req.query.pagesize;
    var params = { 
      page: parseInt( page ), 
      limit: parseInt( pagesize ),
      sort: 'role'
    };
    if( req.query.sort ) {
      params.sort = req.query.sort;
    }
    /* // Search not needed yet
    var keyword = req.query.keyword;
    var query = helpers.formSearchQuery( keyword, 'owner' );
    */
    var query = {};
    User.paginate( query, params, function( err, result ) {
      var return_value = {};
      if( result ) {
        return_value.docs = result.docs;
        return_value.total = result.total;
        return_value.limit = result.limit;
        return_value.page = result.page;
        return_value.pages = result.pages;
      } else {
        return_value.docs = [];
        return_value.total = 0;
        return_value.limit = pagesize;
        return_value.page = 1;
        return_value.pages = 0;
      }
      res.json( return_value );
    } );
  }

  this.getUser = function( req, res, next ) {
    // only admins can access this api
    if( req.session.role != 'admin' ) {
      res.status( 404 ).send( 'Invalid request.' );
      return;
    }
    var id = req.params.id;
    User.findById( id, function( err, user ) {
      if( err ) {
        console.log( err );
        res.json( { id: false } );
        return;
      }
      res.json( user );
    });
  };

  this.deleteUser = function( req, res, next ) {
    // only admins can access this api
    if( req.session.role != 'admin' ) {
      res.status( 404 ).send( 'Invalid request.' );
      return;
    }
    var rst = { result: false };
    if( req.body._id ) {
      User.findByIdAndRemove( req.body._id, function( err, user ) {
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

  this.newOrUpdateUser = function( req, res, next ) {
    // only admins can access this api
    if( req.session.role != 'admin' ) {
      res.status( 404 ).send( 'Invalid request.' );
      return;
    }
    var updated_user = {
      email: req.body.email.toLowerCase(),
      owner: req.body.owner,
      role: req.body.role,
    };
    // Duplication check is added
    dupCriteria = { 
      email: updated_user.email,
      owner: updated_user.owner
    };
    if (req.body._id) {
      dupCriteria._id = { '$ne': req.body._id };
    }
    User.findOne(dupCriteria, function(err, doc) {
      if(!err && doc) {
        res.json( {
          id: false,
          duplicated: true
        } );
        return;
      }
      // Update or create
      if( req.body._id ) {
        User.findByIdAndUpdate( req.body._id, updated_user, function( err, user ) {
          if( err ) {
            console.log( err );
            res.json( { id: false } );
            return;
          }
          res.json( user );
        } );
      } else {
        User.create( updated_user, function( err, user ) {
          if( err ) {
            console.log( err );
            res.json( { id: false } );
            return;
          }
          res.json( user );
        } );
      }
    });
  };

  this.loadDefaultUsers = function( req, res, next ) {
    // only admins can access this api
    if( req.session.role != 'admin' ) {
      res.status( 404 ).send( 'Invalid request.' );
      return;
    }
    User.remove().exec();
    helpers.defaultUsers.forEach( function(user) {
      User.create( user, function( err, doc ) {} );
    } );
    res.json({ result: true });
  }

}

module.exports = new usersController();
