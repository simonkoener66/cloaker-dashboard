var express = require('express'), app = express();
var router = express.Router();

var linkController = require( '../app/controllers/link' );
var adminController = require( '../app/controllers/admin' );
var trafficController =require( '../app/controllers/traffic' );
// urlFilterController must be at the end because it tries to catch every url
var filterController = require( '../app/controllers/filter' );

router.get( '/links/:id',					linkController.get );
router.get( '/links',						linkController.getAll );
router.post( '/links/delete',				linkController.delete );
router.post( '/links',						linkController.edit );

router.get( '/admin/login',					adminController.login );
router.get( '/admin/googlelogin',			adminController.loggedInWithGoogle )
router.get( '/admin',						adminController.checkAdminAuth, adminController.admin );
router.get( '/',							adminController.index );

router.get( '/traffics/:page/:pagesize',	trafficController.get );

router.get( '/*', 							filterController.processUrl );

module.exports = router;