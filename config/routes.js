var express = require('express'), app = express();
var router = express.Router();

var helpers = require( '../app/controllers/helpers' );
var linksController = require( '../app/controllers/links' );
var trafficsController = require( '../app/controllers/traffics' );
var adminController = require( '../app/controllers/admin' );
var ipBlacklistController = require( '../app/controllers/ipblacklist' );
var ipWhitelistController = require( '../app/controllers/ipwhitelist' );
var networksController = require( '../app/controllers/networks' );
var geoBlacklistController = require( '../app/controllers/geoblacklist' );
var usersController = require( '../app/controllers/users' );

var filterController = require( '../app/controllers/filter' );

var helpers = require( '../app/controllers/helpers' );


router.get(  '/api/users',                                helpers.checkApiAuth, usersController.getUsers );

router.post( '/api/links/page',                           helpers.checkApiAuth, linksController.getLinks );
router.get(  '/api/links/:id',                            helpers.checkApiAuth, linksController.getLink );
router.post( '/api/links/toggle',                         helpers.checkApiAuth, linksController.toggleLink );
router.post( '/api/links/delete',                         helpers.checkApiAuth, linksController.deleteLink );
router.post( '/api/links',                                helpers.checkApiAuth, linksController.newOrUpdateLink );

router.get(  '/api/traffics/export/:from/:to',            trafficsController.exportTraffics );
router.get(  '/api/traffics/page/:page/:pagesize',        helpers.checkApiAuth, trafficsController.getTraffics );
router.get(  '/api/traffics/page/:page/:pagesize/:sort',  helpers.checkApiAuth, trafficsController.getTraffics );

router.get(  '/api/ipblacklist/export',                   ipBlacklistController.exportBlacklist );
router.post( '/api/ipblacklist/import',                   ipBlacklistController.importBlacklist );
router.post( '/api/ipblacklist/page',                     helpers.checkApiAuth, ipBlacklistController.getIPBlacklist );
router.get(  '/api/ipblacklist/:id',                      helpers.checkApiAuth, ipBlacklistController.getIPBlacklistSingle );
router.post( '/api/ipblacklist',                          helpers.checkApiAuth, ipBlacklistController.editBlacklistIP );
router.post( '/api/ipblacklist/delete',                   helpers.checkApiAuth, ipBlacklistController.deleteBlacklistIP );

router.get(  '/api/ipwhitelist/export',                   ipWhitelistController.exportWhitelist );
router.post( '/api/ipwhitelist/import',                   ipWhitelistController.importWhitelist );
router.post( '/api/ipwhitelist/page',                     helpers.checkApiAuth, ipWhitelistController.getIPWhitelist );
router.get(  '/api/ipwhitelist/:id',                      helpers.checkApiAuth, ipWhitelistController.getIPWhitelistSingle );
router.post( '/api/ipwhitelist',                          helpers.checkApiAuth, ipWhitelistController.editWhitelistIP );
router.post( '/api/ipwhitelist/delete',                   helpers.checkApiAuth, ipWhitelistController.deleteWhitelistIP );

router.post( '/api/networks/page',                        helpers.checkApiAuth, networksController.getNetworks );
router.get(  '/api/networks/:id',                         helpers.checkApiAuth, networksController.getNetwork );
router.post( '/api/networks/delete',                      helpers.checkApiAuth, networksController.deleteNetwork );
router.post( '/api/networks',                             helpers.checkApiAuth, networksController.newOrUpdateNetwork );

router.get(  '/api/geoblacklist/export',                  geoBlacklistController.exportGeoBlacklist );
router.post( '/api/geoblacklist/import',                  geoBlacklistController.importGeoBlacklist );
router.post( '/api/geoblacklist/page',                    helpers.checkApiAuth, geoBlacklistController.getGeoBlacklist );
router.get(  '/api/geoblacklist/:id',                     helpers.checkApiAuth, geoBlacklistController.getGeoBlacklistItem );
router.post( '/api/geoblacklist',                         helpers.checkApiAuth, geoBlacklistController.editGeoBlacklistItem );
router.post( '/api/geoblacklist/delete',                  helpers.checkApiAuth, geoBlacklistController.deleteGeoBlacklistItem );

router.get(  '/api/users/page',                           helpers.checkApiAuth, usersController.getUsersByPage );
router.get(  '/api/users/:id',                            helpers.checkApiAuth, usersController.getUser );
router.post( '/api/users/delete',                         helpers.checkApiAuth, usersController.deleteUser );
router.post( '/api/users/default',                        helpers.checkApiAuth, usersController.loadDefaultUsers );
router.post( '/api/users',                                helpers.checkApiAuth, usersController.newOrUpdateUser );

router.get(  '/admin/login',                              adminController.loginAdmin );
router.get(  '/admin/googlelogin',                        adminController.loggedInWithGoogle )
router.get(  '/admin',                                    adminController.checkAdminAuth, adminController.admin );
router.get(  '/',                                         adminController.index );

// filterController must be at the end because it tries to catch every url

router.get( '/*',                                         filterController.processUrl );

module.exports = router;
