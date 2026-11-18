/**
 * Adapter around @chronolog/engine. The engine is pure; this file owns the one
 * instance the API uses and supplies the clock and logger.
 */
const { AnomalyDetector } = require('@chronolog/engine');
const logger = require('../config/logger');

const detector = new AnomalyDetector({ clock: () => new Date(), logger });

module.exports = {
  analyze:         (log) => detector.analyze(log),
  getFingerprints: ()    => detector.getFingerprints(),
  _reset:          ()    => detector.reset()
};
