var geoip = require('geoip-lite');
var mongoose = require('mongoose');
var q = require('q');

var Link = mongoose.model( 'Link' );
var Traffic = mongoose.model( 'Traffic' );
var Blacklist = mongoose.model( 'BlacklistedIP' );
var Whitelist = mongoose.model( 'WhitelistedIP' );
var GeoBlacklist = mongoose.model( 'GeoBlacklist' );

var urlFilterController = function( router ) {

	var links = [];

	function getCountry( countryCode, start_index, end_index ) {
        if( typeof start_index === 'undefined' ) {
            start_index = 0;
        }
        if( typeof end_index === 'undefined' ) {
            end_index = countriesSortedByCode.length - 1;
        }
        if( start_index > end_index ) {
          return false;
        } else if( start_index == end_index ) {
            if( countriesSortedByCode[start_index].code == countryCode ) {
                return countriesSortedByCode[start_index];
            } else {
                return false;
            }
        } else {
            var mid_index = parseInt( ( start_index + end_index ) / 2 );
            var mid_code = countriesSortedByCode[mid_index].code;
            if( mid_code == countryCode ) {
                return countriesSortedByCode[mid_index];
            } else if( countryCode < mid_code ) {
                return getCountry( countryCode, start_index, mid_index - 1 );
            } else {
                return getCountry( countryCode, mid_index + 1, end_index );
            }
        }
    }

	this.processUrl = function( req, res, next ) {
		var path = req.originalUrl;
        var queryPos = path.indexOf('?');
        if (queryPos >= 0) {
            path = path.substr(0, queryPos);
        }

        function esc_url( url ) {
            var schema = '';
            var schpos = url.indexOf( '://' );
            if( schpos >= 0 ) {
                schema = url.substr( 0, schpos );
                url = url.substr( schpos + 3 );
                if( !schema ) {
                    schema = 'http';
                }
            } else {
                schema = 'http';
            }
            return schema + '://' + url;
        }

		function processTraffic( ip, use_real_link, link, geolocation, blacklisted, autoblacklisting ) {
            // Disable real link if status is overrided
            if( !link.status ) {
                use_real_link = false;
            }
            var link_generated_path = link.link_generated;
            if( link.utm ) {
                link_generated_path += ("?utm=" + link.utm);
            }
            // Traffic record
			var new_traffic = {
				ip: ip,
				link_generated: link_generated_path,
				used_real: use_real_link,
				link_real: link.link_real,
				link_safe: link.link_safe,
				geolocation: geolocation,
				access_time: new Date(),
                blacklisted: false,
                bl_network: '',
                bl_location: '',
                owner: link.owner
			}
            if(blacklisted) {
                new_traffic.blacklisted = true;
                new_traffic.bl_network = blacklisted.network;
                new_traffic.bl_location = blacklisted.location;
            }
            Traffic.create( new_traffic, function( err, traffic ){
				if( err ) {
					console.log( err );
				}
			} );
            // Link hits
            link.total_hits++;
            if( use_real_link ) {
                link.real_hits++;
            }
            // Link auto blacklisted ips
            if(autoblacklisting) {
                // Update link IP blacklist
                link.ip_auto_blacklisted.push( ip );
            }
            // Update link
            Link.findByIdAndUpdate( link._id, link, function( err, doc ) {
                if( err ) console.log( err );
            } );
            var url = '';
            if( use_real_link ) {
                url = link.link_real;
            } else {
                url = link.link_safe;
            }
            // Url redirect
            res.redirect( esc_url( url ) );
		}

        var condition = {
            link_generated: path,
            utm: ""
        }
        if (req.query.utm) {
            condition.utm = req.query.utm;
        }

		Link.findOne( condition, function( err, link ) {
			if( err ) {
				res.json( { message: 'Error occurred.' } );
			}
			if( link ) {
				var use_real_link = false;
				var ip = req.headers['x-forwarded-for'] ||
					req.connection.remoteAddress ||
					req.socket.remoteAddress ||
					req.connection.socket.remoteAddress;

                // Check if IP is v4 in v6 form
                if( ip.indexOf( '::ffff:' ) >= 0 ) {
                    ip = ip.substr( 7 );
                }

                // Get geolocation
				var geo = geoip.lookup( ip );
				var geolocation = '(Unavailable)';
                var country;
                if( geo ) {
                    country = getCountry( geo.country );
                }
                if( geo && country ) {
                    geolocation = '';
                    if( geo.city ) {
                        geolocation += geo.city + ', ';
                    }
                    if( geo.region ) {
                        var region_num = parseInt( geo.region );
                        if( region_num < country.regions.length ) {
                            geolocation += country.regions[region_num].longname + ', ';
                        }
                    }
                    geolocation += country.longname;
                }

                // Check if link still has IP count to auto blacklist left
                link.ip_count_to_auto_blacklist = link.ip_count_to_auto_blacklist ? link.ip_count_to_auto_blacklist : 0;
                link.ip_auto_blacklisted = link.ip_auto_blacklisted ? link.ip_auto_blacklisted : [];
                if( link.ip_count_to_auto_blacklist > 0 && link.ip_auto_blacklisted.length < link.ip_count_to_auto_blacklist ) {
                    // Add IP to auto blacklisted IP list of the link and IP blacklist if not already in
                    var newIp = true;
                    link.ip_auto_blacklisted.every( function( auto_bl_ip ) {
                        if( ip == auto_bl_ip ) {
                            newIp = false;
                            return false;
                        }
                        return true;
                    } );
                    if( newIp ) {
                        // Update global IP blacklist
                        var link_url = link.link_generated;
                        if( link.utm ) {
                            link_url += "?utm=" + link.utm;
                        }
                        var newBlacklistIP = {
                            ip: ip,
                            description: 'Auto blacklisted from link: ' + link_url,
                            network: '',
                            location: ''
                        };
                        Blacklist.create( newBlacklistIP, function( err, doc ) {} );
                    }
                    processTraffic( ip, false, link, geolocation, false, newIp );
                    return;
                }

                /*
                 * Filtering: IP whitelist -> link geolocation criteria -> IP blacklist -> geolocation blacklist
                 */
                // IP Whitelist check first
                Whitelist.find( { ip: ip }, function( err, ipRecord_white ) {
                    if( !err && ipRecord_white.length > 0 && ipRecord_white[0].ip ) {
                        use_real_link = true;
                        processTraffic( ip, use_real_link, link, geolocation, false );
                    } else {
        				// Geolocation filter
                        if(!link.criteria || link.criteria.length == 0) {
                            use_real_link = true;
                        } else {
            				if( geo && country ) {
                                geo.city = geo.city.toLowerCase();
                                geo.region = geo.region.toLowerCase();
                                geo.country = geo.country.toLowerCase();
            					link.criteria.every( function( criterion ) {
            						if( ( criterion.city && criterion.city.toLowerCase() != geo.city )
            							|| ( criterion.region && criterion.region.toLowerCase() != geo.region )
            							|| ( criterion.country && criterion.country.toLowerCase() != geo.country ) ) {
            							return true;
            						}
            						use_real_link = true;
                                    return false;
            					} );
                                link.criteria_disallow.every( function( criterion ) {
                                    if( ( !criterion.city || criterion.city.toLowerCase() == geo.city )
                                        && ( !criterion.region || criterion.region.toLowerCase() == geo.region )
                                        && ( criterion.country && criterion.country.toLowerCase() == geo.country ) ) {
                                        use_real_link = false;
                                        return false;
                                    }
                                    return true;
                                } );
            				}
                        }

        				// Blacklisted IP filter
        				if( use_real_link && link.use_ip_blacklist ) {
        					Blacklist.find( { ip: ip }, function( err, ipRecord ) {
        						if( err ) {
        							console.log( err );
        							res.json( { message: 'Error occurred.' } );
        						}
        						if( ipRecord.length > 0 && ipRecord[0].ip ) {
        							use_real_link = false;
                                    processTraffic( ip, use_real_link, link, geolocation, ipRecord[0] );
        						} else {
                                    // Geolocation blacklist filter
                                    if( geo ) {
                                        geo.country = geo.country.toUpperCase();
                                        geo.region = geo.region.toUpperCase();
                                        var orCondition = [
                                            { country: geo.country, region: '', city: '' }
                                        ];
                                        if( geo.region ) {
                                            orCondition.push( { country: geo.country, region: geo.region, city: '' } );
                                        }
                                        if( geo.city ) {
                                            orCondition.push( { country: geo.country, region: geo.region, city: geo.city } );
                                        }
                                        var condition = {
                                            $or: orCondition
                                        };
                                        GeoBlacklist.find( condition, function(err, geoRecord) {
                                            if( err ) {
                                                console.log( err );
                                                res.json( { message: 'Error occurred.' } );
                                            }
                                            if( geoRecord.length > 0 ) {
                                                use_real_link = false;
                                            } else {
                                                use_real_link = true;
                                            }
                                            processTraffic( ip, use_real_link, link, geolocation );
                                        } );
                                    } else {
                                        processTraffic( ip, false, link, geolocation );
                                    }
                                }
        					} );
        				} else {
        					processTraffic( ip, use_real_link, link, geolocation );
        				}
                    }
                });
			} else {
				res.json( { message: 'Link not found.' } );
			}
		} );
	};

	function refreshLinks() {
		Link.find( function( err, _links ) {
			if( err ) {
				console.log( err );
			}
			links = _links;
		} );
	}

	function _init() {
		refreshLinks();
		setTimeout( refreshLinks, 20000 );
	}

	_init();

}

module.exports = new urlFilterController();

