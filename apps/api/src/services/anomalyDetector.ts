/**
 * Adapter around @chronolog/engine. The engine is pure; this file owns the one
 * instance the API uses and supplies the clock and logger.
 */
import { AnomalyDetector, type AnomalyInput } from '@chronolog/engine';
import logger from '../config/logger';

const detector = new AnomalyDetector({ clock: () => new Date(), logger });

export const analyze = (log: AnomalyInput) => detector.analyze(log);
export const getFingerprints = () => detector.getFingerprints();
export const _reset = () => detector.reset();
