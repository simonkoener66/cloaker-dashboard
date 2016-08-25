(function () {
    'use strict';

    angular.module( 'app.networks' )
        .controller( 'NetworkListCtrl', ['$scope', '$filter', '$location', '$mdDialog', 'Networks', 'Dialog', NetworkListCtrl] )
        .controller( 'NetworkEditCtrl', ['$scope', '$state', '$location', '$mdDialog', '$stateParams', 'Networks', 'Dialog', NetworkEditCtrl] )

    function NetworkListCtrl( $scope, $filter, $location, $mdDialog, Networks, Dialog ) {

        $scope.networks = [];
        $scope.orderCol = '';
        $scope.numPerPageOpt = [3, 5, 10, 20];
        $scope.numPerPage = $scope.numPerPageOpt[2];
        $scope.currentPage = 1;
        $scope.total = 0;
        $scope.userRole = authData.role;

        $scope.select = select;
        $scope.onNumPerPageChange = onNumPerPageChange;
        $scope.order = order;

        $scope.gotoCreatePage = gotoCreatePage;
        $scope.editNetwork = editNetwork;
        $scope.deleteNetwork = deleteNetwork;

        function select( page ) {
            refresh( page );
        }

        function onNumPerPageChange() {
            select(1);
        }

        function order(colName) {
            if ($scope.orderCol === colName) {
                return;
            }
            $scope.orderCol = colName;
            select(1);
        }

        function gotoCreatePage() {
            $location.path( '/networks/new' );
        }

        function editNetwork( id ) {
            if( $scope.userRole != 'admin' ) {
                return;
            }
            $location.path( '/networks/' + id + '/edit' );
        }

        function deleteNetwork( ev, id ) {
            ev.stopPropagation();
            ev.preventDefault();
            Dialog.showConfirm(
                ev,
                'Confirm to Remove Network',
                'Are you sure to remove this network?',
                'Confirm to Remove Network',
                'Yes, I\'m sure',
                'No, I\'m not',
                function() {
                    Networks.delete( id, function() {
                        refresh();
                    }, function() {
                        Dialog.showAlert( 
                            ev,
                            'Failed to Remove Network',
                            'Request to remove network. Please retry or contact administrator.',
                            'Failed to Remove Network',
                            'OK'
                        );
                    } );
                }
            );
        }

        function refresh( page ) {
            if( !page ) {
                page = $scope.currentPage;
            }
            Networks.getPage( page, $scope.numPerPage, $scope.orderCol, function( result ) {
                $scope.networks = result.networks;
                $scope.currentPage = ( result.page ) ? result.page : 1;
                $scope.total = ( result.total ) ? result.total : 0;
                $scope.pages = ( result.pages ) ? result.pages : 0;

                $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
            } );
        }

        function _init() {
            refresh();
        }

        _init();
    }

    function NetworkEditCtrl( $scope, $state, $location, $mdDialog, $stateParams, Networks, Dialog ) {

        $scope.title = 'Add a Network';
        $scope.submitButtonTitle = 'Create';
        $scope.networks = ['', 'Subnet 1', 'Subnet 2', 'BadNet'];
        $scope.network = {};

        $scope.networkName = networkName;
        $scope.submit = submit;
        $scope.goBack = goBack;

        function networkName(network) {
            if(!network) {
                return 'No network';
            } else {
                return network;
            }
        }

        function submit( ev ) {
            ev.stopPropagation();
            ev.preventDefault();
            if( !Networks.isValid( $scope.network ) ) {
                Dialog.showAlert(
                    ev,
                    'Invalid Parameters',
                    'One of the fields are empty. Please check before submit.',
                    'Invalid Parameters',
                    'OK' );
                return;
            }
            Networks.newOrUpdate( $scope.network, function(response) {
                if(response.duplicated) {
                    Dialog.showAlert( 
                        ev,
                        'Duplicated Network',
                        'Duplicated network: such network already exists.',
                        false,
                        'OK'
                    );
                } else {
                    $location.path( '/networks/list' );
                }
            }, function() {
                if( $scope.network._id ) {
                    Dialog.showAlert( 
                        ev,
                        'Failed to Update Network',
                        'Request to update network has failed. Please retry or contact administrator.',
                        'Failed to Update Network',
                        'OK'
                    );
                } else {
                    Dialog.showAlert( 
                        ev,
                        'Failed to Add a Network',
                        'Request to add a network has failed. Please retry or contact administrator.',
                        'Failed to Add a Network',
                        'OK'
                    );
                }
            } );
        }

        function goBack() {
            $location.path( '/networks/list' );
        }

        function _init() {
            if( $stateParams.id ) {
                $scope.title = 'Edit Network';
                $scope.submitButtonTitle = 'Update';
                Networks.get( $stateParams.id, function( network ) {
                    $scope.network = network;
                    $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
                } );
            } else {
                $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
            }
        }

        _init();
    }

})(); 
