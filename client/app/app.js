(function(){
  'use strict';

  angular.module('app', [
    'ngResource',
    'ui.router',

     // 3rd Party Modules
     'angularGrid',
     // Custom Modules
     'app.home'
  ])

  .config(config);

  function config($stateProvider, $urlRouterProvider, $locationProvider){
    $urlRouterProvider
      .otherwise('/');
    $locationProvider.html5Mode(true);
  }

})();