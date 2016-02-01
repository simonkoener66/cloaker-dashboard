(function () {
    'use strict';

    angular.module( 'app.links' )
        .controller( 'LinksCtrl', ['$scope', '$state', '$window', '$filter', '$location', '$mdDialog', 'Links', 'Dialog', LinksCtrl] )
        .controller( 'EditLinkCtrl', ['$scope', '$state', '$location', '$mdDialog', '$stateParams', 'Links', 'Dialog', 'GeolocationCodes', EditLinkCtrl] )

    function LinksCtrl( $scope, $state, $window, $filter, $location, $mdDialog, Links, Dialog ) {

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
        $scope.editLink = editLink;
        $scope.toggleLink = toggleLink;
        $scope.duplicateLink = duplicateLink;
        $scope.deleteLink = deleteLink;
        
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
                for(var i=0;i<$scope.links.length;i++) {
                    $scope.links[i].enabled = true;
                }
                $scope.currentPage = ( result.page ) ? result.page : 1;
                $scope.total = ( result.total ) ? result.total : 0;
                $scope.pages = ( result.pages ) ? result.pages : 0;

                $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
            } );
        }

        function gotoCreatePage() {
            $location.path( '/links/new' );
        }

        function editLink( id ) {
            $location.path( '/links/' + id + '/edit' );
        }

        function toggleLink( ev, link ) {
            ev.stopPropagation();
            ev.preventDefault();
            Links.toggleEnableStatus( link, function( data ) {
                console.log( data );
                if( data.result ) {
                    link.status = data.status;
                } else {
                    Dialog.showAlert( 
                        ev,
                        'Failed to Change Status',
                        'Failed to change status of the link due to the server error.',
                        'Failed to Change Status',
                        'OK'
                    );
                }
            }, function() {
                Dialog.showAlert( 
                    ev,
                    'Failed to Change Status',
                    'Request to change status of the link has failed. Please retry or contact administrator.',
                    'Failed to Change Status',
                    'OK'
                );
            } );
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

        function duplicateLink( ev, link ) {
            ev.stopPropagation();
            ev.preventDefault();
            $state.duplicatingLink = link;
            $location.path( '/links/new' );
        }

        function _init() {
            refresh();
        }

        _init();
    }

    function EditLinkCtrl( $scope, $state, $location, $mdDialog, $stateParams, Links, Dialog, GeolocationCodes ) {

        var empty_regions = [ [ { code: '', longname: 'All Regions' } ] ];

        $scope.link = {
            link_generated: '',
            link_real: '',
            link_safe: '',
            total_hits: 0,
            real_hits: 0,
            use_ip_blacklist: false,
            criteria: [
                { country: 'US', region: 'CA', city: '' },
            ],
            criteria_disallow: []
        };
        $scope.title = 'Create New Link';
        $scope.submitButtonTitle = 'Create';
        $scope.countries = GeolocationCodes.getCountries();
        $scope.regions = empty_regions;
        $scope.regions_disallow = empty_regions;

        $scope.addNewLocation = addNewLocation;
        $scope.addNewDisallowedLocation = addNewDisallowedLocation;
        $scope.removeCriteria = removeCriteria;
        $scope.removeDisallowedCriteria = removeDisallowedCriteria;
        $scope.updateRegions = updateRegions;
        $scope.updateDisallowRegions = updateDisallowRegions;
        $scope.submit = submit;
        $scope.gotoLinks = gotoLinks;

        function addNewLocation() {
            $scope.link.criteria.push( {
                country: '',
                region: '',
                city: ''
            } );
        }

        function addNewDisallowedLocation() {
            $scope.link.criteria_disallow.push( {
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

        function removeDisallowedCriteria( index ) {
            if( index > -1 ) {
                $scope.link.criteria_disallow.splice( index, 1 );
            }
        }

        function copyRegions( orgRegions ) {
            var new_regions = [];
            orgRegions.forEach( function( region ) {
                new_regions.push( {
                    code: region.code,
                    longname: region.longname
                } );
            } );
            return new_regions;
        }

        function updateRegions( index ) {
            $scope.regions[index] = copyRegions( GeolocationCodes.getCountry( $scope.link.criteria[index].country ).regions );
        }

        function updateDisallowRegions( index ) {
            $scope.regions_disallow[index] = copyRegions( GeolocationCodes.getCountry( $scope.link.criteria_disallow[index].country ).regions );
        }

        function updateAllRegions() {
            $scope.regions = [];
            for( var i = 0; i < $scope.link.criteria.length; i++ ) {
                updateRegions( i );
            }
            $scope.regions_disallow = [];
            for( var i = 0; i < $scope.link.criteria_disallow.length; i++ ) {
                updateDisallowRegions( i );
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
                $location.path( '/links/list' );
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
            $location.path( '/links/list' );
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
                        description: ( link.description ) ? link.description : '',
                        total_hits: ( link.total_hits ) ? link.total_hits : 0,
                        real_hits: ( link.real_hits ) ? link.real_hits : 0,
                        use_ip_blacklist: ( link.use_ip_blacklist ) ? link.use_ip_blacklist : false,
                        criteria: ( link.criteria ) ? link.criteria : [],
                        criteria_disallow: ( link.criteria_disallow ) ? link.criteria_disallow : []
                    };
                    updateAllRegions();
                    $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
                } );
            } else {
                if( $state.duplicatingLink ) {
                    $scope.link = $state.duplicatingLink;
                    $state.duplicatingLink = false;
                    $scope.link._id = '';
                    $scope.title = 'Duplicate Link';
                }
                updateAllRegions();
                $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
            }
        }

        _init();
    }

})(); 
