/**
 * Core/FileManager.js
 *
 * Manage and load files
 *
 * This file is part of ROBrowser, Ragnarok Online in the Web Browser (http://www.robrowser.com/).
 *
 * @author Vincent Thibault
 */

define(  ['Loaders/GameFile', 'Loaders/Targa', 'Loaders/LuaByte', 'Loaders/World', 'Loaders/Ground', 'Loaders/Altitude', 'Loaders/Model', 'Loaders/Sprite', 'Loaders/Action', 'Core/FileSystem'],
function(          GameFile,           Targa,           LuaByte,           World,           Ground,           Altitude,           Model,           Sprite,           Action,        FileSystem )
{
	"use strict";


	/**
	 * FileManager namespace
	 */
	var FileManager = {};


	/**
	 * Where is the remote client located ? 
	 * @var {string} http
	 */
	FileManager.remoteClient = "";


	/**
	 * List of Game Archives loads
	 * @var {array} GameFile[]
	 */
	FileManager.gameFiles = [];


	/**
	 * Initialize file manager with a list of files
	 *
	 * @param {mixed} grf list
	 */
	FileManager.init = function Init( grfList )
	{
		
		var i, count;
		var list = [];

		// load GRFs from a file (DATA.INI)
		if (typeof grfList === 'string') {
			var files = FileSystem.search( grfList );

			if (files.length) {
				var content = (new FileReaderSync()).readAsText(files[0]);

				var result;
				var regex = /(\d+)=([^\s]+)/g;

				// Get a list of GRF
				while (result = regex.exec(content)) {
					list[ parseInt(result[1]) ] = result[2];
				}
	
				// Remove empty slot from list
				for (i = 0, count = list.length; i < count; ) {
					if (list[i] == undefined) {
						list.splice(i, 1);
						count--;
						continue;
					}
					i++;
				}

				grfList = list;
			}

			else {
				grfList = /\.grf$/i;
			}
		}

		// Load grfs from a list defined by the user
		if (grfList instanceof Array) {
			list = grfList;
			for (i = 0, count = list.length; i < count; ++i) {
				list[i] = FileSystem.getFile( list[i] );
			}

			list.sort(function(a,b){
				return a.size - b.size;
			});
		}

		// Search GRF from a regex
		if (grfList instanceof RegExp) {
			list = FileSystem.search( grfList );
		}

		// Load Game files
		for (i = 0, count = list.length; i < count; ++i) {
			FileManager.addGameFile(list[i]);
		}
	};


	/**
	 * Add a game archive to the list
	 *
	 * @param {File} file to load
	 */
	FileManager.addGameFile = function AddGameFile( file )
	{
		try {
			var grf = new GameFile();
			grf.load(file);
	
			this.gameFiles.push(grf);

			if (this.onGameFileLoaded) {
				this.onGameFileLoaded( file.name );
			}
		}
		catch(e) {
			if (this.onGameFileError) {
				this.onGameFileError( file.name, e.message );
			}
		}
	};


	/**
	 * Clean up Game files
	 */
	FileManager.clean = function Clean()
	{
		this.gameFiles.length = 0;
	};


	/**
	 * Search a file in each GameFile
	 *
	 * @param {RegExp} regex
	 * @return {Array} filename list
	 */
	FileManager.search = function Search( regex )
	{
		// Use hosted client (only one to be async ?)
		if( !this.gameFiles.length && this.remoteClient ) {
			var req    = new XMLHttpRequest();
			req.open('POST', this.remoteClient, false);
			req.setRequestHeader("Content-type","application/x-www-form-urlencoded");
			req.overrideMimeType('text/plain; charset=ISO-8859-1');
			req.send('filter=' + encodeURIComponent(regex.source));
			return req.responseText.split("\n");
		}

		var i, count, j, size;
		var fileList, out, matches;

		fileList = this.gameFiles;
		count    = fileList.length;
		out      = {};

		for( i = 0; i < count; ++i ) {
			matches = fileList[i].table.data.match(regex);

			if ( matches !== null ) {
				// Remove duplicates
				for( j = 0, size = matches.length; j < size; ++j ) {
					out[ matches[j] ] = 1;
				}
			}
		}

		return Object.keys(out);
	};


	/**
	 * Get a file
	 *
	 * @param {string} filename
	* @return {ArrayBuffer} buffer
	 */
	FileManager.get = function Get( filename, noerror )
	{
		var i, count;
		var path, buffer, file;
		var fileList;

		// GRF path is as window : dir\to\location.txt
		filename = filename.replace(/^\s+|\s+$/g, '');

		// Search in filesystem
		file = FileSystem.getFile(filename);
		if (file) {
			return (new FileReaderSync()).readAsArrayBuffer(file);
		}

		path     = filename.replace( /\//g, '\\');
		fileList = this.gameFiles;
		count    = fileList.length;

		for( i=0; i<count; ++i ) {
			buffer = fileList[i].getFile( path );

			if( buffer ) {
				return buffer;
			}
		}

		// Not in GRFs ? Try to load it from
		// remote client host
		buffer = this.getHTTP( filename );

		// File is impossible to find...
		if( !buffer && !noerror ) {
			throw new Error("FileManager::get() - Can't find file in GRF and remote host");
		}

		return buffer;
	};


	/**
	 * Trying to load a file from the remote host
	 *
	 * @param {string} filename
	 * @return {string|ArrayBuffer}
	 */
	FileManager.getHTTP = function GetHTTP( filename )
	{
		var xhr;

		// Use http request here (ajax)
		if( this.remoteClient ) {

			// Don't load mp3 sounds to avoid blocking the queue
			// They can be load by the HTML5 Audio / Flash directly.
			if( filename.match(/\.(mp3|wav)$/) ) {
				return this.remoteClient + filename;
			}

			xhr = new XMLHttpRequest();
			xhr.open('GET', this.remoteClient + filename, false);
			xhr.responseType = "arraybuffer";

			// Can throw an error if not connected to internet
			try {
				xhr.send(null);
			}
			catch(e) {
				return null;
			}

			if( xhr.status === 200 && xhr.response && xhr.response.byteLength ) {
				return xhr.response;
			}
		}

		return null;
	};


	/**
	 * Load a file
	 *
	 * @param {string} filename
	 * @return {string|object}
	 */
	FileManager.load = function Load( filename, noerror, args )
	{
		var buffer;
		var ext;

		filename = filename.replace(/^\s+|\s+$/g, '');
		ext      = filename.match(/.[^\.]+$/).toString().substr(1).toLowerCase();

		buffer = this.get( filename, !!noerror );

		if( !buffer ) {
			return null;	
		}

		switch( ext ) {

			// Regular images files
			case 'jpg':
			case 'jpeg':
			case 'bmp':
			case 'gif':
			case 'png':
				return URL.createObjectURL(
					new Blob( [buffer], { type: "image/" + ext })
				);

			case 'tga':
				return buffer;

			// Audio
			case 'wav':
			case 'mp3':
				// From GRF : change the data to an URI
				if( buffer instanceof ArrayBuffer ) {
					return URL.createObjectURL(
						new Blob( [buffer], { type: "audio/" + ext })
					);
				}
				return buffer;

			// Texts
			case 'txt':
			case 'xml':
			case 'lua':
				var i, count, str, uint8;
				uint8 = new Uint8Array(buffer);
				count = uint8.length;
				str   = "";

				for ( i=0; i<count; ++i ) {
					if( uint8[i] === 0 ) {
						break;
					}
					str += String.fromCharCode( uint8[i] );
				}
				return str;

			// Sprite
			case 'spr':
				var spr = new Sprite(buffer);
				if( args && args.to_rgba ) {
					spr.switchToRGBA();
				}
				return spr.compile();

			// Binary
			case 'rsw': return new World(buffer);
			case 'gnd': return new Ground(buffer);
			case 'gat': return new Altitude(buffer);
			case 'rsm': return new Model(buffer);
			case 'act': return new Action(buffer).compile();
			case 'lub': return new LuaByte(buffer).reverse();
		}

		return buffer;
	};


	/**
	 * Export
	 */
	return FileManager;
});