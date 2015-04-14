'use strict';

var Schema = require('./Schema');
var Model = require('./Model');

var debug = require('debug')('dynamodel');

function Dynamodel () {
  this.models = {};

  this.defaults = {
    create: true,
    waitForActive: true, // Wait for table to be created
    waitForActiveTimeout: 180000, // 3 minutes
    prefix: ''
  }; // defaults
}

Dynamodel.prototype.model = function(name, schema, options) {
  options = options || {};

  for(var key in this.defaults) {
    options[key] = (typeof options[key] === 'undefined') ? this.defaults[key] : options[key];
  }

  name = options.prefix + name;

  debug('Looking up model %s', name);

  if(this.models[name]) {
    return this.models[name];
  }
  if (!(schema instanceof Schema)) {
    schema = new Schema(schema);
  }

  var model = Model.compile(name, schema, options, this);
  this.models[name] = model;
  return model;
};

Dynamodel.prototype.AWS = require('aws-sdk');

Dynamodel.prototype.local = function (url) {
  this.endpointURL = url || 'http://localhost:8000';
  debug('Setting DynamoDB to local (%s)', this.endpointURL);
};

Dynamodel.prototype.ddb = function () {
  if(this.dynamoDB) {
    return this.dynamoDB;
  }
  if(this.endpointURL) {
    debug('Setting DynamoDB to %s', this.endpointURL);
    this.dynamoDB = new this.AWS.DynamoDB({ endpoint: new this.AWS.Endpoint(this.endpointURL) });
  } else {
    debug('Getting default DynamoDB');
    this.dynamoDB = new this.AWS.DynamoDB();
  }
  return this.dynamoDB;
};

Dynamodel.prototype.setDefaults = function (options) {

  for(var key in this.defaults) {
    options[key] = (typeof options[key] === 'undefined') ? this.defaults[key] : options[key];
  }

  this.defaults = options;
};

Dynamodel.prototype.Schema = Schema;
Dynamodel.prototype.Table = require('./Table');
Dynamodel.prototype.Dynamodel = Dynamodel;

module.exports = new Dynamodel();
