'use strict';

/**
 * Preview the build app
 */

var os = require('os');
var gulp = require('gulp');
var open = require('gulp-open');

var config = require('../server/config/environment');



module.exports = function () {
  process.env.NODE_ENV = 'production';
  require('../dist/server/server');
  return gulp.src('')
  .pipe(open({uri: 'http://localhost:' + config.port}));
};