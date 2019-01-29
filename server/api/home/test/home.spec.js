'use strict';

var should = require('should');
var app = require('../../../server');
var request = require('supertest');

describe('GET /api/v1/home', function() {

  it('should respond with JSON data', function(done) {
    request(app)
      .get('/api/v1/home')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        res.body.generator.should.be.equal("yo-generator");
        done();
      });
  });
});