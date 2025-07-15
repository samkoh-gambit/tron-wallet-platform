import express from 'express';
import ethTransferHandler from './eth-transfer.js';
import polTransferHandler from './pol-transfer.js';
import tronTransferHandler from './transfer.js';
import dotenv from 'dotenv';
import cors from 'cors';



dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Expose the same endpoints as before
app.post('/api/eth-transfer', ethTransferHandler);
app.post('/api/pol-transfer', polTransferHandler);
app.get('/api/pol-transfer', polTransferHandler); 
app.get('/api/eth-transfer', ethTransferHandler); 
app.post('/api/transfer', tronTransferHandler);
app.get('/api/transfer', tronTransferHandler);

const PORT = process.env.PORT || 4100;
app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});