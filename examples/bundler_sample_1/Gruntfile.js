//var _ = require( "underscore" ),
//	_s = require( "underscore.string" ),
//	path = require( "path" ),
	//assetManager = require( "./WebServer/Libraries/assetManager.js" );
//	assetManager = require( "assetManager.js" );

module.exports = function( grunt ) {

	grunt.initConfig( {
		assetbundler : {
			dist : {
				options : {
					mode : "prod",
					assetLibrary : {
						srcDir : "AssetLibrary/",
						destDir : "WebServer/Static/AssetLibrary-assets/"
					},
					appPages : {
						srcDir : "WebServer/AppPages/",
						destDir : "WebServer/Static/AppPages-assets/",
						filesToIgnore : /_.*/,
						directoriesToIgnore : /__.*/
					},
					staticDir : "WebServer/Static/",
					//rootDir : __dirname,
					serverSideTemplateSuffix : ".swig",
					useDirectoriesForDependencies : true,
					minificationTasks : [
						{
							name : "htmlmin",
							suffixes : [ ".tmpl" ],
							options : {
								removeComments : true
							}
						},
						{
							name : "uglify",
							suffixes : [ ".js" ],
							options : {
								mangle : false
							}
						}
					]
				}
			}
		}
	} );

	grunt.loadNpmTasks( "grunt-contrib-sass");
	grunt.loadNpmTasks( "grunt-contrib-compass" );
	grunt.loadNpmTasks( "grunt-contrib-less");
	grunt.loadNpmTasks( "grunt-contrib-coffee");
	grunt.loadNpmTasks( "grunt-contrib-stylus");
	grunt.loadNpmTasks( "grunt-contrib-watch" );
	grunt.loadNpmTasks( "grunt-contrib-htmlmin" );
	grunt.loadNpmTasks( "grunt-contrib-uglify" );
	grunt.loadNpmTasks( "grunt-asset-bundler" );

};
