/** The log parser lives in the engine so the browser's drop zone and the CLI read files the same way. */
export { type ParsedFile, parseLog, serviceFromPath, toUnixSeconds } from '@chronolog/engine';
