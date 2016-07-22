(function () {
    'use strict';

    angular.module( 'app.traffics' )
        .controller( 'TrafficsCtrl', ['$scope', '$state', '$filter', '$location', 'Traffics', 'Users', TrafficsCtrl] )
        .controller( 'TrafficsExportCtrl', ['$scope', 'Traffics', TrafficsExportCtrl] )

    function TrafficsCtrl( $scope, $state, $filter, $location, Traffics, Users ) {

        $scope.admin = false;
        $scope.users = [];
        $scope.traffics = [];
        $scope.orderCol = '';
        $scope.numPerPageOpt = [3, 5, 10, 20];
        $scope.numPerPage = $scope.numPerPageOpt[2];
        $scope.currentPage = 1;
        $scope.total = 0;
        $scope.selected = [];
        $scope.headerCheckbox = false;
        $scope.ownerFilter = '';
        $scope.searchUpdating = false;

        $scope.select = select;
        $scope.onNumPerPageChange = onNumPerPageChange;
        $scope.ownerFilterChange = ownerFilterChange;
        $scope.order = order;
        $scope.toggleAllCheckboxes = toggleAllCheckboxes;
        $scope.selectedItemExists = selectedItemExists;
        $scope.addToBlacklist = addToBlacklist;

        /// for test
        /*
        $scope.download = function() {
            window.location.href = '/api/traffics/download';
        }
        */

        function select( page ) {
            refresh( page );
        }

        function onNumPerPageChange() {
            $scope.select( 1 );
        }

        function ownerFilterChange() {
            $scope.searchUpdating = true;
            select(1);
        }

        function order(colName) {
            if ($scope.orderCol === colName) {
                return;
            }
            $scope.orderCol = colName;
            refresh();
        }

        function toggleAllCheckboxes() {
            var len = $scope.traffics.length;
            for(var i = 0; i < len; i++) {
                $scope.selected[i] = $scope.headerCheckbox;
            }
        }

        function selectedItemExists() {
            var exists = false
            $scope.selected.every(function(val) {
                if(val) {
                    exists = true;
                    return false;
                }
                return true;
            });
            return exists;
        }

        function uniq(a) {
            var seen = {};
            return a.filter(function(item) {
                return seen.hasOwnProperty(item) ? false : (seen[item] = true);
            })
        }

        function addToBlacklist() {
            var index = 0, ips = [];
            $scope.selected.every(function(val) {
                if(index >= $scope.traffics.length) {
                    return false;
                }
                if(val) {
                    ips.push($scope.traffics[index].ip);
                }
                index++;
                return true;
            });
            if(ips.length > 0) {
                var uniqueIps = uniq(ips);
                $state.selectedIPs = uniqueIps;
                $location.path( '/ipblacklist/new' );
            }
        }

        function refresh( page ) {
            if( !page ) {
                page = $scope.currentPage;
            }
            Traffics.getPage( page, $scope.numPerPage, $scope.orderCol, $scope.ownerFilter, function( result ) {
                $scope.traffics = result.traffics;
                $scope.currentPage = ( result.page ) ? result.page : 1;
                $scope.total = ( result.total ) ? result.total : 0;
                $scope.pages = ( result.pages ) ? result.pages : 0;
                $scope.searchUpdating = false;

                $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
            } );
        }

        function _init() {
            refresh();
            Users.getAll( function( data ) {
                $scope.admin = data.admin;
                $scope.users = data.users;
            } );
        }

        _init();
    }

    function TrafficsExportCtrl( $scope, Traffics ) {

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
