'use strict';

var ServiceResult = function() {
  var result = {};
  result.success = false;
  result.message = null;
  result.data = null;
  return result;
};

module.exports = ServiceResult;