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
                },
                {
                    url: 'ipwhitelist/list',
                    template: 'ipwhitelist/list'
                },
                {
                    url: 'ipwhitelist/new',
                    template: 'ipwhitelist/edit'
                },
                {
                    url: 'ipwhitelist/:id/edit',
                    template: 'ipwhitelist/edit'
                },
                {
                    url: 'ipwhitelist/import',
                    template: 'ipwhitelist/import'
                },
                {
                    url: 'ipwhitelist/export',
                    template: 'ipwhitelist/export'
                },
                {
                    url: 'networks/list',
                    template: 'networks/list'
                },
                {
                    url: 'networks/new',
                    template: 'networks/edit'
                },
                {
                    url: 'networks/:id/edit',
                    template: 'networks/edit'
                },
                {
                    url: 'geoblacklist/list',
                    template: 'geoblacklist/list'
                },
                {
                    url: 'geoblacklist/new',
                    template: 'geoblacklist/edit'
                },
                {
                    url: 'geoblacklist/:id/edit',
                    template: 'geoblacklist/edit'
                },
                {
                    url: 'geoblacklist/import',
                    template: 'geoblacklist/import'
                },
                {
                    url: 'geoblacklist/export',
                    template: 'geoblacklist/export'
                },
                {
                    url: 'users/list',
                    template: 'users/list'
                },
                {
                    url: 'users/new',
                    template: 'users/edit'
                },
                {
                    url: 'users/:id/edit',
                    template: 'users/edit'
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