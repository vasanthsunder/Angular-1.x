# gulp-css-url-rebase [![Build Status](https://travis-ci.org/42Zavattas/gulp-css-url-rebase.svg?branch=master)](https://travis-ci.org/42Zavattas/gulp-css-url-rebase)

> Rebase relative image URLs

_This project has been forked to fix issues that were not resolved by its original author._

## Install

    npm install gulp-css-url-rebase --save-dev

## Example

```javascript
var gulp = require('gulp');
var rebase = require('gulp-css-url-rebase');

gulp.task('default', function () {
  gulp.src('css/**/*.css')
    .pipe(rebase())
     .pipe(concat('style.css'))
     .pipe(gulp.dest('./build/'));
});
```

## What it tries to solve

Let's say you have this structure:

    css
    ├ style.css
    ├ some
    │  └ deep-path/
    │     └ style.css
    img
     ├ logo.png
     ├ cat.png
     └ icons/
       ├ home.png
       └ cancel.png

In `css/style.css` you might have:

```css
.sel {
  background: url('../img/icons/home.png') no-repeat top left;
}
```

And in `css/some/deep-path/style.css`:

```css
.item {
  background: url('../../../img/logo.jpg') no-repeat top left;
}
```

When I minify everything, for example to be in `./style.css` in
production. I want this final file for the css above:

```css
.sel {
  background: url('img/icons/home.jpg') no-repeat top left;
}
.item {
  background: url('img/logo.jpg') no-repeat top left;
}
```
