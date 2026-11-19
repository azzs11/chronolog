import type { RankData } from './api';

export { confidenceWord, evidenceSentences, formatDelay } from '@chronolog/engine';

export const startSourceText: Record<RankData['startSource'], string> = {
  given: 'the start time you gave',
  estimated: 'estimated from the biggest change in the logs; set it yourself for best accuracy',
};
