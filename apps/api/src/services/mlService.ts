import axios from 'axios';
import { ML_TIMEOUT_MS, ML_RETRY_ATTEMPTS } from '../config/constants';
import logger from '../config/logger';
import type { MlResult } from '../types';

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';
let mlAvailable = false;

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

interface HealthResponse {
  model_loaded?: boolean;
}

interface ApiResponse<T> {
  status: string;
  data: T;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const { data } = await axios.get<HealthResponse>(`${ML_URL}/health`, { timeout: 2000 });
    const wasAvailable = mlAvailable;
    mlAvailable = data.model_loaded === true;
    if (mlAvailable !== wasAvailable) {
      logger.info(`ML service ${mlAvailable ? 'came online' : 'went offline'}`);
    }
  } catch {
    mlAvailable = false;
  }
  return mlAvailable;
}

export async function classify(message: string): Promise<MlResult | null> {
  if (!mlAvailable) return null;

  for (let attempt = 0; attempt < ML_RETRY_ATTEMPTS; attempt++) {
    try {
      const { data } = await axios.post<ApiResponse<MlResult>>(
        `${ML_URL}/api/classify`,
        { message },
        { timeout: ML_TIMEOUT_MS },
      );
      if (data.status === 'success') return data.data;
    } catch (err) {
      logger.debug('ML classify attempt failed', { attempt: attempt + 1, error: errorMessage(err) });
    }
  }
  return null;
}

export async function classifyBatch(messages: string[]): Promise<MlResult[] | null> {
  if (!mlAvailable || !messages?.length) return null;
  try {
    const { data } = await axios.post<ApiResponse<MlResult[]>>(
      `${ML_URL}/api/classify/batch`,
      { messages },
      { timeout: ML_TIMEOUT_MS * 2 },
    );
    if (data.status === 'success') return data.data;
  } catch (err) {
    logger.debug('ML batch classify failed', { error: errorMessage(err) });
  }
  return null;
}

export function isAvailable(): boolean {
  return mlAvailable;
}

// Initial health check, deferred to avoid blocking module load.
setImmediate(() => void checkHealth());
