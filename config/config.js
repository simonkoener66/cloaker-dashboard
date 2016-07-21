require('dotenv').config();

module.exports = {
	port: process.env.APP_PORT,
	loginUrl: process.env.LOGINURL,
	googleClientID: process.env.GOOGLE_CLIENT_ID,
	googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
	googleLoginRedirectUrl: process.env.GOOGLE_LOGIN_REDIRECT_URL,
	databaseConnection: process.env.DB_CONNECTION,
};
