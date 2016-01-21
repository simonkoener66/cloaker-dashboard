var express = require('express'), app = express();
var router = express.Router();

( require('./link') )( router );
( require('./admin') )( router );

module.exports = router;