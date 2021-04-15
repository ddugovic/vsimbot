(function() {
  'use strict';

  var fs = require('fs');
  var request = require('request');
  var sinon = require('sinon');
  var chai = require('chai');
  var should = chai.should();

  var ICC = require('./../src/ICC.js');

  describe('ICC', function() {
    it('should be defined', function() {
      ICC.should.not.be.undefined;
    });

    describe('finger', function() {
      var stub;
      var RATINGS_URL = 'https://statistics.chessclub.com/embed/ratings?user=';

      before(function(done) {
        stub = sinon.stub(request, 'get');
        stub.yields(null, 200, '');

        done();
      });

      after(function(done){
        request.get.restore();
        done();
      });

      it('should make a request to app.chessclub.com/profile', function(done) {
        var handle = 'handle';

        ICC.finger(handle, function(exists, name, title, rating, profileUrl){
          request.get.calledWith(RATINGS_URL + handle).should.equal(true);
          done();
        });
      });

      describe('with publicinfo', function() {
        var handle = 'capilanobridge';

        before(function(done) {
          var fixture = __dirname + '/fixtures/' + handle + '.html';

          fs.readFile(fixture, 'utf8', function(err, data) {
            if (err) { throw err; }

            stub.withArgs(RATINGS_URL + handle).yields(null, 200, data);
            done();
          });
        });

        it('should have a name, title, rating and fide profile url', function(done) {
          ICC.finger(handle, function(exists, name, title, rating, profileUrl) {
            exists.should.be.true;
            name.should.have.length.above(0);
            rating.should.have.length.above(0);
            profileUrl.should.not.be.undefined;

            done();
          });
        });
      });
    });
  });
})();
