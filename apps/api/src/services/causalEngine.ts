/**
 * Adapter around @chronolog/engine. The engine is pure; this file owns the one
 * instance the API uses and hands it the logger.
 */
import { CausalEngine, type ChainDetectedEvent, type LogInput } from '@chronolog/engine';
import logger from '../config/logger';

const engine = new CausalEngine({ logger });

export const analyzeLog = (log: LogInput) => engine.analyzeLog(log);
export const getActiveCausalChains = () => engine.getActiveCausalChains();
export const getChainById = (id: string) => engine.getChainById(id);
export const getGraphData = () => engine.getGraphData();
export const onChainDetected = (cb: (event: ChainDetectedEvent) => void) => engine.onChainDetected(cb);
export const _reset = () => engine.reset();
