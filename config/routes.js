var express = require('express'), app = express();
var router = express.Router();

var apiController = require( '../app/controllers/api' );
var filterController = require( '../app/controllers/filter' );

router.get(  '/api/links/:keyword/:page/:pagesize',	apiController.checkApiAuth, apiController.getLinksPage );
router.get(  '/api/links/:page/:pagesize',			apiController.checkApiAuth, apiController.getLinksPage );
router.get(  '/api/links/:id',						apiController.checkApiAuth, apiController.getLink );
router.get(  '/api/links',							apiController.checkApiAuth, apiController.getLinks );
router.post( '/api/links/delete',					apiController.checkApiAuth, apiController.deleteLink );
router.post( '/api/links',							apiController.checkApiAuth, apiController.editLink );

router.get(  '/api/traffics/export/:from/:to',		apiController.exportTraffics );
router.get(  '/api/traffics/:keyword/:page/:pagesize',		apiController.checkApiAuth, apiController.getTraffics );
router.get(  '/api/traffics/:page/:pagesize',		apiController.checkApiAuth, apiController.getTraffics );

router.get(  '/api/ipblacklist/export',				apiController.exportBlacklist );
router.post( '/api/ipblacklist/import',				apiController.importBlacklist );
router.get(  '/api/ipblacklist/:keyword/:page/:pagesize',	apiController.checkApiAuth, apiController.getIPBlacklist );
router.get(  '/api/ipblacklist/:page/:pagesize',	apiController.checkApiAuth, apiController.getIPBlacklist );
router.get(  '/api/ipblacklist/:id',				apiController.checkApiAuth, apiController.getIPBlacklistSingle );
router.post( '/api/ipblacklist',					apiController.checkApiAuth, apiController.editBlacklistIP );
router.post( '/api/ipblacklist/delete',				apiController.checkApiAuth, apiController.deleteBlacklistIP );

router.get(  '/admin/login',						apiController.loginAdmin );
router.get(  '/admin/googlelogin',					apiController.loggedInWithGoogle )
router.get(  '/admin',								apiController.checkAdminAuth, apiController.admin );
router.get(  '/',									apiController.index );

// filterController must be at the end because it tries to catch every url
router.get( '/*', 									filterController.processUrl );

module.exports = router;
