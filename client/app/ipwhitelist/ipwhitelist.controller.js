(function () {
    'use strict';

    angular.module( 'app.ipwhitelist' )
        .controller( 'IPWhitelistListCtrl', ['$scope', '$filter', '$location', '$mdDialog', 'IPWhitelist', 'Dialog', IPWhitelistListCtrl] )
        .controller( 'IPWhitelistEditCtrl', ['$scope', '$state', '$location', '$mdDialog', '$stateParams', 'IPWhitelist', 'Networks', 'Dialog', IPWhitelistEditCtrl] )
        .controller( 'IPWhitelistImportCtrl', ['$scope', '$timeout', 'appConfig', 'IPWhitelist', 'Upload', IPWhitelistImportCtrl] )
        .controller( 'IPWhitelistExportCtrl', ['$scope', '$window', 'IPWhitelist', IPWhitelistExportCtrl] )

    function IPWhitelistListCtrl( $scope, $filter, $location, $mdDialog, IPWhitelist, Dialog ) {

        $scope.ips = [];
        $scope.orderCol = '';
        $scope.numPerPageOpt = [3, 5, 10, 20];
        $scope.numPerPage = $scope.numPerPageOpt[2];
        $scope.currentPage = 1;
        $scope.total = 0;
        $scope.searchKeyword = '';
        $scope.searchUpdating = false;

        $scope.select = select;
        $scope.onNumPerPageChange = onNumPerPageChange;
        $scope.order = order;
        $scope.searchKeywordChange = searchKeywordChange;

        $scope.gotoCreatePage = gotoCreatePage;
        $scope.editIP = editIP;
        $scope.deleteIP = deleteIP;

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

        function searchKeywordChange() {
            $scope.searchUpdating = true;
            select(1);
        }

        function gotoCreatePage() {
            $location.path( '/ipwhitelist/new' );
        }

        function editIP( id ) {
            $location.path( '/ipwhitelist/' + id + '/edit' );
        }

        function deleteIP( ev, id ) {
            ev.stopPropagation();
            ev.preventDefault();
            Dialog.showConfirm(
                ev,
                'Confirm to Remove IP',
                'Are you sure to remove this IP from whitelist?',
                'Confirm to Remove IP',
                'Yes, I\'m sure',
                'No, I\'m not',
                function() {
                    IPWhitelist.delete( id, function() {
                        refresh();
                    }, function() {
                        Dialog.showAlert( 
                            ev,
                            'Failed to Remove IP',
                            'Request to remove IP from whitelist has failed. Please retry or contact administrator.',
                            'Failed to Remove IP',
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
            IPWhitelist.getPage( page, $scope.numPerPage, $scope.orderCol, $scope.searchKeyword, function( result ) {
                $scope.ips = result.ips;
                $scope.currentPage = ( result.page ) ? result.page : 1;
                $scope.total = ( result.total ) ? result.total : 0;
                $scope.pages = ( result.pages ) ? result.pages : 0;
                $scope.searchUpdating = false;
                $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
            } );
        }

        function _init() {
            refresh();
        }

        _init();
    }

    function IPWhitelistEditCtrl( $scope, $state, $location, $mdDialog, $stateParams, IPWhitelist, Networks, Dialog ) {

        $scope.title = 'Add an IP Address to Whitelist';
        $scope.submitButtonTitle = 'Create';
        $scope.networks = [''];
        $scope.ip = {};

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
            if( !IPWhitelist.isValid( $scope.ip ) ) {
                Dialog.showAlert(
                    ev,
                    'Invalid Parameters',
                    'One of the fields are empty. Please check before submit.',
                    'Invalid Parameters',
                    'OK' );
                return;
            }
            IPWhitelist.newOrUpdate( $scope.ip, function(response) {
                if(response.result) {
                    if(response.duplicated) {
                        Dialog.showAlert( 
                            ev,
                            'Duplicated Link',
                            'One or more of entered IPs already exist in whitelist, and are not added.',
                            false,
                            'OK'
                        );
                    }
                    $location.path( '/ipwhitelist/list' );
                } else {
                    if(response.duplicated) {
                        Dialog.showAlert( 
                            ev,
                            'Duplicated IP(s)',
                            'Duplicated IP(s): such IP(s) already exist in whitelist.',
                            false,
                            'OK'
                        );
                    } else {
                        Dialog.showAlert( 
                            ev,
                            'Failed to Update Whitelisted IP',
                            'Request to update whitelisted IP has failed. Please retry or contact administrator.',
                            false,
                            'OK'
                        );
                    }
                }
            }, function() {
                if( $scope.ip._id ) {
                    Dialog.showAlert( 
                        ev,
                        'Failed to Update Whitelisted IP',
                        'Request to update whitelisted IP has failed. Please retry or contact administrator.',
                        false,
                        'OK'
                    );
                } else {
                    Dialog.showAlert( 
                        ev,
                        'Failed to Add IP to Whitelist',
                        'Request to add an IP to whitelist has failed. Please retry or contact administrator.',
                        false,
                        'OK'
                    );
                }
            } );
        }

        function goBack() {
            $location.path( '/ipwhitelist/list' );
        }

        function _init() {
            if( $stateParams.id ) {
                $scope.title = 'Edit Whitelisted IP';
                $scope.submitButtonTitle = 'Update';
                IPWhitelist.get( $stateParams.id, function( data ) {
                    $scope.ip = data.whitelisted;
                    $scope.networks = $scope.networks.concat(data.networks);
                    $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
                } );
            } else {
                if( $state.selectedIPs ) {
                    $scope.ip.ip = $state.selectedIPs.join(', ');
                    $state.selectedIPs = false;
                }
                Networks.getPage(1, 9999, false, function( data ) {
                    $scope.networks = $scope.networks.concat(data.networks);
                    $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
                    $scope.ip.network = '';
                } );
            }
        }

        _init();
    }

    function IPWhitelistImportCtrl( $scope, $timeout, appConfig, IPWhitelist, Upload ) {

        var input = document.getElementById( 'fileinput' );
        $scope.filename = '';
        $scope.started = false;
        $scope.statusText = '';
        $scope.progressValue = 0;
        
        $scope.chooseFile = function() {
            var event = new Event('click');
            input.dispatchEvent( event );
        }

        $scope.importCSV = function( file ) {
            $scope.statusText = 'Importing...';
            $scope.started = true;

            file.upload = Upload.upload( {
                url: appConfig.server + '/api/ipwhitelist/import',
                data: { file: file }
            } );

            file.upload.then( function( response ) {
                $timeout( function() {
                    file.result = response.data;
                    $scope.progressValue = 100;
                    $scope.statusText = 'Import finished.';
                }, 200 );
            }, function( response ) {
                console.log(response);
            }, function( evt ) {
                if(!evt.total) {
                    $scope.progressValue = 0;
                } else {
                    $scope.progressValue = evt.loaded / evt.total * 100;
                }
            } );
        }

        function _init() {
            $(input).change( function() {
                var fn = $(input).val();
                var sep_idx = fn.lastIndexOf( '\\' );
                if( sep_idx >= 0 ) {
                    fn = fn.substr( sep_idx + 1 );
                }
                var sep_idx = fn.lastIndexOf( '/' );
                if( sep_idx >= 0 ) {
                    fn = fn.substr( sep_idx + 1 );
                }
                $scope.filename = fn;
            } );
        }

        _init();
    }

    function IPWhitelistExportCtrl( $scope, $window, IPWhitelist ) {

        $scope.exportCSV = function() {
            IPWhitelist.exportCSV();
        }
    }

})(); 
