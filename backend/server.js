import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import ethTransferHandler from './eth-transfer.js';
import polTransferHandler from './pol-transfer.js';
import bscTransferHandler from './bsc-transfer.js';
import solTransferHandler from './sol-transfer.js';
import tronTransferHandler from './transfer.js';
import { getChainsPayload, isChainEnabled } from '../api/chain-config.js';
import dotenv from 'dotenv';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, '../.env') });

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'tron-wallet-session-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
  })
);

// Auth middleware: require login for API (except login and check-auth)
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Login: validate id and password from env
app.post('/api/login', (req, res) => {
  const { id, password } = req.body || {};
  const adminId = process.env.ADMIN_ID;
  const adminPwd = process.env.ADMIN_PWD;
  if (!adminId || !adminPwd) {
    return res.status(500).json({ error: 'Auth not configured' });
  }
  if (id === adminId && password === adminPwd) {
    req.session.authenticated = true;
    req.session.user = id;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid ID or password' });
});

// Check if current request is authenticated (for frontend redirect)
app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Unauthorized' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

function requireChain(chainId) {
  return (req, res, next) => {
    if (!isChainEnabled(chainId)) {
      return res.status(403).json({ error: `Chain '${chainId}' is disabled` });
    }
    next();
  };
}

app.get('/api/chains', requireAuth, (req, res) => {
  res.json(getChainsPayload());
});

// Protected API routes
app.post('/api/eth-transfer', requireAuth, requireChain('sepolia'), ethTransferHandler);
app.post('/api/pol-transfer', requireAuth, requireChain('amoy'), polTransferHandler);
app.post('/api/bsc-transfer', requireAuth, requireChain('bsc'), bscTransferHandler);
app.post('/api/sol-transfer', requireAuth, requireChain('solana'), solTransferHandler);
app.post('/api/transfer', requireAuth, requireChain('tron'), tronTransferHandler);
app.get('/api/pol-transfer', requireAuth, requireChain('amoy'), polTransferHandler);
app.get('/api/eth-transfer', requireAuth, requireChain('sepolia'), ethTransferHandler);
app.get('/api/bsc-transfer', requireAuth, requireChain('bsc'), bscTransferHandler);
app.get('/api/sol-transfer', requireAuth, requireChain('solana'), solTransferHandler);
app.get('/api/transfer', requireAuth, requireChain('tron'), tronTransferHandler);

// Serve static app (login + pages)
app.use(express.static(join(__dirname, '../public')));

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});
