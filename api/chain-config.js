const ALL_CHAINS = ['tron', 'sepolia', 'amoy', 'bsc', 'solana'];

const CHAIN_PAGES = {
  tron: '/index.html',
  sepolia: '/eth.html',
  amoy: '/pol.html',
  bsc: '/bsc.html',
  solana: '/sol.html',
};

const CHAIN_LABELS = {
  tron: 'TRON (Shasta)',
  sepolia: 'Ethereum Sepolia',
  amoy: 'Polygon Amoy',
  bsc: 'Binance Smart Chain',
  solana: 'Solana Devnet',
};

/**
 * Parse ENABLED_CHAINS from env.
 * Examples: "tron,sepolia,solana" or "all"
 * If unset/empty, all chains are enabled.
 */
export function getEnabledChains() {
  const raw = (process.env.ENABLED_CHAINS || '').trim();
  if (!raw || raw.toLowerCase() === 'all') {
    return [...ALL_CHAINS];
  }

  const enabled = raw
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => ALL_CHAINS.includes(c));

  return [...new Set(enabled)];
}

export function isChainEnabled(chainId) {
  return getEnabledChains().includes(String(chainId).toLowerCase());
}

export function assertChainEnabled(chainId, res) {
  if (isChainEnabled(chainId)) return true;
  res.status(403).json({ error: `Chain '${chainId}' is disabled` });
  return false;
}

export function getChainsPayload() {
  const enabled = getEnabledChains();
  return {
    enabled,
    chains: ALL_CHAINS.map((id) => ({
      id,
      label: CHAIN_LABELS[id],
      page: CHAIN_PAGES[id],
      enabled: enabled.includes(id),
    })),
  };
}

export { ALL_CHAINS, CHAIN_PAGES, CHAIN_LABELS };
