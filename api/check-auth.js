import { isAuthenticated } from './auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (isAuthenticated(req)) {
    res.json({ ok: true });
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}
