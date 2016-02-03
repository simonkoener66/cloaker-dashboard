module.exports = {
	googleClientID: '1085228624824-f4t5ne060o174aid7gm1n6ekl5tmo1bf.apps.googleusercontent.com',
	googleClientSecret: '62UnfM8gL8KgFAjc0gk8MVNB',

	/* Local dev env */
	//googleLoginRedirectUrl: 'http://localhost:3000/admin/googlelogin',
	//databaseConnection: 'mongodb://localhost/cloaker',
	/* Heroku test env */
	//googleLoginRedirectUrl: 'https://cloaker-test.herokuapp.com/admin/googlelogin',
	//databaseConnection: 'mongodb://cloakertester:dkagh123@ds047865.mongolab.com:47865/cloakerdb'
	/* Amazon env */
	googleLoginRedirectUrl: 'http://ec2-54-213-16-224.us-west-2.compute.amazonaws.com/admin/googlelogin',
	databaseConnection: 'mongodb://localhost/phantom',
}