var countriesSortedByCode = [
    {
        code: "AD",
        longname: "Andorra",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Canillo" },
            { code: "03", longname: "Encamp" },
            { code: "04", longname: "La Massana" },
            { code: "05", longname: "Ordino" },
            { code: "06", longname: "Sant Julia de Loria" },
            { code: "07", longname: "Andorra la Vella" },
            { code: "08", longname: "Escaldes-Engordany" }
        ]
    },
    {
        code: "AE",
        longname: "United Arab Emirates",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Abū Z̧aby" },
            { code: "02", longname: "ʻAjman" },
            { code: "03", longname: "Dubayy" },
            { code: "04", longname: "Al Fujayrah" },
            { code: "05", longname: "Raʼs al Khaymah" },
            { code: "06", longname: "Ash Shāriqah" },
            { code: "07", longname: "Umm al Qaywayn" }
        ]
    },
    {
        code: "AF",
        longname: "Afghanistan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Badakhshan" },
            { code: "02", longname: "Badghis" },
            { code: "03", longname: "Baghlan" },
            { code: "05", longname: "Bamian" },
            { code: "06", longname: "Farah" },
            { code: "07", longname: "Faryab" },
            { code: "08", longname: "Ghazni" },
            { code: "09", longname: "Ghor" },
            { code: "10", longname: "Helmand" },
            { code: "11", longname: "Herat" },
            { code: "13", longname: "Kabol" },
            { code: "14", longname: "Kapisa" },
            { code: "17", longname: "Logar" },
            { code: "18", longname: "Nangarhar" },
            { code: "19", longname: "Chakhansur" },
            { code: "23", longname: "Kandahar" },
            { code: "24", longname: "Kunduz" },
            { code: "26", longname: "Takhar" },
            { code: "27", longname: "Warkak" },
            { code: "28", longname: "Zabul" },
            { code: "29", longname: "Paktika" },
            { code: "30", longname: "Balkh" },
            { code: "31", longname: "Jowzjan" },
            { code: "32", longname: "Samangan" },
            { code: "33", longname: "Sar-e Pol" },
            { code: "34", longname: "Konar" },
            { code: "35", longname: "Laghmān" },
            { code: "36", longname: "Paktīā" },
            { code: "37", longname: "Khowst" },
            { code: "38", longname: "Nūrestān" },
            { code: "39", longname: "Uruzgan" },
            { code: "40", longname: "Parwan" },
            { code: "41", longname: "Dāykondī" },
            { code: "42", longname: "Panjshīr" }
        ]
    },
    {
        code: "AG",
        longname: "Antigua And Barbuda",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Barbuda" },
            { code: "03", longname: "Saint George" },
            { code: "04", longname: "Saint John" },
            { code: "05", longname: "Saint Mary" },
            { code: "06", longname: "Saint Paul" },
            { code: "07", longname: "Saint Peter" },
            { code: "08", longname: "Saint Philip" },
            { code: "09", longname: "Redonda" }
        ]
    },
    {
        code: "AI",
        longname: "Anguilla",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "AL",
        longname: "Albania",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "40", longname: "Berat" },
            { code: "41", longname: "Dibër" },
            { code: "42", longname: "Durrës" },
            { code: "43", longname: "Elbasan" },
            { code: "44", longname: "Fier" },
            { code: "45", longname: "Gjirokastër" },
            { code: "46", longname: "Korçë" },
            { code: "47", longname: "Kukës" },
            { code: "48", longname: "Lezhë" },
            { code: "49", longname: "Shkodër" },
            { code: "50", longname: "Tiranë" },
            { code: "51", longname: "Vlorë" }
        ]
    },
    {
        code: "AM",
        longname: "Armenia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Aragatsotn" },
            { code: "02", longname: "Ararat" },
            { code: "03", longname: "Armavir" },
            { code: "04", longname: "Geghark'unik'" },
            { code: "05", longname: "Kotayk'" },
            { code: "06", longname: "Lorri" },
            { code: "07", longname: "Shirak" },
            { code: "08", longname: "Syunik'" },
            { code: "09", longname: "Tavush" },
            { code: "10", longname: "Vayots' Dzor" },
            { code: "11", longname: "Yerevan" }
        ]
    },
    {
        code: "AO",
        longname: "Angola",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Benguela" },
            { code: "02", longname: "Bie" },
            { code: "03", longname: "Cabinda" },
            { code: "04", longname: "Cuando Cubango" },
            { code: "05", longname: "Cuanza Norte" },
            { code: "06", longname: "Cuanza Sul" },
            { code: "07", longname: "Cunene" },
            { code: "08", longname: "Huambo" },
            { code: "09", longname: "Huila" },
            { code: "12", longname: "Malanje" },
            { code: "13", longname: "Namibe" },
            { code: "14", longname: "Moxico" },
            { code: "15", longname: "Uige" },
            { code: "16", longname: "Zaire" },
            { code: "17", longname: "Lunda Norte" },
            { code: "18", longname: "Lunda Sul" },
            { code: "19", longname: "Bengo" },
            { code: "20", longname: "Luanda" }
        ]
    },
    {
        code: "AQ",
        longname: "Antarctica",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "AR",
        longname: "Argentina",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Buenos Aires" },
            { code: "02", longname: "Catamarca" },
            { code: "03", longname: "Chaco" },
            { code: "04", longname: "Chubut" },
            { code: "05", longname: "Cordoba" },
            { code: "06", longname: "Corrientes" },
            { code: "07", longname: "Distrito Federal" },
            { code: "08", longname: "Entre Rios" },
            { code: "09", longname: "Formosa" },
            { code: "10", longname: "Jujuy" },
            { code: "11", longname: "La Pampa" },
            { code: "12", longname: "La Rioja" },
            { code: "13", longname: "Mendoza" },
            { code: "14", longname: "Misiones" },
            { code: "15", longname: "Neuquen" },
            { code: "16", longname: "Rio Negro" },
            { code: "17", longname: "Salta" },
            { code: "18", longname: "San Juan" },
            { code: "19", longname: "San Luis" },
            { code: "20", longname: "Santa Cruz" },
            { code: "21", longname: "Santa Fe" },
            { code: "22", longname: "Santiago del Estero" },
            { code: "23", longname: "Tierra del Fuego, Antártida e Islas del Atlántico Sur" },
            { code: "24", longname: "Tucuman" }
        ]
    },
    {
        code: "AS",
        longname: "American Samoa",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "AT",
        longname: "Austria",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Burgenland" },
            { code: "02", longname: "Karnten" },
            { code: "03", longname: "Niederosterreich" },
            { code: "04", longname: "Oberosterreich" },
            { code: "05", longname: "Salzburg" },
            { code: "06", longname: "Steiermark" },
            { code: "07", longname: "Tirol" },
            { code: "08", longname: "Vorarlberg" },
            { code: "09", longname: "Wien" }
        ]
    },
    {
        code: "AU",
        longname: "Australia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Australian Capital Territory" },
            { code: "02", longname: "New South Wales" },
            { code: "03", longname: "Northern Territory" },
            { code: "04", longname: "Queensland" },
            { code: "05", longname: "South Australia" },
            { code: "06", longname: "Tasmania" },
            { code: "07", longname: "Victoria" },
            { code: "08", longname: "Western Australia" }
        ]
    },
    {
        code: "AW",
        longname: "Aruba",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "AZ",
        longname: "Azerbaijan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Abşeron" },
            { code: "02", longname: "Ağcabədi" },
            { code: "03", longname: "Ağdam" },
            { code: "04", longname: "Ağdaş" },
            { code: "05", longname: "Ağstafa" },
            { code: "06", longname: "Ağsu" },
            { code: "07", longname: "Əli Bayramlı" },
            { code: "08", longname: "Astara" },
            { code: "09", longname: "Bakı" },
            { code: "10", longname: "Balakən" },
            { code: "11", longname: "Bərdə" },
            { code: "12", longname: "Beyləqan" },
            { code: "13", longname: "Biləsuvar" },
            { code: "14", longname: "Cəbrayıl" },
            { code: "15", longname: "Cəlilabad" },
            { code: "16", longname: "Daşkəsən" },
            { code: "17", longname: "Dəvəçi" },
            { code: "18", longname: "Füzuli" },
            { code: "19", longname: "Gədəbəy" },
            { code: "20", longname: "Gəncə" },
            { code: "21", longname: "Goranboy" },
            { code: "22", longname: "Göyçay" },
            { code: "23", longname: "Hacıqabul" },
            { code: "24", longname: "İmişli" },
            { code: "25", longname: "İsmayıllı" },
            { code: "26", longname: "Kəlbəcər" },
            { code: "27", longname: "Kürdəmir" },
            { code: "28", longname: "Laçın" },
            { code: "29", longname: "Lənkəran" },
            { code: "30", longname: "Lənkəran" },
            { code: "31", longname: "Lerik" },
            { code: "32", longname: "Masallı" },
            { code: "33", longname: "Mingəcevir" },
            { code: "34", longname: "Naftalan" },
            { code: "35", longname: "Naxçıvan" },
            { code: "36", longname: "Neftçala" },
            { code: "37", longname: "Oğuz" },
            { code: "38", longname: "Qəbələ" },
            { code: "39", longname: "Qax" },
            { code: "40", longname: "Qazax" },
            { code: "41", longname: "Qobustan" },
            { code: "42", longname: "Quba" },
            { code: "43", longname: "Qubadlı" },
            { code: "44", longname: "Qusar" },
            { code: "45", longname: "Saatlı" },
            { code: "46", longname: "Sabirabad" },
            { code: "47", longname: "Şəki" },
            { code: "48", longname: "Şəki" },
            { code: "49", longname: "Salyan" },
            { code: "50", longname: "Şamaxı" },
            { code: "51", longname: "Şəmkir" },
            { code: "52", longname: "Samux" },
            { code: "53", longname: "Siyəzən" },
            { code: "54", longname: "Sumqayıt" },
            { code: "55", longname: "Şuşa" },
            { code: "56", longname: "Şuşa" },
            { code: "57", longname: "Tərtər" },
            { code: "58", longname: "Tovuz" },
            { code: "59", longname: "Ucar" },
            { code: "60", longname: "Xaçmaz" },
            { code: "61", longname: "Xankəndi" },
            { code: "62", longname: "Xanlar" },
            { code: "63", longname: "Xızı" },
            { code: "64", longname: "Xocalı" },
            { code: "65", longname: "Xocavənd" },
            { code: "66", longname: "Yardımlı" },
            { code: "67", longname: "Yevlax" },
            { code: "68", longname: "Yevlax" },
            { code: "69", longname: "Zəngilan" },
            { code: "70", longname: "Zaqatala" },
            { code: "71", longname: "Zərdab" }
        ]
    },
    {
        code: "BA",
        longname: "Bosnia And Herzegovina",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Federation of Bosnia and Herzegovina [conventional]; Federacija Bosne i Hercegovine [Serbocroatian]" },
            { code: "02", longname: "Republica Srpska" }
        ]
    },
    {
        code: "BB",
        longname: "Barbados",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Christ Church" },
            { code: "02", longname: "Saint Andrew" },
            { code: "03", longname: "Saint George" },
            { code: "04", longname: "Saint James" },
            { code: "05", longname: "Saint John" },
            { code: "06", longname: "Saint Joseph" },
            { code: "07", longname: "Saint Lucy" },
            { code: "08", longname: "Saint Michael" },
            { code: "09", longname: "Saint Peter" },
            { code: "10", longname: "Saint Philip" },
            { code: "11", longname: "Saint Thomas" }
        ]
    },
    {
        code: "BD",
        longname: "Bangladesh",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "81", longname: "Dhaka" },
            { code: "82", longname: "Khulna" },
            { code: "83", longname: "Rājshāhi" },
            { code: "84", longname: "Chittagong" },
            { code: "85", longname: "Barisāl" },
            { code: "86", longname: "Sylhet" }
        ]
    },
    {
        code: "BE",
        longname: "Belgium",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Antwerpen" },
            { code: "03", longname: "Hainaut" },
            { code: "04", longname: "Liege" },
            { code: "05", longname: "Limburg" },
            { code: "06", longname: "Luxembourg" },
            { code: "07", longname: "Namur" },
            { code: "08", longname: "Oost-Vlaanderen" },
            { code: "09", longname: "West-Vlaanderen" },
            { code: "10", longname: "Brabant Wallon" },
            { code: "11", longname: "Brussels Hoofdstedelijk Gewest/Région de Bruxelles-Capitale" },
            { code: "12", longname: "Vlamms-Brabant" }
        ]
    },
    {
        code: "BF",
        longname: "Burkina Faso",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "15", longname: "Bam" },
            { code: "19", longname: "Boulkiemde" },
            { code: "20", longname: "Ganzourgou" },
            { code: "21", longname: "Gnagna" },
            { code: "28", longname: "Kouritenga" },
            { code: "33", longname: "Oudalan" },
            { code: "34", longname: "Passore" },
            { code: "36", longname: "Sanguie" },
            { code: "40", longname: "Soum" },
            { code: "42", longname: "Tapoa" },
            { code: "44", longname: "Zoundweogo" },
            { code: "45", longname: "Balé" },
            { code: "46", longname: "Banwa" },
            { code: "47", longname: "Bazèga" },
            { code: "48", longname: "Bougouriba" },
            { code: "49", longname: "Boulgou" },
            { code: "50", longname: "Gourma" },
            { code: "51", longname: "Houet" },
            { code: "52", longname: "Ioba" },
            { code: "53", longname: "Kadiogo" },
            { code: "54", longname: "Kénédougou" },
            { code: "55", longname: "Comoé" },
            { code: "56", longname: "Komondjari" },
            { code: "57", longname: "Kompienga" },
            { code: "58", longname: "Kossi" },
            { code: "59", longname: "Koulpélogo" },
            { code: "60", longname: "Kourwéogo" },
            { code: "61", longname: "Léraba" },
            { code: "62", longname: "Loroum" },
            { code: "63", longname: "Mouhoun" },
            { code: "64", longname: "Namentenga" },
            { code: "65", longname: "Nahouri" },
            { code: "66", longname: "Nayala" },
            { code: "67", longname: "Noumbiel" },
            { code: "68", longname: "Oubritenga" },
            { code: "69", longname: "Poni" },
            { code: "70", longname: "Sanmatenga" },
            { code: "71", longname: "Séno" },
            { code: "72", longname: "Sissili" },
            { code: "73", longname: "Sourou" },
            { code: "74", longname: "Tuy" },
            { code: "75", longname: "Yagha" },
            { code: "76", longname: "Yatenga" },
            { code: "77", longname: "Ziro" },
            { code: "78", longname: "Zondoma" }
        ]
    },
    {
        code: "BG",
        longname: "Bulgaria",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "38", longname: "Blagoevgrad" },
            { code: "39", longname: "Burgas" },
            { code: "40", longname: "Dobrich" },
            { code: "41", longname: "Gabrovo" },
            { code: "42", longname: "Sofiya-Grad" },
            { code: "43", longname: "Khaskovo" },
            { code: "44", longname: "Kŭrdzhali" },
            { code: "45", longname: "Kyustendil" },
            { code: "46", longname: "Lovech" },
            { code: "47", longname: "Montana" },
            { code: "48", longname: "Pazardzhik" },
            { code: "49", longname: "Pernik" },
            { code: "50", longname: "Pleven" },
            { code: "51", longname: "Plovdiv" },
            { code: "52", longname: "Ruse" },
            { code: "53", longname: "Ruse" },
            { code: "54", longname: "Shumen" },
            { code: "55", longname: "Silistra" },
            { code: "56", longname: "Sliven" },
            { code: "57", longname: "Smolyan" },
            { code: "58", longname: "Sofiya" },
            { code: "59", longname: "Stara Zagora" },
            { code: "60", longname: "Tŭrgovishte" },
            { code: "61", longname: "Varna" },
            { code: "62", longname: "Veliko Tŭrnovo" },
            { code: "63", longname: "Vidin" },
            { code: "64", longname: "Vratsa" },
            { code: "65", longname: "Yambol" }
        ]
    },
    {
        code: "BH",
        longname: "Bahrain",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Al Hadd" },
            { code: "02", longname: "Al Manamah" },
            { code: "05", longname: "Jidd Hafs" },
            { code: "06", longname: "Sitrah" },
            { code: "08", longname: "Al Mintaqah al Gharbiyah" },
            { code: "09", longname: "Mintaqat Juzur Hawar" },
            { code: "10", longname: "Al Mintaqah ash Shamaliyah" },
            { code: "11", longname: "Al Mintaqah al Wusta" },
            { code: "12", longname: "Madinat `Isa" },
            { code: "13", longname: "Ar Rifa` wa al Mintaqah al Janubiyah" },
            { code: "14", longname: "Madinat Hamad" },
            { code: "15", longname: "Al Muḩarraq" },
            { code: "16", longname: "Al ‘Āşimah" },
            { code: "17", longname: "Al Janūbīyah" },
            { code: "18", longname: "Ash Shamālīyah" },
            { code: "19", longname: "Al Wusţá" }
        ]
    },
    {
        code: "BI",
        longname: "Burundi",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Bujumbura" },
            { code: "09", longname: "Bubanza" },
            { code: "10", longname: "Bururi" },
            { code: "11", longname: "Cankuzo" },
            { code: "12", longname: "Cibitoke" },
            { code: "13", longname: "Gitega" },
            { code: "14", longname: "Karuzi" },
            { code: "15", longname: "Kayanza" },
            { code: "16", longname: "Kirundo" },
            { code: "17", longname: "Makamba" },
            { code: "18", longname: "Muyinga" },
            { code: "19", longname: "Ngozi" },
            { code: "20", longname: "Rutana" },
            { code: "21", longname: "Ruyigi" },
            { code: "22", longname: "Muramvya" },
            { code: "23", longname: "Mwaro" }
        ]
    },
    {
        code: "BJ",
        longname: "Benin",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "07", longname: "Alibori" },
            { code: "08", longname: "Atakora" },
            { code: "09", longname: "Atlantique" },
            { code: "10", longname: "Borgou" },
            { code: "11", longname: "Collines" },
            { code: "12", longname: "Kouffo" },
            { code: "13", longname: "Donga" },
            { code: "14", longname: "Littoral" },
            { code: "15", longname: "Mono" },
            { code: "16", longname: "Ouémé" },
            { code: "17", longname: "Plateau" },
            { code: "18", longname: "Zou" }
        ]
    },
    {
        code: "BL",
        longname: "St. Barthélemy",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "BM",
        longname: "Bermuda",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Devonshire" },
            { code: "02", longname: "Hamilton" },
            { code: "03", longname: "Hamilton (Municipality)" },
            { code: "04", longname: "Paget" },
            { code: "05", longname: "Pembroke" },
            { code: "06", longname: "Saint George" },
            { code: "07", longname: "Saint George's" },
            { code: "08", longname: "Sandys" },
            { code: "09", longname: "Smiths" },
            { code: "10", longname: "Southampton" },
            { code: "11", longname: "Warwick" }
        ]
    },
    {
        code: "BN",
        longname: "Brunei",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Belait" },
            { code: "02", longname: "Brunei and Muara" },
            { code: "03", longname: "Temburong" },
            { code: "04", longname: "Tutong" }
        ]
    },
    {
        code: "BO",
        longname: "Bolivia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Chuquisaca" },
            { code: "02", longname: "Cochabamba" },
            { code: "03", longname: "El Beni" },
            { code: "04", longname: "La Paz" },
            { code: "05", longname: "Oruro" },
            { code: "06", longname: "Pando" },
            { code: "07", longname: "Potosi" },
            { code: "08", longname: "Santa Cruz" },
            { code: "09", longname: "Tarija" }
        ]
    },
    {
        code: "BR",
        longname: "Brazil",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Acre" },
            { code: "02", longname: "Alagoas" },
            { code: "03", longname: "Amapa" },
            { code: "04", longname: "Amazonas" },
            { code: "05", longname: "Bahia" },
            { code: "06", longname: "Ceara" },
            { code: "07", longname: "Distrito Federal" },
            { code: "08", longname: "Espirito Santo" },
            { code: "11", longname: "Mato Grosso do Sul" },
            { code: "13", longname: "Maranhao" },
            { code: "14", longname: "Mato Grosso" },
            { code: "15", longname: "Minas Gerais" },
            { code: "16", longname: "Para" },
            { code: "17", longname: "Paraiba" },
            { code: "18", longname: "Parana" },
            { code: "20", longname: "Piaui" },
            { code: "21", longname: "Rio de Janeiro" },
            { code: "22", longname: "Rio Grande do Norte" },
            { code: "23", longname: "Rio Grande do Sul" },
            { code: "24", longname: "Rondonia" },
            { code: "25", longname: "Roraima" },
            { code: "26", longname: "Santa Catarina" },
            { code: "27", longname: "Sao Paulo" },
            { code: "28", longname: "Sergipe" },
            { code: "29", longname: "Goias" },
            { code: "30", longname: "Pernambuco" },
            { code: "31", longname: "Tocantins" }
        ]
    },
    {
        code: "BS",
        longname: "Bahamas",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "05", longname: "Bimini" },
            { code: "06", longname: "Cat Island" },
            { code: "10", longname: "Exuma" },
            { code: "13", longname: "Inagua" },
            { code: "15", longname: "Long Island" },
            { code: "16", longname: "Mayaguana" },
            { code: "18", longname: "Ragged Island" },
            { code: "22", longname: "Harbour Island" },
            { code: "23", longname: "New Providence" },
            { code: "24", longname: "Acklins and Crooked Islands" },
            { code: "25", longname: "Freeport" },
            { code: "26", longname: "Fresh Creek" },
            { code: "27", longname: "Governor's Harbour" },
            { code: "28", longname: "Green Turtle Cay" },
            { code: "29", longname: "High Rock" },
            { code: "30", longname: "Kemps Bay" },
            { code: "31", longname: "Marsh Harbour" },
            { code: "32", longname: "Nichollstown and Berry Islands" },
            { code: "33", longname: "Rock Sound" },
            { code: "34", longname: "Sandy Point" },
            { code: "35", longname: "San Salvador and Rum Cay" }
        ]
    },
    {
        code: "BT",
        longname: "Bhutan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "05", longname: "Bumthang" },
            { code: "06", longname: "Chhukha" },
            { code: "07", longname: "Chirang" },
            { code: "08", longname: "Daga" },
            { code: "09", longname: "Geylegphug" },
            { code: "10", longname: "Ha" },
            { code: "11", longname: "Lhuntshi" },
            { code: "12", longname: "Mongar" },
            { code: "13", longname: "Paro" },
            { code: "14", longname: "Pemagatsel" },
            { code: "15", longname: "Punakha" },
            { code: "16", longname: "Samchi" },
            { code: "17", longname: "Samdrup" },
            { code: "18", longname: "Shemgang" },
            { code: "19", longname: "Tashigang" },
            { code: "20", longname: "Thimphu" },
            { code: "21", longname: "Tongsa" },
            { code: "22", longname: "Wangdi Phodrang" }
        ]
    },
    {
        code: "BV",
        longname: "Bouvet Island",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "BW",
        longname: "Botswana",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Central" },
            { code: "03", longname: "Ghanzi" },
            { code: "04", longname: "Kgalagadi" },
            { code: "05", longname: "Kgatleng" },
            { code: "06", longname: "Kweneng" },
            { code: "08", longname: "North-East" },
            { code: "09", longname: "South-East" },
            { code: "10", longname: "Southern" },
            { code: "11", longname: "North West" }
        ]
    },
    {
        code: "BY",
        longname: "Belarus",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Brestskaya Voblasts'" },
            { code: "02", longname: "Homyel'skaya Voblasts'" },
            { code: "03", longname: "Hrodzyenskaya Voblasts'" },
            { code: "04", longname: "Minsk" },
            { code: "05", longname: "Minskaya Voblasts'" },
            { code: "06", longname: "Mahilyowskaya Voblasts'" },
            { code: "07", longname: "Vitsyebskaya Voblasts'" }
        ]
    },
    {
        code: "BZ",
        longname: "Belize",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Belize" },
            { code: "02", longname: "Cayo" },
            { code: "03", longname: "Corozal" },
            { code: "04", longname: "Orange Walk" },
            { code: "05", longname: "Stann Creek" },
            { code: "06", longname: "Toledo" }
        ]
    },
    {
        code: "CA",
        longname: "Canada",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Alberta" },
            { code: "02", longname: "British Columbia" },
            { code: "03", longname: "Manitoba" },
            { code: "04", longname: "New Brunswick" },
            { code: "05", longname: "Newfoundland and Labrador [English]; Terre-Neuve-et-Labrador [French]" },
            { code: "07", longname: "Nova Scotia" },
            { code: "08", longname: "Ontario" },
            { code: "09", longname: "Prince Edward Island" },
            { code: "10", longname: "Quebec" },
            { code: "11", longname: "Saskatchewan" },
            { code: "12", longname: "Yukon Territory" },
            { code: "13", longname: "Northwest Territories" },
            { code: "14", longname: "Nunavut" }
        ]
    },
    {
        code: "CC",
        longname: "Cocos (keeling) Islands",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "CD",
        longname: "Congo, the Democratic Republic of the",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bandundu" },
            { code: "02", longname: "Équateur" },
            { code: "03", longname: "Kasaï-Occidental" },
            { code: "04", longname: "Kasaï-Oriental" },
            { code: "05", longname: "Katanga" },
            { code: "06", longname: "Kinshasa" },
            { code: "08", longname: "Bas-Congo" },
            { code: "09", longname: "Orientale" },
            { code: "10", longname: "Maniema" },
            { code: "11", longname: "Nord-Kivu" },
            { code: "12", longname: "Sud-Kivu" }
        ]
    },
    {
        code: "CF",
        longname: "Central African Republic",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bamingui-Bangoran" },
            { code: "02", longname: "Basse-Kotto" },
            { code: "03", longname: "Haute-Kotto" },
            { code: "04", longname: "Mambéré-Kadéï" },
            { code: "05", longname: "Haut-Mbomou" },
            { code: "06", longname: "Kémo" },
            { code: "07", longname: "Lobaye" },
            { code: "08", longname: "Mbomou" },
            { code: "09", longname: "Nana-Nambere" },
            { code: "11", longname: "Ouaka" },
            { code: "12", longname: "Ouham" },
            { code: "13", longname: "Ouham-Pende" },
            { code: "14", longname: "Vakaga" },
            { code: "15", longname: "Nana-Grébingui" },
            { code: "16", longname: "Sangha-Mbaéré" },
            { code: "17", longname: "Ombella-Mpoko" },
            { code: "18", longname: "Bangui" }
        ]
    },
    {
        code: "CG",
        longname: "Congo",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bouenza" },
            { code: "04", longname: "Kouilou" },
            { code: "05", longname: "Lekoumou" },
            { code: "06", longname: "Likouala" },
            { code: "07", longname: "Niari" },
            { code: "08", longname: "Plateaux" },
            { code: "10", longname: "Sangha" },
            { code: "11", longname: "Pool" },
            { code: "12", longname: "Brazzaville" },
            { code: "13", longname: "Cuvette" },
            { code: "14", longname: "Cuvette-Ouest" }
        ]
    },
    {
        code: "CH",
        longname: "Switzerland",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Aargau" },
            { code: "02", longname: "Ausser-Rhoden" },
            { code: "03", longname: "Basel-Landschaft" },
            { code: "04", longname: "Basel-Stadt" },
            { code: "05", longname: "Bern" },
            { code: "06", longname: "Fribourg" },
            { code: "07", longname: "Geneve" },
            { code: "08", longname: "Glarus" },
            { code: "09", longname: "Graubunden" },
            { code: "10", longname: "Inner-Rhoden" },
            { code: "11", longname: "Luzern" },
            { code: "12", longname: "Neuchatel" },
            { code: "13", longname: "Nidwalden" },
            { code: "14", longname: "Obwalden" },
            { code: "15", longname: "Sankt Gallen" },
            { code: "16", longname: "Schaffhausen" },
            { code: "17", longname: "Schwyz" },
            { code: "18", longname: "Solothurn" },
            { code: "19", longname: "Thurgau" },
            { code: "20", longname: "Ticino" },
            { code: "21", longname: "Uri" },
            { code: "22", longname: "Valais" },
            { code: "23", longname: "Vaud" },
            { code: "24", longname: "Zug" },
            { code: "25", longname: "Zurich" },
            { code: "26", longname: "Jura" }
        ]
    },
    {
        code: "CI",
        longname: "Côte d'Ivoire",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "74", longname: "Agnéby" },
            { code: "75", longname: "Bafing" },
            { code: "76", longname: "Bas-Sassandra" },
            { code: "77", longname: "Denguélé" },
            { code: "78", longname: "Dix-Huit Montagnes" },
            { code: "79", longname: "Fromager" },
            { code: "80", longname: "Haut-Sassandra" },
            { code: "81", longname: "Lacs" },
            { code: "82", longname: "Lagunes" },
            { code: "83", longname: "Marahoué" },
            { code: "84", longname: "Moyen-Cavally" },
            { code: "85", longname: "Moyen-Comoé" },
            { code: "86", longname: "N’zi-Comoé" },
            { code: "87", longname: "Savanes" },
            { code: "88", longname: "Sud-Bandama" },
            { code: "89", longname: "Sud-Comoé" },
            { code: "90", longname: "Vallée du Bandama" },
            { code: "91", longname: "Worodougou" },
            { code: "92", longname: "Zanzan" }
        ]
    },
    {
        code: "CK",
        longname: "Cook Islands",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "CL",
        longname: "Chile",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Valparaiso" },
            { code: "02", longname: "Aisen del General Carlos Ibanez del Campo" },
            { code: "03", longname: "Antofagasta" },
            { code: "04", longname: "Araucania" },
            { code: "05", longname: "Atacama" },
            { code: "06", longname: "Bio-Bio" },
            { code: "07", longname: "Coquimbo" },
            { code: "08", longname: "Libertador General Bernardo O'Higgins" },
            { code: "10", longname: "Magallanes y de la Antártica Chilena" },
            { code: "11", longname: "Maule" },
            { code: "12", longname: "Region Metropolitana" },
            { code: "14", longname: "Los Lagos" },
            { code: "15", longname: "Tarapacá" },
            { code: "16", longname: "Arica y Parinacota" },
            { code: "17", longname: "Los Ríos" }
        ]
    },
    {
        code: "CM",
        longname: "Cameroon",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "04", longname: "East" },
            { code: "05", longname: "Littoral" },
            { code: "07", longname: "North-west" },
            { code: "08", longname: "West" },
            { code: "09", longname: "South-west" },
            { code: "10", longname: "Adamaoua" },
            { code: "11", longname: "Centre" },
            { code: "12", longname: "Far North" },
            { code: "13", longname: "North" },
            { code: "14", longname: "South" }
        ]
    },
    {
        code: "CN",
        longname: "China",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Anhwei" },
            { code: "02", longname: "Chekiang" },
            { code: "03", longname: "Kiangsi" },
            { code: "04", longname: "Kiangsu" },
            { code: "05", longname: "Kirin" },
            { code: "06", longname: "Tsinghai" },
            { code: "07", longname: "Fukien" },
            { code: "08", longname: "Heilungkiang" },
            { code: "09", longname: "Honan" },
            { code: "10", longname: "Hopeh" },
            { code: "11", longname: "Hunan" },
            { code: "12", longname: "Hupeh" },
            { code: "13", longname: "Sinkiang" },
            { code: "14", longname: "Tibet" },
            { code: "15", longname: "Kansu" },
            { code: "16", longname: "Kwangsi" },
            { code: "18", longname: "Kweichow" },
            { code: "19", longname: "Liaoning" },
            { code: "20", longname: "Inner Mongolia" },
            { code: "21", longname: "Ningxia" },
            { code: "22", longname: "Peking" },
            { code: "23", longname: "Shanghai" },
            { code: "24", longname: "Shansi" },
            { code: "25", longname: "Shantung" },
            { code: "26", longname: "Shensi" },
            { code: "28", longname: "Tianjin" },
            { code: "29", longname: "Yunnan" },
            { code: "30", longname: "Kwangtung" },
            { code: "31", longname: "Hainan" },
            { code: "32", longname: "Szechwan" },
            { code: "33", longname: "Chongqing" }
        ]
    },
    {
        code: "CO",
        longname: "Colombia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Amazonas" },
            { code: "02", longname: "Antioquia" },
            { code: "03", longname: "Arauca" },
            { code: "04", longname: "Atlantico" },
            { code: "08", longname: "Caqueta" },
            { code: "09", longname: "Cauca" },
            { code: "10", longname: "Cesar" },
            { code: "11", longname: "Choco" },
            { code: "12", longname: "Cordoba" },
            { code: "14", longname: "Guaviare" },
            { code: "15", longname: "Guainia" },
            { code: "16", longname: "Huila" },
            { code: "17", longname: "La Guajira" },
            { code: "19", longname: "Meta" },
            { code: "20", longname: "Narino" },
            { code: "21", longname: "Norte de Santander" },
            { code: "22", longname: "Putumayo" },
            { code: "23", longname: "Quindio" },
            { code: "24", longname: "Risaralda" },
            { code: "25", longname: "San Andres y Providencia" },
            { code: "26", longname: "Santander" },
            { code: "27", longname: "Sucre" },
            { code: "28", longname: "Tolima" },
            { code: "29", longname: "Valle del Cauca" },
            { code: "30", longname: "Vaupes" },
            { code: "31", longname: "Vichada" },
            { code: "32", longname: "Casanare" },
            { code: "33", longname: "Cundinamarca" },
            { code: "34", longname: "Distrito Capital" },
            { code: "35", longname: "Bolivar" },
            { code: "36", longname: "Boyaca" },
            { code: "37", longname: "Caldas" },
            { code: "38", longname: "Magdalena" }
        ]
    },
    {
        code: "CR",
        longname: "Costa Rica",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Alajuela" },
            { code: "02", longname: "Cartago" },
            { code: "03", longname: "Guanacaste" },
            { code: "04", longname: "Heredia" },
            { code: "06", longname: "Limon" },
            { code: "07", longname: "Puntarenas" },
            { code: "08", longname: "San Jose" }
        ]
    },
    {
        code: "CU",
        longname: "Cuba",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Pinar del Rio" },
            { code: "02", longname: "Ciudad de la Habana" },
            { code: "03", longname: "Matanzas" },
            { code: "04", longname: "Isla de la Juventud" },
            { code: "05", longname: "Camaguey" },
            { code: "07", longname: "Ciego de Avila" },
            { code: "08", longname: "Cienfuegos" },
            { code: "09", longname: "Granma" },
            { code: "10", longname: "Guantanamo" },
            { code: "11", longname: "La Habana" },
            { code: "12", longname: "Holguin" },
            { code: "13", longname: "Las Tunas" },
            { code: "14", longname: "Sancti Spiritus" },
            { code: "15", longname: "Santiago de Cuba" },
            { code: "16", longname: "Villa Clara" }
        ]
    },
    {
        code: "CV",
        longname: "Cape Verde",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Boa Vista" },
            { code: "02", longname: "Brava" },
            { code: "04", longname: "Maio" },
            { code: "05", longname: "Paul" },
            { code: "07", longname: "Ribeira Grande" },
            { code: "08", longname: "Sal" },
            { code: "10", longname: "Sao Nicolau" },
            { code: "11", longname: "Sao Vicente" },
            { code: "13", longname: " Mosteiros" },
            { code: "14", longname: "Praia" },
            { code: "15", longname: "Santa Catarina" },
            { code: "16", longname: "Santa Cruz" },
            { code: "17", longname: "São Domingos" },
            { code: "18", longname: "São Filipe" },
            { code: "19", longname: "São Miguel" },
            { code: "20", longname: "Tarrafal" }
        ]
    },
    {
        code: "CX",
        longname: "Christmas Island",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "CY",
        longname: "Cyprus",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Famagusta" },
            { code: "02", longname: "Kyrenia" },
            { code: "03", longname: "Larnaca" },
            { code: "04", longname: "Nicosia" },
            { code: "05", longname: "Limassol" },
            { code: "06", longname: "Paphos" }
        ]
    },
    {
        code: "CZ",
        longname: "Czech Republic",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "52", longname: "Hlavní Město Praha" },
            { code: "78", longname: "Jihomoravký Kraj" },
            { code: "79", longname: "Jihočeský Kraj" },
            { code: "80", longname: "Vysočina" },
            { code: "81", longname: "Karlovarský Kraj" },
            { code: "82", longname: "Královéhradecký Kraj" },
            { code: "83", longname: "Liberecký Kraj" },
            { code: "84", longname: "Olomoucký Kraj" },
            { code: "85", longname: "Moravskolezský Kraj" },
            { code: "86", longname: "Pardubický Kraj" },
            { code: "87", longname: "Plzeňský Kraj" },
            { code: "88", longname: "Středočeský Kraj" },
            { code: "89", longname: "Ústecký Kraj" },
            { code: "90", longname: "Zlínský Kraj" }
        ]
    },
    {
        code: "DE",
        longname: "Germany",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Baden-Wurttemberg" },
            { code: "02", longname: "Bavaria" },
            { code: "03", longname: "Bremen" },
            { code: "04", longname: "Hamburg" },
            { code: "05", longname: "Hessen" },
            { code: "06", longname: "Niedersachsen" },
            { code: "07", longname: "Nordrhein-Westfalen" },
            { code: "08", longname: "Rheinland-Pfalz" },
            { code: "09", longname: "Saarland" },
            { code: "10", longname: "Schleswig-Holstein" },
            { code: "11", longname: "Brandenburg" },
            { code: "12", longname: "Mecklenburg-Vorpommern" },
            { code: "13", longname: "Sachsen" },
            { code: "14", longname: "Sachsen-Anhalt" },
            { code: "15", longname: "Thuringen" },
            { code: "16", longname: "Berlin" }
        ]
    },
    {
        code: "DJ",
        longname: "Djibouti",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ali Sabieh" },
            { code: "04", longname: "Obock" },
            { code: "05", longname: "Tadjoura" },
            { code: "06", longname: "Dikhil" },
            { code: "07", longname: "Djibouti" },
            { code: "08", longname: "Arta" }
        ]
    },
    {
        code: "DK",
        longname: "Denmark",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "17", longname: "Hovedstaden" },
            { code: "18", longname: "Midtjyllen" },
            { code: "19", longname: "Nordjylland" },
            { code: "20", longname: "Sjælland" },
            { code: "21", longname: "Syddanmark" }
        ]
    },
    {
        code: "DM",
        longname: "Dominica",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Saint Andrew" },
            { code: "03", longname: "Saint David" },
            { code: "04", longname: "Saint George" },
            { code: "05", longname: "Saint John" },
            { code: "06", longname: "Saint Joseph" },
            { code: "07", longname: "Saint Luke" },
            { code: "08", longname: "Saint Mark" },
            { code: "09", longname: "Saint Patrick" },
            { code: "10", longname: "Saint Paul" },
            { code: "11", longname: "Saint Peter" }
        ]
    },
    {
        code: "DO",
        longname: "Dominican Republic",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Azua" },
            { code: "02", longname: "Bahoruco" },
            { code: "03", longname: "Barahona" },
            { code: "04", longname: "Dajabon" },
            { code: "06", longname: "Duarte" },
            { code: "08", longname: "Espaillat" },
            { code: "09", longname: "Independencia" },
            { code: "10", longname: "La Altagracia" },
            { code: "11", longname: "Elias Pina" },
            { code: "12", longname: "La Romana" },
            { code: "14", longname: "Maria Trinidad Sanchez" },
            { code: "15", longname: "Monte Cristi" },
            { code: "16", longname: "Pedernales" },
            { code: "18", longname: "Puerto Plata" },
            { code: "19", longname: "Salcedo" },
            { code: "20", longname: "Samana" },
            { code: "21", longname: "Sanchez Ramirez" },
            { code: "23", longname: "San Juan" },
            { code: "24", longname: "San Pedro De Macoris" },
            { code: "25", longname: "Santiago" },
            { code: "26", longname: "Santiago Rodriguez" },
            { code: "27", longname: "Valverde" },
            { code: "28", longname: "El Seibo" },
            { code: "29", longname: "Hato Mayor" },
            { code: "30", longname: "La Vega" },
            { code: "31", longname: "Monsenor Nouel" },
            { code: "32", longname: "Monte Plata" },
            { code: "33", longname: "San Cristobal" },
            { code: "34", longname: "Distrito Nacional" },
            { code: "35", longname: "Peravia" },
            { code: "36", longname: "San José de Ocoa" },
            { code: "37", longname: "Santo Domingo" }
        ]
    },
    {
        code: "DZ",
        longname: "Algeria",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Alger" },
            { code: "03", longname: "Batna" },
            { code: "04", longname: "Constantine" },
            { code: "06", longname: "Medea" },
            { code: "07", longname: "Mostaganem" },
            { code: "09", longname: "Oran" },
            { code: "10", longname: "Saida" },
            { code: "12", longname: "Setif" },
            { code: "13", longname: "Tiaret" },
            { code: "14", longname: "Tizi Ouzou" },
            { code: "15", longname: "Tlemcen" },
            { code: "18", longname: "Bejaia" },
            { code: "19", longname: "Biskra" },
            { code: "20", longname: "Blida" },
            { code: "21", longname: "Bouira" },
            { code: "22", longname: "Djelfa" },
            { code: "23", longname: "Guelma" },
            { code: "24", longname: "Jijel" },
            { code: "25", longname: "Laghouat" },
            { code: "26", longname: "Mascara" },
            { code: "27", longname: "M'sila" },
            { code: "29", longname: "Oum el Bouaghi" },
            { code: "30", longname: "Sidi Bel Abbes" },
            { code: "31", longname: "Skikda" },
            { code: "33", longname: "Tebessa" },
            { code: "34", longname: "Adrar" },
            { code: "35", longname: "Ain Defla" },
            { code: "36", longname: "Ain Temouchent" },
            { code: "37", longname: "Annaba" },
            { code: "38", longname: "Bechar" },
            { code: "39", longname: "Bordj Bou Arreridj" },
            { code: "40", longname: "Boumerdes" },
            { code: "41", longname: "Chlef" },
            { code: "42", longname: "El Bayadh" },
            { code: "43", longname: "El Oued" },
            { code: "44", longname: "El Tarf" },
            { code: "45", longname: "Ghardaia" },
            { code: "46", longname: "Illizi" },
            { code: "47", longname: "Khenchela" },
            { code: "48", longname: "Mila" },
            { code: "49", longname: "Naama" },
            { code: "50", longname: "Ouargla" },
            { code: "51", longname: "Relizane" },
            { code: "52", longname: "Souk Ahras" },
            { code: "53", longname: "Tamanghasset" },
            { code: "54", longname: "Tindouf" },
            { code: "55", longname: "Tipaza" },
            { code: "56", longname: "Tissemsilt" }
        ]
    },
    {
        code: "EC",
        longname: "Ecuador",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Galapagos" },
            { code: "02", longname: "Azuay" },
            { code: "03", longname: "Bolivar" },
            { code: "04", longname: "Canar" },
            { code: "05", longname: "Carchi" },
            { code: "06", longname: "Chimborazo" },
            { code: "07", longname: "Cotopaxi" },
            { code: "08", longname: "El Oro" },
            { code: "09", longname: "Esmeraldas" },
            { code: "10", longname: "Guayas" },
            { code: "11", longname: "Imbabura" },
            { code: "12", longname: "Loja" },
            { code: "13", longname: "Los Rios" },
            { code: "14", longname: "Manabi" },
            { code: "15", longname: "Morona-Santiago" },
            { code: "17", longname: "Pastaza" },
            { code: "18", longname: "Pichincha" },
            { code: "19", longname: "Tungurahua" },
            { code: "20", longname: "Zamora-Chinchipe" },
            { code: "22", longname: "Sucumbios" },
            { code: "23", longname: "Napo" },
            { code: "24", longname: "Orellana" }
        ]
    },
    {
        code: "EE",
        longname: "Estonia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Harjumaa" },
            { code: "02", longname: "Hiiumaa" },
            { code: "03", longname: "Ida-Virumaa" },
            { code: "04", longname: "Jarvamaa" },
            { code: "05", longname: "Jogevamaa" },
            { code: "07", longname: "Laanemaa" },
            { code: "08", longname: "Laane-Virumaa" },
            { code: "11", longname: "Parnumaa" },
            { code: "12", longname: "Polvamaa" },
            { code: "13", longname: "Raplamaa" },
            { code: "14", longname: "Saaremaa" },
            { code: "18", longname: "Tartumaa" },
            { code: "19", longname: "Valgamaa" },
            { code: "20", longname: "Viljandimaa" },
            { code: "21", longname: "Vorumaa" }
        ]
    },
    {
        code: "EG",
        longname: "Egypt",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ad Daqahliyah" },
            { code: "02", longname: "Al Bahr al Ahmar" },
            { code: "03", longname: "Al Buhayrah" },
            { code: "04", longname: "Al Fayyum" },
            { code: "05", longname: "Al Gharbiyah" },
            { code: "06", longname: "Al Iskandariyah" },
            { code: "07", longname: "Al Isma'iliyah" },
            { code: "08", longname: "Al Jizah" },
            { code: "09", longname: "Al Minufiyah" },
            { code: "10", longname: "Al Minya" },
            { code: "11", longname: "Al Qahirah" },
            { code: "12", longname: "Al Qalyubiyah" },
            { code: "13", longname: "Al Wadi al Jadid" },
            { code: "14", longname: "Ash Sharqiyah" },
            { code: "15", longname: "As Suways" },
            { code: "16", longname: "Aswan" },
            { code: "17", longname: "Asyut" },
            { code: "18", longname: "Bani Suwayf" },
            { code: "19", longname: "Bur Sa'id" },
            { code: "20", longname: "Dumyat" },
            { code: "21", longname: "Kafr ash Shaykh" },
            { code: "22", longname: "Matruh" },
            { code: "23", longname: "Qina" },
            { code: "24", longname: "Suhaj" },
            { code: "26", longname: "Janub Sina'" },
            { code: "27", longname: "Shamal Sina'" }
        ]
    },
    {
        code: "EH",
        longname: "Western Sahara",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "ER",
        longname: "Eritrea",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ānseba" },
            { code: "02", longname: "Debub" },
            { code: "03", longname: "Debubawī K’eyih Bahrī" },
            { code: "04", longname: "Gash Barka" },
            { code: "05", longname: "Ma'ākel" },
            { code: "06", longname: "Semēnawī K’eyih Bahrī" }
        ]
    },
    {
        code: "ES",
        longname: "Spain",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "07", longname: "Islas Baleares" },
            { code: "27", longname: "La Rioja" },
            { code: "29", longname: "Madrid" },
            { code: "31", longname: "Murcia" },
            { code: "32", longname: "Navarra" },
            { code: "34", longname: "Asturias" },
            { code: "39", longname: "Cantabria" },
            { code: "51", longname: "Andalucia" },
            { code: "52", longname: "Aragon" },
            { code: "53", longname: "Canarias" },
            { code: "54", longname: "Castilla-La Mancha" },
            { code: "55", longname: "Castilla y Leon" },
            { code: "56", longname: "Cataluna" },
            { code: "57", longname: "Extremadura" },
            { code: "58", longname: "Galicia" },
            { code: "59", longname: "Pais Vasco" },
            { code: "60", longname: "Valenciana" }
        ]
    },
    {
        code: "ET",
        longname: "Ethiopia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "44", longname: "Ādīs Ābeba" },
            { code: "45", longname: "Āfar" },
            { code: "46", longname: "Āmara" },
            { code: "47", longname: "Bīnshangul Gumuz" },
            { code: "48", longname: "Dirē Dawa" },
            { code: "49", longname: "Gambēla Hizboch" },
            { code: "50", longname: "Hārerī Hizb" },
            { code: "51", longname: "Oromīya" },
            { code: "52", longname: "Sumalē" },
            { code: "53", longname: "Tigray" },
            { code: "54", longname: "YeDebub Bihēroch Bihēreseboch na Hizboch" }
        ]
    },
    {
        code: "FI",
        longname: "Finland",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ahvenanmaa" },
            { code: "06", longname: "Lappi" },
            { code: "08", longname: "Oulun Lääni" },
            { code: "13", longname: "Etelä-Suomen Lääni" },
            { code: "14", longname: "Itä-Suomen Lääni" },
            { code: "15", longname: "Länsi-Suomen Lääni" }
        ]
    },
    {
        code: "FJ",
        longname: "Fiji",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Central" },
            { code: "02", longname: "Eastern" },
            { code: "03", longname: "Northern" },
            { code: "04", longname: "Rotuma" },
            { code: "05", longname: "Western" }
        ]
    },
    {
        code: "FK",
        longname: "Falkland Islands (Malvinas)",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "FM",
        longname: "Micronesia, Federated States of",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Kosrae" },
            { code: "02", longname: "Pohnpei" },
            { code: "03", longname: "Chuuk" },
            { code: "04", longname: "Yap" }
        ]
    },
    {
        code: "FO",
        longname: "Faroe Islands",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "FR",
        longname: "France",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "97", longname: "Aquitaine" },
            { code: "98", longname: "Auvergne" },
            { code: "99", longname: "Basse-Normandie" }
        ]
    },
    {
        code: "GA",
        longname: "Gabon",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Estuaire" },
            { code: "02", longname: "Haut-Ogooue" },
            { code: "03", longname: "Moyen-Ogooue" },
            { code: "04", longname: "Ngounie" },
            { code: "05", longname: "Nyanga" },
            { code: "06", longname: "Ogooue-Ivindo" },
            { code: "07", longname: "Ogooue-Lolo" },
            { code: "08", longname: "Ogooue-Maritime" },
            { code: "09", longname: "Woleu-Ntem" }
        ]
    },
    {
        code: "GB",
        longname: "United Kingdom",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "GD",
        longname: "Grenada",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Saint Andrew" },
            { code: "02", longname: "Saint David" },
            { code: "03", longname: "Saint George" },
            { code: "04", longname: "Saint John" },
            { code: "05", longname: "Saint Mark" },
            { code: "06", longname: "Saint Patrick" }
        ]
    },
    {
        code: "GE",
        longname: "Georgia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Abashis Raioni" },
            { code: "02", longname: "Abkhazia" },
            { code: "03", longname: "Adigenis Raioni" },
            { code: "04", longname: "Ajaria" },
            { code: "05", longname: "Akhalgoris Raioni" },
            { code: "06", longname: "Akhalk'alak'is Raioni" },
            { code: "07", longname: "Akhalts'ikhis Raioni" },
            { code: "08", longname: "Akhmetis Raioni" },
            { code: "09", longname: "Ambrolauris Raioni" },
            { code: "10", longname: "Aspindzis Raioni" },
            { code: "11", longname: "Baghdat'is Raioni" },
            { code: "12", longname: "Bolnisis Raioni" },
            { code: "13", longname: "Borjomis Raioni" },
            { code: "14", longname: "Chiat'ura" },
            { code: "15", longname: "Ch'khorotsqus Raioni" },
            { code: "16", longname: "Ch'okhatauris Raioni" },
            { code: "17", longname: "Dedop'listsqaros Raioni" },
            { code: "18", longname: "Dmanisis Raioni" },
            { code: "19", longname: "Dushet'is Raioni" },
            { code: "20", longname: "Gardabanis Raioni" },
            { code: "21", longname: "Gori" },
            { code: "22", longname: "Goris Raioni" },
            { code: "23", longname: "Gurjaanis Raioni" },
            { code: "24", longname: "Javis Raioni" },
            { code: "25", longname: "K'arelis Raioni" },
            { code: "26", longname: "Kaspis Raioni" },
            { code: "27", longname: "Kharagaulis Raioni" },
            { code: "28", longname: "Khashuris Raioni" },
            { code: "29", longname: "Khobis Raioni" },
            { code: "30", longname: "Khonis Raioni" },
            { code: "31", longname: "K'ut'aisi" },
            { code: "32", longname: "Lagodekhis Raioni" },
            { code: "33", longname: "Lanch'khut'is Raioni" },
            { code: "34", longname: "Lentekhis Raioni" },
            { code: "35", longname: "Marneulis Raioni" },
            { code: "36", longname: "Martvilis Raioni" },
            { code: "37", longname: "Mestiis Raioni" },
            { code: "38", longname: "Mts'khet'is Raioni" },
            { code: "39", longname: "Ninotsmindis Raioni" },
            { code: "40", longname: "Onis Raioni" },
            { code: "41", longname: "Ozurget'is Raioni" },
            { code: "42", longname: "P'ot'i" },
            { code: "43", longname: "Qazbegis Raioni" },
            { code: "44", longname: "Qvarlis Raioni" },
            { code: "45", longname: "Rust'avi" },
            { code: "46", longname: "Sach'kheris Raioni" },
            { code: "47", longname: "Sagarejos Raioni" },
            { code: "48", longname: "Samtrediis Raioni" },
            { code: "49", longname: "Senakis Raioni" },
            { code: "50", longname: "Sighnaghis Raioni" },
            { code: "51", longname: "T'bilisi" },
            { code: "52", longname: "T'elavis Raioni" },
            { code: "53", longname: "T'erjolis Raioni" },
            { code: "54", longname: "T'et'ritsqaros Raioni" },
            { code: "55", longname: "T'ianet'is Raioni" },
            { code: "56", longname: "Tqibuli" },
            { code: "57", longname: "Ts'ageris Raioni" },
            { code: "58", longname: "Tsalenjikhis Raioni" },
            { code: "59", longname: "Tsalkis Raioni" },
            { code: "60", longname: "Tsqaltubo" },
            { code: "61", longname: "Vanis Raioni" },
            { code: "62", longname: "Zestap'onis Raioni" },
            { code: "63", longname: "Zugdidi" },
            { code: "64", longname: "Zugdidis Raioni" }
        ]
    },
    {
        code: "GF",
        longname: "French Guiana",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "GG",
        longname: "Guernsey",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "GH",
        longname: "Ghana",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Greater Accra" },
            { code: "02", longname: "Ashanti" },
            { code: "03", longname: "Brong-Ahafo" },
            { code: "04", longname: "Central" },
            { code: "05", longname: "Eastern" },
            { code: "06", longname: "Northern" },
            { code: "08", longname: "Volta" },
            { code: "09", longname: "Western" },
            { code: "10", longname: "Upper East" },
            { code: "11", longname: "Upper West" }
        ]
    },
    {
        code: "GI",
        longname: "Gibraltar",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "GL",
        longname: "Greenland",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Nordgronland" },
            { code: "02", longname: "Ostgronland" },
            { code: "03", longname: "Vestgronland" }
        ]
    },
    {
        code: "GM",
        longname: "Gambia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Banjul" },
            { code: "02", longname: "Lower River" },
            { code: "03", longname: "Central River" },
            { code: "04", longname: "Upper River" },
            { code: "05", longname: "Western" },
            { code: "07", longname: "North Bank" }
        ]
    },
    {
        code: "GN",
        longname: "Guinea",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Beyla" },
            { code: "02", longname: "Boffa" },
            { code: "03", longname: "Boke" },
            { code: "04", longname: "Conakry" },
            { code: "05", longname: "Dabola" },
            { code: "06", longname: "Dalaba" },
            { code: "07", longname: "Dinguiraye" },
            { code: "09", longname: "Faranah" },
            { code: "10", longname: "Forecariah" },
            { code: "11", longname: "Fria" },
            { code: "12", longname: "Gaoual" },
            { code: "13", longname: "Gueckedou" },
            { code: "15", longname: "Kerouane" },
            { code: "16", longname: "Kindia" },
            { code: "17", longname: "Kissidougou" },
            { code: "18", longname: "Koundara" },
            { code: "19", longname: "Kouroussa" },
            { code: "21", longname: "Macenta" },
            { code: "22", longname: "Mali" },
            { code: "23", longname: "Mamou" },
            { code: "25", longname: "Pita" },
            { code: "27", longname: "Telimele" },
            { code: "28", longname: "Tougue" },
            { code: "29", longname: "Yomou" },
            { code: "30", longname: "Coyah" },
            { code: "31", longname: "Dubréka" },
            { code: "32", longname: "Kankan" },
            { code: "33", longname: "Koubia" },
            { code: "34", longname: "Labé" },
            { code: "35", longname: "Lélouma" },
            { code: "36", longname: "Lola" },
            { code: "37", longname: "Mandiana" },
            { code: "38", longname: "Nzérékoré" },
            { code: "39", longname: "Siguiri" }
        ]
    },
    {
        code: "GP",
        longname: "Guadeloupe",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "GQ",
        longname: "Equatorial Guinea",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "03", longname: "Annobon" },
            { code: "04", longname: "Bioko Norte" },
            { code: "05", longname: "Bioko Sur" },
            { code: "06", longname: "Centro Sur" },
            { code: "07", longname: "Kie-Ntem" },
            { code: "08", longname: "Litoral" },
            { code: "09", longname: "Wele-Nzas" }
        ]
    },
    {
        code: "GR",
        longname: "Greece",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Evros" },
            { code: "02", longname: "Rodhopi" },
            { code: "03", longname: "Xanthi" },
            { code: "04", longname: "Drama" },
            { code: "05", longname: "Serrai" },
            { code: "06", longname: "Kilkis" },
            { code: "07", longname: "Pella" },
            { code: "08", longname: "Florina" },
            { code: "09", longname: "Kastoria" },
            { code: "10", longname: "Grevena" },
            { code: "11", longname: "Kozani" },
            { code: "12", longname: "Imathia" },
            { code: "13", longname: "Thessaloniki" },
            { code: "14", longname: "Kavala" },
            { code: "15", longname: "Khalkidhiki" },
            { code: "16", longname: "Pieria" },
            { code: "17", longname: "Ioannina" },
            { code: "18", longname: "Thesprotia" },
            { code: "19", longname: "Preveza" },
            { code: "20", longname: "Arta" },
            { code: "21", longname: "Larisa" },
            { code: "22", longname: "Trikala" },
            { code: "23", longname: "Kardhitsa" },
            { code: "24", longname: "Magnisia" },
            { code: "25", longname: "Kerkira" },
            { code: "26", longname: "Levkas" },
            { code: "27", longname: "Kefallinia" },
            { code: "28", longname: "Zakinthos" },
            { code: "29", longname: "Fthiotis" },
            { code: "30", longname: "Evritania" },
            { code: "31", longname: "Aitolia kai Akarnania" },
            { code: "32", longname: "Fokis" },
            { code: "33", longname: "Voiotia" },
            { code: "34", longname: "Evvoia" },
            { code: "35", longname: "Attiki" },
            { code: "36", longname: "Argolis" },
            { code: "37", longname: "Korinthia" },
            { code: "38", longname: "Akhaia" },
            { code: "39", longname: "Ilia" },
            { code: "40", longname: "Messinia" },
            { code: "41", longname: "Arkadhia" },
            { code: "42", longname: "Lakonia" },
            { code: "43", longname: "Khania" },
            { code: "44", longname: "Rethimni" },
            { code: "45", longname: "Iraklion" },
            { code: "46", longname: "Lasithi" },
            { code: "47", longname: "Dhodhekanisos" },
            { code: "48", longname: "Samos" },
            { code: "49", longname: "Kikladhes" },
            { code: "50", longname: "Khios" },
            { code: "51", longname: "Lesvos" }
        ]
    },
    {
        code: "GS",
        longname: "South Georgia And The South Sandwich Islands",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "GT",
        longname: "Guatemala",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Alta Verapaz" },
            { code: "02", longname: "Baja Verapaz" },
            { code: "03", longname: "Chimaltenango" },
            { code: "04", longname: "Chiquimula" },
            { code: "05", longname: "El Progreso" },
            { code: "06", longname: "Escuintla" },
            { code: "07", longname: "Guatemala" },
            { code: "08", longname: "Huehuetenango" },
            { code: "09", longname: "Izabal" },
            { code: "10", longname: "Jalapa" },
            { code: "11", longname: "Jutiapa" },
            { code: "12", longname: "Peten" },
            { code: "13", longname: "Quetzaltenango" },
            { code: "14", longname: "Quiche" },
            { code: "15", longname: "Retalhuleu" },
            { code: "16", longname: "Sacatepequez" },
            { code: "17", longname: "San Marcos" },
            { code: "18", longname: "Santa Rosa" },
            { code: "19", longname: "Solola" },
            { code: "20", longname: "Suchitepequez" },
            { code: "21", longname: "Totonicapan" },
            { code: "22", longname: "Zacapa" }
        ]
    },
    {
        code: "GU",
        longname: "Guam",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "GW",
        longname: "Guinea-bissau",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bafata" },
            { code: "02", longname: "Quinara" },
            { code: "04", longname: "Oio" },
            { code: "05", longname: "Bolama" },
            { code: "06", longname: "Cacheu" },
            { code: "07", longname: "Tombali" },
            { code: "10", longname: "Gabu" },
            { code: "11", longname: "Bissau" },
            { code: "12", longname: "Biombo" }
        ]
    },
    {
        code: "GY",
        longname: "Guyana",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "10", longname: "Barima-Waini" },
            { code: "11", longname: "Cuyuni-Mazaruni" },
            { code: "12", longname: "Demerara-Mahaica" },
            { code: "13", longname: "East Berbice-Corentyne" },
            { code: "14", longname: "Essequibo Islands-West Demerara" },
            { code: "15", longname: "Mahaica-Berbice" },
            { code: "16", longname: "Pomeroon-Supenaam" },
            { code: "17", longname: "Potaro-Siparuni" },
            { code: "18", longname: "Upper Demerara-Berbice" },
            { code: "19", longname: "Upper Takutu-Upper Essequibo" }
        ]
    },
    {
        code: "HK",
        longname: "Hong Kong",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "HM",
        longname: "Heard Island And Mcdonald Islands",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "HN",
        longname: "Honduras",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Atlantida" },
            { code: "02", longname: "Choluteca" },
            { code: "03", longname: "Colon" },
            { code: "04", longname: "Comayagua" },
            { code: "05", longname: "Copan" },
            { code: "06", longname: "Cortes" },
            { code: "07", longname: "El Paraiso" },
            { code: "08", longname: "Francisco Morazan" },
            { code: "09", longname: "Gracias a Dios" },
            { code: "10", longname: "Intibuca" },
            { code: "11", longname: "Islas de la Bahia" },
            { code: "12", longname: "La Paz" },
            { code: "13", longname: "Lempira" },
            { code: "14", longname: "Ocotepeque" },
            { code: "15", longname: "Olancho" },
            { code: "16", longname: "Santa Barbara" },
            { code: "17", longname: "Valle" },
            { code: "18", longname: "Yoro" }
        ]
    },
    {
        code: "HR",
        longname: "Croatia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bjelovarsko-Bilogorska" },
            { code: "02", longname: "Brodsko-Posavska" },
            { code: "03", longname: "Dubrovačko-Neretvanska" },
            { code: "04", longname: " Istarska" },
            { code: "05", longname: " Karlovačka" },
            { code: "06", longname: " Koprivničko-Križevačka" },
            { code: "07", longname: " Krapinsko-Zagorska" },
            { code: "08", longname: "Ličko-Senjska" },
            { code: "09", longname: "Međimurska" },
            { code: "10", longname: "Osječko-Baranjska" },
            { code: "11", longname: "Požeško-Slavonska" },
            { code: "12", longname: "Primorsko-Goranska" },
            { code: "13", longname: "Šibensko-Kninska" },
            { code: "14", longname: "Sisačko-Moslavačka" },
            { code: "15", longname: "Splitsko-Dalmatinska" },
            { code: "16", longname: "Varaždinska" },
            { code: "17", longname: "Virovitičko-Podravska" },
            { code: "18", longname: "Vukovarsko-Srijemska" },
            { code: "19", longname: "Zadarska" },
            { code: "20", longname: "Zagrebačka" },
            { code: "21", longname: "Grad Zagreb" }
        ]
    },
    {
        code: "HT",
        longname: "Haiti",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "03", longname: "Nord-Ouest" },
            { code: "06", longname: "Artibonite" },
            { code: "07", longname: "Centre" },
            { code: "09", longname: "Nord" },
            { code: "10", longname: "Nord-Est" },
            { code: "11", longname: "Ouest" },
            { code: "12", longname: "Sud" },
            { code: "13", longname: "Sud-Est" },
            { code: "14", longname: "Grand' Anse" },
            { code: "15", longname: "Nippes" }
        ]
    },
    {
        code: "HU",
        longname: "Hungary",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bacs-Kiskun" },
            { code: "02", longname: "Baranya" },
            { code: "03", longname: "Bekes" },
            { code: "04", longname: "Borsod-Abauj-Zemplen" },
            { code: "05", longname: "Budapest" },
            { code: "06", longname: "Csongrad" },
            { code: "07", longname: "Debrecen" },
            { code: "08", longname: "Fejer" },
            { code: "09", longname: "Gyor-Moson-Sopron" },
            { code: "10", longname: "Hajdu-Bihar" },
            { code: "11", longname: "Heves" },
            { code: "12", longname: "Komarom-Esztergom" },
            { code: "13", longname: "Miskolc" },
            { code: "14", longname: "Nograd" },
            { code: "15", longname: "Pecs" },
            { code: "16", longname: "Pest" },
            { code: "17", longname: "Somogy" },
            { code: "18", longname: "Szabolcs-Szatmar-Bereg" },
            { code: "19", longname: "Szeged" },
            { code: "20", longname: "Jasz-Nagykun-Szolnok" },
            { code: "21", longname: "Tolna" },
            { code: "22", longname: "Vas" },
            { code: "23", longname: "Veszprem" },
            { code: "24", longname: "Zala" },
            { code: "25", longname: "Gyor" },
            { code: "26", longname: "Bekescsaba" },
            { code: "27", longname: "Dunaujvaros" },
            { code: "28", longname: "Eger" },
            { code: "29", longname: "Hodmezovasarhely" },
            { code: "30", longname: "Kaposvar" },
            { code: "31", longname: "Kecskemet" },
            { code: "32", longname: "Nagykanizsa" },
            { code: "33", longname: "Nyiregyhaza" },
            { code: "34", longname: "Sopron" },
            { code: "35", longname: "Szekesfehervar" },
            { code: "36", longname: "Szolnok" },
            { code: "37", longname: "Szombathely" },
            { code: "38", longname: "Tatabanya" },
            { code: "39", longname: "Veszprem" },
            { code: "40", longname: "Zalaegerszeg" },
            { code: "41", longname: "Salgótarján" },
            { code: "42", longname: "Szekszárd" },
            { code: "43", longname: "Erd" }
        ]
    },
    {
        code: "ID",
        longname: "Indonesia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Atjeh" },
            { code: "02", longname: "Bali" },
            { code: "03", longname: "Bengkulu" },
            { code: "04", longname: "Djakarta Raya" },
            { code: "05", longname: "Djambi" },
            { code: "07", longname: "Djawa Tengah" },
            { code: "08", longname: "Djawa Timur" },
            { code: "10", longname: "Jogjakarta" },
            { code: "11", longname: "Kalimantan Barat" },
            { code: "12", longname: "Kalimantan Selatan" },
            { code: "13", longname: "Kalimantan Tengah" },
            { code: "14", longname: "Kalimantan Timur" },
            { code: "15", longname: "Lampung" },
            { code: "17", longname: "Nusa Tenggara Barat" },
            { code: "18", longname: "Nusa Tenggara Timur" },
            { code: "21", longname: "Sulawesi Tengah" },
            { code: "22", longname: "Sulawesi Tenggara" },
            { code: "24", longname: "Sumatera Barat" },
            { code: "26", longname: "Sumatera Utara" },
            { code: "28", longname: "Maluku" },
            { code: "29", longname: "Maluku Utara" },
            { code: "30", longname: "Djawa Barat" },
            { code: "31", longname: "Sulawesi Utara" },
            { code: "32", longname: "Sumatera Selatan" },
            { code: "33", longname: "Banten" },
            { code: "34", longname: "Gorontalo" },
            { code: "35", longname: "Kepulauan Bangka Belitung" },
            { code: "36", longname: "Papua" },
            { code: "37", longname: "Riau" },
            { code: "38", longname: "Sulawesi Selatan" },
            { code: "39", longname: "Irian Jaya Barat" },
            { code: "40", longname: "Kepulauan Riau" },
            { code: "41", longname: "Sulawesi Barat" }
        ]
    },
    {
        code: "IE",
        longname: "Ireland",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Carlow" },
            { code: "02", longname: "Cavan" },
            { code: "03", longname: "Clare" },
            { code: "04", longname: "Cork" },
            { code: "06", longname: "Donegal" },
            { code: "07", longname: "Dublin" },
            { code: "10", longname: "Galway" },
            { code: "11", longname: "Kerry" },
            { code: "12", longname: "Kildare" },
            { code: "13", longname: "Kilkenny" },
            { code: "14", longname: "Leitrim" },
            { code: "15", longname: "Laois" },
            { code: "16", longname: "Limerick" },
            { code: "18", longname: "Longford" },
            { code: "19", longname: "Louth" },
            { code: "20", longname: "Mayo" },
            { code: "21", longname: "Meath" },
            { code: "22", longname: "Monaghan" },
            { code: "23", longname: "Offaly" },
            { code: "24", longname: "Roscommon" },
            { code: "25", longname: "Sligo" },
            { code: "26", longname: "Tipperary" },
            { code: "27", longname: "Waterford" },
            { code: "29", longname: "Westmeath" },
            { code: "30", longname: "Wexford" },
            { code: "31", longname: "Wicklow" }
        ]
    },
    {
        code: "IL",
        longname: "Israel",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Southern" },
            { code: "02", longname: "Central" },
            { code: "03", longname: "Northern" },
            { code: "04", longname: "Haifa" },
            { code: "05", longname: "Tel Aviv" },
            { code: "06", longname: "Jerusalem" }
        ]
    },
    {
        code: "IN",
        longname: "India",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Andaman and Nicobar Islands" },
            { code: "02", longname: "Andhra Pradesh" },
            { code: "03", longname: "Assam" },
            { code: "05", longname: "Chandigarh" },
            { code: "06", longname: "Dadra and Nagar Haveli" },
            { code: "07", longname: "Delhi" },
            { code: "09", longname: "Gujarat" },
            { code: "10", longname: "Haryana" },
            { code: "11", longname: "Himachal Pradesh" },
            { code: "12", longname: "Jammu and Kashmir" },
            { code: "13", longname: "Kerala" },
            { code: "14", longname: "Laccadive, Minacoy, and Amindivi Islands" },
            { code: "16", longname: "Maharashtra" },
            { code: "17", longname: "Manipur" },
            { code: "18", longname: "Meghalaya" },
            { code: "19", longname: "Karnataka" },
            { code: "20", longname: "Nagaland" },
            { code: "21", longname: "Orissa" },
            { code: "22", longname: "Puducherry" },
            { code: "23", longname: "Punjab" },
            { code: "24", longname: "Rajasthan" },
            { code: "25", longname: "Madras" },
            { code: "26", longname: "Tripura" },
            { code: "28", longname: "West Bengal" },
            { code: "29", longname: "Sikkim" },
            { code: "30", longname: "Arunachal Pradesh" },
            { code: "31", longname: "Mizoram" },
            { code: "32", longname: "Daman and Diu" },
            { code: "33", longname: "Goa" },
            { code: "34", longname: "Bihār" },
            { code: "35", longname: "Madhya Pradesh" },
            { code: "36", longname: "Uttar Pradesh" },
            { code: "37", longname: "Chhattīsgarh" },
            { code: "38", longname: "Jharkhand" },
            { code: "39", longname: "Uttarakhand" }
        ]
    },
    {
        code: "IO",
        longname: "British Indian Ocean Territory",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "IQ",
        longname: "Iraq",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Al Anbar" },
            { code: "02", longname: "Al Basrah" },
            { code: "03", longname: "Al Muthanna" },
            { code: "04", longname: "Al Qadisiyah" },
            { code: "05", longname: "As Sulaymaniyah" },
            { code: "06", longname: "Babil" },
            { code: "07", longname: "Baghdad" },
            { code: "08", longname: "Dahuk" },
            { code: "09", longname: "Dhi Qar" },
            { code: "10", longname: "Diyala" },
            { code: "11", longname: "Arbil" },
            { code: "12", longname: "Karbala'" },
            { code: "13", longname: "Kirkuk" },
            { code: "14", longname: "Maysan" },
            { code: "15", longname: "Ninawa" },
            { code: "16", longname: "Wasit" },
            { code: "17", longname: "An Najaf" },
            { code: "18", longname: "Salah ad Din" }
        ]
    },
    {
        code: "IR",
        longname: "Iran",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Āz̄ārbāyjān-e Gharbī" },
            { code: "03", longname: "Chahar Mahall va Bakhtiari" },
            { code: "04", longname: "Sistan va Baluchestan" },
            { code: "05", longname: "Kohgīlūyeh va Būyer Aḩmad" },
            { code: "07", longname: "Fars" },
            { code: "08", longname: "Gilan" },
            { code: "09", longname: "Hamadan" },
            { code: "10", longname: "Ilam" },
            { code: "11", longname: "Hormozgan" },
            { code: "13", longname: "Kermānshāh" },
            { code: "15", longname: "Khuzestan" },
            { code: "16", longname: "Kordestan" },
            { code: "22", longname: "Bushehr" },
            { code: "23", longname: "Lorestan" },
            { code: "25", longname: "Semnan" },
            { code: "26", longname: "Tehran" },
            { code: "28", longname: "Esfahan" },
            { code: "29", longname: "Kerman" },
            { code: "32", longname: "Ardabīl" },
            { code: "33", longname: "Āz̄ārbāyjān-e Sharqī" },
            { code: "34", longname: "Markazī" },
            { code: "35", longname: "Māzandarān" },
            { code: "36", longname: "Zanjān" },
            { code: "37", longname: "Golestān" },
            { code: "38", longname: "Qazvīn" },
            { code: "39", longname: "Qom" },
            { code: "40", longname: "Yazd" },
            { code: "41", longname: "Khorāsān-e Janūbī" },
            { code: "42", longname: "Khorāsān-e Razavī" },
            { code: "43", longname: "Khorāsān-e Shemālī" }
        ]
    },
    {
        code: "IS",
        longname: "Iceland",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "38", longname: "Austurland" },
            { code: "39", longname: "Höfuðborgarsvæði" },
            { code: "40", longname: "Norðurland Eystra" },
            { code: "41", longname: "Norðurland Vestra" },
            { code: "42", longname: "Suðurland" },
            { code: "43", longname: "Suðurnes" },
            { code: "44", longname: "Vestfirðir" },
            { code: "45", longname: "Vesturland" }
        ]
    },
    {
        code: "IT",
        longname: "Italy",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Abruzzi" },
            { code: "02", longname: "Basilicata" },
            { code: "03", longname: "Calabria" },
            { code: "04", longname: "Campania" },
            { code: "05", longname: "Emilia-Romagna" },
            { code: "06", longname: "Friuli-Venezia Giulia" },
            { code: "07", longname: "Lazio" },
            { code: "08", longname: "Liguria" },
            { code: "09", longname: "Lombardia" },
            { code: "10", longname: "Marche" },
            { code: "11", longname: "Molise" },
            { code: "12", longname: "Piemonte" },
            { code: "13", longname: "Puglia" },
            { code: "14", longname: "Sardegna" },
            { code: "15", longname: "Sicilia" },
            { code: "16", longname: "Toscana" },
            { code: "17", longname: "Trentino-Alto Adige" },
            { code: "18", longname: "Umbria" },
            { code: "19", longname: "Valle d'Aosta" },
            { code: "20", longname: "Veneto" }
        ]
    },
    {
        code: "JE",
        longname: "Jersey",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "JM",
        longname: "Jamaica",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Clarendon" },
            { code: "02", longname: "Hanover" },
            { code: "04", longname: "Manchester" },
            { code: "07", longname: "Portland" },
            { code: "08", longname: "Saint Andrew" },
            { code: "09", longname: "Saint Ann" },
            { code: "10", longname: "Saint Catherine" },
            { code: "11", longname: "Saint Elizabeth" },
            { code: "12", longname: "Saint James" },
            { code: "13", longname: "Saint Mary" },
            { code: "14", longname: "Saint Thomas" },
            { code: "15", longname: "Trelawny" },
            { code: "16", longname: "Westmoreland" },
            { code: "17", longname: "Kingston" }
        ]
    },
    {
        code: "JO",
        longname: "Jordan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Al Balqa'" },
            { code: "09", longname: "Al Karak" },
            { code: "12", longname: "Aţ Ţafilah" },
            { code: "15", longname: "Al Mafraq" },
            { code: "16", longname: "`Ammān" },
            { code: "17", longname: "Az Zarqā'" },
            { code: "18", longname: "Irbid" },
            { code: "19", longname: "Ma`ān" },
            { code: "20", longname: "'Ajlūn" },
            { code: "21", longname: "Al 'Aqabah" },
            { code: "22", longname: "Jarash" },
            { code: "23", longname: "Mādabā" }
        ]
    },
    {
        code: "JP",
        longname: "Japan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Aichi" },
            { code: "02", longname: "Akita" },
            { code: "03", longname: "Aomori" },
            { code: "04", longname: "Chiba" },
            { code: "05", longname: "Ehime" },
            { code: "06", longname: "Fukui" },
            { code: "07", longname: "Fukuoka" },
            { code: "08", longname: "Fukushima" },
            { code: "09", longname: "Gifu" },
            { code: "10", longname: "Gumma" },
            { code: "11", longname: "Hiroshima" },
            { code: "12", longname: "Hokkaido" },
            { code: "13", longname: "Hyogo" },
            { code: "14", longname: "Ibaraki" },
            { code: "15", longname: "Ishikawa" },
            { code: "16", longname: "Iwate" },
            { code: "17", longname: "Kagawa" },
            { code: "18", longname: "Kagoshima" },
            { code: "19", longname: "Kanagawa" },
            { code: "20", longname: "Kochi" },
            { code: "21", longname: "Kumamoto" },
            { code: "22", longname: "Kyoto" },
            { code: "23", longname: "Mie" },
            { code: "24", longname: "Miyagi" },
            { code: "25", longname: "Miyazaki" },
            { code: "26", longname: "Nagano" },
            { code: "27", longname: "Nagasaki" },
            { code: "28", longname: "Nara" },
            { code: "29", longname: "Niigata" },
            { code: "30", longname: "Oita" },
            { code: "31", longname: "Okayama" },
            { code: "32", longname: "Osaka" },
            { code: "33", longname: "Saga" },
            { code: "34", longname: "Saitama" },
            { code: "35", longname: "Shiga" },
            { code: "36", longname: "Shimane" },
            { code: "37", longname: "Shizuoka" },
            { code: "38", longname: "Tochigi" },
            { code: "39", longname: "Tokushima" },
            { code: "40", longname: "Tokyo" },
            { code: "41", longname: "Tottori" },
            { code: "42", longname: "Toyama" },
            { code: "43", longname: "Wakayama" },
            { code: "44", longname: "Yamagata" },
            { code: "45", longname: "Yamaguchi" },
            { code: "46", longname: "Yamanashi" },
            { code: "47", longname: "Okinawa" }
        ]
    },
    {
        code: "KE",
        longname: "Kenya",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Central" },
            { code: "02", longname: "Coast" },
            { code: "03", longname: "Eastern" },
            { code: "05", longname: "Nairobi Area" },
            { code: "06", longname: "North-Eastern" },
            { code: "07", longname: "Nyanza" },
            { code: "08", longname: "Rift Valley" },
            { code: "09", longname: "Western" }
        ]
    },
    {
        code: "KG",
        longname: "Kyrgyzstan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bishkek" },
            { code: "02", longname: "Chüy" },
            { code: "03", longname: "Jalal-Abad" },
            { code: "04", longname: "Naryn" },
            { code: "06", longname: "Talas" },
            { code: "07", longname: "Ysyk-Köl" },
            { code: "08", longname: "Osh" },
            { code: "09", longname: "Batken" }
        ]
    },
    {
        code: "KH",
        longname: "Cambodia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Kampong Cham" },
            { code: "03", longname: "Kampong Chhnang" },
            { code: "04", longname: "Kampong Spoe" },
            { code: "05", longname: "Kampong Thum" },
            { code: "07", longname: "Kandal" },
            { code: "08", longname: "Kaoh Kong" },
            { code: "09", longname: "Kracheh" },
            { code: "10", longname: "Mondol Kiri" },
            { code: "12", longname: "Pouthisat" },
            { code: "13", longname: "Preah Vihear" },
            { code: "14", longname: "Prey Veng" },
            { code: "17", longname: "Stoeng Treng" },
            { code: "18", longname: "Svay Rieng" },
            { code: "19", longname: "Takev" },
            { code: "21", longname: "Kâmpôt" },
            { code: "22", longname: "Phnum Pénh" },
            { code: "23", longname: "Rôtânăh Kiri" },
            { code: "24", longname: "Siĕm Réab" },
            { code: "25", longname: "Bântéay Méan Cheăy" },
            { code: "26", longname: "Kêb" },
            { code: "27", longname: "Ŏtdâr Méan Cheăy" },
            { code: "28", longname: "Preăh Seihânŭ" },
            { code: "29", longname: "Bătdâmbâng" },
            { code: "30", longname: "Pailĭn" }
        ]
    },
    {
        code: "KI",
        longname: "Kiribati",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Gilbert Islands" },
            { code: "02", longname: "Line Islands" },
            { code: "03", longname: "Phoenix Islands" }
        ]
    },
    {
        code: "KM",
        longname: "Comoros",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Anjouan" },
            { code: "02", longname: "Grande Comore" },
            { code: "03", longname: "Moheli" }
        ]
    },
    {
        code: "KN",
        longname: "St. Kitts And Nevis",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Christ Church Nichola Town" },
            { code: "02", longname: "Saint Anne Sandy Point" },
            { code: "03", longname: "Saint George Basseterre" },
            { code: "04", longname: "Saint George Gingerland" },
            { code: "05", longname: "Saint James Windward" },
            { code: "06", longname: "Saint John Capisterre" },
            { code: "07", longname: "Saint John Figtree" },
            { code: "08", longname: "Saint Mary Cayon" },
            { code: "09", longname: "Saint Paul Capisterre" },
            { code: "10", longname: "Saint Paul Charlestown" },
            { code: "11", longname: "Saint Peter Basseterre" },
            { code: "12", longname: "Saint Thomas Lowland" },
            { code: "13", longname: "Saint Thomas Middle Island" },
            { code: "15", longname: "Trinity Palmetto Point" }
        ]
    },
    {
        code: "KP",
        longname: "Korea, Democratic People's Republic Of",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Chagang-do" },
            { code: "03", longname: "Hamgyong-namdo" },
            { code: "06", longname: "Hwanghae-namdo" },
            { code: "07", longname: "Hwanghae-bukto" },
            { code: "08", longname: "Kaesong-si" },
            { code: "09", longname: "Kangwon-do" },
            { code: "11", longname: "P'yongan-bukto" },
            { code: "12", longname: "P'yongyang-si" },
            { code: "13", longname: "Yanggang-do" },
            { code: "14", longname: "Namp'o-si" },
            { code: "15", longname: "P'yongan-namdo" },
            { code: "17", longname: "Hamgyŏng-bukto" },
            { code: "18", longname: "Najin Sŏnbong-si" }
        ]
    },
    {
        code: "KR",
        longname: "Korea, Republic Of",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Cheju-do" },
            { code: "03", longname: "Cholla-bukto" },
            { code: "05", longname: "Ch'ungch'ong-bukto" },
            { code: "06", longname: "Kangwon-do" },
            { code: "10", longname: "Pusan-gwangyŏksi" },
            { code: "11", longname: "Soul-t'ukpyolsi" },
            { code: "12", longname: "Inch'ŏn-gwangyŏksi" },
            { code: "13", longname: "Kyonggi-do" },
            { code: "14", longname: "Kyongsang-bukto" },
            { code: "15", longname: "Taegu-gwangyŏksi" },
            { code: "16", longname: "Cholla-namdo" },
            { code: "17", longname: "Ch'ungch'ong-namdo" },
            { code: "18", longname: "Kwangju-gwangyŏksi" },
            { code: "19", longname: "Taejon-gwangyŏksi" },
            { code: "20", longname: "Kyŏngsang-namdo" },
            { code: "21", longname: "Ulsan-gwangyŏksi" }
        ]
    },
    {
        code: "KW",
        longname: "Kuwait",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Al 'Āşimah" },
            { code: "04", longname: "Al Aḩmadī" },
            { code: "05", longname: "Al Jahrā'" },
            { code: "07", longname: "Al Farwānīyah" },
            { code: "08", longname: "Ḩawallī" },
            { code: "09", longname: "Mubārak al Kabīr" }
        ]
    },
    {
        code: "KY",
        longname: "Cayman Islands",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Creek" },
            { code: "02", longname: "Eastern" },
            { code: "03", longname: "Midland" },
            { code: "04", longname: "South Town" },
            { code: "05", longname: "Spot Bay" },
            { code: "06", longname: "Stake Bay" },
            { code: "07", longname: "West End" },
            { code: "08", longname: "Western" }
        ]
    },
    {
        code: "KZ",
        longname: "Kazakhstan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Almaty" },
            { code: "02", longname: "Almaty" },
            { code: "03", longname: "Aqmola" },
            { code: "04", longname: "Aqtöbe" },
            { code: "05", longname: "Astana" },
            { code: "06", longname: "Atyraū" },
            { code: "07", longname: "Batys Qazaqstan" },
            { code: "08", longname: "Bayqongyr" },
            { code: "09", longname: "Mangghystaū" },
            { code: "10", longname: "Ongtüstik Qazaqstan" },
            { code: "11", longname: "Pavlodar" },
            { code: "12", longname: "Qaraghandy" },
            { code: "13", longname: "Qostanay" },
            { code: "14", longname: "Qyzylorda" },
            { code: "15", longname: "Shyghys Qazaqstan" },
            { code: "16", longname: "Soltüstik Qazaqstan" },
            { code: "17", longname: "Zhambyl" }
        ]
    },
    {
        code: "LA",
        longname: "Laos",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Attopeu" },
            { code: "02", longname: "Champassak" },
            { code: "03", longname: "Houa Phan" },
            { code: "07", longname: "Oudomxai" },
            { code: "13", longname: "Sayaboury" },
            { code: "14", longname: "Xieng Khouang                        " },
            { code: "15", longname: "Khammouane" },
            { code: "16", longname: "Houa Khong" },
            { code: "17", longname: "Luang Prabang" },
            { code: "18", longname: "Phong Saly" },
            { code: "19", longname: "Saravane" },
            { code: "20", longname: "Savannahkhét" },
            { code: "22", longname: "Bokèo" },
            { code: "23", longname: "Bolikhamxai" },
            { code: "24", longname: "Viangchan" },
            { code: "25", longname: "Xaisômboun" },
            { code: "26", longname: "Xékong" },
            { code: "27", longname: "Viangchan" }
        ]
    },
    {
        code: "LB",
        longname: "Lebanon",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "04", longname: "Beyrouth" },
            { code: "05", longname: "Mont-Liban" },
            { code: "06", longname: "Liban-Sud" },
            { code: "07", longname: "Nabatîyé" },
            { code: "08", longname: "Béqaa" },
            { code: "09", longname: "Liban-Nord" },
            { code: "10", longname: "Aakkâr" },
            { code: "11", longname: "Baalbek-Hermel" }
        ]
    },
    {
        code: "LC",
        longname: "St. Lucia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Anse-la-Raye" },
            { code: "02", longname: "Dauphin" },
            { code: "03", longname: "Castries" },
            { code: "04", longname: "Choiseul" },
            { code: "05", longname: "Dennery" },
            { code: "06", longname: "Gros-Islet" },
            { code: "07", longname: "Laborie" },
            { code: "08", longname: "Micoud" },
            { code: "09", longname: "Soufriere" },
            { code: "10", longname: "Vieux-Fort" },
            { code: "11", longname: "Praslin" }
        ]
    },
    {
        code: "LI",
        longname: "Liechtenstein",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Balzers" },
            { code: "02", longname: "Eschen" },
            { code: "03", longname: "Gamprin" },
            { code: "04", longname: "Mauren" },
            { code: "05", longname: "Planken" },
            { code: "06", longname: "Ruggell" },
            { code: "07", longname: "Schaan" },
            { code: "08", longname: "Schellenberg" },
            { code: "09", longname: "Triesen" },
            { code: "10", longname: "Triesenberg" },
            { code: "11", longname: "Vaduz" }
        ]
    },
    {
        code: "LK",
        longname: "Sri Lanka",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Amparai" },
            { code: "02", longname: "Anuradhapura" },
            { code: "03", longname: "Badulla" },
            { code: "04", longname: "Batticaloa" },
            { code: "06", longname: "Galle" },
            { code: "07", longname: "Hambantota" },
            { code: "09", longname: "Kalutara" },
            { code: "10", longname: "Kandy" },
            { code: "11", longname: "Kegalla" },
            { code: "12", longname: "Kurunegala" },
            { code: "14", longname: "Matale" },
            { code: "15", longname: "Matara" },
            { code: "16", longname: "Moneragala" },
            { code: "17", longname: "Nuwara Eliya" },
            { code: "18", longname: "Polonnaruwa" },
            { code: "19", longname: "Puttalam" },
            { code: "20", longname: "Ratnapura" },
            { code: "21", longname: "Trincomalee" },
            { code: "23", longname: "Colombo" },
            { code: "24", longname: "Gampaha" },
            { code: "25", longname: "Jaffna" },
            { code: "26", longname: "Mannar" },
            { code: "27", longname: "Mullaittivu" },
            { code: "28", longname: "Vavuniya" }
        ]
    },
    {
        code: "LR",
        longname: "Liberia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bong" },
            { code: "07", longname: "Monrovia" },
            { code: "09", longname: "Nimba" },
            { code: "10", longname: "Sinoe" },
            { code: "11", longname: "Grand Bassa" },
            { code: "12", longname: "Grand Cape Mount" },
            { code: "13", longname: "Maryland" },
            { code: "14", longname: "Montserrado" },
            { code: "19", longname: "Grand Gedeh" },
            { code: "20", longname: "Lofa" },
            { code: "21", longname: "Gbarpolu" },
            { code: "22", longname: "River Gee" }
        ]
    },
    {
        code: "LS",
        longname: "Lesotho",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "10", longname: "Berea" },
            { code: "11", longname: "Butha-Buthe" },
            { code: "12", longname: "Leribe" },
            { code: "13", longname: "Mafeteng" },
            { code: "14", longname: "Maseru" },
            { code: "15", longname: "Mohales Hoek" },
            { code: "16", longname: "Mokhotlong" },
            { code: "17", longname: "Qachas Nek" },
            { code: "18", longname: "Quthing" },
            { code: "19", longname: "Thaba-Tseka" }
        ]
    },
    {
        code: "LT",
        longname: "Lithuania",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "56", longname: "Alytaus Apskritis" },
            { code: "57", longname: "Kauno Apskritis" },
            { code: "58", longname: "Klaipėdos Apskritis" },
            { code: "59", longname: "Marijampolėªs Apskritis" },
            { code: "60", longname: "Panevėžio Apskritis" },
            { code: "61", longname: "Šiaulių Apskritis" },
            { code: "62", longname: "Tauragės Apskritis" },
            { code: "63", longname: "Telšių Apskritis" },
            { code: "64", longname: "Utenos Apskritis" },
            { code: "65", longname: "Vilniaus Apskritis" }
        ]
    },
    {
        code: "LU",
        longname: "Luxembourg",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Diekirch" },
            { code: "02", longname: "Grevenmacher" },
            { code: "03", longname: "Luxembourg" }
        ]
    },
    {
        code: "LV",
        longname: "Latvia",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "LY",
        longname: "Libya",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "03", longname: "Al `Aziziyah" },
            { code: "05", longname: "Al Jufrah" },
            { code: "08", longname: "Al Kufrah" },
            { code: "13", longname: "Ash Shati'" },
            { code: "30", longname: "Murzuq" },
            { code: "34", longname: "Sabha" },
            { code: "41", longname: "Tarhunah" },
            { code: "42", longname: "Tubruq" },
            { code: "45", longname: "Zlitan" },
            { code: "47", longname: "Ajdabiya" },
            { code: "48", longname: "Al Fatih" },
            { code: "49", longname: "Al Jabal al Akhdar" },
            { code: "50", longname: "Al Khums" },
            { code: "51", longname: "An Nuqat al Khams" },
            { code: "52", longname: "Awbari" },
            { code: "53", longname: "Az Zawiyah" },
            { code: "54", longname: "Banghazi" },
            { code: "55", longname: "Darnah" },
            { code: "56", longname: "Ghadamis" },
            { code: "57", longname: "Gharyan" },
            { code: "58", longname: "Misratah" },
            { code: "59", longname: "Sawfajjin" },
            { code: "60", longname: "Surt" },
            { code: "61", longname: "Tarabulus" },
            { code: "62", longname: "Yafran" }
        ]
    },
    {
        code: "MA",
        longname: "Morocco",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "45", longname: "Grand Casablanca" },
            { code: "46", longname: "Fès-Boulemane" },
            { code: "47", longname: "Marrakech-Tensift-Al Haouz" },
            { code: "48", longname: "Meknès-Tafilalet" },
            { code: "49", longname: "Rabat-Salé-Zemmour-Zaër" },
            { code: "50", longname: "Chaouia-Ouardigha" },
            { code: "51", longname: "Doukkala-Abda" },
            { code: "52", longname: "Gharb-Chrarda-Beni Hssen" },
            { code: "53", longname: "Guelmim-Es Smara" },
            { code: "54", longname: "Oriental" },
            { code: "55", longname: "Souss-Massa-Drâa" },
            { code: "56", longname: "Tadla-Azilal" },
            { code: "57", longname: "Tanger-Tétouan" },
            { code: "58", longname: "Taza-Al Hoceima-Taounate" },
            { code: "59", longname: "Laâyoune-Boujdour-Sakia El Hamra" }
        ]
    },
    {
        code: "MC",
        longname: "Monaco",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "MD",
        longname: "Moldova",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "51", longname: "Găgăuzia" },
            { code: "57", longname: "Chişinău" },
            { code: "58", longname: "Stînga Nistrului" },
            { code: "59", longname: "Anenii Noi" },
            { code: "60", longname: "Bălţi" },
            { code: "61", longname: "Basarabeasca" },
            { code: "62", longname: "Bender" },
            { code: "63", longname: "Briceni" },
            { code: "64", longname: "Cahul" },
            { code: "65", longname: "Cantemir" },
            { code: "66", longname: "Călăraşi" },
            { code: "67", longname: "Căuşeni" },
            { code: "68", longname: "Cimişlia" },
            { code: "69", longname: "Criuleni" },
            { code: "70", longname: "Donduşeni" },
            { code: "71", longname: "Drochia" },
            { code: "72", longname: "Dubăsari" },
            { code: "73", longname: "Edineţ" },
            { code: "74", longname: "Făleşti" },
            { code: "75", longname: "Floreşti" },
            { code: "76", longname: "Glodeni" },
            { code: "77", longname: "Hînceşti" },
            { code: "78", longname: "Ialoveni" },
            { code: "79", longname: "Leova" },
            { code: "80", longname: "Nisporeni" },
            { code: "81", longname: "Ocniţa" },
            { code: "82", longname: "Orhei" },
            { code: "83", longname: "Rezina" },
            { code: "84", longname: "Rîşcani" },
            { code: "85", longname: "Sîngerei" },
            { code: "86", longname: "Şoldăneşti" },
            { code: "87", longname: "Soroca" },
            { code: "88", longname: "Ştefan-Vodă" },
            { code: "89", longname: "Străşeni" },
            { code: "90", longname: "Taraclia" },
            { code: "91", longname: "Teleneşti" },
            { code: "92", longname: "Ungheni" }
        ]
    },
    {
        code: "ME",
        longname: "Montenegro",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "MF",
        longname: "St. Martin (French part)",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "MG",
        longname: "Madagascar",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Antsiranana" },
            { code: "02", longname: "Fianarantsoa" },
            { code: "03", longname: "Mahajanga" },
            { code: "04", longname: "Toamasina" },
            { code: "05", longname: "Antananarivo" },
            { code: "06", longname: "Toliara" }
        ]
    },
    {
        code: "MH",
        longname: "Marshall Islands",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "MK",
        longname: "Macedonia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Aračinovo" },
            { code: "02", longname: "Bač" },
            { code: "03", longname: "Belčišta" },
            { code: "04", longname: "Berovo" },
            { code: "05", longname: "Bistrica" },
            { code: "06", longname: "Bitola" },
            { code: "07", longname: "Blatec" },
            { code: "08", longname: "Bogdanci" },
            { code: "09", longname: "Bogomila" },
            { code: "10", longname: "Bogovinje" },
            { code: "11", longname: "Bosilovo" },
            { code: "12", longname: "Brvenica" },
            { code: "13", longname: "Čair" },
            { code: "14", longname: "Capari" },
            { code: "15", longname: "Čaška" },
            { code: "16", longname: "Čegrane" },
            { code: "17", longname: "Centar" },
            { code: "18", longname: "Centar Župa" },
            { code: "19", longname: "Češinovo" },
            { code: "20", longname: "Čučer-Sandevo" },
            { code: "21", longname: "Debar" },
            { code: "22", longname: "Delčevo" },
            { code: "23", longname: "Delogoždi" },
            { code: "24", longname: "Demir Hisar" },
            { code: "25", longname: "Demir Kapija" },
            { code: "26", longname: "Dobruševo" },
            { code: "27", longname: "Dolna Banjica" },
            { code: "28", longname: "Dolneni" },
            { code: "29", longname: "Đorče Petrov" },
            { code: "30", longname: "Drugovo" },
            { code: "31", longname: "Džepčište" },
            { code: "32", longname: "Gazi Baba" },
            { code: "33", longname: "Gevgelija" },
            { code: "34", longname: "Gostivar" },
            { code: "35", longname: "Gradsko" },
            { code: "36", longname: "Ilinden" },
            { code: "37", longname: "Izvor" },
            { code: "38", longname: "Jegunovce" },
            { code: "39", longname: "Kamenjane" },
            { code: "40", longname: "Karbinci" },
            { code: "41", longname: "Karpoš" },
            { code: "42", longname: "Kavadarci" },
            { code: "43", longname: "Kičevo" },
            { code: "44", longname: "Kisela Voda" },
            { code: "45", longname: "Klečevce" },
            { code: "46", longname: "Kočani" },
            { code: "47", longname: "Konče" },
            { code: "48", longname: "Kondovo" },
            { code: "49", longname: "Konopište" },
            { code: "50", longname: "Kosel" },
            { code: "51", longname: "Kratovo" },
            { code: "52", longname: "Kriva Palanka" },
            { code: "53", longname: "Krivogaštani" },
            { code: "54", longname: "Kruševo" },
            { code: "55", longname: "Kukliš" },
            { code: "56", longname: "Kukurečani" },
            { code: "57", longname: "Kumanovo" },
            { code: "58", longname: "Labuništa" },
            { code: "59", longname: "Lipkovo" },
            { code: "60", longname: "Lozovo" },
            { code: "61", longname: "Lukovo" },
            { code: "62", longname: "Makedonska Kamenica" },
            { code: "63", longname: "Makedonski Brod" },
            { code: "64", longname: "Mavrovi Anovi" },
            { code: "65", longname: "Mešeišta" },
            { code: "66", longname: "Miravci" },
            { code: "67", longname: "Mogila" },
            { code: "68", longname: "Murtino" },
            { code: "69", longname: "Negotino" },
            { code: "70", longname: "Negotino-Pološko" },
            { code: "71", longname: "Novaci" },
            { code: "72", longname: "Novo Selo" },
            { code: "73", longname: "Obleševo" },
            { code: "74", longname: "Ohrid" },
            { code: "75", longname: "Orašac" },
            { code: "76", longname: "Orizari" },
            { code: "77", longname: "Oslomej" },
            { code: "78", longname: "Pehčevo" },
            { code: "79", longname: "Petrovec" },
            { code: "80", longname: "Plasnica" },
            { code: "81", longname: "Podareš" },
            { code: "82", longname: "Prilep" },
            { code: "83", longname: "Probištip" },
            { code: "84", longname: "Radoviš" },
            { code: "85", longname: "Rankovce" },
            { code: "86", longname: "Resen" },
            { code: "87", longname: "Rosoman" },
            { code: "88", longname: "Rostuša" },
            { code: "89", longname: "Samokov" },
            { code: "90", longname: "Saraj" },
            { code: "91", longname: "Šipkovica" },
            { code: "92", longname: "Sopište" },
            { code: "93", longname: "Sopotnica" },
            { code: "94", longname: "Srbinovo" },
            { code: "95", longname: "Staravina" },
            { code: "96", longname: "Star Dojran" },
            { code: "97", longname: "Staro Nagoričane" },
            { code: "98", longname: "Štip" },
            { code: "99", longname: "Struga" }
        ]
    },
    {
        code: "ML",
        longname: "Mali",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bamako" },
            { code: "03", longname: "Kayes" },
            { code: "04", longname: "Mopti" },
            { code: "05", longname: "Segou" },
            { code: "06", longname: "Sikasso" },
            { code: "07", longname: "Koulikoro" },
            { code: "08", longname: "Tombouctou" },
            { code: "09", longname: "Gao" },
            { code: "10", longname: "Kidal" }
        ]
    },
    {
        code: "MM",
        longname: "Myanmar",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Rakhine State" },
            { code: "02", longname: "Chin State" },
            { code: "03", longname: "Ayeyarwady" },
            { code: "04", longname: "Kachin State" },
            { code: "05", longname: "Kayin State" },
            { code: "06", longname: "Kayah State" },
            { code: "08", longname: "Mandalay" },
            { code: "10", longname: "Sagaing" },
            { code: "11", longname: "Shan State" },
            { code: "12", longname: "Tanintharyi" },
            { code: "13", longname: "Mon State" },
            { code: "15", longname: "Magway" },
            { code: "16", longname: "Bago" },
            { code: "17", longname: "Yangon" }
        ]
    },
    {
        code: "MN",
        longname: "Mongolia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Arhangay" },
            { code: "02", longname: "Bayanhongor" },
            { code: "03", longname: "Bayan-Olgiy" },
            { code: "06", longname: "Dornod" },
            { code: "07", longname: "Dornogovi" },
            { code: "08", longname: "Dundgovi" },
            { code: "09", longname: "Dzavhan" },
            { code: "10", longname: "Govi-Altay" },
            { code: "11", longname: "Hentiy" },
            { code: "12", longname: "Hovd" },
            { code: "13", longname: "Hovsgol" },
            { code: "14", longname: "Omnogovi" },
            { code: "15", longname: "Ovorhangay" },
            { code: "16", longname: "Selenge" },
            { code: "17", longname: "Suhbaatar" },
            { code: "18", longname: "Tov" },
            { code: "19", longname: "Uvs" },
            { code: "20", longname: "Ulaanbaatar" },
            { code: "21", longname: "Bulgan" },
            { code: "23", longname: "Darhan-Uul" },
            { code: "24", longname: "Govĭsumber" },
            { code: "25", longname: "Orhon" }
        ]
    },
    {
        code: "MO",
        longname: "Macao",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ilhas" },
            { code: "02", longname: "Macao" }
        ]
    },
    {
        code: "MP",
        longname: "Northern Mariana Islands",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "MQ",
        longname: "Martinique",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "MR",
        longname: "Mauritania",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Premiere Region" },
            { code: "02", longname: "Deuxieme Region" },
            { code: "03", longname: "Troisieme Region" },
            { code: "04", longname: "Quatrieme Region" },
            { code: "05", longname: "Cinquieme Region" },
            { code: "06", longname: "Sixieme Region" },
            { code: "07", longname: "Septieme Region" },
            { code: "08", longname: "Huitieme Region" },
            { code: "09", longname: "Neuvieme Region" },
            { code: "10", longname: "Dixieme Region" },
            { code: "11", longname: "Onzieme Region" },
            { code: "12", longname: "Douzieme Region" }
        ]
    },
    {
        code: "MS",
        longname: "Montserrat",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Saint Anthony" },
            { code: "02", longname: "Saint Georges" },
            { code: "03", longname: "Saint Peter" }
        ]
    },
    {
        code: "MT",
        longname: "Malta",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "MU",
        longname: "Mauritius",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "12", longname: "Black River" },
            { code: "13", longname: "Flacq" },
            { code: "14", longname: "Grand Port" },
            { code: "15", longname: "Moka" },
            { code: "16", longname: "Pamplemousses" },
            { code: "17", longname: "Plaines Wilhems" },
            { code: "18", longname: "Port Louis" },
            { code: "19", longname: "Riviere du Rempart" },
            { code: "20", longname: "Savanne" },
            { code: "21", longname: "Agalega Islands" },
            { code: "22", longname: "Cargados Carajos" },
            { code: "23", longname: "Rodrigues" }
        ]
    },
    {
        code: "MV",
        longname: "Maldives",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Seenu" },
            { code: "05", longname: "Laamu" },
            { code: "30", longname: "Alifu" },
            { code: "31", longname: "Baa" },
            { code: "32", longname: "Dhaalu" },
            { code: "33", longname: "Faafu" },
            { code: "34", longname: "Gaafu Alifu" },
            { code: "35", longname: "Gaafu Dhaalu" },
            { code: "36", longname: "Haa Alifu" },
            { code: "37", longname: "Haa Dhaalu" },
            { code: "38", longname: "Kaafu" },
            { code: "39", longname: "Lhaviyani" },
            { code: "40", longname: "Maale" },
            { code: "41", longname: "Meemu" },
            { code: "42", longname: "Gnaviyani" },
            { code: "43", longname: "Noonu" },
            { code: "44", longname: "Raa" },
            { code: "45", longname: "Shaviyani" },
            { code: "46", longname: "Thaa" },
            { code: "47", longname: "Vaavu" }
        ]
    },
    {
        code: "MW",
        longname: "Malawi",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Chikwawa" },
            { code: "03", longname: "Chiradzulu" },
            { code: "04", longname: "Chitipa" },
            { code: "05", longname: "Thyolo" },
            { code: "06", longname: "Dedza" },
            { code: "07", longname: "Dowa" },
            { code: "08", longname: "Karonga" },
            { code: "09", longname: "Kasungu" },
            { code: "11", longname: "Lilongwe" },
            { code: "12", longname: "Fort Johnston" },
            { code: "13", longname: "Mchinji" },
            { code: "15", longname: "Mzimba" },
            { code: "16", longname: "Ntcheu" },
            { code: "17", longname: "Nkhata Bay" },
            { code: "18", longname: "Nkhotakota" },
            { code: "19", longname: "Nsanje" },
            { code: "20", longname: "Nchisi" },
            { code: "21", longname: "Rumpi" },
            { code: "22", longname: "Salima" },
            { code: "23", longname: "Zomba" },
            { code: "24", longname: "Blantyre" },
            { code: "25", longname: "Mwanza" },
            { code: "26", longname: "Balaka" },
            { code: "27", longname: "Likoma" },
            { code: "28", longname: "Kasupe" },
            { code: "29", longname: "Mlange" },
            { code: "30", longname: "Phalombe" }
        ]
    },
    {
        code: "MX",
        longname: "Mexico",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Aguascalientes" },
            { code: "02", longname: "Baja California" },
            { code: "03", longname: "Baja California Sur" },
            { code: "04", longname: "Campeche" },
            { code: "05", longname: "Chiapas" },
            { code: "06", longname: "Chihuahua" },
            { code: "07", longname: "Coahuila de Zaragoza" },
            { code: "08", longname: "Colima" },
            { code: "09", longname: "Distrito Federal" },
            { code: "10", longname: "Durango" },
            { code: "11", longname: "Guanajuato" },
            { code: "12", longname: "Guerrero" },
            { code: "13", longname: "Hidalgo" },
            { code: "14", longname: "Jalisco" },
            { code: "15", longname: "Mexico" },
            { code: "16", longname: "Michoacan de Ocampo" },
            { code: "17", longname: "Morelos" },
            { code: "18", longname: "Nayarit" },
            { code: "19", longname: "Nuevo Leon" },
            { code: "20", longname: "Oaxaca" },
            { code: "21", longname: "Puebla" },
            { code: "22", longname: "Queretaro de Arteaga" },
            { code: "23", longname: "Quintana Roo" },
            { code: "24", longname: "San Luis Potosi" },
            { code: "25", longname: "Sinaloa" },
            { code: "26", longname: "Sonora" },
            { code: "27", longname: "Tabasco" },
            { code: "28", longname: "Tamaulipas" },
            { code: "29", longname: "Tlaxcala" },
            { code: "30", longname: "Veracruz-Llave" },
            { code: "31", longname: "Yucatan" },
            { code: "32", longname: "Zacatecas" }
        ]
    },
    {
        code: "MY",
        longname: "Malaysia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Johor" },
            { code: "02", longname: "Kedah" },
            { code: "03", longname: "Kelantan" },
            { code: "04", longname: "Melaka" },
            { code: "05", longname: "Negeri Sembilan" },
            { code: "06", longname: "Pahang" },
            { code: "07", longname: "Perak" },
            { code: "08", longname: "Perlis" },
            { code: "09", longname: "Pulau Pinang" },
            { code: "11", longname: "Sarawak" },
            { code: "12", longname: "Selangor" },
            { code: "13", longname: "Terengganu" },
            { code: "14", longname: "Kuala Lumpur" },
            { code: "15", longname: "Labuan" },
            { code: "16", longname: "Sabah" },
            { code: "17", longname: "Putrajaya" }
        ]
    },
    {
        code: "MZ",
        longname: "Mozambique",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Cabo Delgado" },
            { code: "02", longname: "Gaza" },
            { code: "03", longname: "Inhambane" },
            { code: "04", longname: "Maputo" },
            { code: "05", longname: "Sofala" },
            { code: "06", longname: "Nampula" },
            { code: "07", longname: "Niassa" },
            { code: "08", longname: "Tete" },
            { code: "09", longname: "Zambezia" },
            { code: "10", longname: "Manica" },
            { code: "11", longname: "Maputo" }
        ]
    },
    {
        code: "NA",
        longname: "Namibia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "21", longname: "Khomas" },
            { code: "28", longname: "Caprivi" },
            { code: "29", longname: "Erongo" },
            { code: "30", longname: "Hardap" },
            { code: "31", longname: "Karas" },
            { code: "32", longname: "Kunene" },
            { code: "33", longname: "Ohangwena" },
            { code: "34", longname: "Okavango" },
            { code: "35", longname: "Omaheke" },
            { code: "36", longname: "Omusati" },
            { code: "37", longname: "Oshana" },
            { code: "38", longname: "Oshikoto" },
            { code: "39", longname: "Otjozondjupa" }
        ]
    },
    {
        code: "NC",
        longname: "New Caledonia",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "NE",
        longname: "Niger",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Agadez" },
            { code: "02", longname: "Diffa" },
            { code: "03", longname: "Dosso" },
            { code: "04", longname: "Maradi" },
            { code: "06", longname: "Tahoua" },
            { code: "07", longname: "Zinder" },
            { code: "08", longname: "Niamey" },
            { code: "09", longname: "Tillabéri" }
        ]
    },
    {
        code: "NF",
        longname: "Norfolk Island",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "NG",
        longname: "Nigeria",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "05", longname: "Lagos" },
            { code: "11", longname: "Federal Capital Territory" },
            { code: "16", longname: "Ogun" },
            { code: "21", longname: "Akwa Ibom" },
            { code: "22", longname: "Cross River" },
            { code: "23", longname: "Kaduna" },
            { code: "24", longname: "Katsina" },
            { code: "25", longname: "Anambra" },
            { code: "26", longname: "Benue" },
            { code: "27", longname: "Borno" },
            { code: "28", longname: "Imo" },
            { code: "29", longname: "Kano" },
            { code: "30", longname: "Kwara" },
            { code: "31", longname: "Niger" },
            { code: "32", longname: "Oyo" },
            { code: "35", longname: "Adamawa" },
            { code: "36", longname: "Delta" },
            { code: "37", longname: "Edo" },
            { code: "39", longname: "Jigawa" },
            { code: "40", longname: "Kebbi" },
            { code: "41", longname: "Kogi" },
            { code: "42", longname: "Osun" },
            { code: "43", longname: "Taraba" },
            { code: "44", longname: "Yobe" },
            { code: "45", longname: "Abia" },
            { code: "46", longname: "Bauchi" },
            { code: "47", longname: "Enugu" },
            { code: "48", longname: "Ondo" },
            { code: "49", longname: "Plateau" },
            { code: "50", longname: "Rivers" },
            { code: "51", longname: "Sokoto" },
            { code: "52", longname: "Bayelsa" },
            { code: "53", longname: "Ebonyi" },
            { code: "54", longname: "Ekiti" },
            { code: "55", longname: "Gombe" },
            { code: "56", longname: "Nassarawa" },
            { code: "57", longname: "Zamfara" }
        ]
    },
    {
        code: "NI",
        longname: "Nicaragua",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Boaco" },
            { code: "02", longname: "Carazo" },
            { code: "03", longname: "Chinandega" },
            { code: "04", longname: "Chontales" },
            { code: "05", longname: "Esteli" },
            { code: "06", longname: "Granada" },
            { code: "07", longname: "Jinotega" },
            { code: "08", longname: "Leon" },
            { code: "09", longname: "Madriz" },
            { code: "10", longname: "Managua" },
            { code: "11", longname: "Masaya" },
            { code: "12", longname: "Matagalpa" },
            { code: "13", longname: "Nueva Segovia" },
            { code: "14", longname: "Rio San Juan" },
            { code: "15", longname: "Rivas" },
            { code: "17", longname: "Atlántico Norte" },
            { code: "18", longname: "Atlántico Sur" }
        ]
    },
    {
        code: "NL",
        longname: "Netherlands",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Drenthe" },
            { code: "02", longname: "Friesland" },
            { code: "03", longname: "Gelderland" },
            { code: "04", longname: "Groningen" },
            { code: "05", longname: "Limburg" },
            { code: "06", longname: "Noord-Brabant" },
            { code: "07", longname: "Noord-Holland" },
            { code: "09", longname: "Utrecht" },
            { code: "10", longname: "Zeeland" },
            { code: "11", longname: "Zuid-Holland" },
            { code: "15", longname: "Overijssel" },
            { code: "16", longname: "Flevoland" }
        ]
    },
    {
        code: "NO",
        longname: "Norway",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Akershus" },
            { code: "02", longname: "Aust-Agder" },
            { code: "04", longname: "Buskerud" },
            { code: "05", longname: "Finnmark" },
            { code: "06", longname: "Hedmark" },
            { code: "07", longname: "Hordaland" },
            { code: "08", longname: "More og Romsdal" },
            { code: "09", longname: "Nordland" },
            { code: "10", longname: "Nord-Trondelag" },
            { code: "11", longname: "Oppland" },
            { code: "12", longname: "Oslo" },
            { code: "13", longname: "Ostfold" },
            { code: "14", longname: "Rogaland" },
            { code: "15", longname: "Sogn og Fjordane" },
            { code: "16", longname: "Sor-Trondelag" },
            { code: "17", longname: "Telemark" },
            { code: "18", longname: "Troms" },
            { code: "19", longname: "Vest-Agder" },
            { code: "20", longname: "Vestfold" }
        ]
    },
    {
        code: "NP",
        longname: "Nepal",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bagmati" },
            { code: "02", longname: "Bheri" },
            { code: "03", longname: "Dhawalagiri" },
            { code: "04", longname: "Gandaki" },
            { code: "05", longname: "Janakpur" },
            { code: "06", longname: "Karnali" },
            { code: "07", longname: "Kosi" },
            { code: "08", longname: "Lumbini" },
            { code: "09", longname: "Mahakali" },
            { code: "10", longname: "Mechi" },
            { code: "11", longname: "Narayani" },
            { code: "12", longname: "Rapti" },
            { code: "13", longname: "Sagarmatha" },
            { code: "14", longname: "Seti" }
        ]
    },
    {
        code: "NR",
        longname: "Nauru",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Aiwo" },
            { code: "02", longname: "Anabar" },
            { code: "03", longname: "Anetan" },
            { code: "04", longname: "Anibare" },
            { code: "05", longname: "Baiti" },
            { code: "06", longname: "Boe" },
            { code: "07", longname: "Buada" },
            { code: "08", longname: "Denigomodu" },
            { code: "09", longname: "Ewa" },
            { code: "10", longname: "Ijuw" },
            { code: "11", longname: "Meneng" },
            { code: "12", longname: "Nibok" },
            { code: "13", longname: "Uaboe" },
            { code: "14", longname: "Yaren" }
        ]
    },
    {
        code: "NU",
        longname: "Niue",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "NZ",
        longname: "New Zealand",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "10", longname: "Chatham Islands" }
        ]
    },
    {
        code: "OM",
        longname: "Oman",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ad Dākhilīyah" },
            { code: "02", longname: "Al Bāţinah" },
            { code: "03", longname: "Al Wusţá" },
            { code: "04", longname: "Ash Sharqīyah" },
            { code: "06", longname: "Masqaţ" },
            { code: "07", longname: "Musandam" },
            { code: "08", longname: "Z̧ufār" },
            { code: "09", longname: "Az̧ Z̧āhirah" },
            { code: "10", longname: "Al Buraymī" }
        ]
    },
    {
        code: "PA",
        longname: "Panama",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bocas del Toro" },
            { code: "02", longname: "Chiriqui" },
            { code: "03", longname: "Cocle" },
            { code: "04", longname: "Colon" },
            { code: "05", longname: "Darien" },
            { code: "06", longname: "Herrera" },
            { code: "07", longname: "Los Santos" },
            { code: "08", longname: "Panama" },
            { code: "09", longname: "San Blas" },
            { code: "10", longname: "Veraguas" }
        ]
    },
    {
        code: "PE",
        longname: "Peru",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Amazonas" },
            { code: "02", longname: "Ancash" },
            { code: "03", longname: "Apurimac" },
            { code: "04", longname: "Arequipa" },
            { code: "05", longname: "Ayacucho" },
            { code: "06", longname: "Cajamarca" },
            { code: "07", longname: "Callao" },
            { code: "08", longname: "Cusco" },
            { code: "09", longname: "Huancavelica" },
            { code: "10", longname: "Huanuco" },
            { code: "11", longname: "Ica" },
            { code: "12", longname: "Junin" },
            { code: "13", longname: "La Libertad" },
            { code: "14", longname: "Lambayeque" },
            { code: "15", longname: "Lima" },
            { code: "16", longname: "Loreto" },
            { code: "17", longname: "Madre de Dios" },
            { code: "18", longname: "Moquegua" },
            { code: "19", longname: "Pasco" },
            { code: "20", longname: "Piura" },
            { code: "21", longname: "Puno" },
            { code: "22", longname: "San Martin" },
            { code: "23", longname: "Tacna" },
            { code: "24", longname: "Tumbes" },
            { code: "25", longname: "Ucayali" }
        ]
    },
    {
        code: "PF",
        longname: "French Polynesia",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "PG",
        longname: "Papua New Guinea",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Central" },
            { code: "02", longname: "Gulf" },
            { code: "03", longname: "Milne Bay" },
            { code: "04", longname: "Northern" },
            { code: "05", longname: "Southern Highlands" },
            { code: "06", longname: "Western" },
            { code: "07", longname: "Boungainville" },
            { code: "08", longname: "Chimbu" },
            { code: "09", longname: "Eastern Highlands" },
            { code: "10", longname: "East New Britain" },
            { code: "11", longname: "East Sepik" },
            { code: "12", longname: "Madang" },
            { code: "13", longname: "Manus" },
            { code: "14", longname: "Morobe" },
            { code: "15", longname: "New Ireland" },
            { code: "16", longname: "Western Highlands" },
            { code: "17", longname: "West New Britain" },
            { code: "18", longname: "Sandaun" },
            { code: "19", longname: "Enga" },
            { code: "20", longname: "National Capital" }
        ]
    },
    {
        code: "PH",
        longname: "Philippines",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Abra" },
            { code: "02", longname: "Agusan del Norte" },
            { code: "03", longname: "Agusan del Sur" },
            { code: "04", longname: "Aklan" },
            { code: "05", longname: "Albay" },
            { code: "06", longname: "Antique" },
            { code: "07", longname: "Bataan" },
            { code: "08", longname: "Batanes" },
            { code: "09", longname: "Batangas" },
            { code: "10", longname: "Benguet" },
            { code: "11", longname: "Bohol" },
            { code: "12", longname: "Bukidnon" },
            { code: "13", longname: "Bulacan" },
            { code: "14", longname: "Cagayan" },
            { code: "15", longname: "Camarines Norte" },
            { code: "16", longname: "Camarines Sur" },
            { code: "17", longname: "Camiguin" },
            { code: "18", longname: "Capiz" },
            { code: "19", longname: "Catanduanes" },
            { code: "20", longname: "Cavite" },
            { code: "21", longname: "Cebu" },
            { code: "22", longname: "Basilan" },
            { code: "23", longname: "Eastern Samar" },
            { code: "24", longname: "Davao" },
            { code: "25", longname: "Davao del Sur" },
            { code: "26", longname: "Davao Oriental" },
            { code: "27", longname: "Ifugao" },
            { code: "28", longname: "Ilocos Norte" },
            { code: "29", longname: "Ilocos Sur" },
            { code: "30", longname: "Iloilo" },
            { code: "31", longname: "Isabela" },
            { code: "32", longname: "Kalinga-Apayao" },
            { code: "33", longname: "Laguna" },
            { code: "34", longname: "Lanao del Norte" },
            { code: "35", longname: "Lanao del Sur" },
            { code: "36", longname: "La Union" },
            { code: "37", longname: "Leyte" },
            { code: "38", longname: "Marinduque" },
            { code: "39", longname: "Masbate" },
            { code: "40", longname: "Mindoro Occidental" },
            { code: "41", longname: "Mindoro Oriental" },
            { code: "42", longname: "Misamis Occidental" },
            { code: "43", longname: "Misamis Oriental" },
            { code: "44", longname: "Mountain" },
            { code: "46", longname: "Negros Oriental" },
            { code: "47", longname: "Nueva Ecija" },
            { code: "48", longname: "Nueva Vizcaya" },
            { code: "49", longname: "Palawan" },
            { code: "50", longname: "Pampanga" },
            { code: "51", longname: "Pangasinan" },
            { code: "53", longname: "Rizal" },
            { code: "54", longname: "Romblon" },
            { code: "55", longname: "Samar" },
            { code: "56", longname: "Maguindanao" },
            { code: "57", longname: "North Cotabato" },
            { code: "58", longname: "Sorsogon" },
            { code: "59", longname: "Southern Leyte" },
            { code: "60", longname: "Sulu" },
            { code: "61", longname: "Surigao del Norte" },
            { code: "62", longname: "Surigao del Sur" },
            { code: "63", longname: "Tarlac" },
            { code: "64", longname: "Zambales" },
            { code: "65", longname: "Zamboanga del Norte" },
            { code: "66", longname: "Zamboanga del Sur" },
            { code: "67", longname: "Northern Samar" },
            { code: "68", longname: "Quirino" },
            { code: "69", longname: "Siquijor" },
            { code: "70", longname: "South Cotabato" },
            { code: "71", longname: "Sultan Kudarat" },
            { code: "72", longname: "Tawitawi" }
        ]
    },
    {
        code: "PK",
        longname: "Pakistan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Federally Administered Tribal Areas" },
            { code: "02", longname: "Balochistan" },
            { code: "03", longname: "North-West Frontier" },
            { code: "04", longname: "Punjab" },
            { code: "05", longname: "Sindh" },
            { code: "06", longname: "Azad Kashmir" },
            { code: "07", longname: "Northern Areas" },
            { code: "08", longname: "Islamabad" }
        ]
    },
    {
        code: "PL",
        longname: "Poland",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "72", longname: "Dolnośląskie" },
            { code: "73", longname: "Kujawsko-Pomorskie" },
            { code: "74", longname: "Łódzkie" },
            { code: "75", longname: "Lubelskie" },
            { code: "76", longname: "Lubuskie" },
            { code: "77", longname: "Małopolskie" },
            { code: "78", longname: "Mazowieckie" },
            { code: "79", longname: "Opolskie" },
            { code: "80", longname: "Podkarpackie" },
            { code: "81", longname: "Podlaskie" },
            { code: "82", longname: "Pomorskie" },
            { code: "83", longname: "Śląskie" },
            { code: "84", longname: "Świętokrzyskie" },
            { code: "85", longname: "Warmińsko-Mazurskie" },
            { code: "86", longname: "Wielkopolskie" },
            { code: "87", longname: "Zachodniopomorskie" }
        ]
    },
    {
        code: "PM",
        longname: "St. Pierre And Miquelon",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "PN",
        longname: "Pitcairn",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "PR",
        longname: "Puerto Rico",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "PT",
        longname: "Portugal",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Aveiro" },
            { code: "03", longname: "Beja" },
            { code: "04", longname: "Braga" },
            { code: "05", longname: "Braganca" },
            { code: "06", longname: "Castelo Branco" },
            { code: "07", longname: "Coimbra" },
            { code: "08", longname: "Evora" },
            { code: "09", longname: "Faro" },
            { code: "10", longname: "Madeira" },
            { code: "11", longname: "Guarda" },
            { code: "13", longname: "Leiria" },
            { code: "14", longname: "Lisboa" },
            { code: "16", longname: "Portalegre" },
            { code: "17", longname: "Porto" },
            { code: "18", longname: "Santarem" },
            { code: "19", longname: "Setubal" },
            { code: "20", longname: "Viana do Castelo" },
            { code: "21", longname: "Vila Real" },
            { code: "22", longname: "Viseu" },
            { code: "23", longname: "Azores" }
        ]
    },
    {
        code: "PW",
        longname: "Palau",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Aimelik" },
            { code: "02", longname: "Airai" },
            { code: "03", longname: "Angaur" },
            { code: "04", longname: "Hatohobei" },
            { code: "05", longname: "Kayangel" },
            { code: "06", longname: "Koror" },
            { code: "07", longname: "Melekeok" },
            { code: "08", longname: "Ngaraard" },
            { code: "09", longname: "Ngarchelong" },
            { code: "10", longname: "Ngardmau" },
            { code: "11", longname: "Ngatpang" },
            { code: "12", longname: "Ngchesar" },
            { code: "13", longname: "Ngeremlengui" },
            { code: "14", longname: "Ngiwal" },
            { code: "15", longname: "Peleliu" },
            { code: "16", longname: "Sonsorol" }
        ]
    },
    {
        code: "PY",
        longname: "Paraguay",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Alto Parana" },
            { code: "02", longname: "Amambay" },
            { code: "04", longname: "Caaguazu" },
            { code: "05", longname: "Caazapa" },
            { code: "06", longname: "Central" },
            { code: "07", longname: "Concepcion" },
            { code: "08", longname: "Cordillera" },
            { code: "10", longname: "Guaira" },
            { code: "11", longname: "Itapua" },
            { code: "12", longname: "Misiones" },
            { code: "13", longname: "Neembucu" },
            { code: "15", longname: "Paraguari" },
            { code: "16", longname: "Presidente Hayes" },
            { code: "17", longname: "San Pedro" },
            { code: "19", longname: "Canindeyu" },
            { code: "22", longname: "Asunció" },
            { code: "23", longname: "Alto Paraguay" },
            { code: "24", longname: "Boquerón" }
        ]
    },
    {
        code: "QA",
        longname: "Qatar",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ad Dawḩah" },
            { code: "02", longname: "Al Ghuwayrīyah" },
            { code: "03", longname: "Al Jumaylīyah" },
            { code: "04", longname: "Al Khawr" },
            { code: "06", longname: "Ar Rayyān" },
            { code: "08", longname: "Madīnat ash Shamāl" },
            { code: "09", longname: "Umm Şalāl" },
            { code: "10", longname: "Al Wakrah" },
            { code: "11", longname: "Jarayān al Bāţinah" },
            { code: "12", longname: "Umm Sa‘īd" }
        ]
    },
    {
        code: "RO",
        longname: "Romania",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Alba" },
            { code: "02", longname: "Arad" },
            { code: "03", longname: "Arges" },
            { code: "04", longname: "Bacau" },
            { code: "05", longname: "Bihor" },
            { code: "06", longname: "Bistrita-Nasaud" },
            { code: "07", longname: "Botosani" },
            { code: "08", longname: "Braila" },
            { code: "09", longname: "Brasov" },
            { code: "10", longname: "Bucuresti" },
            { code: "11", longname: "Buzau" },
            { code: "12", longname: "Caras-Severin" },
            { code: "13", longname: "Cluj" },
            { code: "14", longname: "Constanta" },
            { code: "15", longname: "Covasna" },
            { code: "16", longname: "Dâmbovița" },
            { code: "17", longname: "Dolj" },
            { code: "18", longname: "Galati" },
            { code: "19", longname: "Gorj" },
            { code: "20", longname: "Harghita" },
            { code: "21", longname: "Hunedoara" },
            { code: "22", longname: "Ialomita" },
            { code: "23", longname: "Iasi" },
            { code: "25", longname: "Maramures" },
            { code: "26", longname: "Mehedinti" },
            { code: "27", longname: "Mures" },
            { code: "28", longname: "Neamt" },
            { code: "29", longname: "Olt" },
            { code: "30", longname: "Prahova" },
            { code: "31", longname: "Salaj" },
            { code: "32", longname: "Satu Mare" },
            { code: "33", longname: "Sibiu" },
            { code: "34", longname: "Suceava" },
            { code: "35", longname: "Teleorman" },
            { code: "36", longname: "Timis" },
            { code: "37", longname: "Tulcea" },
            { code: "38", longname: "Vaslui" },
            { code: "39", longname: "Vâlcea" },
            { code: "40", longname: "Vrancea" },
            { code: "41", longname: "Calarasi" },
            { code: "42", longname: "Giurgiu" },
            { code: "43", longname: "Ilfov" }
        ]
    },
    {
        code: "RS",
        longname: "Serbia",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "RU",
        longname: "Russian Federation",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Adygeya" },
            { code: "02", longname: "Aginskiy Buryatskiy Avtonomnyy Okrug" },
            { code: "03", longname: "Altay" },
            { code: "04", longname: "Altayskiy Kray" },
            { code: "05", longname: "Amurskaya Oblast'" },
            { code: "06", longname: "Arkhangel'skaya Oblast'" },
            { code: "07", longname: "Astrakhanskaya Oblast'" },
            { code: "08", longname: "Bashkortostan" },
            { code: "09", longname: "Belgorodskaya Oblast'" },
            { code: "10", longname: "Bryanskaya Oblast'" },
            { code: "11", longname: "Buryatiya" },
            { code: "12", longname: "Chechnya" },
            { code: "13", longname: "Chelyabinskaya Oblast'" },
            { code: "14", longname: "Chitinskaya Oblast'" },
            { code: "15", longname: "Chukotskiy Avtonomnyy Okrug" },
            { code: "16", longname: "Chuvashiya" },
            { code: "17", longname: "Dagestan" },
            { code: "19", longname: "Ingushetiya" },
            { code: "20", longname: "Irkutskaya Oblast'" },
            { code: "21", longname: "Ivanovskaya Oblast'" },
            { code: "22", longname: "Kabardino-Balkariya" },
            { code: "23", longname: "Kaliningradskaya Oblast'" },
            { code: "24", longname: "Kalmykiya" },
            { code: "25", longname: "Kaluzhskaya Oblast'" },
            { code: "27", longname: "Karachayevo-Cherkesiya" },
            { code: "28", longname: "Kareliya" },
            { code: "29", longname: "Kemerovskaya Oblast'" },
            { code: "30", longname: "Khabarovskiy Kray" },
            { code: "31", longname: "Khakasiya" },
            { code: "32", longname: "Khanty-Mansiyskiy Avtonomnyy Okrug" },
            { code: "33", longname: "Kirovskaya Oblast'" },
            { code: "34", longname: "Komi" },
            { code: "37", longname: "Kostromskaya Oblast'" },
            { code: "38", longname: "Krasnodarskiy Kray" },
            { code: "40", longname: "Kurganskaya Oblast'" },
            { code: "41", longname: "Kurskaya Oblast'" },
            { code: "42", longname: "Leningradskaya Oblast'" },
            { code: "43", longname: "Lipetskaya Oblast'" },
            { code: "44", longname: "Magadanskaya Oblast'" },
            { code: "45", longname: "Mariy-El" },
            { code: "46", longname: "Mordoviya" },
            { code: "47", longname: "Moskovskaya Oblast'" },
            { code: "48", longname: "Moskva" },
            { code: "49", longname: "Murmanskaya Oblast'" },
            { code: "50", longname: "Nenetskiy Avtonomnyy Okrug" },
            { code: "51", longname: "Nizhegorodskaya Oblast'" },
            { code: "52", longname: "Novgorodskaya Oblast'" },
            { code: "53", longname: "Novosibirskaya Oblast'" },
            { code: "54", longname: "Omskaya Oblast'" },
            { code: "55", longname: "Orenburgskaya Oblast'" },
            { code: "56", longname: "Orlovskaya Oblast'" },
            { code: "57", longname: "Penzenskaya Oblast'" },
            { code: "59", longname: "Primorskiy Kray" },
            { code: "60", longname: "Pskovskaya Oblast'" },
            { code: "61", longname: "Rostovskaya Oblast'" },
            { code: "62", longname: "Ryazanskaya Oblast'" },
            { code: "63", longname: "Sakha (Yakutiya)" },
            { code: "64", longname: "Sakhalinskaya Oblast'" },
            { code: "65", longname: "Samarskaya Oblast'" },
            { code: "66", longname: "Sankt-Peterburg" },
            { code: "67", longname: "Saratovskaya Oblast'" },
            { code: "68", longname: "Severnaya Osetiya-Alaniya" },
            { code: "69", longname: "Smolenskaya Oblast'" },
            { code: "70", longname: "Stavropol'skiy Kray" },
            { code: "71", longname: "Sverdlovskaya Oblast'" },
            { code: "72", longname: "Tambovskaya Oblast'" },
            { code: "73", longname: "Tatarstan" },
            { code: "75", longname: "Tomskaya Oblast'" },
            { code: "76", longname: "Tul'skaya Oblast'" },
            { code: "77", longname: "Tverskaya Oblast'" },
            { code: "78", longname: "Tyumenskaya Oblast'" },
            { code: "79", longname: "Tyva" },
            { code: "80", longname: "Udmurtiya" },
            { code: "81", longname: "Ul'yanovskaya Oblast'" },
            { code: "82", longname: "Ust'-Ordynskiy Buryatskiy Avtonomnyy Okrug" },
            { code: "83", longname: "Vladimirskaya Oblast'" },
            { code: "84", longname: "Volgogradskaya Oblast'" },
            { code: "85", longname: "Vologodskaya Oblast'" },
            { code: "86", longname: "Voronezhskaya Oblast'" },
            { code: "87", longname: "Yamalo-Nenetskiy Avtonomnyy Okrug" },
            { code: "88", longname: "Yaroslavskaya Oblast'" },
            { code: "89", longname: "Yevreyskaya Avtonomnaya Oblast'" },
            { code: "90", longname: "Permskiy Kray" },
            { code: "91", longname: "Krasnoyarskiy Kray" },
            { code: "92", longname: "Kamchatskiy Kray" }
        ]
    },
    {
        code: "RW",
        longname: "Rwanda",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "11", longname: "Est" },
            { code: "12", longname: "Kigali" },
            { code: "13", longname: "Nord" },
            { code: "14", longname: "Ouest" },
            { code: "15", longname: "Sud" }
        ]
    },
    {
        code: "SA",
        longname: "Saudi Arabia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Al Bahah" },
            { code: "05", longname: "Al Madinah" },
            { code: "06", longname: "Ash Sharqiyah" },
            { code: "08", longname: "Al Qasim" },
            { code: "10", longname: "Ar Riyad" },
            { code: "11", longname: "`Asir" },
            { code: "13", longname: "Ha'il" },
            { code: "14", longname: "Makkah" },
            { code: "15", longname: "Al Hudud ash Shamaliyah" },
            { code: "16", longname: "Najran" },
            { code: "17", longname: "Jizan" },
            { code: "19", longname: "Tabuk" },
            { code: "20", longname: "Al Jawf" }
        ]
    },
    {
        code: "SB",
        longname: "Solomon Islands",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "03", longname: "Malaita" },
            { code: "06", longname: "Guadalcanal" },
            { code: "07", longname: "Isabel" },
            { code: "08", longname: "Makira" },
            { code: "09", longname: "Temotu" },
            { code: "10", longname: "Central" },
            { code: "11", longname: "Western" },
            { code: "12", longname: "Choiseul" },
            { code: "13", longname: "Rennell and Bellona" }
        ]
    },
    {
        code: "SC",
        longname: "Seychelles",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Anse aux Pins" },
            { code: "02", longname: "Anse Boileau" },
            { code: "03", longname: "Anse Etoile" },
            { code: "05", longname: "Anse Royale" },
            { code: "06", longname: "Baie Lazare" },
            { code: "07", longname: "Baie Sainte Anne" },
            { code: "08", longname: "Beau Vallon" },
            { code: "09", longname: "Bel Air" },
            { code: "10", longname: "Bel Ombre" },
            { code: "11", longname: "Cascade" },
            { code: "12", longname: "Glacis" },
            { code: "14", longname: "Grand' Anse (Praslin)" },
            { code: "17", longname: "Mont Buxton" },
            { code: "18", longname: "Mont Fleuri" },
            { code: "19", longname: "Plaisance" },
            { code: "20", longname: "Pointe La Rue" },
            { code: "22", longname: "Saint Louis" },
            { code: "23", longname: "Takamaka" },
            { code: "24", longname: "Grand Anse Mahe" },
            { code: "25", longname: "Inner Islands" },
            { code: "26", longname: "English River" },
            { code: "27", longname: "Port Glaud" },
            { code: "28", longname: "Au Cap" },
            { code: "29", longname: "Les Mamelles" },
            { code: "30", longname: "Roche Caiman" }
        ]
    },
    {
        code: "SD",
        longname: "Sudan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "29", longname: "Al Kharţūm" },
            { code: "35", longname: "Aʽālī an Nīl" },
            { code: "36", longname: "Al Baḩr al Aḩmar" },
            { code: "37", longname: "Al Buḩayrāt" },
            { code: "38", longname: "Al Jazīrah" },
            { code: "39", longname: "Al Qaḑārif" },
            { code: "40", longname: "Al Waḩdah" },
            { code: "41", longname: "An Nīl al Abyaḑ" },
            { code: "42", longname: "An Nīl al Azraq" },
            { code: "43", longname: "Ash Shamālīyah" },
            { code: "44", longname: "Baḩr al Jabal" },
            { code: "45", longname: "Gharb al Istiwāʼīyah" },
            { code: "46", longname: "Gharb Baḩr al Ghazāl" },
            { code: "47", longname: "Gharb Dārfūr" },
            { code: "48", longname: "Gharb Kurdufān" },
            { code: "49", longname: "Janūb Dārfūr" },
            { code: "50", longname: "Janūb Kurdufān" },
            { code: "51", longname: "Junqalī" },
            { code: "52", longname: "Kassalā" },
            { code: "53", longname: "Nahr an Nīl" },
            { code: "54", longname: "Shamāl Baḩr al Ghazāl" },
            { code: "55", longname: "Shamāl Dārfūr" },
            { code: "56", longname: "Shamāl Kurdufān" },
            { code: "57", longname: "Sharq al Istiwāʼīyah" },
            { code: "58", longname: "Sinnār" },
            { code: "59", longname: "Warab" }
        ]
    },
    {
        code: "SE",
        longname: "Sweden",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Blekinge Lan" },
            { code: "03", longname: "Gavleborgs Lan" },
            { code: "05", longname: "Gotlands Lan" },
            { code: "06", longname: "Hallands Lan" },
            { code: "07", longname: "Jamtlands Lan" },
            { code: "08", longname: "Jonkopings Lan" },
            { code: "09", longname: "Kalmar Lan" },
            { code: "10", longname: "Dalarnas Län" },
            { code: "12", longname: "Kronobergs Lan" },
            { code: "14", longname: "Norrbottens Lan" },
            { code: "15", longname: "Orebro Lan" },
            { code: "16", longname: "Ostergotlands Lan" },
            { code: "18", longname: "Sodermanlands Lan" },
            { code: "21", longname: "Uppsala Lan" },
            { code: "22", longname: "Varmlands Lan" },
            { code: "23", longname: "Vasterbottens Lan" },
            { code: "24", longname: "Vasternorrlands Lan" },
            { code: "25", longname: "Vastmanlands Lan" },
            { code: "26", longname: "Stockholms Lan" },
            { code: "27", longname: "Skåne Län" },
            { code: "28", longname: "Västra Götalands Län" }
        ]
    },
    {
        code: "SG",
        longname: "Singapore",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "SH",
        longname: "St. Helena",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ascension" },
            { code: "02", longname: "Saint Helena" },
            { code: "03", longname: "Tristan da Cunha" }
        ]
    },
    {
        code: "SI",
        longname: "Slovenia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ajdovščina" },
            { code: "02", longname: "Beltinci" },
            { code: "03", longname: "Bled" },
            { code: "04", longname: "Bohinj" },
            { code: "05", longname: "Borovnica" },
            { code: "06", longname: "Bovec" },
            { code: "07", longname: "Brda" },
            { code: "08", longname: "Brežice" },
            { code: "09", longname: "Brezovica" },
            { code: "11", longname: "Celje" },
            { code: "12", longname: "Cerklje na Gorenjskem" },
            { code: "13", longname: "Cerknica" },
            { code: "14", longname: "Cerkno" },
            { code: "15", longname: "Črenšovci" },
            { code: "16", longname: "Črna na Koroškem" },
            { code: "17", longname: "Črnomelj" },
            { code: "19", longname: "Divača" },
            { code: "20", longname: "Dobrepolje" },
            { code: "22", longname: "Dol pri Ljubljani" },
            { code: "24", longname: "Dornava" },
            { code: "25", longname: "Dravograd" },
            { code: "26", longname: "Duplek" },
            { code: "27", longname: "Gorenja Vas-Poljane" },
            { code: "28", longname: "Gorišnica" },
            { code: "29", longname: "Gornja Radgona" },
            { code: "30", longname: "Gornji Grad" },
            { code: "31", longname: "Gornji Petrovci" },
            { code: "32", longname: "Grosuplje" },
            { code: "34", longname: "Hrastnik" },
            { code: "35", longname: "Hrpelje-Kozina" },
            { code: "36", longname: "Idrija" },
            { code: "37", longname: "Ig" },
            { code: "38", longname: "Ilirska Bistrica" },
            { code: "39", longname: "Ivančna Gorica" },
            { code: "40", longname: "Izola-Isola" },
            { code: "42", longname: "Juršinci" },
            { code: "44", longname: "Kanal" },
            { code: "45", longname: "Kidričevo" },
            { code: "46", longname: "Kobarid" },
            { code: "47", longname: "Kobilje" },
            { code: "49", longname: "Komen" },
            { code: "50", longname: "Koper-Capodistria" },
            { code: "51", longname: "Kozje" },
            { code: "52", longname: "Kranj" },
            { code: "53", longname: "Kranjska Gora" },
            { code: "54", longname: "Krško" },
            { code: "55", longname: "Kungota" },
            { code: "57", longname: "Laško" },
            { code: "61", longname: "Ljubljana" },
            { code: "62", longname: "Ljubno" },
            { code: "64", longname: "Logatec" },
            { code: "66", longname: "Loški Potok" },
            { code: "68", longname: "Lukovica" },
            { code: "71", longname: "Medvode" },
            { code: "72", longname: "Mengeš" },
            { code: "73", longname: "Metlika" },
            { code: "74", longname: "Mežica" },
            { code: "76", longname: "Mislinja" },
            { code: "77", longname: "Moravče" },
            { code: "78", longname: "Moravske Toplice" },
            { code: "79", longname: "Mozirje" },
            { code: "80", longname: "Murska Sobota" },
            { code: "81", longname: "Muta" },
            { code: "82", longname: "Naklo" },
            { code: "83", longname: "Nazarje" },
            { code: "84", longname: "Nova Gorica" },
            { code: "86", longname: "Odranci" },
            { code: "87", longname: "Ormož" },
            { code: "88", longname: "Osilnica" },
            { code: "89", longname: "Pesnica" },
            { code: "91", longname: "Pivka" },
            { code: "92", longname: "Podčetrtek" },
            { code: "94", longname: "Postojna" },
            { code: "97", longname: "Puconci" },
            { code: "98", longname: "Rače-Fram" },
            { code: "99", longname: "Radeče" }
        ]
    },
    {
        code: "SJ",
        longname: "Svalbard",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "SK",
        longname: "Slovakia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Banskobystrický" },
            { code: "02", longname: "Bratislavský" },
            { code: "03", longname: "Košický" },
            { code: "04", longname: "Nitriansky" },
            { code: "05", longname: "Prešovský" },
            { code: "06", longname: "Trenčiansky" },
            { code: "07", longname: "Trnavský" },
            { code: "08", longname: "Žilinský" }
        ]
    },
    {
        code: "SL",
        longname: "Sierra Leone",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Eastern" },
            { code: "02", longname: "Northern" },
            { code: "03", longname: "Southern" },
            { code: "04", longname: "Western Area" }
        ]
    },
    {
        code: "SM",
        longname: "San Marino",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Acquaviva" },
            { code: "02", longname: "Chiesanuova" },
            { code: "03", longname: "Domagnano" },
            { code: "04", longname: "Faetano" },
            { code: "05", longname: "Fiorentino" },
            { code: "06", longname: "Borgo Maggiore" },
            { code: "07", longname: "San Marino" },
            { code: "08", longname: "Monte Giardino" },
            { code: "09", longname: "Serravalle" }
        ]
    },
    {
        code: "SN",
        longname: "Senegal",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Dakar" },
            { code: "03", longname: "Diourbel" },
            { code: "05", longname: "Tambacounda" },
            { code: "07", longname: "Thies" },
            { code: "09", longname: "Fatick" },
            { code: "10", longname: "Kaolack" },
            { code: "11", longname: "Kolda" },
            { code: "12", longname: "Ziguinchor" },
            { code: "13", longname: "Louga" },
            { code: "14", longname: "Saint-Louis" },
            { code: "15", longname: "Matam" }
        ]
    },
    {
        code: "SO",
        longname: "Somalia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Bakool" },
            { code: "02", longname: "Banaadir" },
            { code: "03", longname: "Bari" },
            { code: "04", longname: "Bay" },
            { code: "05", longname: "Galguduud" },
            { code: "06", longname: "Gedo" },
            { code: "07", longname: "Hiiraan" },
            { code: "08", longname: "Jubbada Dhexe" },
            { code: "09", longname: "Jubbada Hoose" },
            { code: "10", longname: "Mudug" },
            { code: "12", longname: "Sanaag" },
            { code: "13", longname: "Shabeellaha Dhexe" },
            { code: "14", longname: "Shabeellaha Hoose" },
            { code: "18", longname: "Nugaal" },
            { code: "19", longname: "Togdheer" },
            { code: "20", longname: "Woqooyi Galbeed" },
            { code: "21", longname: "Awdal" },
            { code: "22", longname: "Sool" }
        ]
    },
    {
        code: "SR",
        longname: "Suriname",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "10", longname: "Brokopondo" },
            { code: "11", longname: "Commewijne" },
            { code: "12", longname: "Coronie" },
            { code: "13", longname: "Marowijne" },
            { code: "14", longname: "Nickerie" },
            { code: "15", longname: "Para" },
            { code: "16", longname: "Paramaribo" },
            { code: "17", longname: "Saramacca" },
            { code: "18", longname: "Sipaliwini" },
            { code: "19", longname: "Wanica" }
        ]
    },
    {
        code: "ST",
        longname: "Sao Tome And Principe",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Principe" },
            { code: "02", longname: "Sao Tome" }
        ]
    },
    {
        code: "SV",
        longname: "El Salvador",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ahuachapan" },
            { code: "02", longname: "Cabanas" },
            { code: "03", longname: "Chalatenango" },
            { code: "04", longname: "Cuscatlan" },
            { code: "05", longname: "La Libertad" },
            { code: "06", longname: "La Paz" },
            { code: "07", longname: "La Union" },
            { code: "08", longname: "Morazan" },
            { code: "09", longname: "San Miguel" },
            { code: "10", longname: "San Salvador" },
            { code: "11", longname: "Santa Ana" },
            { code: "12", longname: "San Vicente" },
            { code: "13", longname: "Sonsonate" },
            { code: "14", longname: "Usulutan" }
        ]
    },
    {
        code: "SY",
        longname: "Syria",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Al Hasakah" },
            { code: "02", longname: "Al Ladhiqiyah" },
            { code: "03", longname: "Al Qunaytirah" },
            { code: "04", longname: "Ar Raqqah" },
            { code: "05", longname: "As Suwayda'" },
            { code: "06", longname: "Dar`a" },
            { code: "07", longname: "Dayr az Zawr" },
            { code: "08", longname: "Rif Dimashq" },
            { code: "09", longname: "Halab" },
            { code: "10", longname: "Hamah" },
            { code: "11", longname: "Hims" },
            { code: "12", longname: "Idlib" },
            { code: "13", longname: "Dimashq" },
            { code: "14", longname: "Tartus" }
        ]
    },
    {
        code: "SZ",
        longname: "Swaziland",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Hhohho" },
            { code: "02", longname: "Lubombo" },
            { code: "03", longname: "Manzini" },
            { code: "04", longname: "Shiselweni" },
            { code: "05", longname: "Praslin" }
        ]
    },
    {
        code: "TC",
        longname: "Turks And Caicos Islands",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "TD",
        longname: "Chad",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Batha" },
            { code: "02", longname: "Wadi Fira" },
            { code: "03", longname: "Borkou-Ennedi-Tibesti" },
            { code: "05", longname: "Guéra" },
            { code: "06", longname: "Kanem" },
            { code: "07", longname: "Lac" },
            { code: "08", longname: "Logone Occidental" },
            { code: "09", longname: "Logone Oriental" },
            { code: "12", longname: "Ouaddaï" },
            { code: "13", longname: "Salamat" },
            { code: "14", longname: "Tandjilé" },
            { code: "15", longname: "Chari-Baguirmi" },
            { code: "16", longname: "Mayo-Kebbi Est" },
            { code: "17", longname: "Moyen-Chari" },
            { code: "18", longname: "Hadjer-Lamis" },
            { code: "19", longname: "Mandoul" },
            { code: "20", longname: "Mayo-Kébbi Ouest" },
            { code: "21", longname: "Ville de N’Djaména" }
        ]
    },
    {
        code: "TF",
        longname: "French Southern Territories",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "TG",
        longname: "Togo",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "22", longname: "Centrale" },
            { code: "23", longname: "Kara" },
            { code: "24", longname: "Maritime" },
            { code: "25", longname: "Plateaux" },
            { code: "26", longname: "Savanes" }
        ]
    },
    {
        code: "TH",
        longname: "Thailand",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Mae Hong Son" },
            { code: "02", longname: "Chiang Mai" },
            { code: "03", longname: "Chiang Rai" },
            { code: "04", longname: "Nan" },
            { code: "05", longname: "Lamphun" },
            { code: "06", longname: "Lampang" },
            { code: "07", longname: "Phrae" },
            { code: "08", longname: "Tak" },
            { code: "09", longname: "Sukhothai" },
            { code: "10", longname: "Uttaradit" },
            { code: "11", longname: "Kamphaeng Phet" },
            { code: "12", longname: "Phitsanulok" },
            { code: "13", longname: "Phichit" },
            { code: "14", longname: "Phetchabun" },
            { code: "15", longname: "Uthai Thani" },
            { code: "16", longname: "Nakhon Sawan" },
            { code: "17", longname: "Nong Khai" },
            { code: "18", longname: "Loei" },
            { code: "20", longname: "Sakon Nakhon" },
            { code: "22", longname: "Khon Kaen" },
            { code: "23", longname: "Kalasin" },
            { code: "24", longname: "Maha Sarakham" },
            { code: "25", longname: "Roi Et" },
            { code: "26", longname: "Chaiyaphum" },
            { code: "27", longname: "Nakhon Ratchasima" },
            { code: "28", longname: "Buriram" },
            { code: "29", longname: "Surin" },
            { code: "30", longname: "Sisaket" },
            { code: "31", longname: "Narathiwat" },
            { code: "32", longname: "Chai Nat" },
            { code: "33", longname: "Sing Buri" },
            { code: "34", longname: "Lop Buri" },
            { code: "35", longname: "Ang Thong" },
            { code: "36", longname: "Phra Nakhon Si Ayutthaya" },
            { code: "37", longname: "Saraburi" },
            { code: "38", longname: "Nonthaburi" },
            { code: "39", longname: "Pathum Thani" },
            { code: "40", longname: "Krung Thep" },
            { code: "41", longname: "Phayao" },
            { code: "42", longname: "Samut Prakan" },
            { code: "43", longname: "Nakhon Nayok" },
            { code: "44", longname: "Chachoengsao" },
            { code: "46", longname: "Chon Buri" },
            { code: "47", longname: "Rayong" },
            { code: "48", longname: "Chanthaburi" },
            { code: "49", longname: "Trat" },
            { code: "50", longname: "Kanchanaburi" },
            { code: "51", longname: "Suphan Buri" },
            { code: "52", longname: "Ratchaburi" },
            { code: "53", longname: "Nakhon Pathom" },
            { code: "54", longname: "Samut Songkhram" },
            { code: "55", longname: "Samut Sakhon" },
            { code: "56", longname: "Phetchaburi" },
            { code: "57", longname: "Prachuap Khiri Khan" },
            { code: "58", longname: "Chumphon" },
            { code: "59", longname: "Ranong" },
            { code: "60", longname: "Surat Thani" },
            { code: "61", longname: "Phangnga" },
            { code: "62", longname: "Phuket" },
            { code: "63", longname: "Krabi" },
            { code: "64", longname: "Nakhon Si Thammarat" },
            { code: "65", longname: "Trang" },
            { code: "66", longname: "Phatthalung" },
            { code: "67", longname: "Satun" },
            { code: "68", longname: "Songkhla" },
            { code: "69", longname: "Pattani" },
            { code: "70", longname: "Yala" },
            { code: "72", longname: "Yasothon" },
            { code: "73", longname: "Nakhon Phanom" },
            { code: "74", longname: "Prachin Buri" },
            { code: "75", longname: "Ubon Ratchathani" },
            { code: "76", longname: "Udon Thani" },
            { code: "77", longname: "Amnta Charoen" },
            { code: "78", longname: "Mukdahan" },
            { code: "79", longname: "Nong Bua Lamphu" },
            { code: "80", longname: "Sa Kaeo" }
        ]
    },
    {
        code: "TJ",
        longname: "Tajikistan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Kŭhistoni Badakhshon" },
            { code: "02", longname: "Khatlon" },
            { code: "03", longname: "Sughd" }
        ]
    },
    {
        code: "TK",
        longname: "Tokelau",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "TL",
        longname: "Timor-leste",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "TM",
        longname: "Turkmenistan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ahal" },
            { code: "02", longname: "Balkan" },
            { code: "03", longname: "Dashhowuz" },
            { code: "04", longname: "Lebap" },
            { code: "05", longname: "Mary" }
        ]
    },
    {
        code: "TN",
        longname: "Tunisia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Al Qasrayn" },
            { code: "03", longname: "Al Qayrawan" },
            { code: "06", longname: "Jundubah" },
            { code: "10", longname: "Qafsah" },
            { code: "14", longname: "Kef" },
            { code: "15", longname: "Al Mahdiyah" },
            { code: "16", longname: "Al Munastir" },
            { code: "17", longname: "Bajah" },
            { code: "18", longname: "Banzart" },
            { code: "19", longname: "Nabul" },
            { code: "22", longname: "Silyanah" },
            { code: "23", longname: "Susah" },
            { code: "27", longname: "Bin `Arus" },
            { code: "28", longname: "Madanin" },
            { code: "29", longname: "Qabis" },
            { code: "31", longname: "Qibili" },
            { code: "32", longname: "Safaqis" },
            { code: "33", longname: "Sidi Bu Zayd" },
            { code: "34", longname: "Tatawin" },
            { code: "35", longname: "Tawzar" },
            { code: "36", longname: "Tunis" },
            { code: "37", longname: "Zaghwan" },
            { code: "38", longname: "Ariana" },
            { code: "39", longname: "Manouba" }
        ]
    },
    {
        code: "TO",
        longname: "Tonga",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Ha`apai" },
            { code: "02", longname: "Tongatapu" },
            { code: "03", longname: "Vava`u" }
        ]
    },
    {
        code: "TR",
        longname: "Turkey",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Adiyaman" },
            { code: "03", longname: "Afyonkarahisar" },
            { code: "04", longname: "Agri" },
            { code: "05", longname: "Amasya" },
            { code: "07", longname: "Antalya" },
            { code: "08", longname: "Artvin" },
            { code: "09", longname: "Aydin" },
            { code: "10", longname: "Balikesir" },
            { code: "11", longname: "Bilecik" },
            { code: "12", longname: "Bingol" },
            { code: "13", longname: "Bitlis" },
            { code: "14", longname: "Bolu" },
            { code: "15", longname: "Burdur" },
            { code: "16", longname: "Bursa" },
            { code: "17", longname: "Canakkale" },
            { code: "19", longname: "Corum" },
            { code: "20", longname: "Denizli" },
            { code: "21", longname: "Diyarbakir" },
            { code: "22", longname: "Edirne" },
            { code: "23", longname: "Elazig" },
            { code: "24", longname: "Erzincan" },
            { code: "25", longname: "Erzurum" },
            { code: "26", longname: "Eskisehir" },
            { code: "28", longname: "Giresun" },
            { code: "31", longname: "Hatay" },
            { code: "32", longname: "Icel" },
            { code: "33", longname: "Isparta" },
            { code: "34", longname: "Istanbul" },
            { code: "35", longname: "Izmir" },
            { code: "37", longname: "Kastamonu" },
            { code: "38", longname: "Kayseri" },
            { code: "39", longname: "Kirklareli" },
            { code: "40", longname: "Kirsehir" },
            { code: "41", longname: "Kocaeli" },
            { code: "43", longname: "Kutahya" },
            { code: "44", longname: "Malatya" },
            { code: "45", longname: "Manisa" },
            { code: "46", longname: "Kahramanmaraş" },
            { code: "48", longname: "Mugla" },
            { code: "49", longname: "Mus" },
            { code: "50", longname: "Nevsehir" },
            { code: "52", longname: "Ordu" },
            { code: "53", longname: "Rize" },
            { code: "54", longname: "Sakarya" },
            { code: "55", longname: "Samsun" },
            { code: "57", longname: "Sinop" },
            { code: "58", longname: "Sivas" },
            { code: "59", longname: "Tekirdag" },
            { code: "60", longname: "Tokat" },
            { code: "61", longname: "Trabzon" },
            { code: "62", longname: "Tunceli" },
            { code: "63", longname: "Şanlıurfa" },
            { code: "64", longname: "Usak" },
            { code: "65", longname: "Van" },
            { code: "66", longname: "Yozgat" },
            { code: "68", longname: "Ankara" },
            { code: "69", longname: "Gumushane" },
            { code: "70", longname: "Hakkari" },
            { code: "71", longname: "Konya" },
            { code: "72", longname: "Mardin" },
            { code: "73", longname: "Nigde" },
            { code: "74", longname: "Siirt" },
            { code: "75", longname: "Aksaray" },
            { code: "76", longname: "Batman" },
            { code: "77", longname: "Bayburt" },
            { code: "78", longname: "Karaman" },
            { code: "79", longname: "Kirikkale" },
            { code: "80", longname: "Sirnak" },
            { code: "81", longname: "Adana" },
            { code: "82", longname: "Çankırı" },
            { code: "83", longname: "Gaziantep" },
            { code: "84", longname: "Kars" },
            { code: "85", longname: "Zonguldak" },
            { code: "86", longname: "Ardahan" },
            { code: "87", longname: "Bartın İli" },
            { code: "88", longname: "Iğdır" },
            { code: "89", longname: "Karabük" },
            { code: "90", longname: "Kilis" },
            { code: "91", longname: "Osmaniye" },
            { code: "92", longname: "Yalova" },
            { code: "93", longname: "Düzce" }
        ]
    },
    {
        code: "TT",
        longname: "Trinidad and Tobago",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Arima" },
            { code: "02", longname: "Caroni" },
            { code: "03", longname: "Mayaro" },
            { code: "04", longname: "Nariva" },
            { code: "05", longname: "Port-of-Spain" },
            { code: "06", longname: "Saint Andrew" },
            { code: "07", longname: "Saint David" },
            { code: "08", longname: "Saint George" },
            { code: "09", longname: "Saint Patrick" },
            { code: "10", longname: "San Fernando" },
            { code: "11", longname: "Tobago" },
            { code: "12", longname: "Victoria" }
        ]
    },
    {
        code: "TV",
        longname: "Tuvalu",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "TW",
        longname: "Taiwan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Fu-chien" },
            { code: "02", longname: "Kao-hsiung" },
            { code: "03", longname: "T'ai-pei" },
            { code: "04", longname: "T'ai-wan" }
        ]
    },
    {
        code: "TZ",
        longname: "Tanzania",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "Pwani" },
            { code: "03", longname: "Dodoma" },
            { code: "04", longname: "Iringa" },
            { code: "05", longname: "Kigoma" },
            { code: "06", longname: "Kilimanjaro" },
            { code: "07", longname: "Lindi" },
            { code: "08", longname: "Mara" },
            { code: "09", longname: "Mbeya" },
            { code: "10", longname: "Morogoro" },
            { code: "11", longname: "Mtwara" },
            { code: "12", longname: "Mwanza" },
            { code: "13", longname: "Pemba North" },
            { code: "14", longname: "Ruvuma" },
            { code: "15", longname: "Shinyanga" },
            { code: "16", longname: "Singida" },
            { code: "17", longname: "Tabora" },
            { code: "18", longname: "Tanga" },
            { code: "19", longname: "Kagera" },
            { code: "20", longname: "Pemba South" },
            { code: "21", longname: "Zanzibar Central/South" },
            { code: "22", longname: "Zanzibar North" },
            { code: "23", longname: "Dar es Salaam" },
            { code: "24", longname: "Rukwa" },
            { code: "25", longname: "Zanzibar Urban/West" },
            { code: "26", longname: "Arusha" },
            { code: "27", longname: "Manyara" }
        ]
    },
    {
        code: "UA",
        longname: "Ukraine",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Cherkas'ka Oblast'" },
            { code: "02", longname: "Chernihivs'ka Oblast'" },
            { code: "03", longname: "Chernivets'ka Oblast'" },
            { code: "04", longname: "Dnipropetrovs'ka Oblast'" },
            { code: "05", longname: "Donets'ka Oblast'" },
            { code: "06", longname: "Ivano-Frankivs'ka Oblast'" },
            { code: "07", longname: "Kharkivs'ka Oblast'" },
            { code: "08", longname: "Khersons'ka Oblast'" },
            { code: "09", longname: "Khmel'nyts'ka Oblast'" },
            { code: "10", longname: "Kirovohrads'ka Oblast'" },
            { code: "11", longname: "Krym, Avtonomna Respublika" },
            { code: "12", longname: "Kyyiv, Misto" },
            { code: "13", longname: "Kyyivs'ka Oblast'" },
            { code: "14", longname: "Luhans'ka Oblast'" },
            { code: "15", longname: "L'vivs'ka Oblast'" },
            { code: "16", longname: "Mykolayivs'ka Oblast'" },
            { code: "17", longname: "Odes'ka Oblast'" },
            { code: "18", longname: "Poltavs'ka Oblast'" },
            { code: "19", longname: "Rivnens'ka Oblast'" },
            { code: "20", longname: "Sevastopol', Misto" },
            { code: "21", longname: "Sums'ka Oblast'" },
            { code: "22", longname: "Ternopil's'ka Oblast'" },
            { code: "23", longname: "Vinnyts'ka Oblast'" },
            { code: "24", longname: "Volyns'ka Oblast'" },
            { code: "25", longname: "Zakarpats'ka Oblast'" },
            { code: "26", longname: "Zaporiz'ka Oblast'" },
            { code: "27", longname: "Zhytomyrs'ka Oblast'" }
        ]
    },
    {
        code: "UG",
        longname: "Uganda",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "26", longname: "Apac" },
            { code: "28", longname: "Bundibugyo" },
            { code: "29", longname: "Bushenyi" },
            { code: "30", longname: "Gulu" },
            { code: "31", longname: "Hoima" },
            { code: "33", longname: "Jinja" },
            { code: "34", longname: "Kabale" },
            { code: "36", longname: "Kalangala" },
            { code: "37", longname: "Kampala" },
            { code: "38", longname: "Kamuli" },
            { code: "39", longname: "Kapchorwa" },
            { code: "40", longname: "Kasese" },
            { code: "41", longname: "Kibale" },
            { code: "42", longname: "Kiboga" },
            { code: "43", longname: "Kisoro" },
            { code: "45", longname: "Kotido" },
            { code: "46", longname: "Kumi" },
            { code: "47", longname: "Lira" },
            { code: "50", longname: "Masindi" },
            { code: "52", longname: "Mbarara" },
            { code: "56", longname: "Mubende" },
            { code: "58", longname: "Nebbi" },
            { code: "59", longname: "Ntungamo" },
            { code: "60", longname: "Pallisa" },
            { code: "61", longname: "Rakai" },
            { code: "65", longname: "Adjumani" },
            { code: "66", longname: "Bugiri" },
            { code: "67", longname: "Busia" },
            { code: "69", longname: "Katakwi" },
            { code: "70", longname: "Luwero" },
            { code: "71", longname: "Masaka" },
            { code: "72", longname: "Moyo" },
            { code: "73", longname: "Nakasongola" },
            { code: "74", longname: "Sembabule" },
            { code: "76", longname: "Tororo" },
            { code: "77", longname: "Arua" },
            { code: "78", longname: "Iganga" },
            { code: "79", longname: "Kabarole" },
            { code: "80", longname: "Kaberamaido" },
            { code: "81", longname: "Kamwenge" },
            { code: "82", longname: "Kanungu" },
            { code: "83", longname: "Kayunga" },
            { code: "84", longname: "Kitgum" },
            { code: "85", longname: "Kyenjojo" },
            { code: "86", longname: "Mayuge" },
            { code: "87", longname: "Mbale" },
            { code: "88", longname: "Moroto" },
            { code: "89", longname: "Mpigi" },
            { code: "90", longname: "Mukono" },
            { code: "91", longname: "Nakapiripirit" },
            { code: "92", longname: "Pader" },
            { code: "93", longname: "Rukungiri" },
            { code: "94", longname: "Sironko" },
            { code: "95", longname: "Soroti" },
            { code: "96", longname: "Wakiso" },
            { code: "97", longname: "Yumbe" }
        ]
    },
    {
        code: "US",
        longname: "United States",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "AL", longname: "Alabama" },
            { code: "AK", longname: "Alaska" },
            { code: "AZ", longname: "Arizona" },
            { code: "AR", longname: "Arkansas" },
            { code: "CA", longname: "California" },
            { code: "CO", longname: "Colorado" },
            { code: "CT", longname: "Connecticut" },
            { code: "DE", longname: "Delaware" },
            { code: "DC", longname: "District of Columbia" },
            { code: "FL", longname: "Florida" },
            { code: "GA", longname: "Georgia" },
            { code: "HI", longname: "Hawaii" },
            { code: "ID", longname: "Idaho" },
            { code: "IL", longname: "Illinois" },
            { code: "IN", longname: "Indiana" },
            { code: "IA", longname: "Iowa" },
            { code: "KS", longname: "Kansas" },
            { code: "KY", longname: "Kentucky" },
            { code: "LA", longname: "Louisiana" },
            { code: "ME", longname: "Maine" },
            { code: "MD", longname: "Maryland" },
            { code: "MA", longname: "Massachusetts" },
            { code: "MI", longname: "Michigan" },
            { code: "MN", longname: "Minnesota" },
            { code: "MS", longname: "Mississippi" },
            { code: "MO", longname: "Missouri" },
            { code: "MT", longname: "Montana" },
            { code: "NE", longname: "Nebraska" },
            { code: "NV", longname: "Nevada" },
            { code: "NH", longname: "New Hampshire" },
            { code: "NH", longname: "New Jersey" },
            { code: "NM", longname: "New Mexico" },
            { code: "NY", longname: "New York" },
            { code: "NC", longname: "North Carolina" },
            { code: "ND", longname: "North Dakota" },
            { code: "OH", longname: "Ohio" },
            { code: "OK", longname: "Oklahoma" },
            { code: "OR", longname: "Oregon" },
            { code: "PA", longname: "Pennsylvania" },
            { code: "RI", longname: "Rhode Island" },
            { code: "SC", longname: "South Carolina" },
            { code: "SD", longname: "South Dakota" },
            { code: "TN", longname: "Tennessee" },
            { code: "TX", longname: "Texas" },
            { code: "UT", longname: "Utah" },
            { code: "VT", longname: "Vermont" },
            { code: "VA", longname: "Virginia" },
            { code: "WA", longname: "Washington" },
            { code: "WV", longname: "West Virginia" },
            { code: "WI", longname: "Wisconsin" },
            { code: "WY", longname: "Wyoming" }
        ]
    },
    {
        code: "UY",
        longname: "Uruguay",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Artigas" },
            { code: "02", longname: "Canelones" },
            { code: "03", longname: "Cerro Largo" },
            { code: "04", longname: "Colonia" },
            { code: "05", longname: "Durazno" },
            { code: "06", longname: "Flores" },
            { code: "07", longname: "Florida" },
            { code: "08", longname: "Lavalleja" },
            { code: "09", longname: "Maldonado" },
            { code: "10", longname: "Montevideo" },
            { code: "11", longname: "Paysandu" },
            { code: "12", longname: "Rio Negro" },
            { code: "13", longname: "Rivera" },
            { code: "14", longname: "Rocha" },
            { code: "15", longname: "Salto" },
            { code: "16", longname: "San Jose" },
            { code: "17", longname: "Soriano" },
            { code: "18", longname: "Tacuarembo" },
            { code: "19", longname: "Treinta y Tres" }
        ]
    },
    {
        code: "UZ",
        longname: "Uzbekistan",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Andijon" },
            { code: "02", longname: "Bukhoro" },
            { code: "03", longname: "Farghona" },
            { code: "05", longname: "Khorazm" },
            { code: "06", longname: "Namangan" },
            { code: "07", longname: "Nawoiy" },
            { code: "08", longname: "Qashqadaryo" },
            { code: "09", longname: "Qoraqalpoghiston" },
            { code: "10", longname: "Samarqand" },
            { code: "12", longname: "Surhkondaryo" },
            { code: "13", longname: "Toshkent" },
            { code: "14", longname: "Toshkent" },
            { code: "15", longname: "Jizzakh" },
            { code: "16", longname: "Sirdaryo" }
        ]
    },
    {
        code: "VA",
        longname: "Vatican City",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "VC",
        longname: "St. Vincent And The Grenadines",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Charlotte" },
            { code: "02", longname: "Saint Andrew" },
            { code: "03", longname: "Saint David" },
            { code: "04", longname: "Saint George" },
            { code: "05", longname: "Saint Patrick" },
            { code: "06", longname: "Grenadines" }
        ]
    },
    {
        code: "VE",
        longname: "Venezuela",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Amazonas" },
            { code: "02", longname: "Anzoategui" },
            { code: "03", longname: "Apure" },
            { code: "04", longname: "Aragua" },
            { code: "05", longname: "Barinas" },
            { code: "06", longname: "Bolivar" },
            { code: "07", longname: "Carabobo" },
            { code: "08", longname: "Cojedes" },
            { code: "09", longname: "Delta Amacuro" },
            { code: "11", longname: "Falcon" },
            { code: "12", longname: "Guarico" },
            { code: "13", longname: "Lara" },
            { code: "14", longname: "Merida" },
            { code: "15", longname: "Miranda" },
            { code: "16", longname: "Monagas" },
            { code: "17", longname: "Nueva Esparta" },
            { code: "18", longname: "Portuguesa" },
            { code: "19", longname: "Sucre" },
            { code: "20", longname: "Tachira" },
            { code: "21", longname: "Trujillo" },
            { code: "22", longname: "Yaracuy" },
            { code: "23", longname: "Zulia" },
            { code: "24", longname: "Dependencias Federales" },
            { code: "25", longname: "Distrito Federal" },
            { code: "26", longname: "Vargas" }
        ]
    },
    {
        code: "VG",
        longname: "Virgin Islands, British",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "VI",
        longname: "Virgin Islands, U.S.",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "VN",
        longname: "Viet Nam",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "An Giang" },
            { code: "03", longname: "Bến Tre" },
            { code: "05", longname: "Cao Bằng" },
            { code: "09", longname: "Ðồng Tháp" },
            { code: "13", longname: "Hải Phòng" },
            { code: "20", longname: "Hồ Chí Minh" },
            { code: "21", longname: "Kiến Giang" },
            { code: "23", longname: "Lâm Ðồng" },
            { code: "24", longname: "Long An" },
            { code: "30", longname: "Quảng Ninh" },
            { code: "32", longname: "Sơn La" },
            { code: "33", longname: "Tây Ninh" },
            { code: "34", longname: "Thanh Hóa" },
            { code: "35", longname: "Thái Bình" },
            { code: "37", longname: "Tiền Giang" },
            { code: "39", longname: "Lạng Sơn" },
            { code: "43", longname: "Ðồng Nai" },
            { code: "44", longname: "Hà Nội" },
            { code: "45", longname: "Bà Rịa-Vũng Tàu" },
            { code: "46", longname: "Bình Ðịnh" },
            { code: "47", longname: "Bình Thuận" },
            { code: "49", longname: "Gia Lai" },
            { code: "50", longname: "Hà Giang" },
            { code: "51", longname: "Hà Tây" },
            { code: "52", longname: "Hà Tĩnh" },
            { code: "53", longname: "Hòa Bình" },
            { code: "54", longname: "Khánh Hòa" },
            { code: "55", longname: "Kon Tum" },
            { code: "58", longname: "Nghệ An" },
            { code: "59", longname: "Ninh Bình" },
            { code: "60", longname: "Ninh Thuận" },
            { code: "61", longname: "Phú Yên" },
            { code: "62", longname: "Quảng Bình" },
            { code: "63", longname: "Quảng Ngãi" },
            { code: "64", longname: "Quảng Trị" },
            { code: "65", longname: "Sóc Trăng" },
            { code: "66", longname: "Thừa Thiên-Huế" },
            { code: "67", longname: "Trà Vinh" },
            { code: "68", longname: "Tuyên Quang" },
            { code: "69", longname: "Vĩnh Long " },
            { code: "70", longname: "Yên Bái" },
            { code: "71", longname: "Bắc Giang" },
            { code: "72", longname: "Bắc Kạn" },
            { code: "73", longname: "Bạc Liêu" },
            { code: "74", longname: "Bắc Ninh" },
            { code: "75", longname: "Bìn Dương" },
            { code: "76", longname: "Bìn Phước" },
            { code: "77", longname: "Cà Mau" },
            { code: "78", longname: " " },
            { code: "79", longname: "Hải Dương" },
            { code: "80", longname: "Hà Nam" },
            { code: "81", longname: "Hưng Yên" },
            { code: "82", longname: " " },
            { code: "83", longname: "Phú Thọ" },
            { code: "84", longname: "Quảng Nam" },
            { code: "85", longname: "Thái Nguyên" },
            { code: "86", longname: "Vĩnh Phúc" },
            { code: "87", longname: "Cẩn Thỏ" },
            { code: "88", longname: "Đắk Lắk" },
            { code: "89", longname: "Lai Châu" },
            { code: "90", longname: "Lào Cai" },
            { code: "91", longname: "Đắk Nông" },
            { code: "92", longname: "Điện Biên" },
            { code: "93", longname: "Hậu Giang" }
        ]
    },
    {
        code: "VU",
        longname: "Vanuatu",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "07", longname: "Torba" },
            { code: "13", longname: "Sanma" },
            { code: "15", longname: "Tafea" },
            { code: "16", longname: "Malampa" },
            { code: "17", longname: "Penama" },
            { code: "18", longname: "Shefa" }
        ]
    },
    {
        code: "WF",
        longname: "Wallis And Futuna",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "WS",
        longname: "Samoa",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "A`ana" },
            { code: "02", longname: "Aiga-i-le-Tai" },
            { code: "03", longname: "Atua" },
            { code: "04", longname: "Fa`asaleleaga" },
            { code: "05", longname: "Gaga`emauga" },
            { code: "06", longname: "Va`a-o-Fonoti" },
            { code: "07", longname: "Gagaifomauga" },
            { code: "08", longname: "Palauli" },
            { code: "09", longname: "Satupa`itea" },
            { code: "10", longname: "Tuamasaga" },
            { code: "11", longname: "Vaisigano" }
        ]
    },
    {
        code: "YE",
        longname: "Yemen",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Abyan" },
            { code: "02", longname: "‘Adan" },
            { code: "03", longname: "Al Mahrah" },
            { code: "04", longname: "Hadramawt" },
            { code: "05", longname: "Shabwah" },
            { code: "08", longname: "Al Hudaydah" },
            { code: "10", longname: "Al Mahwit" },
            { code: "11", longname: "Dhamar" },
            { code: "14", longname: "Ma'rib" },
            { code: "15", longname: "Sa‘dah" },
            { code: "16", longname: "San‘a'" },
            { code: "18", longname: "Aḑ Ḑāli‘" },
            { code: "19", longname: "‘Amrān" },
            { code: "20", longname: "Al Bayda'" },
            { code: "21", longname: "Al Jawf" },
            { code: "22", longname: "Ḩajjah" },
            { code: "23", longname: "Ibb" },
            { code: "24", longname: "Laḩij" },
            { code: "25", longname: "Ta‘izz" }
        ]
    },
    {
        code: "YT",
        longname: "Mayotte",
        regions: [
            { code: "", longname: "All Regions" }
        ]
    },
    {
        code: "ZA",
        longname: "South Africa",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "02", longname: "KwaZulu-Natal" },
            { code: "03", longname: "Free State" },
            { code: "05", longname: "Eastern Cape" },
            { code: "06", longname: "Gauteng" },
            { code: "07", longname: "Mpumalanga" },
            { code: "08", longname: "Northern Cape" },
            { code: "09", longname: "Limpopo" },
            { code: "10", longname: "North-West" },
            { code: "11", longname: "Western Cape" }
        ]
    },
    {
        code: "ZM",
        longname: "Zambia",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Western" },
            { code: "02", longname: "Central" },
            { code: "03", longname: "Eastern" },
            { code: "04", longname: "Luapula" },
            { code: "05", longname: "Northern" },
            { code: "06", longname: "North-Western" },
            { code: "07", longname: "Southern" },
            { code: "08", longname: "Copperbelt" },
            { code: "09", longname: "Lusaka" }
        ]
    },
    {
        code: "ZW",
        longname: "Zimbabwe",
        regions: [
            { code: "", longname: "All Regions" },
            { code: "01", longname: "Manicaland" },
            { code: "02", longname: "Midlands" },
            { code: "03", longname: "Mashonaland Central" },
            { code: "04", longname: "Mashonaland East" },
            { code: "05", longname: "Mashonaland West" },
            { code: "06", longname: "Matabeleland North" },
            { code: "07", longname: "Matabeleland South" },
            { code: "08", longname: "Masvingo" },
            { code: "09", longname: "Bulawayo" },
            { code: "10", longname: "Harare" }
        ]
    },
];