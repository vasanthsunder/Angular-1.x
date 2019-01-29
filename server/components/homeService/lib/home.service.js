/* jshint -W116 */
/* jshint -W083 */
'use strict';

var Emitter = require('events').EventEmitter;
var util = require('util');
var Verror = require('verror');
var log = require('debug')('HomeService');

var Model = require('./home.model.js');
var Response = require('./serviceResult.model');
var Client = require('node-rest-client').Client;

var ItemService = function(configuration) {
  Emitter.call(this);
  var self = this;
  var continueWith = null;

  var config = configuration;
  var client = new Client();

  // Validate Service Input
  if(!config) {
    config = {};
  }

  if(!config.name) {
    config.name = process.env.USER || 'DEFAULT VALUE';
  }

  //////////////////////// INITIALIZATION DONE


  // READ
  var readItem = function() {
    log('Info: ' + JSON.stringify('readItem', null, 2));

    client.get("http://private-9a11f-smartparkgarage.apiary-mock.com/api/users", function (data, response) { 
      return self.emit('send-data', data);
    });
    
  };

  // Create an Okay Result
  var sendData = function(data) {
    var result = new Response();
    result.success = true;
    result.message = 'All Good';
    result.data = data;
    if(continueWith) {
      continueWith(null, result);
    }
  };

  // Create a Bad Result
  var sendError = function(err, message) {
    var result = new Response();
    result.success = false;
    result.message = message;

    if(err) {
      var error = new Verror(err, message);
      log('Failure: ' + JSON.stringify(error, null, 2));
    }
    if(continueWith) {
      continueWith(null, result);
    }
  };

  /////////////////////////////////////////

  self.read = function(done) {
    continueWith = done;
    self.emit('read-item');
  };

  self.on('read-item', readItem);
  self.on('send-data', sendData);
  self.on('send-error', sendError);

  return self;
};

util.inherits(ItemService,Emitter);
module.exports = ItemService;
