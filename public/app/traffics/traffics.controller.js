(function () {
    'use strict';

    angular.module( 'app.traffics' )
        .controller( 'TrafficsCtrl', ['$scope', '$filter', '$location', '$mdDialog', 'Traffics', TrafficsCtrl] )

    function TrafficsCtrl( $scope, $filter, $location, $mdDialog, Traffics ) {

        $scope.traffics = [];
        $scope.row = '';
        $scope.numPerPageOpt = [3, 5, 10, 20];
        $scope.numPerPage = $scope.numPerPageOpt[2];
        $scope.currentPage = 1;
        $scope.total = 0;

        $scope.select = select;
        $scope.onNumPerPageChange = onNumPerPageChange;
        $scope.order = order;

        /*function showAlert( ev, title, content, ariaLabel, ok ) {
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
        };*/

        function select( page ) {
            refresh( page );
        };

        function onNumPerPageChange() {
            $scope.select(1);
            return $scope.currentPage = 1;
        };

        function order(rowName) {
            if ($scope.row === rowName) {
                return;
            }
            $scope.row = rowName;
            $scope.traffics = $filter('orderBy')( $scope.traffics, rowName );
        };

        function refresh( page ) {
            if( !page ) {
                page = $scope.currentPage;
            }
            Traffics.getPage( page, $scope.numPerPage, function( result ) {
                $scope.traffics = result.traffics;
                $scope.currentPage = ( result.page ) ? result.page : 1;
                $scope.total = ( result.total ) ? result.total : 0;
                $scope.pages = ( result.pages ) ? result.pages : 0;
            } );
        }

        function _init() {
            refresh();
        }

        _init();
    }

})(); 
