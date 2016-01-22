(function () {
    'use strict';

    angular.module( 'app.links' )
        .controller( 'LinksCtrl', ['$scope', '$filter', '$location', '$mdDialog', 'Links', LinksCtrl] )
        .controller( 'EditLinkCtrl', ['$scope', '$location', '$mdDialog', '$stateParams', 'Links', EditLinkCtrl] )

    function LinksCtrl( $scope, $filter, $location, $mdDialog, Links ) {

        $scope.links = [];
        $scope.filteredLinks = [];
        $scope.searchKeywords = '';
        $scope.row = '';
        $scope.numPerPageOpt = [3, 5, 10, 20];
        $scope.numPerPage = $scope.numPerPageOpt[2];
        $scope.currentPage = 1;
        $scope.currentPageLinks = [];

        $scope.select = select;
        $scope.onFilterChange = onFilterChange;
        $scope.onNumPerPageChange = onNumPerPageChange;
        $scope.onOrderChange = onOrderChange;
        $scope.search = search;
        $scope.order = order;
        $scope.gotoCreatePage = gotoCreatePage;
        $scope.deleteLink = deleteLink;
        $scope.editLink = editLink;

        function showAlert( ev, title, content, ariaLabel, ok ) {
            $mdDialog.show(
                $mdDialog.alert()
                    .parent( angular.element(document.querySelector('#popupContainer')) )
                    .clickOutsideToClose( true )
                    .title( title )
                    .content( content )
                    .ariaLabel( ariaLabel )
                    .ok( ok )
                    .targetEvent( ev )
            );
        }

        function showConfirm( ev, title, content, ariaLabel, ok, cancel, ok_callback, cancel_callback ) {
            var confirm = $mdDialog.confirm()
                        .title( title )
                        .content( content )
                        .ariaLabel( ariaLabel )
                        .targetEvent( ev )
                        .ok( ok )
                        .cancel( cancel );
            $mdDialog.show(confirm).then(function() {
                ok_callback();
            }, function() {
                if( typeof cancel_callback != 'undefined' ) {
                    cancel_callback();
                }
            });
        };

        function select(page) {
            var end, start;
            start = (page - 1) * $scope.numPerPage;
            end = start + $scope.numPerPage;
            return $scope.currentPageLinks = $scope.filteredLinks.slice(start, end);
        };

        function onFilterChange() {
            $scope.select(1);
            $scope.currentPage = 1;
            return $scope.row = '';
        };

        function onNumPerPageChange() {
            $scope.select(1);
            return $scope.currentPage = 1;
        };

        function onOrderChange() {
            $scope.select(1);
            return $scope.currentPage = 1;
        };

        function search() {
            $scope.filteredLinks = $filter('filter')($scope.links, $scope.searchKeywords);
            return $scope.onFilterChange();
        };

        function order(rowName) {
            if ($scope.row === rowName) {
                return;
            }
            $scope.row = rowName;
            $scope.filteredLinks = $filter('orderBy')($scope.links, rowName);
            return $scope.onOrderChange();
        };

        function refresh() {
            Links.all( function( links ) {
                $scope.links = links;
                $scope.search();
                $scope.select($scope.currentPage);
            } );
        }

        function gotoCreatePage() {
            $location.path( '/links/new' );
        }

        function editLink( id ) {
            $location.path( '/links/' + id + '/edit' );
        }

        function deleteLink( ev, id ) {
            showConfirm(
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
                        showAlert( 
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

    function EditLinkCtrl( $scope, $location, $mdDialog, $stateParams, Links ) {

        $scope.link = {
            link_generated: '',
            link_real: '',
            link_safe: ''
        };
        $scope.title = 'Create New Link';
        $scope.submitButtonTitle = 'Create';

        $scope.submit = submit;
        $scope.gotoLinks = gotoLinks;

        function showAlert( ev, title, content, ariaLabel, ok ) {
            $mdDialog.show(
                $mdDialog.alert()
                    .parent( angular.element(document.querySelector('#popupContainer')) )
                    .clickOutsideToClose( true )
                    .title( title )
                    .content( content )
                    .ariaLabel( ariaLabel )
                    .ok( ok )
                    .targetEvent( ev )
            );
        }

        function submit( ev ) {
            if( !Links.isValid( $scope.link ) ) {
                showAlert(
                    ev,
                    'Invalid Parameters',
                    'One of the fields are empty. Please check before submit.',
                    'Invalid Parameters',
                    'OK' );
                return;
            }
            Links.new( $scope.link, function() {
                $location.path( '/links' );
            }, function() {
                showAlert( 
                    ev,
                    'Failed to Create New Link',
                    'Request to create new link has failed. Please retry or contact administrator.',
                    'Failed to Create New Link',
                    'OK'
                );
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
                    $scope.link = link;
                } );
            }
        }

        _init();
    }

})(); 
