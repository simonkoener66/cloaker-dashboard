module.exports = {
	// real
	googleClientID: '1085228624824-f4t5ne060o174aid7gm1n6ekl5tmo1bf.apps.googleusercontent.com',
	googleClientSecret: '62UnfM8gL8KgFAjc0gk8MVNB',
	// test
	//googleClientID: '794547063462-klinv1to3d5fk5uatrk7g97o5lkhi17e.apps.googleusercontent.com',
	//googleClientSecret: '5ZL9WC3xLmZWQRBhHJZiVq4X',

	/* Local dev env */
	//googleLoginRedirectUrl: 'http://localhost:3000/admin/googlelogin',
	//databaseConnection: 'mongodb://localhost/cloaker',
	/* Heroku test env */
	//googleLoginRedirectUrl: 'https://cloaker-test.herokuapp.com/admin/googlelogin',
	//databaseConnection: 'mongodb://cloakertester:dkagh123@ds047865.mongolab.com:47865/cloakerdb'
	/* Amazon env */
	googleLoginRedirectUrl: 'http://phantom.bnfaw.com/admin/googlelogin',
	databaseConnection: 'mongodb://localhost/phantom',
}
