(function () {
    'use strict';

    angular.module('app')
    .service( 'Dialog', [ '$mdDialog', DialogService ] )
    .service( 'AuthenticationService', [ '$http', '$window', 'appConfig', 'Dialog', AuthenticationService ] )
    .service( 'Links', [ '$http', '$window', 'appConfig', 'AuthenticationService', LinksService ] )
    .service( 'Traffics', [ '$http', '$window', 'appConfig', 'AuthenticationService', TrafficsService ] )
    .service( 'IPBlacklist', [ '$http', '$window', 'appConfig', 'AuthenticationService', IPBlacklistService ] )

    function AuthenticationService( $http, $window, appConfig, Dialog ) {

        function apiUrl( path ) {
            return appConfig.server + '/api' + path;
        }

        this.checkAuth = function( response ) {
            if( response.status == 401 ) {
                if( !$window.sessionStorage.token ) {
                    if( authData.token ) {
                        $window.sessionStorage.token = authData.token;
                        $window.sessionStorage.email = authData.email;
                    } else {
                        $window.location.href = appConfig.server + '/admin/login';
                    }
                } else {
                    Dialog
                    .showAlert( false, 'Session Expired', 'You need to relogin to authenticate your session.', 'Session Expired', 'Login', false )
                    .then( function() {
                        $window.location.href = appConfig.server + '/admin/login';
                    } );
                }
                return false;
            } else {
                return true;
            }
        }
    }
    
    function LinksService( $http, $window, appConfig, AuthenticationService ) {

    	function apiUrl( path ) {
    		return appConfig.server + '/api' + path;
    	}

    	this.isValid = function( link ) {
    		return ( link.link_generated != '' ) && 
                ( link.link_real != '' ) && 
                ( link.link_safe != '' );
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
            } )
            .catch( function( response ) {
                AuthenticationService.checkAuth( response );
            } );
        }

        this.getPage = function( page, limit, sort, keyword, callback ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            var apiPath = '/links/page';
            var data = {
                page: page,
                pagesize: limit
            };
            if(sort) {
                data.sort = sort;
            }
            if(keyword) {
                data.keyword = keyword;
            }
            $http
            .post( apiUrl( apiPath ), data )
            .then( function( response ) {
                callback( response.data );
            } )
            .catch( function( response ) {
                AuthenticationService.checkAuth( response );
            } );
        }

        this.newOrUpdate = function( link, success, error ) {
        	if( !this.isValid( link ) ) {
        		if( typeof error != 'undefined' ) {
	        		error();
	        	}
        		return;
        	}
            if( link.link_generated.substr( 0, 1 ) != '/' ) {
                link.link_generated = '/' + link.link_generated;
            }
            $http.defaults.headers.common.token = $window.sessionStorage.token;
        	$http
            .post( apiUrl( '/links' ), link )
            .success( function( response ) {
                if( AuthenticationService.checkAuth( response ) ) {
                    if( typeof success != 'undefined' ) {
                        success(response);
                    }
                }
            } )
            .error( function( response ) {
                if( typeof error != 'undefined' ) {
                    error(response);
                }
            } );
        }

        this.toggleEnableStatus = function( id, success, error ) {
            if( !id ) {
                if( typeof error != 'undefined' ) {
                    error();
                }
                return;
            }
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            $http
            .post( 
                apiUrl( '/links/toggle' ),
                { _id: id }
            )
            .success( function( response ) {
                if( AuthenticationService.checkAuth( response ) ) {
                    if( typeof success != 'undefined' ) {
                        success( response );
                    }
                }
            } )
            .error( function( response ) {
                if( typeof error != 'undefined' ) {
                    error();
                }
            } );
        }

        this.delete = function( id, success, error ) {
        	if( !id ) {
        		if( typeof error != 'undefined' ) {
	        		error();
	        	}
        		return;
        	}
            $http.defaults.headers.common.token = $window.sessionStorage.token;
        	$http
            .post( 
        		apiUrl( '/links/delete' ),
        		{ _id: id }
        	)
            .success( function( response ) {
                if( AuthenticationService.checkAuth( response ) ) {
                    if( typeof success != 'undefined' ) {
                        success();
                    }
                }
            } )
            .error( function( response ) {
                if( typeof error != 'undefined' ) {
                    error();
                }
            } );
        }

    }

    function TrafficsService( $http, $window, appConfig, AuthenticationService ) {

    	function apiUrl( path ) {
    		return appConfig.server + '/api' + path;
    	}

    	this.getPage = function( page, limit, sort, callback ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            var apiPath = '/traffics/page/';
            apiPath += page + '/' + limit;
            if( sort) {
                apiPath += '/' + sort;
            }
    		$http
    		.get( apiUrl( apiPath ) )
    		.then( function( response ) {
                callback( response.data );
            } )
            .catch( function( response ) {
                AuthenticationService.checkAuth( response );
            } );
    	}

        this.exportCSV = function( from, to ) {
            $window.location.href = apiUrl( '/traffics/export/' + from + '/' + to );
        }
    }

    function IPBlacklistService( $http, $window, appConfig, AuthenticationService ) {

        function apiUrl( path ) {
            return appConfig.server + '/api' + path;
        }

        this.isValid = function( ip ) {
            return ( ip.ip != '' ) && ( ip.description != '' );
        }

        this.getPage = function( page, limit, callback ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            $http
            .get( apiUrl( '/ipblacklist/page/' + page + '/' + limit ) )
            .then( function( response ) {
                callback( response.data );
            } )
            .catch( function( response ) {
                AuthenticationService.checkAuth( response );
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
            } )
            .catch( function( response ) {
                AuthenticationService.checkAuth( response );
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
            $http
            .post( apiUrl( '/ipblacklist' ), ip )
            .success( function( response ) {
                if( AuthenticationService.checkAuth( response ) ) {
                    if( typeof success != 'undefined' ) {
                        success();
                    }
                }
            } )
            .error( function( response ) {
                if( typeof error != 'undefined' ) {
                    error();
                }
            } );
        }

        this.delete = function( id, success, error ) {
            if( !id ) {
                if( typeof error != 'undefined' ) {
                    error();
                }
                return;
            }
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            $http.post( 
                apiUrl( '/ipblacklist/delete' ),
                { _id: id }
            )
            .success( function( response ) {
                if( AuthenticationService.checkAuth( response ) ) {
                    if( typeof success != 'undefined' ) {
                        success();
                    }
                }
            } )
            .error( function( response ) {
                if( typeof error != 'undefined' ) {
                    error();
                }
            } );
        }

        this.exportCSV = function() {
            $window.location.href = apiUrl( '/ipblacklist/export' );
        }
    }

    function DialogService( $mdDialog ) {

        this.showAlert = function( ev, title, content, ariaLabel, ok, modal ) {
            if( typeof modal === 'undefined' ) modal = true;
            if(!ariaLabel) {
                ariaLabel = title;
            }
            return $mdDialog.show(
                $mdDialog.alert()
                    .parent( angular.element(document.querySelector('#popupContainer')) )
                    .clickOutsideToClose( modal )
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