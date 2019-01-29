'use strict';

var gulp = require('gulp');
var jshint = require('gulp-jshint');
var jscs = require('gulp-jscs');
var jscsStyle = require('gulp-jscs-stylish');
var noop = function () {};

module.exports = function (done) {

  var paths = ['index.js', 'test/test.js'];

  gulp.src(paths)
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'))
    .on('finish', function () {
      gulp.src(paths)
        .pipe(jscs())
        .on('error', noop)
        .pipe(jscsStyle())
        .on('end', done);
    });

};