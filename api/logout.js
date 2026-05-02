import { clearAuthCookie } from './auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.setHeader('Set-Cookie', clearAuthCookie(req));
  res.json({ ok: true });
}
