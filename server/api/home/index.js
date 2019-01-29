'use strict';
var express = require('express');
var router = express.Router();

var config = require('../../config/environment');

var homeService = require('../../components/homeService'); 


router.get('/', function(req, res) {

  homeService.setup(config);

  homeService.get(function(err, result) {
    if (err) {
      res.send(err);
    }
    res.json(result);
  });
});

module.exports = router;