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
var Link = mongoose.model( 'Link' );
var Tag = mongoose.model( 'Tag' );

var linksController = function( router ) {

  this.getLinks = function( req, res, next ) {
    var page = req.body.page;
    var pagesize = req.body.pagesize;
    var keyword = req.body.keyword;
    var params = { 
      page: parseInt( page ), 
      limit: parseInt( pagesize ),
      sort: '-created_time'
    };
    if( req.body.sort ) {
      params.sort = req.body.sort;
    }
    var query = helpers.formSearchQuery( keyword, 'link_generated' );
    query = helpers.formSearchQuery( keyword, 'link_real', query );
    query = helpers.formSearchQuery( keyword, 'link_safe', query );
    query = helpers.formSearchQuery( keyword, 'tags', query );
    query = helpers.formSearchQuery( keyword, 'description', query );
    // owner
    if( req.session.role == 'admin' ) {
      if(req.body.ownerFilter && !keyword) {
        query = helpers.formSearchQuery( req.body.ownerFilter, 'owner', query );
      }
    } else {
      query['$and'] = [ { owner: req.session.owner } ];
    }
    Link.paginate( query, params, function( err, result ) {
      var return_value = {};
      if( result ) {
        return_value.links = result.docs;
        return_value.total = result.total;
        return_value.limit = result.limit;
        return_value.page = result.page;
        return_value.pages = result.pages;
      } else {
        return_value.links = [];
        return_value.total = 0;
        return_value.limit = pagesize;
        return_value.page = 1;
        return_value.pages = 0;
      }
      res.json( return_value );
    } );
  }

  this.getLink = function( req, res, next ) {
    var id = req.params.id;
    Tag.find(function(err, tags) {
      if(err || !tags) {
        tags = [];
      }
      Link.findById( id, function( err, link ) {
        if( err ) {
          console.log( err );
          res.json( { id: false } );
          return;
        }
        res.json( {
          link: link,
          alltags: tags
        } );
      } );
    });
  };

  this.toggleLink = function( req, res, next ) {
    Link.findById( req.body._id, function( err, link ) {
      if( err ) {
        console.log( err );
        res.json( { result: false } );
        return;
      }
      link.status = !link.status;
      link._id = false;
      Link.findByIdAndUpdate( req.body._id, link, function( err, doc ) {
        if( err ) {
          console.log( err );
          res.json( { result: false } );
          return;
        }
        res.json( { result: true, status: link.status } );
      } );
    } );
  }

  this.deleteLink = function( req, res, next ) {
    var rst = { result: false };
    if( req.body._id ) {
      Link.findByIdAndRemove( req.body._id, function( err, link ) {
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

  this.newOrUpdateLink = function( req, res, next ) {
    var updated_link = {
      link_generated: req.body.link_generated,
      utm: req.body.use_utm ? helpers.generateUTM( req.body.utm ) : "",
      link_real: req.body.link_real,
      link_safe: req.body.link_safe,
      description: req.body.description,
      owner: req.session.owner,
      tags: req.body.tags,
      status: true,
      total_hits: req.body.total_hits,
      real_hits: req.body.real_hits,
      use_ip_blacklist: req.body.use_ip_blacklist,
      criteria: helpers.copyLinkRegions( req.body.criteria ),
      criteria_disallow: helpers.copyLinkRegions( req.body.criteria_disallow )
    };
    if( updated_link.link_generated.substr( 0, 1 ) != '/' ) {
      updated_link.link_generated = '/' + updated_link.link_generated;
    }
    // Duplication check is added
    dupCriteria = { 
      link_generated: updated_link.link_generated
    };
    if (updated_link.utm) {
      dupCriteria.utm = updated_link.utm;
    } else {
      dupCriteria.utm = "";
    }
    if (req.body._id) {
      dupCriteria._id = { '$ne': req.body._id };
    }
    Link.findOne(dupCriteria, function(err, doc) {
      if(!err && doc) {
        res.json( {
          id: false,
          duplicated: true
        } );
        return;
      }
      // Update or create
      if( req.body._id ) {
        Link.findByIdAndUpdate( req.body._id, updated_link, function( err, link ) {
          if( err ) {
            console.log( err );
            res.json( { id: false } );
            return;
          }
          helpers.updateTagsIfRequired(req.body.tags);
          res.json( link );
        } );
      } else {
        updated_link.created_time = new Date();
        updated_link.total_hits = 0;
        updated_link.real_hits = 0;
        Link.create( updated_link, function( err, link ) {
          if( err ) {
            console.log( err );
            res.json( { id: false } );
            return;
          }
          helpers.updateTagsIfRequired(req.body.tags);
          res.json( link );
        } );
      }
    });
  };

}

module.exports = new linksController();
