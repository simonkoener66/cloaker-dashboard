(function () {
    'use strict';

    angular.module('app')
    .service( 'Dialog', [ '$mdDialog', DialogService ] )
    .service( 'AuthenticationService', [ '$http', '$window', 'appConfig', 'Dialog', AuthenticationService ] )
    .service( 'Users', [ '$http', '$window', 'appConfig', 'AuthenticationService', UsersService ] )
    .service( 'Links', [ '$http', '$window', 'appConfig', 'AuthenticationService', LinksService ] )
    .service( 'Traffics', [ '$http', '$window', 'appConfig', 'AuthenticationService', TrafficsService ] )
    .service( 'IPBlacklist', [ '$http', '$window', 'appConfig', 'AuthenticationService', IPBlacklistService ] )
    .service( 'Networks', [ '$http', '$window', 'appConfig', 'AuthenticationService', NetworksService ] )
    .service( 'GeoBlacklist', [ '$http', '$window', 'appConfig', 'AuthenticationService', GeolocationBlacklistService ] )

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

    function UsersService( $http, $window, appConfig, AuthenticationService ) {

        function apiUrl( path ) {
            return appConfig.server + '/api' + path;
        }

        this.isValid = function( user ) {
            return ( user.email != '' ) && 
                ( user.owner != '' ) && 
                ( user.role != '' );
        }

        this.get = function( success, error ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            $http
            .get( apiUrl( '/users' ) )
            .then( function( response ) {
                if( typeof success != 'undefined' ) {
                    success( response.data );
                }
            } )
            .catch( function( response ) {
                if( typeof error != 'undefined' ) {
                    error( response );
                }
            } );
        }

        this.getPage = function( page, limit, sort, callback ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            var apiPath = '/users/page';
            var query = '?';
            query += 'page=' + page;
            query += '&pagesize=' + limit;
            if(sort) {
                query += '&sort=' + sort;
            }
            $http
            .get( apiUrl( apiPath ) + query )
            .then( function( response ) {
                callback( response.data );
            } )
            .catch( function( response ) {
                AuthenticationService.checkAuth( response );
            } );
        }

        this.newOrUpdate = function( user, success, error ) {
          if( !this.isValid( user ) ) {
            if( typeof error != 'undefined' ) {
              error();
            }
            return;
          }
          $http.defaults.headers.common.token = $window.sessionStorage.token;
          $http
            .post( apiUrl( '/users' ), user )
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
            apiUrl( '/users/delete' ),
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

        this.getPage = function( page, limit, sort, keyword, ownerFilter, callback ) {
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
            if(ownerFilter) {
                data.ownerFilter = ownerFilter;
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

    	this.getPage = function( page, limit, sort, ownerFilter, callback ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            var apiPath = '/traffics/page/';
            apiPath += page + '/' + limit;
            if( sort ) {
                apiPath += '/' + sort;
            }
            if( ownerFilter ) {
                apiPath += ('?ownerFilter=' + ownerFilter.replace( ' ', '+' ) );
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

        this.getPage = function( page, limit, sort, keyword, callback ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
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
            .post( apiUrl( '/ipblacklist/page' ), data )
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

        this.newOrUpdate = function( ip, success, error ) {
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

    function GeolocationBlacklistService( $http, $window, appConfig, AuthenticationService ) {

        function apiUrl( path ) {
            return appConfig.server + '/api' + path;
        }

        this.isValid = function( geo ) {
            return ( geo.country != '' );
        }

        this.getPage = function( page, limit, sort, keyword, callback ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
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
            .post( apiUrl( '/geoblacklist/page' ), data )
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
            .get( apiUrl( '/geoblacklist/' + id ) )
            .then( function( response ) {
                callback( response.data );
            } )
            .catch( function( response ) {
                AuthenticationService.checkAuth( response );
            } );
        }

        this.newOrUpdate = function( geolocation, success, error ) {
            if( !this.isValid( geolocation ) ) {
                if( typeof error != 'undefined' ) {
                    error();
                }
                return;
            }
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            $http
            .post( apiUrl( '/geoblacklist' ), geolocation )
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

        this.delete = function( id, success, error ) {
            if( !id ) {
                if( typeof error != 'undefined' ) {
                    error();
                }
                return;
            }
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            $http.post( 
                apiUrl( '/geoblacklist/delete' ),
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
            $window.location.href = apiUrl( '/geoblacklist/export' );
        }
    }

    function NetworksService( $http, $window, appConfig, AuthenticationService ) {

        function apiUrl( path ) {
            return appConfig.server + '/api' + path;
        }

        this.isValid = function( network ) {
            return network.network != '';
        }

        this.get = function( id, callback ) {
            if( !id ) {
                callback( { id: false } );
            }
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            $http
            .get( apiUrl( '/networks/' + id ) )
            .then( function( response ) {
                callback( response.data );
            } )
            .catch( function( response ) {
                AuthenticationService.checkAuth( response );
            } );
        }

        this.getPage = function( page, limit, sort, callback ) {
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            var apiPath = '/networks/page';
            var data = {
                page: page,
                pagesize: limit
            };
            if(sort) {
                data.sort = sort;
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

        this.newOrUpdate = function( network, success, error ) {
            if( !this.isValid( network ) ) {
                if( typeof error != 'undefined' ) {
                  error();
                }
                return;
            }
            $http.defaults.headers.common.token = $window.sessionStorage.token;
            $http
            .post( apiUrl( '/networks' ), network )
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
            apiUrl( '/networks/delete' ),
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