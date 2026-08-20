import { createRequire } from 'module';
import dotenv from 'dotenv';
import { requireAuth } from './auth.js';
import { assertChainEnabled } from './chain-config.js';

// Load Solana packages via CJS to avoid Vercel ESM crash:
// ERR_UNSUPPORTED_DIR_IMPORT for jayson/lib/client/browser
const require = createRequire(import.meta.url);

let Connection;
let Keypair;
let PublicKey;
let SystemProgram;
let Transaction;
let sendAndConfirmTransaction;
let LAMPORTS_PER_SOL;
let createAssociatedTokenAccountIdempotentInstruction;
let createTransferInstruction;
let getAssociatedTokenAddress;
let getAssociatedTokenAddressSync;
let getMint;
let getAccount;
let bs58;
let moduleLoadError = null;

try {
  ({
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL,
  } = require('@solana/web3.js'));

  ({
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferInstruction,
    getAssociatedTokenAddress,
    getAssociatedTokenAddressSync,
    getMint,
    getAccount,
  } = require('@solana/spl-token'));

  const bs58Module = require('bs58');
  bs58 = bs58Module.default || bs58Module;
} catch (error) {
  moduleLoadError = error;
}

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const EXPLORER_BASE = 'https://solscan.io/tx';
const DEFAULT_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

function getCluster() {
  const url = (process.env.SOLANA_RPC_URL || '').toLowerCase();
  if (url.includes('mainnet')) return 'mainnet-beta';
  if (url.includes('testnet') && !url.includes('devnet')) return 'testnet';
  return 'devnet';
}

function loadKeypair() {
  const raw = process.env.SOLANA_PRIVATE_KEY;
  if (!raw) {
    throw new Error('SOLANA_PRIVATE_KEY is not set');
  }

  const trimmed = raw.trim();
  let secretKey;
  if (trimmed.startsWith('[')) {
    secretKey = Uint8Array.from(JSON.parse(trimmed));
  } else {
    secretKey = bs58.decode(trimmed);
  }
  return Keypair.fromSecretKey(secretKey);
}

function getConnection() {
  return new Connection(RPC_URL, 'confirmed');
}

function explorerLink(signature) {
  return `${EXPLORER_BASE}/${signature}?cluster=${getCluster()}`;
}

function getTokenMint() {
  return process.env.SOLANA_TOKEN_MINT || DEFAULT_USDC_MINT;
}

// Token account data size for rent-exempt ATA creation (~0.002 SOL)
const TOKEN_ACCOUNT_SIZE = 165;
const TX_FEE_LAMPORTS = 10_000n;

function parseSolanaAddress(address) {
  try {
    return new PublicKey(address);
  } catch {
    throw new Error(`Invalid Solana address: ${address}`);
  }
}

async function getTokenAccountAmount(connection, ata, tokenProgramId) {
  try {
    const account = await getAccount(connection, ata, 'confirmed', tokenProgramId);
    return account.amount;
  } catch {
    return 0n;
  }
}

async function getSplBalance(connection, owner, mintAddress) {
  try {
    const mint = new PublicKey(mintAddress);
    const mintAccount = await connection.getAccountInfo(mint);
    const tokenProgramId = mintAccount?.owner;
    const ata = await getAssociatedTokenAddress(mint, owner, false, tokenProgramId);
    const account = await getAccount(connection, ata, 'confirmed', tokenProgramId);
    const mintInfo = await getMint(connection, mint, 'confirmed', tokenProgramId);
    return Number(account.amount) / 10 ** mintInfo.decimals;
  } catch {
    return 0;
  }
}

async function countMissingAtas(connection, mint, tokenProgramId, recipients) {
  let missing = 0;
  for (const recipient of recipients) {
    const destAta = getAssociatedTokenAddressSync(
      mint,
      recipient,
      false,
      tokenProgramId
    );
    const info = await connection.getAccountInfo(destAta, 'confirmed');
    if (!info) missing += 1;
  }
  return missing;
}

