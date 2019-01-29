(function(){
  'use strict';

  angular
    .module('app.home')
    .config(config);

  function config($stateProvider) {

    $stateProvider
      .state('home', {
        url: '/',
        templateUrl: 'app/home/home.html',
        controller: 'HomeCtrl as hc'
      })
      .state('fonts', {
        url: '/fonts',
        templateUrl: 'templates/font.html',
      })
      .state('colors', {
        url: '/colors',
        templateUrl: 'templates/color.html',
      }).state('icons', {
        url: '/icons',
        templateUrl: 'templates/icons.html'
      });
  }
})();