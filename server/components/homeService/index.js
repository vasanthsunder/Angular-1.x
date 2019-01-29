'use strict';

var homeService = require('./lib/home.service');

var HomeService = function(){
  var self = this;
  var service = null;

  self.setup = function (config){
    service = new homeService(config);
  };

  self.get = function(done) {
    service.read(function(err, result) {
      done(err, result.data);
    });
  };

  return self;
};

module.exports = new HomeService();