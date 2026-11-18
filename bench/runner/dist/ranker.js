"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceRanker = void 0;
class ServiceRanker {
    incidentStartMs;
    sourceById = new Map();
    scores = new Map();
    linkedInWindow = 0;
    constructor(incidentStartMs) {
        this.incidentStartMs = incidentStartMs;
    }
    /** Record a log and the engine's verdict on it. Call once per log, in stream order. */
    observe(id, source, timestampMs, result) {
        this.sourceById.set(id, source);
        if (timestampMs < this.incidentStartMs || result.causal_root_id === null)
            return;
        const rootSource = this.sourceById.get(result.causal_root_id);
        if (rootSource === undefined)
            return;
        this.scores.set(rootSource, (this.scores.get(rootSource) ?? 0) + result.blast_radius_score);
        this.linkedInWindow++;
    }
    get linkedLogsInWindow() {
        return this.linkedInWindow;
    }
    ranking() {
        return [...this.scores.entries()]
            .map(([service, score]) => ({ service, score: Math.round(score * 1000) / 1000 }))
            .sort((a, b) => b.score - a.score || a.service.localeCompare(b.service));
    }
}
exports.ServiceRanker = ServiceRanker;
