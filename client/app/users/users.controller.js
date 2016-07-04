(function () {
    'use strict';

    angular.module( 'app.users' )
        .controller( 'UsersCtrl', ['$scope', '$state', '$window', '$filter', '$location', '$mdDialog', 'Users', 'Dialog', UsersCtrl] )
        .controller( 'EditUserCtrl', ['$scope', '$state', '$location', '$mdDialog', '$stateParams', 'Users', 'Dialog', 'GeolocationCodes', EditUserCtrl] )

    function UsersCtrl( $scope, $state, $window, $filter, $location, $mdDialog, Users, Dialog ) {

        $scope.users = [];
        $scope.orderCol = '';
        $scope.numPerPageOpt = [3, 5, 10, 20];
        $scope.numPerPage = $scope.numPerPageOpt[2];
        $scope.currentPage = 1;
        $scope.total = 0;

        $scope.select = select;
        $scope.onNumPerPageChange = onNumPerPageChange;
        $scope.order = order;

        $scope.gotoCreatePage = gotoCreatePage;
        $scope.editUser = editUser;
        $scope.deleteUser = deleteUser;
        $scope.loadDefaultUsers = loadDefaultUsers;

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

        function refresh( page ) {
            if( !page ) {
                page = $scope.currentPage;
            }
            Users.getPage( page, $scope.numPerPage, $scope.orderCol, function( result ) {
                $scope.users = result.docs;
                $scope.currentPage = ( result.page ) ? result.page : 1;
                $scope.total = ( result.total ) ? result.total : 0;
                $scope.pages = ( result.pages ) ? result.pages : 0;
                $scope.searchUpdating = false;
                $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
            } );
        }

        function gotoCreatePage() {
            $location.path( '/users/new' );
        }

        function editUser( id ) {
            $location.path( '/users/' + id + '/edit' );
        }

        function deleteUser( ev, id ) {
            ev.stopPropagation();
            ev.preventDefault();
            Dialog.showConfirm(
                ev,
                'Confirm to Delete User',
                'Are you sure to delete this User?',
                'Confirm to Delete User',
                'Yes, I\'m sure',
                'No, I\'m not',
                function() {
                    Users.delete( id, function() {
                        refresh();
                    }, function() {
                        Dialog.showAlert( 
                            ev,
                            'Failed to Delete User',
                            'Request to delete user has failed. Please retry or contact administrator.',
                            'Failed to Delete User',
                            'OK'
                        );
                    } );
                }
            );
        }

        function loadDefaultUsers( ev ) {
            Dialog.showConfirm(
                ev,
                'Confirm to Reset to Defaults',
                'Are you sure to reset and load default users?',
                'Confirm to Reset to Defaults',
                'Yes, I\'m sure',
                'No, I\'m not',
                function() {
                    Users.loadDefaults( function() {
                        refresh();
                    }, function() {
                        Dialog.showAlert( 
                            ev,
                            'Failed to Reset to Defaults',
                            'Request to reset to defaults has failed. Please retry or contact administrator.',
                            'Failed to Reset to Defaults',
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

    function EditUserCtrl( $scope, $state, $location, $mdDialog, $stateParams, Users, Dialog, GeolocationCodes ) {

        $scope.user = {
            email: '',
            owner: '',
            role: 'user'
        };
        $scope.title = 'Create New User';
        $scope.submitButtonTitle = 'Create';

        $scope.submit = submit;
        $scope.gotoList = gotoList;

        function submit( ev ) {
            if( !Users.isValid( $scope.user ) ) {
                Dialog.showAlert(
                    ev,
                    'Invalid Parameters',
                    'One of the fields are empty. Please check before submit.',
                    'Invalid Parameters',
                    'OK' );
                return;
            }
            Users.newOrUpdate( $scope.user, function(response) {
                if(response.duplicated) {
                    Dialog.showAlert( 
                        ev,
                        'Duplicated User',
                        'Duplicated user: such user already exists.',
                        false,
                        'OK'
                    );
                } else {
                    $location.path( '/users/list' );
                }
            }, function(response) {
                if( $scope.user._id ) {
                    Dialog.showAlert( 
                        ev,
                        'Failed to Update User',
                        'Request to update user has failed. Please retry or contact administrator.',
                        'Failed to Update User',
                        'OK'
                    );
                } else {
                    Dialog.showAlert( 
                        ev,
                        'Failed to Create New User',
                        'Request to create new user has failed. Please retry or contact administrator.',
                        'Failed to Create New User',
                        'OK'
                    );
                }
            } );
        }

        function gotoList() {
            $location.path( '/users/list' );
        }

        function _init() {
            if( $stateParams.id ) {
                $scope.title = 'Edit User';
                $scope.submitButtonTitle = 'Update';
                Users.get( $stateParams.id, function( data ) {
                    $scope.user = data;
                    $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
                } );
            } else {
                $( '.cl-panel-loading' ).removeClass( 'cl-panel-loading' );
            }
        }

        _init();
    }

})(); 
