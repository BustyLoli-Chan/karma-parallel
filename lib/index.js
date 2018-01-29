'use strict';

// jshint node: true
// let coverage;
// try { coverage = require('karma-coverage'); } catch (er) { coverage = {}}

const parallel = {
  'framework:parallel': ['type', require('./framework')],
  'middleware:parallel': ['factory', require('./middleware')]
};

// Overwrite other reporters if parallel is enabled
// this is required because the angular CLI DEMANDS coverage-istanbul 
// and the only way to get rid of it is to replace the default implementation
/*if (coverage['reporter:coverage']) {
  coverage = { 'reporter:coverage': ['type', require('./reporter')]};
} else if (coverage['reporter:coverage-istanbul']) {
  coverage = { 'reporter:coverage-istanbul': ['type', require('./reporter')]};
} else {
  parallel['reporter:coverage-parallel'] = ['type', require('./reporter')];
}*/
const coverage = {
  'reporter:coverage': ['type', require('./karma/reporter')],
  'reporter:coverage-istanbul': ['type', require('./istanbul/reporter')],
  'reporter:coverage-parallel': ['type', require('./karma/reporter')]
}

module.exports = Object.assign({}, coverage, parallel);
