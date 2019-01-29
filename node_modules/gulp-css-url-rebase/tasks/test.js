'use strict';

var spawn = require('child_process').spawn;

module.exports = function (done) {
  var mocha = spawn('./node_modules/.bin/_mocha');

  mocha.stdout.on('data', function (data) {
    if (data.length > 1) {
      console.log(data.toString());
    }
  });

  mocha.on('close', done);
};