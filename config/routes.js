var express = require('express'), app = express();
var router = express.Router();

// filterController must be at the end because it tries to catch every url
var apiController = require( '../app/controllers/api' );
var filterController = require( '../app/controllers/filter' );

router.get( '/links/:id',					apiController.checkApiAuth, apiController.getLink );
router.get( '/links',						apiController.checkApiAuth, apiController.getLinks );
router.post( '/links/delete',				apiController.checkApiAuth, apiController.deleteLink );
router.post( '/links',						apiController.checkApiAuth, apiController.editLink );

router.get( '/traffics/:page/:pagesize',	apiController.checkApiAuth, apiController.getTraffics );

router.get( '/admin/login',					apiController.loginAdmin );
router.get( '/admin/googlelogin',			apiController.loggedInWithGoogle )
router.get( '/admin',						apiController.checkAdminAuth, apiController.admin );
router.get( '/',							apiController.index );

router.get( '/*', 							filterController.processUrl );

module.exports = router;