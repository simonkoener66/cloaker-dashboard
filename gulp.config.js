module.exports = function() {
    var client = 'public',
        clientApp = './public'
    dist = 'dist',
        tmp = '.tmp',
        docs = 'documentation',
        landing = 'landing';
    var config = {
        client: client,
        dist: dist,
        tmp: tmp,
        index: client + "/index.html",
        sass_output: clientApp + '/styles',
        alljs: [
            client + "/app/**/*.js",
            './*.js'
        ],
        assets: [
            client + "/app/**/*.html",
            client + "/bower_components/font-awesome/css/*",
            client + "/bower_components/font-awesome/fonts/*",
            client + "/bower_components/weather-icons/css/*",
            client + "/bower_components/weather-icons/font/*",
            client + "/bower_components/weather-icons/fonts/*",
            client + "/bower_components/material-design-iconic-font/dist/**/*",
            client + "/fonts/**/*",
            client + "/i18n/**/*",
            client + "/images/**/*",
            client + "/styles/loader.css",
            client + "/styles/ui/images/*",
            client + "/favicon.ico"
        ],
        less: [],
        sass: [
            client + "/styles/**/*.scss"
        ],
        js: [
            clientApp + "/**/*.module.js",
            clientApp + "/**/*.js",
            '!' + clientApp + "/**/*.spec.js"
        ],
        docs: docs,
        docsJade: [
            docs + "/jade/index.jade",
            docs + "/jade/faqs.jade",
            docs + "/jade/layout.jade"
        ],
        allToClean: [
            tmp,
            ".DS_Store",
            ".sass-cache",
            "node_modules",
            ".git",
            client + "/bower_components",
            docs + "/jade",
            docs + "/layout.html",
            landing + "/jade",
            landing + "/bower_components",
            "readme.md"
        ]
    };

    return config;
};