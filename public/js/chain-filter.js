(function () {
  const CHAIN_PAGES = {
    tron: '/index.html',
    sepolia: '/eth.html',
    amoy: '/pol.html',
    bsc: '/bsc.html',
    solana: '/sol.html',
  };

  function currentChain() {
    return document.body.getAttribute('data-chain') || '';
  }

  function applyEnabledChains(enabled) {
    const enabledSet = new Set((enabled || []).map(String));
    const dropdownOptions = document.getElementById('dropdownOptions');
    if (!dropdownOptions) return;

    dropdownOptions.querySelectorAll('.dropdown-option').forEach((option) => {
      const value = option.getAttribute('data-value');
      if (!enabledSet.has(value)) {
        option.remove();
      }
    });

    const chain = currentChain();
    if (chain && !enabledSet.has(chain)) {
      const first = enabled[0];
      if (first && CHAIN_PAGES[first]) {
        window.location.replace(CHAIN_PAGES[first]);
      }
    }
  }

  async function loadEnabledChains() {
    try {
      const response = await fetch('/api/chains', { credentials: 'include' });
      if (response.status === 401) return;
      if (!response.ok) return;
      const data = await response.json();
      applyEnabledChains(data.enabled || []);
    } catch (error) {
      console.error('Failed to load enabled chains:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadEnabledChains);
  } else {
    loadEnabledChains();
  }
})();
