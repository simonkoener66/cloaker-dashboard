(function () {
    'use strict';

    angular.module('app', [
        // Core modules
        'app.core'

        // Features
        ,'app.links'
        ,'app.traffics'
        ,'app.ipblacklist'
        ,'app.ipwhitelist'
        ,'app.networks'
        ,'app.geoblacklist'
        ,'app.users'
        
        // 3rd party feature modules
        ,'ui.tree'
        ,'ngMap'
        ,'textAngular'
        ,'ngFileUpload'
    ]);

})();

