(function () {
    'use strict';

    angular.module('app')
    .service( 'Links', [ '$http', '$window', 'appConfig', LinksService ] )
    .service( 'Traffics', [ '$http', '$window', 'appConfig', TrafficsService ] )
    .service( 'IPBlacklist', [ '$http', '$window', 'appConfig', IPBlacklistService ] )
    .service( 'Dialog', [ '$mdDialog', DialogService ] )
    
    function LinksService( $http, $window, appConfig ) {

    	function apiUrl( path ) {
    		return appConfig.dbserver + '/api' + path;
    	}

    	this.isValid = function( link ) {
    		return ( link.link_generated != '' ) && ( link.link_real != '' ) && ( link.link_safe != '' );
    	}

        this.all = function( callback ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
        	$http
        	.get( apiUrl( '/links' ) )
        	.then( function( response ) {
        		callback( response.data );
        	} );
        }

        this.get = function( id, callback ) {
        	if( !id ) {
        		callback( { id: false } );
        	}
            $http.defaults.headers.common.token = $window.sessionStorage.token;
        	$http
        	.get( apiUrl( '/links/' + id ) )
        	.then( function( response ) {
        		callback( response.data );
        	} );
        }

        this.new = function( link, success, error ) {
        	if( !this.isValid( link ) ) {
        		if( typeof error != 'undefined' ) {
	        		error();
	        	}
        		return;
        	}
            $http.defaults.headers.common.token = $window.sessionStorage.token;
        	var request = $http.post( apiUrl( '/links' ), link );
        	if( typeof success != 'undefined' ) {
        		request = request.success( success );
        	}
        	if( typeof error != 'undefined' ) {
        		request = request.error( error );
        	}
        }

        this.delete = function( id, success, error ) {
        	if( !id ) {
        		if( typeof error != 'undefined' ) {
	        		error();
	        	}
        		return;
        	}
            $http.defaults.headers.common.token = $window.sessionStorage.token;
        	var request = $http.post( 
        		apiUrl( '/links/delete' ),
        		{ _id: id }
        	);
        	if( typeof success != 'undefined' ) {
        		request = request.success( success );
        	}
        	if( typeof error != 'undefined' ) {
        		request = request.error( error );
        	}
        }

        this.update = function( link, success, error ) {
        	if( !link.id || !this.isValid( link ) ) {
        		if( typeof error != 'undefined' ) {
	        		error();
	        	}
        		return;
        	}
            $http.defaults.headers.common.token = $window.sessionStorage.token;
        	var request = $http.post( apiUrl( '/links/update' ), link );
        	if( typeof success != 'undefined' ) {
        		request = request.success( success );
        	}
        	if( typeof error != 'undefined' ) {
        		request = request.error( error );
        	}
        }

    }

    function TrafficsService( $http, $window, appConfig ) {

    	function apiUrl( path ) {
    		return appConfig.dbserver + '/api' + path;
    	}

    	this.getPage = function( page, limit, callback ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
    		$http
    		.get( apiUrl( '/traffics/' + page + '/' + limit ) )
    		.then( function( response ) {
    			callback( response.data );
    		} );
    	}
    }

    function IPBlacklistService( $http, $window, appConfig ) {

        function apiUrl( path ) {
            return appConfig.dbserver + '/api' + path;
        }

        this.isValid = function( ip ) {
            return ( ip.ip != '' ) && ( ip.description != '' );
        }

        this.getPage = function( page, limit, callback ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            $http
            .get( apiUrl( '/ipblacklist/' + page + '/' + limit ) )
            .then( function( response ) {
                callback( response.data );
            } );
        }

        this.get = function( id, callback ) {
            if( !id ) {
                callback( { id: false } );
            }
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            $http
            .get( apiUrl( '/ipblacklist/' + id ) )
            .then( function( response ) {
                callback( response.data );
            } );
        }

        this.new = function( ip, success, error ) {
            if( !this.isValid( ip ) ) {
                if( typeof error != 'undefined' ) {
                    error();
                }
                return;
            }
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            var request = $http.post( apiUrl( '/ipblacklist' ), ip );
            if( typeof success != 'undefined' ) {
                request = request.success( success );
            }
            if( typeof error != 'undefined' ) {
                request = request.error( error );
            }
        }

        this.delete = function( id, success, error ) {
            if( !id ) {
                if( typeof error != 'undefined' ) {
                    error();
                }
                return;
            }
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            var request = $http.post( 
                apiUrl( '/ipblacklist/delete' ),
                { _id: id }
            );
            if( typeof success != 'undefined' ) {
                request = request.success( success );
            }
            if( typeof error != 'undefined' ) {
                request = request.error( error );
            }
        }
    }

    function DialogService( $mdDialog ) {

        this.showAlert = function( ev, title, content, ariaLabel, ok ) {
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

        this.showConfirm = function( ev, title, content, ariaLabel, ok, cancel, ok_callback, cancel_callback ) {
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
    }

})(); 