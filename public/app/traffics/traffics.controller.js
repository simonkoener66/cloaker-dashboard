(function () {
    'use strict';

    angular.module( 'app.traffics' )
        .controller( 'TrafficsCtrl', ['$scope', '$filter', '$location', 'Traffics', TrafficsCtrl] )
        .controller( 'TrafficsExportCtrl', ['$scope', '$window', 'Traffics', TrafficsExportCtrl] )

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

        /// for test
        $scope.download = function() {
            window.location.href = '/api/traffics/download';
        }

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

    function TrafficsExportCtrl( $scope, $window, Traffics ) {

        $scope.fromDateEnabled = false;
        $scope.toDateEnabled = false;

        $scope.exportCSV = exportCSV;

        function mmddyyyy( date ) {
            var str = '';
            var m = date.getMonth(), d = date.getDate(), y = date.getFullYear();
            str += ( m < 10 ) ? '0' + m : m;
            str += ( d < 10 ) ? '0' + d : d;
            str += y;
            return str;
        }

        function exportCSV() {
            var from = '0', to = '0';
            if( $scope.fromDate && $scope.fromDateEnabled ) {
                from = mmddyyyy( $scope.fromDate );
            }
            if( $scope.toDate && $scope.toDateEnabled ) {
                to = mmddyyyy( $scope.toDate );
            }
            Traffics.exportCSV( from, to );
        }

    }

})(); 
