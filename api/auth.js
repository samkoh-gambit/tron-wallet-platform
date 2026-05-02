import crypto from 'crypto';

const COOKIE_NAME = 'tw_auth';
const MAX_AGE_SECONDS = 24 * 60 * 60;

function getSecret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PWD;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(value) {
  const secret = getSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((cookies, item) => {
    const index = item.indexOf('=');
    if (index === -1) return cookies;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function isProductionRequest(req) {
  const proto = req.headers['x-forwarded-proto'];
  return proto === 'https' || process.env.VERCEL === '1';
}

export function createAuthCookie(user) {
  const payload = base64UrlEncode(JSON.stringify({
    user,
    exp: Date.now() + MAX_AGE_SECONDS * 1000,
  }));
  const token = `${payload}.${sign(payload)}`;
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SECONDS}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function clearAuthCookie(req) {
  const secure = isProductionRequest(req);
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function isAuthenticated(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return false;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = sign(payload);
  if (!expected || expected.length !== signature.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  try {
    const session = JSON.parse(base64UrlDecode(payload));
    return Boolean(session.exp && session.exp > Date.now());
  } catch {
    return false;
  }
}

export function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}
