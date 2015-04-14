'use strict';
var debug = require('debug')('dynamodel:attribute');

var util = require('util');

var moment = require('moment');

var errors = require('./errors');

function Attribute(schema, name, type, options) {
    options = options || {};

    this.options = options;

    this.schema = schema;

    this.name = name;

    this.setType(type);

    this.applyDefault(options.default);

    this.required = options.required;
    this.set = options.set;
    this.get = options.get;

    this.applyValidation(options.validate);

    this.applyIndexes(options.index);
}

function datify(v) {
    if (!v.getTime) {
        v = new Date(v);
    }
    var utc = moment(v).utc();
    return utc.format("YYYY-MM-DD") + 'T' + utc.format("hh:mm:ss.SSS") + 'Z';
}

function booleantify(v) {
    return v ? 1 : 0;
}

Attribute.prototype.types = {
    string: {
        name: 'string',
        dynamo: 'S'
    },
    number: {
        name: 'number',
        dynamo: 'N',
        dynamofy: JSON.stringify
    },
    boolean: {
        name: 'boolean',
        dynamo: 'N',
        dynamofy: booleantify
    },
    date: {
        name: 'date',
        dynamo: 'S',
        dynamofy: datify
    },
    object: {
        name: 'object',
        dynamo: 'S',
        dynamofy: JSON.stringify
    },
    array: {
        name: 'array',
        dynamo: 'S',
        dynamofy: JSON.stringify
    },
    buffer: {
        name: 'buffer',
        dynamo: 'B'
    }
};

