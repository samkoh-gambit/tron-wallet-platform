import { createAuthCookie } from './auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { id, password } = req.body || {};
  const adminId = process.env.ADMIN_ID;
  const adminPwd = process.env.ADMIN_PWD;

  if (!adminId || !adminPwd) {
    res.status(500).json({ error: 'Auth not configured' });
    return;
  }

  if (id === adminId && password === adminPwd) {
    res.setHeader('Set-Cookie', createAuthCookie(id));
    res.json({ ok: true });
    return;
  }

  res.status(401).json({ error: 'Invalid ID or password' });
}
