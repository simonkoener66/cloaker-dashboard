module.exports = function() {
    var client = 'client',
        clientApp = './client',
        dist = 'public',
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
            client + "/client/**/*.js",
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
            client + "/bower_components/angular-material/angular-material.min.css",
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
        sassDist: dist + '/styles',
        jsDist: dist + '/scripts',
        jsFiles: [
            client + "/bower_components/jquery/dist/jquery.min.js",
            client + "/bower_components/angular/angular.min.js",
            client + "/bower_components/angular-animate/angular-animate.min.js",
            client + "/bower_components/angular-aria/angular-aria.min.js",
            client + "/bower_components/angular-messages/angular-messages.min.js",
            client + "/bower_components/angular-ui-router/release/angular-ui-router.min.js",
            client + "/bower_components/angular-material/angular-material.min.js",
            client + "/bower_components/angular-bootstrap/ui-bootstrap-tpls.min.js",
            client + "/bower_components/jquery-steps/build/jquery.steps.min.js",
            client + "/bower_components/jquery.slimscroll/jquery.slimscroll.min.js",
            client + "/bower_components/angular-ui-tree/dist/angular-ui-tree.min.js",
            client + "/bower_components/ngmap/build/scripts/ng-map.min.js",
            client + "/bower_components/angular-scroll/angular-scroll.min.js",
            client + "/bower_components/angular-validation-match/dist/angular-validation-match.min.js",
            client + "/bower_components/textAngular/dist/textAngular-rangy.min.js",
            client + "/bower_components/textAngular/dist/textAngular.min.js",
            client + "/bower_components/textAngular/dist/textAngular-sanitize.min.js",
            client + "/bower_components/angular-translate/angular-translate.min.js",
            client + "/bower_components/angular-translate-loader-static-files/angular-translate-loader-static-files.min.js",
            client + "/bower_components/ng-file-upload/ng-file-upload.min.js",
            client + "/bower_components/ng-file-upload-shim/ng-file-upload-shim.min.js",
            client + "/app/app.module.js",
            client + "/app/core/core.module.js",
            client + "/app/layout/layout.module.js",
            client + "/app/core/app.config.js",
            client + "/app/core/app.controller.js",
            client + "/app/core/app.service.js",
            client + "/app/core/geolocation-names.service.js",
            client + "/app/core/config.route.js",
            client + "/app/core/i18n.js",
            client + "/app/layout/layout.controller.js",
            client + "/app/layout/layout.diretive.js",
            client + "/app/layout/loader.js",
            client + "/app/layout/sidebar.directive.js",
            client + "/app/links/links.module.js",
            client + "/app/links/links.controller.js",
            client + "/app/traffics/traffics.module.js",
            client + "/app/traffics/traffics.controller.js",
            client + "/app/ipblacklist/ipblacklist.module.js",
            client + "/app/ipblacklist/ipblacklist.controller.js",
            client + "/app/networks/networks.module.js",
            client + "/app/networks/networks.controller.js",
            client + "/app/geoblacklist/geoblacklist.module.js",
            client + "/app/geoblacklist/geoblacklist.controller.js"
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