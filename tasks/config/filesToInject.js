/**
 * Files injected into index.html by gulp-inject
 * used by tasks inject & watch
 */

module.exports = [
  'client/app/*.js',
  'client/app/**/*.module.js',
  'client/app/**/*.*.js',
  '!' + 'client/app/**/*.spec.js',
  '!' + 'client/app/**/*.e2e.js'
];
