var assert = require("assert")

var greet = require('../lib/hello');

describe('hello', function(){
    it('should say Hello to the World', function(){
      assert.equal(greet('World'), 'Hello, World!');
    });
});