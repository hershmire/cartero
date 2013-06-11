var _ = require( "underscore" ),
	_s = require( "underscore.string" ),
	assetBundlerUtil = require( "./util" ),
	crypto = require( "crypto" ),
	fs = require( "fs" ),
	path = require( "path" ),
	findit = require( "findit" ),
	Walker = require( "./walker" ),
	File = require( "./file" );

var kBundleFileName = "bundle.json";

//function Bundle( name, folder, dependencies, files, keepSeparate ) {
function Bundle( properties ) {

	//console.log( "in Bundle constructor" );

	//this.name = name;
	//this.folder = folder;
	//this.dependencies = dependencies;
	//this.files = files;
	//this.keepSeparate = keepSeparate;

	//console.log( "creating a bundle: " + properties.name );
	if( ! _.isUndefined( properties ) )
		_.extend( this, properties );

	console.log( "stored bundle name: " + this.name );

	this.filesToServe = [];
}

Bundle.prototype = {

	getFilesToServe : function( bundlesAlreadyInParcel, mode, forceKeepSeparate ) {

		//console.log( "in Bundle.prototype.getFilesToServe" );

		//console.log( "getFilesToServe for " + this.name );

		//if( this.name === "App/Client/FieldDefinition" )
		//	throw new Error( "found it!" );

		var _this = this;

		var files = this.getLocalFiles();

		var keepSeparateFiles = [];
		var dependentFiles = [];

		//var dependencies = this.getDependencies();

		//console.log( this.dependencies );
		//console.log( _.pluck( dependencies, "name" ) );

		_.each( this.dependencies, function( dependency ) {

			if( _.contains( bundlesAlreadyInParcel, this ) )
				throw new Exception( "CIRCULAR DEPENDENCY! AHHH! " + this.name );

			if( _.contains( bundlesAlreadyInParcel, dependency ) ) {
				console.log( "dependency " + dependency.name + " already in parcel. ignoring." );
				return;
			}

			//console.log( "label 2 " + dependency.name );

			console.log( "dependency:" );
			console.log( dependency );
			if( dependency.keepSeparate )
				keepSeparateFiles = _.union( dependency.getFilesToServe( bundlesAlreadyInParcel, mode ), keepSeparateFiles );
			else
				dependentFiles = _.union( dependentFiles, dependency.getFilesToServe( bundlesAlreadyInParcel, mode )  );

		} );

		files = _.union( keepSeparateFiles, dependentFiles, files );

		//console.log( files );

		bundlesAlreadyInParcel.push( this );

		var keepSeparate = _.isUndefined( forceKeepSeparate ) ? this.keepSeparate : forceKeepSeparate;

		if( keepSeparate && mode === "prod" )
			files = this.mergeFiles( files );

		return files;

	},

	expandDependencies : function( bundleRegistry ) {
		var _this = this;

		var expandedDependencies = [];

		_.each( this.dependencies, function( bundleName ) {
			if( bundleName.indexOf( "*" ) !== -1 ) {
				expandedDependencies = _.union( expandedDependencies, assetBundlerUtil.expandDependencyWithWildcard( bundleName, _.pluck( bundleRegistry, "name" ) ) );
			}
			else {
				expandedDependencies.push( bundleName );
			}
		} );

		expandedDependencies = _.map( expandedDependencies, function( bundleName ) {
			if( _.isUndefined( bundleRegistry[ bundleName ] ) ) {
				console.log( "Could not find bundle in bundle map: " + bundleName );
			}
			return bundleRegistry[ bundleName ];
		} );

		var keepSeparateDependencies = _.filter( expandedDependencies, function( dependency ) {
			return dependency.keepSeparate;
		} );

		// move keepSeparate dependencies to the beginning of the list
		// TODO explain why...
		expandedDependencies = _.union( keepSeparateDependencies, expandedDependencies );

		return expandedDependencies;
	},

	getLocalFiles : function() {
		return this.files;
	},

	getBundleFolder : function() {
		//return options.assetLibrary.destDir + this.name;
		return this.folder;
	},

	mergeFiles : function( files ) {

		var _this = this;

		var mergedFiles = [];

		var filesToConcat = [];


		_.each( files, function( file ) {

			if( file.keepSeparate ) {
				mergedFiles.push( file );
			}
			else {
				//build list of files for each file type
				filesToConcat.push( file );
			}
		} );

		var filesByType = getFilesByType( filesToConcat );

		_.each( filesByType, function( files, fileType ) {

			//console.log( filePaths );
			var filePathsHash = createHash( _.pluck( files, "path" ) );

			if( _.contains( _.pluck( _this.filesToServe, "hash" ), filePathsHash ) ) {
				//console.log( "file already exists!" );
				//need to push the combined file onto mergedFiles
				var combinedFile = _.find( _this.filesToServe, function( combinedFile ) {
					return combinedFile.hash === filePathsHash;
				} );

				mergedFiles.push( combinedFile );
			}
			else {
				//console.log( "file does not exist. need to create it!" );

				var combinedFile = new File();

				combinedFile.hash = filePathsHash;
				combinedFile.path = path.join( _this.getBundleFolder(), _this.name.substring( _this.name.lastIndexOf( "/" ) + 1 ) + "_" + filePathsHash ) + "." + fileType;
				combinedFile.keepSeparate = true;
				combinedFile.type = fileType;
				combinedFile.sourceFilePaths = _.pluck( files, "path" );
				combinedFile.filePathsHash = filePathsHash;
				_this.filesToServe.push( combinedFile );

				mergedFiles.push( combinedFile );
			}
		} );

		// for each file type list, combine the files and insert into combinedFiles
		// and append to this.combinedFiles

		return mergedFiles;
	},

	buildCombinedFiles : function() {

		var _this = this;

		_.each( _this.filesToServe, function( file ) {

			var combinedFileContents = _.map( file.sourceFilePaths, function( filePath ) {
				return fs.readFileSync( filePath ).toString() ;
			} ).join( "\n" );

			var hash = crypto.createHash( "sha1" ).update( combinedFileContents ).digest( "hex" );

			file.path = file.path.replace( file.filePathsHash, hash );

			fs.writeFileSync( file.path, combinedFileContents );

		} );
	}

};

