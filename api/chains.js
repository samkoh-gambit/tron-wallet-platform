import { requireAuth } from './auth.js';
import { getChainsPayload } from './chain-config.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.json(getChainsPayload());
}
