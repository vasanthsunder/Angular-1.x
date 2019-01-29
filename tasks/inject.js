'use strict';

/**
 * Inject css/js files in index.html
 */

var gulp       = require('gulp');
var bowerFiles = require('main-bower-files');
var fileSort   = require('gulp-angular-filesort');
var inject     = require('gulp-inject');

var appJS   = require('./config/filesToInject');
var toExclude  = require('./config/bowerFilesToExclude');

module.exports = function () {
  var views = 'client/index.html';

  var paths = {
        bowerDirectory: 'client/bower_components',
        bowerrc: '.bowerrc',
        bowerJson: 'bower.json'
    };

  return gulp
    .src(views)
    .pipe(inject(gulp.src(bowerFiles(paths), { read: false }), {
      name: 'bower',
      relative: 'true',
      ignorePath: toExclude
    }))
    .pipe(inject(gulp.src(appJS), {relative: true}))
    .pipe(gulp.dest('client'));
};
