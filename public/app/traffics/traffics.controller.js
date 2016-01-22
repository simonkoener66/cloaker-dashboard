(function () {
    'use strict';

    angular.module( 'app.traffics' )
        .controller( 'TrafficsCtrl', ['$scope', '$filter', '$location', 'Traffics', TrafficsCtrl] )

    function TrafficsCtrl( $scope, $filter, $location, Traffics ) {

        $scope.traffics = [];
        $scope.row = '';
        $scope.numPerPageOpt = [3, 5, 10, 20];
        $scope.numPerPage = $scope.numPerPageOpt[2];
        $scope.currentPage = 1;
        $scope.total = 0;

        $scope.select = select;
        $scope.onNumPerPageChange = onNumPerPageChange;
        $scope.order = order;

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
