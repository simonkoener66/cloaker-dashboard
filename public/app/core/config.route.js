(function () {
    'use strict';

    angular.module('app')
        .config(['$stateProvider', '$urlRouterProvider', function($stateProvider, $urlRouterProvider) {

            /* Set routes */
            var routes, setRoutes;
            routes = [
                {
                    url: 'links',
                    template: 'links/links'
                },
                {
                    url: 'links/new',
                    template: 'links/edit'
                },
                {
                    url: 'links/:id/edit',
                    template: 'links/edit'
                },
                {
                    url: 'traffics',
                    template: 'traffics/traffics'
                },
                {
                    url: 'iplist',
                    template: 'iplist/iplist'
                }
            ];
            setRoutes = function(route) {
                var config, url;
                url = '/' + route.url;
                config = {
                    url: url,
                    templateUrl: 'app/' + route.template + '.html'
                };
                $stateProvider.state(route.url, config);
                return $stateProvider;
            };
            routes.forEach(function(route) {
                return setRoutes(route);
            });

            /* Dashboard route */
            $urlRouterProvider
                .when('/', '/links')
                .otherwise('/links');

        }]
    );

})(); 