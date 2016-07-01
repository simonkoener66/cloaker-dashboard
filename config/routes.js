var express = require('express'), app = express();
var router = express.Router();

var apiController = require( '../app/controllers/api' );
var filterController = require( '../app/controllers/filter' );

router.get(  '/api/users',                                apiController.checkApiAuth, apiController.getUsers );

router.post( '/api/links/page',                           apiController.checkApiAuth, apiController.getLinks );
router.get(  '/api/links/:id',                            apiController.checkApiAuth, apiController.getLink );
router.post( '/api/links/toggle',                         apiController.checkApiAuth, apiController.toggleLink );
router.post( '/api/links/delete',                         apiController.checkApiAuth, apiController.deleteLink );
router.post( '/api/links',                                apiController.checkApiAuth, apiController.newOrUpdateLink );

router.get(  '/api/traffics/export/:from/:to',            apiController.exportTraffics );
router.get(  '/api/traffics/page/:page/:pagesize',        apiController.checkApiAuth, apiController.getTraffics );
router.get(  '/api/traffics/page/:page/:pagesize/:sort',  apiController.checkApiAuth, apiController.getTraffics );

router.get(  '/api/ipblacklist/export',                   apiController.exportBlacklist );
router.post( '/api/ipblacklist/import',                   apiController.importBlacklist );
router.post( '/api/ipblacklist/page',                     apiController.checkApiAuth, apiController.getIPBlacklist );
router.get(  '/api/ipblacklist/:id',                      apiController.checkApiAuth, apiController.getIPBlacklistSingle );
router.post( '/api/ipblacklist',                          apiController.checkApiAuth, apiController.editBlacklistIP );
router.post( '/api/ipblacklist/delete',                   apiController.checkApiAuth, apiController.deleteBlacklistIP );

router.post( '/api/networks/page',                        apiController.checkApiAuth, apiController.getNetworks );
router.get(  '/api/networks/:id',                         apiController.checkApiAuth, apiController.getNetwork );
router.post( '/api/networks/delete',                      apiController.checkApiAuth, apiController.deleteNetwork );
router.post( '/api/networks',                             apiController.checkApiAuth, apiController.newOrUpdateNetwork );

router.get(  '/api/geoblacklist/export',                  apiController.exportGeoBlacklist );
router.post( '/api/geoblacklist/import',                  apiController.importGeoBlacklist );
router.post( '/api/geoblacklist/page',                    apiController.checkApiAuth, apiController.getGeoBlacklist );
router.get(  '/api/geoblacklist/:id',                     apiController.checkApiAuth, apiController.getGeoBlacklistItem );
router.post( '/api/geoblacklist',                         apiController.checkApiAuth, apiController.editGeoBlacklistItem );
router.post( '/api/geoblacklist/delete',                  apiController.checkApiAuth, apiController.deleteGeoBlacklistItem );

router.get(  '/api/users/page',                           apiController.checkApiAuth, apiController.getUsersByPage );
router.get(  '/api/users/:id',                            apiController.checkApiAuth, apiController.getUser );
router.post( '/api/users/delete',                         apiController.checkApiAuth, apiController.deleteUser );
router.post( '/api/users',                                apiController.checkApiAuth, apiController.newOrUpdateUser );

router.get(  '/admin/login',                              apiController.loginAdmin );
router.get(  '/admin/googlelogin',                        apiController.loggedInWithGoogle )
router.get(  '/admin',                                    apiController.checkAdminAuth, apiController.admin );
router.get(  '/',                                         apiController.index );

// filterController must be at the end because it tries to catch every url

router.get( '/*',                                         filterController.processUrl );

module.exports = router;
