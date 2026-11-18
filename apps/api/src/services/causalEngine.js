/**
 * Adapter around @chronolog/engine. The engine is pure; this file owns the one
 * instance the API uses and hands it the logger.
 */
const { CausalEngine } = require('@chronolog/engine');
const logger = require('../config/logger');

const engine = new CausalEngine({ logger });

module.exports = {
  analyzeLog:           (log)  => engine.analyzeLog(log),
  getActiveCausalChains: ()    => engine.getActiveCausalChains(),
  getChainById:         (id)   => engine.getChainById(id),
  getGraphData:         ()     => engine.getGraphData(),
  onChainDetected:      (cb)   => engine.onChainDetected(cb),
  _reset:               ()     => engine.reset()
};
