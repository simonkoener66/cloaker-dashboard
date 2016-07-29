var session = require('express-session');
var crypto = require('crypto');
var google = require('googleapis');
var OAuth2Client = google.auth.OAuth2;
var plus = google.plus('v1');
var config = require('../../config/config');
var multiparty = require('multiparty');
var moment = require('moment-timezone');
var geoip = require('geoip-lite');

var helpers = require( './helpers' );

var mongoose = require('mongoose');
var BlacklistedIP = mongoose.model( 'BlacklistedIP' );
var Network = mongoose.model( 'Network' );

var ipBlacklistController = function( router ) {

  this.exportBlacklist = function( req, res, next ) {
    if( req.session.token ) {
      BlacklistedIP.find( {}, function( err, docs ) {
        res.setHeader( 'Content-disposition', 'attachment; filename=ipblacklist.csv' );
        var data = 'IP,Description,Network,Location' + "\n";
        docs.forEach( function( ip ) {
          data += ip.ip + ',';
          data += '"' + helpers.escapeUndefined(ip.description) + "\",";
          data += '"' + helpers.escapeUndefined(ip.network) + "\",";
          data += '"' + helpers.escapeUndefined(ip.location) + "\"\n";
        } );
        res.write( data );
        res.end();
      } );
    } else {
      res.status( 404 ).json( { message: 'API access unauthorized' } );
    }
  }

  this.importBlacklist = function( req, res, next ) {
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
        fields[0] = fields[0].trim();
        if( fields[0] && /^[0-9\:\.]*$/.test( fields[0] ) ) {
          dupCriteria = { 
            ip: fields[0]
          };
          BlacklistedIP.findOne(dupCriteria, function(err, doc) {
            if(!err && doc) {
              return;
            }
            var new_ip = {
              ip: fields[0],
              description: helpers.removeQuotes(fields[1]),
              network: helpers.removeQuotes(fields[2]),
              location: helpers.removeQuotes(fields[3])
            };
            BlacklistedIP.create( new_ip, function( err, doc ) {} );
          });
        }
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

  this.getIPBlacklist = function( req, res, next ) {
    var page = req.body.page;
    var pagesize = req.body.pagesize;
    var params = { 
      page: parseInt( page ), 
      limit: parseInt( pagesize )
    };
    if( req.body.sort ) {
      params.sort = req.body.sort;
    }
    var keyword = req.body.keyword;
    var query = helpers.formSearchQuery( keyword, 'ip' );
    query = helpers.formSearchQuery( keyword, 'description', query );
    query = helpers.formSearchQuery( keyword, 'network', query );
    query = helpers.formSearchQuery( keyword, 'location', query );

    helpers.initIPBlacklist();

    BlacklistedIP.paginate( query, params, function( err, result ) {
      var return_value = {};
      if( result ) {
        return_value.ips = result.docs;
        return_value.total = result.total;
        return_value.limit = result.limit;
        return_value.page = result.page;
        return_value.pages = result.pages;
      } else {
        return_value.ips = [];
        return_value.total = 0;
        return_value.limit = pagesize;
        return_value.page = 1;
        return_value.pages = 0;
      }
      res.json( return_value );
    } );
  }

  this.getIPBlacklistSingle = function( req, res, next ) {
    var id = req.params.id;
    Network.find(function(err, nets) {
      if(err || !nets) {
        nets = [];
      }
      BlacklistedIP.findById( id, function( err, doc ) {
        if( err ) {
          console.log( err );
          res.json( { id: false } );
          return;
        }
        res.json( {
          blacklisted: doc,
          networks: nets
        } );
      } );
    });
  }

  function updateExistingBlacklistedIP( res, id, editingIP ) {
    // Duplication check is added
    dupCriteria = { 
      ip: editingIP.ip
    };
    dupCriteria._id = { '$ne': id };
    BlacklistedIP.findOne(dupCriteria, function(err, doc) {
      if(!err && doc) {
        res.json( {
          id: false,
          result: false,
          duplicated: true
        } );
        return;
      }
      BlacklistedIP.findByIdAndUpdate( id, editingIP, function( err, doc ) {
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
          ip: doc
        } );
      } );
    });
  }

  function getLocationFromIP( ip ) {
    var geo = geoip.lookup( ip );
    var geolocation = '';
    var country;
    if( geo ) {
      country = helpers.getCountry( geo.country );
      if( country ) {
        if( geo.city ) {
          geolocation += geo.city + ', ';
        }
        if( geo.region ) {
          var region_num = parseInt( geo.region );
          if( region_num < country.regions.length ) {
            geolocation += country.regions[region_num].longname + ', ';
          }
        }
        geolocation += country.longname;
      }
    }
    return geolocation;
  }

  function addIPtoBlacklist( res, editingIP ) {
    var ips = editingIP.ip.split(',');
    var dup = false, result = false;
    var ipCount = ips.length, doneCount = 0;
    ips.forEach( function(ip) {
      ip = ip.trim();
      dupCriteria = {     // Duplication check criteria
        ip: ip
      };
      BlacklistedIP.findOne(dupCriteria, function(err, doc) {
        if(!err && doc) {
          dup = true;
          doneCount++;
          if(doneCount >= ipCount) {
            res.json({ result: result, duplicated: dup });
          }
          return;
        }
        editingIP.ip = ip;
        if( !editingIP.location ) {
          editingIP.location = getLocationFromIP( ip );
        }
        BlacklistedIP.create( editingIP, function( err, doc ) {
          doneCount++;
          if( err ) {
            console.log( err );
          } else {
            result = true;
          }
          if(doneCount >= ipCount) {
            res.json({ result: result, duplicated: dup });
          }
        } );
      });
    });
  }

  this.editBlacklistIP = function( req, res, next ) {
    var editingIP = {
      ip: req.body.ip,  // req.body.ip can be multiple ips separated by comma when adding to list
      description: req.body.description,
      network: req.body.network,
      location: req.body.location
    };
    if(req.body._id) {
      if(req.session.role == 'admin') {
        updateExistingBlacklistedIP( res, req.body._id, editingIP );
      } else {
        res.status( 401 ).json( { 'message': 'API access unauthorized' } );
      }
    } else {
      addIPtoBlacklist( res, editingIP );
    }
  }

  this.deleteBlacklistIP = function( req, res, next ) {
    var rst = { result: false };
    if(req.session.role != 'admin') {
      res.status( 401 ).json( { 'message': 'API access unauthorized' } );
      return;
    }
    if( req.body._id ) {
      BlacklistedIP.findByIdAndRemove( req.body._id, function( err, link ) {
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

module.exports = new ipBlacklistController();
