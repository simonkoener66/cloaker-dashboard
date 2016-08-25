(function () {
    'use strict';

    angular.module( 'app.geoblacklist' )
        .controller( 'GeoBlacklistListCtrl', ['$scope', '$filter', '$location', '$mdDialog', 'GeoBlacklist', 'Dialog', 'GeolocationCodes', GeoBlacklistListCtrl] )
        .controller( 'GeoBlacklistEditCtrl', ['$scope', '$state', '$location', '$mdDialog', '$stateParams', 'GeoBlacklist', 'Dialog', 'GeolocationCodes', GeoBlacklistEditCtrl] )
        .controller( 'GeoBlacklistImportCtrl', ['$scope', '$timeout', 'appConfig', 'GeoBlacklist', 'Upload', GeoBlacklistImportCtrl] )
        .controller( 'GeoBlacklistExportCtrl', ['$scope', '$window', 'GeoBlacklist', GeoBlacklistExportCtrl] )

    function GeoBlacklistListCtrl( $scope, $filter, $location, $mdDialog, GeoBlacklist, Dialog, GeolocationCodes ) {

        $scope.items = [];
        $scope.orderCol = '';
        $scope.numPerPageOpt = [3, 5, 10, 20];
        $scope.numPerPage = $scope.numPerPageOpt[2];
        $scope.currentPage = 1;
        $scope.total = 0;
        $scope.searchKeyword = '';
        $scope.searchUpdating = false;
        $scope.userRole = authData.role;

        $scope.select = select;
        $scope.onNumPerPageChange = onNumPerPageChange;
        $scope.order = order;
        $scope.searchKeywordChange = searchKeywordChange;
        $scope.countryName = countryName;
        $scope.regionName = regionName;

        $scope.gotoCreatePage = gotoCreatePage;
        $scope.editGeolocation = editGeolocation;
        $scope.deleteGeolocation = deleteGeolocation;

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

        function countryName(code) {
            return GeolocationCodes.getCountry( code ).longname;
        }

        function regionName(countryCode, regionCode) {
            var regions = GeolocationCodes.getCountry( countryCode ).regions;
            if( !regions ) {
                return '';
            }
            var regionCount = regions.length;
            for(var i = 0; i < regionCount; i++) {
                if( regions[i].code == regionCode) {
                    return regions[i].longname;
                }
            }
            return '';
        }

        function gotoCreatePage() {
            $location.path( '/geoblacklist/new' );
        }

        function editGeolocation( id ) {
            if( $scope.userRole != 'admin' ) {
                return;
            }
            $location.path( '/geoblacklist/' + id + '/edit' );
        }

        function deleteGeolocation( ev, id ) {
            ev.stopPropagation();
            ev.preventDefault();
            Dialog.showConfirm(
                ev,
                'Confirm to Remove geolocation',
                'Are you sure to remove this geolocation from blacklist?',
                'Confirm to Remove geolocation',
                'Yes, I\'m sure',
                'No, I\'m not',
                function() {
                    GeoBlacklist.delete( id, function() {
                        refresh();
                    }, function() {
                        Dialog.showAlert( 
                            ev,
                            'Failed to Remove geolocation',
                            'Request to remove geolocation from blacklist has failed. Please retry or contact administrator.',
                            'Failed to Remove geolocation',
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
            GeoBlacklist.getPage( page, $scope.numPerPage, $scope.orderCol, $scope.searchKeyword, function( result ) {
                $scope.items = result.items;
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

    function GeoBlacklistEditCtrl( $scope, $state, $location, $mdDialog, $stateParams, GeoBlacklist, Dialog, GeolocationCodes ) {

        var empty_regions = [ [ { code: '', longname: 'All Regions' } ] ];

        $scope.title = 'Add a geolocation to Blacklist';
        $scope.submitButtonTitle = 'Create';
        $scope.geo = {
            country: '',
            region: '',
            city: '',
        };
        $scope.countries = GeolocationCodes.getCountries();
        $scope.regions = empty_regions;

        $scope.submit = submit;
        $scope.goBack = goBack;
        $scope.updateRegions = updateRegions;

        function submit( ev ) {
            ev.stopPropagation();
            ev.preventDefault();
            if( !GeoBlacklist.isValid( $scope.geo ) ) {
                Dialog.showAlert(
                    ev,
                    'Invalid Parameters',
                    'One of the fields are empty. Please check before submit.',
                    'Invalid Parameters',
                    'OK' );
                return;
            }
            GeoBlacklist.newOrUpdate( $scope.geo, function(response) {
                if(response.result) {
                    $location.path( '/geoblacklist/list' );
                } else {
                    if(response.duplicated) {
                        Dialog.showAlert( 
                            ev,
                            'Duplicated geolocation(s)',
                            'Duplicated geolocation(s): such geolocation(s) already exist in blacklist.',
                            false,
                            'OK'
                        );
                    } else {
                        Dialog.showAlert( 
                            ev,
                            'Failed to Update Blacklisted geolocation',
                            'Request to update blacklisted geolocation has failed. Please retry or contact administrator.',
                            false,
                            'OK'
                        );
                    }
                }
            }, function() {
                if( $scope.geo._id ) {
                    Dialog.showAlert( 
                        ev,
                        'Failed to Update Blacklisted geolocation',
                        'Request to update blacklisted geolocation has failed. Please retry or contact administrator.',
                        false,
                        'OK'
                    );
                } else {
                    Dialog.showAlert( 
                        ev,
                        'Failed to Add geolocation to Blacklist',
                        'Request to add a geolocation to blacklist has failed. Please retry or contact administrator.',
                        false,
                        'OK'
                    );
                }
            } );
        }

        function copyRegions( orgRegions ) {
            var new_regions = [];
            if( orgRegions ) {
                orgRegions.forEach( function( region ) {
                    new_regions.push( {
                        code: region.code,
                        longname: region.longname
                    } );
                } );
            }
            return new_regions;
        }

        function updateRegions() {
            $scope.regions = copyRegions( GeolocationCodes.getCountry( $scope.geo.country ).regions );
        }

        function goBack() {
            $location.path( '/geoblacklist/list' );
        }

        function _init() {
            if( $stateParams.id ) {
                $scope.title = 'Edit Blacklisted Geolocation';
                $scope.submitButtonTitle = 'Update';
                GeoBlacklist.get( $stateParams.id, function( data ) {
                    $scope.geo = data.item;
                    $scope.updateRegions();
                    $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
                } );
            } else {
                $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
            }
        }

        _init();
    }

    function GeoBlacklistImportCtrl( $scope, $timeout, appConfig, GeoBlacklist, Upload ) {

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
                url: appConfig.server + '/api/geoblacklist/import',
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

    function GeoBlacklistExportCtrl( $scope, $window, GeoBlacklist ) {

        $scope.exportCSV = function() {
            GeoBlacklist.exportCSV();
        }
    }

})(); 
