(function () {
    'use strict';

    angular.module('app')
        .config(['$stateProvider', '$urlRouterProvider', function($stateProvider, $urlRouterProvider) {

            /* Set routes */
            var routes, setRoutes;
            routes = [
                {
                    url: 'links/list',
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
                    url: 'traffics/list',
                    template: 'traffics/traffics'
                },
                {
                    url: 'traffics/export',
                    template: 'traffics/export'
                },
                {
                    url: 'ipblacklist/list',
                    template: 'ipblacklist/list'
                },
                {
                    url: 'ipblacklist/new',
                    template: 'ipblacklist/edit'
                },
                {
                    url: 'ipblacklist/:id/edit',
                    template: 'ipblacklist/edit'
                },
                {
                    url: 'ipblacklist/import',
                    template: 'ipblacklist/import'
                },
                {
                    url: 'ipblacklist/export',
                    template: 'ipblacklist/export'
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
                .when('/', '/links/list')
                .otherwise('/links/list');

        }]
    );

})(); 