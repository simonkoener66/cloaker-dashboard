(function () {
    'use strict';

    angular.module('app')
    .service( 'Links', [ '$http', 'appConfig', LinksService] )
    .service( 'Traffics', [ '$http', 'appConfig', TrafficsService] );
    
    function LinksService( $http, appConfig ) {

    	function apiUrl( path ) {
    		return appConfig.dbserver + path;
    	}

    	this.isValid = function( link ) {
    		return ( link.link_generated != '' ) && ( link.link_real != '' ) && ( link.link_safe != '' );
    	}

        this.all = function( callback ) {
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
        	var request = $http.post( apiUrl( '/links/update' ), link );
        	if( typeof success != 'undefined' ) {
        		request = request.success( success );
        	}
        	if( typeof error != 'undefined' ) {
        		request = request.error( error );
        	}
        }

    }

    function TrafficsService( $http, appConfig ) {

    	function apiUrl( path ) {
    		return appConfig.dbserver + path;
    	}

    	this.getPage = function( page, limit, callback ) {
    		$http
    		.get( apiUrl( '/traffics/' + page + '/' + limit ) )
    		.then( function( response ) {
    			callback( response.data );
    		} );
    	}
    }

})(); 