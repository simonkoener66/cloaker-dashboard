(function () {
    'use strict';

    angular.module('app', [
        // Core modules
        'app.core'

        // Features
        ,'app.links'
        ,'app.traffics'
        ,'app.ipblacklist'
        
        // 3rd party feature modules
        ,'ui.tree'
        ,'ngMap'
        ,'textAngular'
    ]);

})();

