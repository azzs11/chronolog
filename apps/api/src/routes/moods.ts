import { Router, type Request, type Response } from 'express';
import { currentMoods } from '../services/moods';
import { errorMessage } from './http';

const router = Router();

/** GET /api/moods: every service's mood right now, with its reason and the log ids behind it. */
router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json({ status: 'success', data: await currentMoods() });
  } catch (err) {
    res.status(500).json({ status: 'error', message: errorMessage(err) });
  }
});

export default router;
