import { Router } from 'express';
import * as causalEngine from '../services/causalEngine';
import * as logRepository from '../db/logRepository';
import { errorMessage } from './http';

const router = Router();
const NARRATIVE_MESSAGE_MAX = 60;

/** GET /api/causal/chains: all active chains, sorted by blast radius */
router.get('/chains', (_req, res) => {
  try {
    const chains = causalEngine.getActiveCausalChains();
    res.json({ status: 'success', data: chains, count: chains.length });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

/** GET /api/causal/chains/:rootId: full chain with depth and blast radius summary */
router.get('/chains/:rootId', async (req, res) => {
  try {
    const rootId = req.params.rootId as string;

    // Prefer the in-memory ring buffer (faster, always current)
    let chain: { id: string; message: string; source: string; blast_radius_score?: number; causal_chain_depth?: number }[] =
      causalEngine.getChainById(rootId);

    if (!chain.length) {
      // Fall back to the database for historical chains
      chain = await logRepository.getCausalChain(rootId);
    }

    const root = chain.find((l) => l.id === rootId) ?? chain[0];
    if (!root) {
      res.status(404).json({ status: 'error', message: 'Causal chain not found' });
      return;
    }

    const blastRadius = parseFloat(chain.reduce((sum, l) => sum + (l.blast_radius_score || 0), 0).toFixed(3));
    const maxDepth = Math.max(...chain.map((l) => l.causal_chain_depth || 0));

    res.json({
      status: 'success',
      data: {
        root,
        chain,
        chain_depth: maxDepth,
        total_affected: chain.length,
        blast_radius_score: blastRadius,
        narrative: `"${root.message.slice(0, NARRATIVE_MESSAGE_MAX)}" triggered ${chain.length - 1} downstream event(s) across ${new Set(chain.map((l) => l.source)).size} service(s).`,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

/** GET /api/causal/graph: nodes and edges for graph visualisation */
router.get('/graph', (_req, res) => {
  try {
    res.json({ status: 'success', data: causalEngine.getGraphData() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

export default router;