async function assertSenderCanFundAtas(connection, payer, missingAtaCount, transferCount) {
  if (missingAtaCount <= 0 && transferCount <= 0) return;

  const rentLamports = BigInt(
    await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE)
  );
  const solBalance = BigInt(await connection.getBalance(payer, 'confirmed'));
  const required =
    rentLamports * BigInt(missingAtaCount) + TX_FEE_LAMPORTS * BigInt(Math.max(transferCount, 1));

  if (solBalance < required) {
    const have = Number(solBalance) / LAMPORTS_PER_SOL;
    const need = Number(required) / LAMPORTS_PER_SOL;
    throw new Error(
      `Insufficient SOL for fees/ATA rent. Have ${have.toFixed(6)} SOL, need at least ${need.toFixed(6)} SOL ` +
        `(${missingAtaCount} new USDC account(s) × ~${(Number(rentLamports) / LAMPORTS_PER_SOL).toFixed(6)} SOL rent + fees).`
    );
  }
}

async function transferSplToRecipient({
  connection,
  keypair,
  mint,
  tokenProgramId,
  fromAta,
  recipientPubkey,
  amount,
}) {
  const destAta = getAssociatedTokenAddressSync(
    mint,
    recipientPubkey,
    false,
    tokenProgramId
  );

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      keypair.publicKey,
      destAta,
      recipientPubkey,
      mint,
      tokenProgramId
    ),
    createTransferInstruction(
      fromAta,
      destAta,
      keypair.publicKey,
      amount,
      [],
      tokenProgramId
    )
  );

  return sendAndConfirmTransaction(connection, tx, [keypair], {
    commitment: 'confirmed',
  });
}

