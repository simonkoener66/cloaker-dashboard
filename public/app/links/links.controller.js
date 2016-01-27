(function () {
    'use strict';

    angular.module( 'app.links' )
        .controller( 'LinksCtrl', ['$scope', '$window', '$filter', '$location', '$mdDialog', 'Links', 'Dialog', LinksCtrl] )
        .controller( 'EditLinkCtrl', ['$scope', '$location', '$mdDialog', '$stateParams', 'Links', 'Dialog', 'GeolocationCodes', EditLinkCtrl] )

    function LinksCtrl( $scope, $window, $filter, $location, $mdDialog, Links, Dialog ) {

        $scope.links = [];
        $scope.row = '';
        $scope.numPerPageOpt = [3, 5, 10, 20];
        $scope.numPerPage = $scope.numPerPageOpt[2];
        $scope.currentPage = 1;
        $scope.total = 0;

        $scope.select = select;
        $scope.onNumPerPageChange = onNumPerPageChange;
        $scope.order = order;

        $scope.gotoCreatePage = gotoCreatePage;
        $scope.deleteLink = deleteLink;
        $scope.editLink = editLink;

        function select( page ) {
            refresh( page );
        };

        function onNumPerPageChange() {
            $scope.select( 1 );
        };

        function order(rowName) {
            if ($scope.row === rowName) {
                return;
            }
            $scope.row = rowName;
            $scope.links = $filter('orderBy')($scope.links, rowName);
        };

        function refresh( page ) {
            if( !page ) {
                page = $scope.currentPage;
            }
            Links.getPage( page, $scope.numPerPage, function( result ) {
                $scope.links = result.links;
                $scope.currentPage = ( result.page ) ? result.page : 1;
                $scope.total = ( result.total ) ? result.total : 0;
                $scope.pages = ( result.pages ) ? result.pages : 0;
            } );
        }

        function gotoCreatePage() {
            $location.path( '/links/new' );
        }

        function editLink( id ) {
            $location.path( '/links/' + id + '/edit' );
        }

        function deleteLink( ev, id ) {
            ev.stopPropagation();
            ev.preventDefault();
            Dialog.showConfirm(
                ev,
                'Confirm to Delete Link',
                'Are you sure to delete this link? Once deleted, you won\'t be able to recover the link.',
                'Confirm to Delete Link',
                'Yes, I\'m sure',
                'No, I\'m not',
                function() {
                    Links.delete( id, function() {
                        refresh();
                    }, function() {
                        Dialog.showAlert( 
                            ev,
                            'Failed to Delete Link',
                            'Request to delete link has failed. Please retry or contact administrator.',
                            'Failed to Delete Link',
                            'OK'
                        );
                    } );
                }
            );
        }

        function _init() {
            refresh();
        }

        _init();
    }

    function EditLinkCtrl( $scope, $location, $mdDialog, $stateParams, Links, Dialog, GeolocationCodes ) {

        $scope.link = {
            link_generated: '',
            link_real: '',
            link_safe: '',
            total_hits: 0,
            real_hits: 0,
            use_ip_blacklist: false,
            criteria: [
                { country: 'US', region: 'CA', city: '' },
            ]
        };
        $scope.title = 'Create New Link';
        $scope.submitButtonTitle = 'Create';
        $scope.countries = GeolocationCodes.getCountries();
        $scope.regions = [ [ { code: '', longname: 'All Regions' } ] ];

        $scope.addNewCriteria = addNewCriteria;
        $scope.removeCriteria = removeCriteria;
        $scope.updateRegions = updateRegions;
        $scope.submit = submit;
        $scope.gotoLinks = gotoLinks;

        function addNewCriteria() {
            $scope.link.criteria.push( {
                country: '',
                region: '',
                city: ''
            } );
        }

        function removeCriteria( index ) {
            if( index > -1 ) {
                $scope.link.criteria.splice( index, 1 );
            }
        }

        function updateRegions( index ) {
            $scope.regions[index] = GeolocationCodes.getCountry( $scope.link.criteria[index].country ).regions;
            console.log($scope.link.criteria[index].country );
            console.log(GeolocationCodes.getCountry( $scope.link.criteria[index].country ));
        }

        function updateAllRegions() {
            $scope.regions = [];
            for( var i = 0; i < $scope.link.criteria.length; i++ ) {
                updateRegions( i );
            }
        }

        function submit( ev ) {
            if( !Links.isValid( $scope.link ) ) {
                Dialog.showAlert(
                    ev,
                    'Invalid Parameters',
                    'One of the fields are empty. Please check before submit.',
                    'Invalid Parameters',
                    'OK' );
                return;
            }
            Links.newOrUpdate( $scope.link, function() {
                $location.path( '/links' );
            }, function() {
                if( $scope.link._id ) {
                    Dialog.showAlert( 
                        ev,
                        'Failed to Update Link',
                        'Request to update link has failed. Please retry or contact administrator.',
                        'Failed to Update Link',
                        'OK'
                    );
                } else {
                    Dialog.showAlert( 
                        ev,
                        'Failed to Create New Link',
                        'Request to create new link has failed. Please retry or contact administrator.',
                        'Failed to Create New Link',
                        'OK'
                    );
                }
            } );
        }

        function gotoLinks() {
            $location.path( '/links' );
        }

        function _init() {
            if( $stateParams.id ) {
                $scope.title = 'Edit Link';
                $scope.submitButtonTitle = 'Update';
                Links.get( $stateParams.id, function( link ) {
                    $scope.link = {
                        _id: link._id,
                        link_generated: ( link.link_generated ) ? link.link_generated : '',
                        link_real: ( link.link_real ) ? link.link_real : '',
                        link_safe: ( link.link_safe ) ? link.link_safe : '',
                        total_hits: ( link.total_hits ) ? link.total_hits : 0,
                        real_hits: ( link.real_hits ) ? link.real_hits : 0,
                        use_ip_blacklist: ( link.use_ip_blacklist ) ? link.use_ip_blacklist : false,
                        criteria: ( link.criteria ) ? link.criteria : []
                    };
                    updateAllRegions();
                } );
            } else {
                updateAllRegions();
            }
        }

        _init();
    }

})(); 
