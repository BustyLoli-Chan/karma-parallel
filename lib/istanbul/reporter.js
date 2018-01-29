'use strict';

const istanbul = require('istanbul-api');
const util = require('./util');

const BROWSER_PLACEHOLDER = '%browser%';

function checkThresholds(thresholds, summary) {
  const failedTypes = [];

  Object.keys(thresholds).forEach(key => {
    const coverage = summary[key].pct;
    if (coverage < thresholds[key]) {
      failedTypes.push(key);
    }
  });

  return failedTypes;
}

function CoverageIstanbulReporter(baseReporterDecorator, logger, config) {
  baseReporterDecorator(this);

  // Parallel
  // TODO: Factor these out into a shared file?
  var collectors;
  var aggregator = config.browserId || 'id'; // ADDED BY KARMA-SHARDING

  const log = logger.create('reporter.coverage-parallel.istanbul');
  const browserCoverage = new WeakMap();
  const coverageConfig = Object.assign({}, config.coverageIstanbulReporter);

  function addCoverage(coverageMap, browser) {
    const coverage = browserCoverage.get(browser);
    browserCoverage.delete(browser);

    if (!coverage) {
      return;
    }

    Object.keys(coverage).forEach(filename => {
      const fileCoverage = coverage[filename];
      if (fileCoverage.inputSourceMap && coverageConfig.fixWebpackSourcePaths) {
        fileCoverage.inputSourceMap = util.fixWebpackSourcePaths(fileCoverage.inputSourceMap, config.webpack);
      }
      if (
        coverageConfig.skipFilesWithNoCoverage &&
        Object.keys(fileCoverage.statementMap).length === 0 &&
        Object.keys(fileCoverage.fnMap).length === 0 &&
        Object.keys(fileCoverage.branchMap).length === 0
      ) {
        log.debug(`File [${filename}] ignored, nothing could be mapped`);
      } else {
        coverageMap.addFileCoverage(fileCoverage);
      }
    });
  }

  function logThresholdMessage(thresholds, message) {
    if (thresholds.emitWarning) {
      log.warn(message);
    } else {
      log.error(message);
    }
  }

  function createReport(browserOrBrowsers, results) {
    if (!coverageConfig.combineBrowserReports && coverageConfig.dir) {
      coverageConfig.dir = coverageConfig.dir.replace(BROWSER_PLACEHOLDER, browserOrBrowsers.name);
    }

    const reportConfig = istanbul.config.loadObject({
      reporting: coverageConfig
    });
    const reportTypes = reportConfig.reporting.config.reports;

    const reporter = istanbul.createReporter(reportConfig);
    reporter.addAll(reportTypes);

    const coverageMap = istanbul.libCoverage.createCoverageMap();
    const sourceMapStore = istanbul.libSourceMaps.createSourceMapStore();

    if (coverageConfig.combineBrowserReports) {
      browserOrBrowsers.forEach(browser => addCoverage(coverageMap, browser));
    } else {
      addCoverage(coverageMap, browserOrBrowsers);
    }

    const remappedCoverageMap = sourceMapStore.transformCoverage(coverageMap).map;

    log.debug('Writing coverage reports:', reportTypes);
    reporter.write(remappedCoverageMap);

    const userThresholds = coverageConfig.thresholds;

    const thresholds = {
      emitWarning: false,
      global: {
        statements: 0,
        lines: 0,
        branches: 0,
        functions: 0
      },
      each: {
        statements: 0,
        lines: 0,
        branches: 0,
        functions: 0,
        overrides: {}
      }
    };

    if (userThresholds) {
      if (userThresholds.global || userThresholds.each) {
        Object.assign(thresholds.global, userThresholds.global);
        Object.assign(thresholds.each, userThresholds.each);
        if (userThresholds.emitWarning === true) {
          thresholds.emitWarning = true;
        }
      } else {
        Object.assign(thresholds.global, userThresholds);
      }
    }

    let thresholdCheckFailed = false;

    // Adapted from https://github.com/istanbuljs/nyc/blob/98ebdff573be91e1098bb7259776a9082a5c1ce1/index.js#L463-L478
    const globalSummary = remappedCoverageMap.getCoverageSummary();
    const failedGlobalTypes = checkThresholds(thresholds.global, globalSummary);
    failedGlobalTypes.forEach(type => {
      thresholdCheckFailed = true;
      logThresholdMessage(thresholds, `Coverage for ${type} (${globalSummary[type].pct}%) does not meet global threshold (${thresholds.global[type]}%)`);
    });

    remappedCoverageMap.files().forEach(file => {
      const fileThresholds = Object.assign({}, thresholds.each, util.overrideThresholds(file, thresholds.each.overrides, config.basePath));
      delete fileThresholds.overrides;
      const fileSummary = remappedCoverageMap.fileCoverageFor(file).toSummary().data;
      const failedFileTypes = checkThresholds(fileThresholds, fileSummary);

      failedFileTypes.forEach(type => {
        thresholdCheckFailed = true;
        if (coverageConfig.fixWebpackSourcePaths) {
          file = util.fixWebpackFilePath(file);
        }
        logThresholdMessage(thresholds, `Coverage for ${type} (${fileSummary[type].pct}%) in file ${file} does not meet per file threshold (${fileThresholds[type]}%)`);
      });
    });

    if (thresholdCheckFailed && results && !thresholds.emitWarning) {
      results.exitCode = 1;
    }
  }

    this.onRunStart = function (browsers) {
        collectors = Object.create(null);

        // TODO(vojta): remove once we don't care about Karma 0.10
        // TODO: I don't really know what this does, but I stole it from Karma sharding
        /*if (browsers) {
            browsers.forEach(this.onBrowserStart.bind(this));
        }*/
    };

  this.onBrowserComplete = function (browser, result) {
    /* Removed to match karma sharding
    if (result && result.coverage) {
      browserCoverage.set(browser, result.coverage);
    }*/
    var collector = collectors[browser[aggregator]]; // CHANGE MADE BY KARMA-SHARDING

    if (!collector) return;
    if (!result || !result.coverage) return;

    collector.add(result.coverage);
  };

  // Parallel
  this.onSpecComplete = function (browser, result) {
    // if (!result.coverage) return;

    if (result && result.coverage) {
      // browserCoverage.set(browser, result.coverage);
      collectors[browser[aggregator]].add(result.coverage); // CHANGE MADE BY KARMA-SHARDING
    }
  };

  const baseReporterOnRunComplete = this.onRunComplete;
  this.onRunComplete = function (browsers, results) {
    baseReporterOnRunComplete.apply(this, arguments);

    if (coverageConfig.combineBrowserReports) {
      createReport(browsers, results);
    } else {
      browsers.forEach(browser => {
        createReport(browser, results);
      });
    }
  };
}

CoverageIstanbulReporter.$inject = ['baseReporterDecorator', 'logger', 'config'];

// Don't do this... Index.js exports now
/* module.exports = {
  'reporter:coverage-istanbul': ['type', CoverageIstanbulReporter]
}; */

module.exports = CoverageIstanbulReporter;