export default async function handler(req, res) {
  if (moduleLoadError) {
    res.status(500).json({
      error: 'Solana module failed to load',
      detail: moduleLoadError.message,
    });
    return;
  }

  if (!requireAuth(req, res)) return;
  if (!assertChainEnabled('solana', res)) return;

  console.log('[SOL] Incoming request:', req.method, req.url, req.body);

  let connection;
  let keypair;
  try {
    connection = getConnection();
    keypair = loadKeypair();
  } catch (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (req.method === 'GET') {
    try {
      const lamports = await connection.getBalance(keypair.publicKey);
      const mintAddress = getTokenMint();
      const tokenBalance = await getSplBalance(connection, keypair.publicKey, mintAddress);

      res.json({
        address: keypair.publicKey.toBase58(),
        balance: (lamports / LAMPORTS_PER_SOL).toString(),
        tokenBalance,
        usdtBalance: tokenBalance,
        tokenMint: mintAddress,
      });
      return;
    } catch (error) {
      res.status(500).json({ error: error.message });
      return;
    }
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { recipients, amounts, tokenAddress, type } = req.body || {};

  if (!recipients || !amounts || recipients.length !== amounts.length) {
    res.status(400).json({ error: 'Invalid recipient/amount data' });
    return;
  }

  try {
    const results = [];

    // Validate recipients up front so invalid addresses fail clearly
    const parsedRecipients = [];
    for (let i = 0; i < recipients.length; i++) {
      try {
        parsedRecipients.push(parseSolanaAddress(recipients[i]));
      } catch (error) {
        results.push({
          index: i,
          recipient: recipients[i],
          amount: amounts[i],
          success: false,
          error: error.message,
        });
        parsedRecipients.push(null);
      }
    }

    const validIndexes = parsedRecipients
      .map((pubkey, index) => (pubkey ? index : -1))
      .filter((index) => index >= 0);

    if (validIndexes.length === 0) {
      res.json({
        success: false,
        summary: {
          total: results.length,
          successCount: 0,
          failureCount: results.length,
        },
        results: results.map(({ index, ...rest }) => rest),
      });
      return;
    }

    if (type === 'native') {
      const totalLamports = validIndexes.reduce((sum, i) => {
        return sum + BigInt(Math.round(parseFloat(amounts[i]) * LAMPORTS_PER_SOL));
      }, 0n);
      const solBalance = BigInt(await connection.getBalance(keypair.publicKey, 'confirmed'));
      const required = totalLamports + TX_FEE_LAMPORTS * BigInt(validIndexes.length);

      if (solBalance < required) {
        const have = Number(solBalance) / LAMPORTS_PER_SOL;
        const need = Number(required) / LAMPORTS_PER_SOL;
        res.status(400).json({
          error: `Insufficient SOL. Have ${have.toFixed(6)} SOL, need at least ${need.toFixed(6)} SOL (transfers + fees).`,
        });
        return;
      }

      for (const i of validIndexes) {
        try {
          const lamports = Math.round(parseFloat(amounts[i]) * LAMPORTS_PER_SOL);
          const tx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: keypair.publicKey,
              toPubkey: parsedRecipients[i],
              lamports,
            })
          );
          const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
          results.push({
            index: i,
            recipient: recipients[i],
            amount: amounts[i],
            success: true,
            txHash: signature,
            explorerLink: explorerLink(signature),
          });
        } catch (error) {
          results.push({
            index: i,
            recipient: recipients[i],
            amount: amounts[i],
            success: false,
            error: error.message,
          });
        }
      }
    } else {
      const mintAddress = tokenAddress || getTokenMint();
      if (!mintAddress) {
        res.status(400).json({ error: 'Token mint address required for SPL transfer' });
        return;
      }

      const mint = new PublicKey(mintAddress);
      const mintAccount = await connection.getAccountInfo(mint);
      if (!mintAccount) {
        res.status(400).json({ error: `Mint not found: ${mintAddress}` });
        return;
      }
      const tokenProgramId = mintAccount.owner;
      const mintInfo = await getMint(connection, mint, 'confirmed', tokenProgramId);
      const fromAta = getAssociatedTokenAddressSync(
        mint,
        keypair.publicKey,
        false,
        tokenProgramId
      );

      const parsedAmounts = validIndexes.map((i) => {
        const raw = parseFloat(amounts[i]);
        if (!Number.isFinite(raw) || raw <= 0) {
          throw new Error(`Invalid amount for ${recipients[i]}: ${amounts[i]}`);
        }
        return {
          index: i,
          amount: BigInt(Math.round(raw * 10 ** mintInfo.decimals)),
        };
      });

      const totalTokenAmount = parsedAmounts.reduce((sum, item) => sum + item.amount, 0n);
      const senderTokenBalance = await getTokenAccountAmount(
        connection,
        fromAta,
        tokenProgramId
      );

      if (senderTokenBalance < totalTokenAmount) {
        const have = Number(senderTokenBalance) / 10 ** mintInfo.decimals;
        const need = Number(totalTokenAmount) / 10 ** mintInfo.decimals;
        res.status(400).json({
          error: `Insufficient USDC. Have ${have} USDC, need ${need} USDC for this batch.`,
        });
        return;
      }

      const validPubkeys = validIndexes.map((i) => parsedRecipients[i]);
      const missingAtaCount = await countMissingAtas(
        connection,
        mint,
        tokenProgramId,
        validPubkeys
      );
      await assertSenderCanFundAtas(
        connection,
        keypair.publicKey,
        missingAtaCount,
        validIndexes.length
      );

      for (const item of parsedAmounts) {
        const i = item.index;
        try {
          const signature = await transferSplToRecipient({
            connection,
            keypair,
            mint,
            tokenProgramId,
            fromAta,
            recipientPubkey: parsedRecipients[i],
            amount: item.amount,
          });
          results.push({
            index: i,
            recipient: recipients[i],
            amount: amounts[i],
            success: true,
            txHash: signature,
            explorerLink: explorerLink(signature),
          });
        } catch (error) {
          results.push({
            index: i,
            recipient: recipients[i],
            amount: amounts[i],
            success: false,
            error: error.message,
          });
        }
      }
    }

    results.sort((a, b) => a.index - b.index);

    res.json({
      success: results.every((tx) => tx.success),
      summary: {
        total: results.length,
        successCount: results.filter((tx) => tx.success).length,
        failureCount: results.filter((tx) => !tx.success).length,
      },
      results: results.map(({ index, ...rest }) => rest),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
