'use strict';

var gulp = require('gulp');

gulp.task('test', require('./tasks/test'));
gulp.task('control', require('./tasks/control'));

gulp.task('default', ['control']);