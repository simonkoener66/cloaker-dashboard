var express = require('express'), app = express();
var router = express.Router();

( require( './link' ) )( router );
( require( './admin' ) )( router );
( require( './traffic' ) )( router );
// urlFilterController must be at the end because it tries to catch every url
( require( './filter' ) )( router );

module.exports = router;