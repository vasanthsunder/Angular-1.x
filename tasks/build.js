'use strict';

/**
 * Build task
 */

var gulp                 = require('gulp');
var path                 = require('path');
var sq                   = require('streamqueue');
var runSequence          = require('run-sequence');
var del                  = require('del');
var $ = require('gulp-load-plugins')({ lazy: true });

module.exports = function (done) {
  runSequence(
    ['clean:dist', 'sass'],
    ['usemin', 'copy:dist'],
    ['scripts', 'cssmin'],
    done);
};

gulp.task('clean:dist', function (done) {
  del(['dist/**', '!dist', '!dist/.git{,/**}'])
    .then(function () { done(); }).catch(done);
});


gulp.task('copy:dist', function () {
  var main = gulp.src(['server/**/*', 'package.json'], { base: './' });
  var assets = gulp.src('client/assets/**/*', { base: './' });
  var templates = gulp.src(['client/app/**/*.html', 'client/templates/**/*.html'], { base: './'});

  return sq({ objectMode: true }, main, assets, templates)
    .pipe(gulp.dest('dist/'));
});

gulp.task('usemin', ['inject'], function () {
  return gulp.src('client/index.html')
    .pipe($.plumber())
    .pipe($.usemin({ css: [$.cssUrlRebase({ root: 'client' }), 'concat'] }))
    .pipe(gulp.dest('dist/client/'));
});

gulp.task('cssmin', function () {
  return gulp.src('dist/client/app.css')
    .pipe($.autoprefixer())
    .pipe($.minifyCss())
    .pipe(gulp.dest('dist/client/'));
});

gulp.task('scripts', function () {
  return gulp
    .src('dist/client/app.js')
    .pipe($.ngAnnotate())
    .pipe($.uglify())
    .pipe(gulp.dest('dist/client'));
});