Attribute.prototype.setType = function (type) {
    if (!type) {
        throw new errors.SchemaError('Invalid attribute type: ' + type);
    }

    if (typeof type === 'function' || (util.isArray(type) && type.length === 1)) {
        this.isSet = util.isArray(type);
        var regexFuncName = /^Function ([^(]+)\(/i;
        var found = type.toString().match(regexFuncName);
        type = found[1];
    } else if (typeof type !== 'string') {
        throw new errors.SchemaError('Invalid attribute type: ' + type);
    }

    type = type.toLowerCase();

    this.type = this.types[type];

    if (!this.type) {
        throw new errors.SchemaError('Invalid attribute type: ' + type);
    }
};

Attribute.prototype.applyDefault = function (dflt) {
    if (dflt === null || dflt === undefined) {
        delete this.default;
    } else if (typeof dflt === 'function') {
        this.default = dflt;
    } else {
        this.default = function () {
            return dflt;
        };
    }
};

Attribute.prototype.applyValidation = function (validator) {
    if (validator === null || validator === undefined) {
        delete this.validator;
    } else if (typeof validator === 'function') {
        this.validator = validator;
    } else if (validator.constructor.name === 'RegExp') {
        this.validator = function (val) {
            return validator.test(val);
        };
    } else {
        this.validator = function (val) {
            return validator === val;
        };
    }
};

Attribute.prototype.applyIndexes = function (indexes) {
    if (indexes === null || indexes === undefined) {
        delete this.indexes;
        return;
    }

    var attr = this;
    attr.indexes = {};

    function applyIndex(i) {
        if (typeof i !== 'object') {
            i = {};
        }

        var index = {};

        if (i.global) {
            index.global = true;

            if (i.rangeKey) {
                index.rangeKey = i.rangeKey;
            }

            if (i.throughput) {
                var throughput = i.throughput;
                if (typeof throughput === 'number') {
                    throughput = { read: throughput, write: throughput };
                }
                index.throughput = throughput;
                if ((!index.throughput.read || !index.throughput.write) &&
                  index.throughput.read >= 1 && index.throughput.write >= 1) {
                    throw new errors.SchemaError('Invalid Index throughput: ' + index.throughput);
                }
            } else {
                index.throughput = attr.schema.throughput;
            }
        }

        if (i.name) {
            index.name = i.name;
        } else {
            index.name = attr.name + (i.global ? 'GlobalIndex' : 'LocalIndex');
        }

        if (i.project !== null && i.project !== undefined) {
            index.project = i.project;
        } else {
            index.project = true;
        }


        if (attr.indexes[index.name]) {
            throw new errors.SchemaError('Duplicate index names: ' + index.name);
        }
        attr.indexes[index.name] = index;
    }

    if (util.isArray(indexes)) {
        indexes.map(applyIndex);
    } else {
        applyIndex(indexes);
    }
};

Attribute.prototype.setDefault = function (model) {
    var val = model[this.name];
    if ((val === null || val === undefined || val === '') && this.default) {
        model[this.name] = this.default();
        debug('Defaulted %s to %s', this.name, model[this.name]);
    }
};

Attribute.prototype.toDynamo = function (val, noSet) {

    if (val === null || val === undefined || val === '') {
        if (this.required) {
            throw new errors.ValidationError('Requried value missing: ' + this.name);
        }
        return null;
    }

    if (!noSet && this.isSet) {
        if (!util.isArray(val)) {
            throw new errors.ValidationError('Values must be array: ' + this.name);
        }
        if (val.length === 0) {
            return null;
        }
    }

    if (this.validator && !this.validator(val)) {
        throw new errors.ValidationError('Validation failed: ' + this.name);
    }

    if (this.set) {
        val = this.set(val);
    }

    var type = this.type;
    var isSet = this.isSet && !noSet;
    var dynamoObj = {};
    if (isSet) {
        dynamoObj[type.dynamo + 'S'] = val.map(function (v) {
            if (type.dynamofy) {
                return type.dynamofy(v);
            }
            v = v.toString();
            if (type.dynamo === 'S') {
                if (this.options.trim) {
                    v = v.trim();
                }
                if (this.options.lowercase) {
                    v = v.toLowerCase();
                }
                if (this.options.uppercase) {
                    v = v.toUpperCase();
                }
            }

            return v;
        }.bind(this));
    } else {
        if (type.dynamofy) {
            val = type.dynamofy(val);
        }
        val = val.toString();
        if (type.dynamo === 'S') {
            if (this.options.trim) {
                val = val.trim();
            }
            if (this.options.lowercase) {
                val = val.toLowerCase();
            }
            if (this.options.uppercase) {
                val = val.toUpperCase();
            }
        }
        dynamoObj[type.dynamo] = val.toString();
    }

    return dynamoObj;
};


Attribute.prototype.parseDynamo = function (json) {

    function dedynamofy(type, isSet, json, transform) {
        if (!json) {
            return;
        }
        if (isSet) {
            var set = json[type + 'S'];
            return set.map(function (v) {
                if (transform) {
                    return transform(v);
                }
                return v;
            });
        }
        var val = json[type];
        if (transform) {
            return transform(val);
        }
        return val;
    }

    function datify(v) {
        debug('parsing date from %s', v);
        return new Date(parseInt(v, 10));
    }
    function bufferify(v) {
        return new Buffer(v);
    }

    var val;
    switch (this.type.name) {
        case 'string':
            val = dedynamofy('S', this.isSet, json);
            break;
        case 'number':
            val = dedynamofy('N', this.isSet, json, JSON.parse);
            break;
        case 'boolean':
            val = dedynamofy('N', this.isSet, json, booleantify);
            break;
        case 'date':
            val = dedynamofy('S', this.isSet, json, datify);
            break;
        case 'object':
            val = dedynamofy('S', this.isSet, json, JSON.parse);
            break;
        case 'array':
            val = dedynamofy('S', this.isSet, json, JSON.parse);
            break;
        case 'buffer':
            val = dedynamofy('B', this.isSet, json, bufferify);
            break;
        default:
            throw new errors.SchemaError('Invalid attribute type: ' + this.type);
    }

    if (this.get) {
        val = this.get(val);
    }

    return val;


};


module.exports = Attribute;