function getFilesByType( files ) {

	var fileTypes = {};
	_.each( files, function( file ) {
		var fileType = file.getFileType();
		fileTypes[ fileType ] = fileTypes[ fileType ] || [];
		fileTypes[ fileType ].push( file );
	} );

	return fileTypes;
}

function createHash( filePaths ) {
	return crypto.createHash( "sha1" ).update( filePaths.join( "," ) ).digest( "hex" );
}

function createRegistryForDirectory( directory, rootDir, options, dirOptions ) {

	var bundleRegistry = {};

	var fileDependencies = [];
	var bundleDependencies = [];

	var directoriesToFlatten = dirOptions.directoriesToFlatten;
	var keepSeparate = false;
	var prioritizeFlattenedSubdirectories = false;
	var filePriority = [];
	var filesToIgnore = [];
	var browserifyAutorun = [];
	var dynamicallyLoadedFiles = [];
	var devModeOnlyFiles = [];
	var prodModeOnlyFiles = [];

	var walker = new Walker( directory );

	var files = walker.ls();

	var namespacePrefix = dirOptions.namespace ? dirOptions.namespace + "/" : "";
	var bundleName = namespacePrefix + directory.substring( rootDir.length + 1 );
	var bundleDestFolder = path.join( dirOptions.destDir, directory.substring( rootDir.length + 1 ) );

	function resolveFileName( fileName ) {
		return path.join( dirOptions.destDir, walker.fullPath( assetBundlerUtil.mapAssetFileName( fileName, options.assetExtensionMap ) ).substring( rootDir.length + 1 ) );
	}

	if( _.contains( _.keys( files ), kBundleFileName ) ) {
		var bundleFileContents = walker.cat( kBundleFileName );
		var bundleJSON;

		try {
			bundleJSON = JSON.parse( bundleFileContents.toString() );
		}
		catch( e ) {
			throw new Error( "Failed to parse contents of bundle.json file in " + bundleName );
		}

		//var name = bundleJSON[ "name" ];
		var deps = bundleJSON[ "dependencies" ];
		var keepSep = bundleJSON[ "keepSeparate" ];
		var dirToFlatten = bundleJSON[ "directoriesToFlatten" ];
		var filePri = bundleJSON[ "filePriority" ];
		var ignoreFiles = bundleJSON[ "filesToIgnore" ];


		if( ! _.isUndefined( dirToFlatten ) ) {
			directoriesToFlatten = dirToFlatten;
		}

		if( ! _.isUndefined( deps ) ) {
			bundleDependencies = _.union( bundleDependencies, deps );
		}

		if( ! _.isUndefined( keepSep ) ) {
			keepSeparate = keepSep;
		}

		if( ! _.isUndefined( filePri ) ) {
			filePriority = _.map( filePri, function( fileName ) {
				return resolveFileName( fileName );
			} );
		}

		if( ! _.isUndefined( ignoreFiles ) ) {
			filesToIgnore = _.map( ignoreFiles, function( ignoreFile ) {
				return resolveFileName( fileName );
			} );
		}

		if( ! _.isUndefined( bundleJSON[ "prioritizeFlattenedSubdirectories" ] ) )
			prioritizeFlattenedSubdirectories = bundleJSON[ "prioritizeFlattenedSubdirectories" ];

		if( ! _.isUndefined( bundleJSON[ "browserifyAutorun" ] ) )
			browserifyAutorun = _.map( bundleJSON[ "browserifyAutorun" ], function( autorunFiles ) {
				return path.join( directory, autorunFiles );
			} );

		if( ! _.isUndefined( bundleJSON[ "dynamicallyLoadedFiles" ] ) )
			dynamicallyLoadedFiles = _.map( bundleJSON[ "dynamicallyLoadedFiles" ], function( dynamicallyLoadedFile ) {
				return resolveFileName( dynamicallyLoadedFile );
			} );

		if( ! _.isUndefined( bundleJSON[ "prodModeOnlyFiles" ] ) )
			prodModeOnlyFiles = _.map( bundleJSON[ "prodModeOnlyFiles" ], function( fileName ) {
				return resolveFileName( fileName );
			} );

		if( ! _.isUndefined( bundleJSON[ "devModeOnlyFiles" ] ) )
			devModeOnlyFiles = _.map( bundleJSON[ "devModeOnlyFiles" ], function( fileName ) {
				return resolveFileName( fileName );
			} );
	}

	_.each( _.keys( files ), function( fileName ) {
		var fileStats = files[ fileName ];

		console.log( "directoriesToFlatten:" );
		console.log( directoriesToFlatten );

		if( fileStats.isDirectory() ) {
			if( _s.startsWith( fileName, "__" ) ) {
				return;
			}
			else if( ( _.isArray( directoriesToFlatten ) && _.contains( directoriesToFlatten, fileName ) ) || ( _.isRegExp( directoriesToFlatten ) && directoriesToFlatten.test( fileName ) ) ) {
				var assetFiles = _.filter( findit.sync( walker.fullPath( fileName ) ), function( fileName ) {
						return assetBundlerUtil.isAssetFile( fileName, options.validOriginalAssetExt ) ;
					} );


				var subdirectoryFiles = _.map( assetFiles, function( assetFile ) {
					return assetBundlerUtil.mapAssetFileName( path.join( dirOptions.destDir, path.join( assetFile.substring( rootDir.length ) ) ), options.assetExtensionMap );
				} );

				//if prioritizeSubdirectories is true, append the subdirectoryFiles at the beginning.
				//otherwise append them at the end
				if( prioritizeFlattenedSubdirectories ) {
					fileDependencies = _.union( subdirectoryFiles, fileDependencies );
				}
				else
					fileDependencies = _.union( fileDependencies, subdirectoryFiles );

			}
			else {
				_.extend( bundleRegistry, createRegistryForDirectory( walker.fullPath( fileName ), rootDir, options, dirOptions ) );
			}
		}
		else if( fileStats.isFile() ) {
			if( assetBundlerUtil.isAssetFile( fileName, options.validOriginalAssetExt ) ) {

				var resolvedFileName = path.join( dirOptions.destDir, walker.fullPath( assetBundlerUtil.mapAssetFileName( fileName, options.assetExtensionMap ) ).substring( rootDir.length + 1 ) );

				//if prioritizeSubdirectories is true, append the file at the end.
				//otherwise append it at the beginning
				if( prioritizeFlattenedSubdirectories )
					fileDependencies.push( resolvedFileName );
				else
					fileDependencies.unshift( resolvedFileName );
			}
		}
	} );

	// if childrenDependOnParents is true, add the parent directory to the dependencies (as long as we are not already at the root )
	if( dirOptions.childrenDependOnParents && directory.substring( rootDir.length + 1 ).indexOf( "/" ) != -1 ) {
		bundleDependencies.push( namespacePrefix + directory.replace( /\/\w+$/, "" ).substring( rootDir.length + 1 ) );
	}

	// if priority files are specified, push them to the beginning
	if( filePriority.length > 0 ) {

		var invalidFilesInFilePriority = _.difference( filePriority, fileDependencies );

		if( invalidFilesInFilePriority.length > 0 )
			throw new Error( "The following files listed in the filePriority in the bundle.json of " + bundleName + " do not exist: " + invalidFilesInFilePriority.join( ",") );

		fileDependencies = _.union( filePriority, _.difference( fileDependencies, filePriority ) );

	}

	//remove dynamically loaded files from the file dependencies list
	if( dynamicallyLoadedFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, dynamicallyLoadedFiles );

	console.log( "number of prod mode only files: " + prodModeOnlyFiles.length );
	console.log( prodModeOnlyFiles );
	console.log( fileDependencies );
	if( options.mode === "dev" && prodModeOnlyFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, prodModeOnlyFiles );
	else if( options.mode === "prod" && devModeOnlyFiles.length > 0 )
		fileDependencies = _.difference( fileDependencies, devModeOnlyFiles );

	// remove files that we want to ignore
	if( filesToIgnore.length > 0 )
		fileDependencies = _.difference( fileDependencies, filesToIgnore );

	var fileObjects = 

	bundleRegistry[ bundleName ] = new Bundle( {
		name : bundleName,
		folder : bundleDestFolder,
		files : _.map( fileDependencies, function( filePath ) {
			return new File( {
				path : filePath,
				keepSeparate : false
			} );
		} ),
		directoriesToFlatten : directoriesToFlatten,
		dependencies : bundleDependencies,
		keepSeparate : keepSeparate,
		browserifyAutorun : browserifyAutorun,
		dynamicallyLoadedFiles : dynamicallyLoadedFiles
	} );

	return bundleRegistry;
}

Bundle.createRegistry = function( dirs, options ) {
	var bundleRegistry = {};
	_.each( dirs, function( dirOptions ) {
		_.extend (bundleRegistry, createRegistryForDirectory( dirOptions.path, dirOptions.path, options, dirOptions ) );
	} );

	_.each( bundleRegistry, function ( bundle ) {
		bundle.dependencies = bundle.expandDependencies( bundleRegistry );
	} );

	return bundleRegistry;
};

module.exports = Bundle;