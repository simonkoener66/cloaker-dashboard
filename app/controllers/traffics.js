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
var Traffic = mongoose.model( 'Traffic' );

var trafficsController = function( router ) {

  this.getTraffics = function( req, res, next ) {
    var page = req.params.page;
    var pagesize = req.params.pagesize;
    var keyword = req.params.keyword;
    var query = helpers.formSearchQuery( keyword, 'link_generated' );
    // owner
    if( req.session.role == 'admin' ) {
      if(req.query.ownerFilter && !keyword) {
        query = helpers.formSearchQuery( req.query.ownerFilter, 'owner', query );
      }
    } else {
      query['$and'] = [ { owner: req.session.owner } ];
    }
    // sort
    var sortField = '-access_time';
    if( req.params.sort ) {
      sortField = req.params.sort;
    }
    Traffic.paginate( query, { page: parseInt( page ), limit: parseInt( pagesize ), sort: sortField }, function( err, result ) {
      var return_value = {};
      if( result ) {
        return_value.traffics = result.docs;
        return_value.total = result.total;
        return_value.limit = result.limit;
        return_value.page = result.page;
        return_value.pages = result.pages;
      } else {
        return_value.traffics = [];
        return_value.total = 0;
        return_value.limit = pagesize;
        return_value.page = 1;
        return_value.pages = 0;
      }
      res.json( return_value );
    } );
  };

  this.exportTraffics = function( req, res, next ) {
    if( req.session.token ) {
      // from/to date query
      var query = helpers.formFromToQuery( req.params.from, req.params.to );
      // owner
      if( req.session.role == 'admin' ) {
        if(req.query.ownerFilter && !keyword) {
            query = helpers.formSearchQuery( req.query.ownerFilter, 'owner', query );
        }
      } else {
        query['$and'] = [ { owner: req.session.owner } ];
      }
      var page = 1, pagesize = 1000, data = '';
      // Sendout file header and column header first
      res.setHeader( 'Content-disposition', 'attachment; filename=traffics.csv' );
      res.setHeader( 'Content-Type', 'text/plain' );
      res.setHeader( 'Transfer-Encoding', 'chunked' );
      res.flushHeaders();

      res.write('IP,Generated Link,Allowed Real Link,Real Link,Safe Link,Geolocation,Access Time,Blacklisted IP,Network,Location' + "\n");

      // Start with timer and load page by page
      var timer;
      function stopTimer() {
        res.end();
        clearInterval(timer);
      }

      function loadCycle() {
        Traffic.paginate( query, { page: parseInt(page), limit: parseInt(pagesize), sort: '-access_time' }, function( err, result ) {
          if( result ) {
            data = '';
            result.docs.forEach( function( traffic ) {
              data += traffic.ip + ',';
              data += traffic.link_generated + ',';
              data += traffic.used_real + ',';
              data += traffic.link_real + ',';
              data += traffic.link_safe + ',';
              data += '"' + traffic.geolocation + '",';
              var format = 'YYYY-MM-DD HH:mm:ss';
              data += moment(traffic.access_time).tz('EST').format(format) + ',';
              data += traffic.blacklisted + ',';
              data += '"' + traffic.bl_network + '",';
              data += '"' + traffic.bl_location + '"\n';
            } );
            res.write( data );
            if(page < result.pages) {
              page++;
              setTimeout( loadCycle, 20 );
            } else {
              res.end();
            }
          } else {
            res.end();
          }
        } );
      }
      
      // Start timer
      setTimeout( loadCycle, 20 );
      
    } else {
      res.status( 404 ).json( { message: 'API access unauthorized' } );
    }
  }

}

module.exports = new trafficsController();
