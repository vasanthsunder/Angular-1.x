(function(){
  'use strict';

  angular
    .module('app.home')
    .controller('HomeCtrl', HomeCtrl)
    .controller('HeaderCtrl', HeaderCtrl);;

    HomeCtrl.$inject = ['$http'];
    HeaderCtrl.$inject = ['$location'];

    function HomeCtrl($http){

      var self = this;
      self.service = null;


    var columnDefs = [
        {headerName: "First Name", field: "firstName"},
        {headerName: "Last Name", field: "lastName"},
        {headerName: "Email", field: "email"},
        {headerName: "Join Date", field: "joinDate"},
        {headerName: "Conatct", field: "contact"}
    ];

    //init();

    

    self.gridOptions = {
        columnDefs: columnDefs,
        rowHeight:50,
        enableSorting:true,
        ready:function(){
          console.log("init");
        },
        rowSelected:function(row){
          console.log(row);
        }
    };

    $http.get('/api/v1/home').success(function(data){
          self.gridOptions.rowData = data;
          self.gridOptions.api.onNewRows(data);

          //self.service = data
        })


      // self.gridOptions = {
      //     rowData: null,
      //     columnDefs: GetColumnDefs(),
      //     rowHeight: 50,
      //     ready: function(){
      //       console.log('ready');
      //       init();
      //     },
      // };

      

      function init(){
        console.log('i am here');
        $http.get('/api/v1/home').success(function(data){
          self.gridOptions.rowData = data;
          self.gridOptions.api.onNewRows(data);

          //self.service = data
        })
      }

      // function GetColumnDefs(){

      //   var columnDefs = [

      //     { headerName : 'firstName'},{ headerName : 'lastName'},{ headerName : 'contact'}];

      //   return columnDefs;

      // }

    }

    function HeaderCtrl($location){
      var vm = this;
      vm.getClass = getClass;

      function getClass(path){
        if ($location.path().substr(0, path.length) === path) {
            return 'active';
          } else {
            return '';
          }
      }
    }

})();
