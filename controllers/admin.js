var adminController = function( router ) {
	router.get( '/admin', function( req, res, next ) {
	  res.render( 'index', { title: 'Cloaker' });
	});
	router.get( '/', function( req, res, next ) {
	  res.redirect( '/admin' );
	});
}

module.exports = adminController;