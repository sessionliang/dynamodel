var chai = require('chai');
var greet = require('../lib/hello');

describe('hello', function () {
    it('should say Hello to the World', function () {
        chai.expect(greet('World')).to.equal('Hello, World!');
    });
});