import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import basicAuth from 'express-basic-auth';
import { WebSocketServer, WebSocket } from 'ws';
import http, { IncomingMessage } from 'http';
import fetch from 'node-fetch';
import crypto from 'crypto';

// ----------- Config -----------
const PORT = Number(process.env.PORT || 8080);
const ORIGIN = process.env.CORS_ORIGIN || '*';
const USE_TESTNET = String(process.env.BINANCE_TESTNET || 'true') === 'true';
const B_API_KEY = process.env.BINANCE_API_KEY || '';
const B_API_SECRET = process.env.BINANCE_API_SECRET || '';

const REST_BASE = USE_TESTNET
  ? 'https://testnet.binance.vision'
  : 'https://api.binance.com';

const WS_BASE = USE_TESTNET
  ? 'wss://testnet.binance.vision/ws'
  : 'wss://stream.binance.com:9443/ws';

// ----------- App -----------
const app = express();
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json());

// optional basic auth for private routes
if (process.env.BASIC_USER && process.env.BASIC_PASS) {
  app.use(
    ['/api/trade', '/api/account'],
    basicAuth({
      users: { [process.env.BASIC_USER!]: process.env.BASIC_PASS! },
      challenge: true,
    })
  );
}

app.get('/api/health', (_req: Request, res: Response) =>
  res.json({ ok: true, testnet: USE_TESTNET })
);

// Public klines proxy (for charts)
app.get('/api/klines', async (req: Request, res: Response) => {
  try {
    const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase();
    const interval = String(req.query.interval || '1m');
    const limit = Number(req.query.limit || 200);
    const url = `${REST_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'failed' });
  }
});

// Sign Binance REST query
function signQuery(params: string) {
  const hmac = crypto.createHmac('sha256', B_API_SECRET);
  hmac.update(params);
  return hmac.digest('hex');
}

// Example MARKET spot order (private)
app.post('/api/trade', async (req: Request, res: Response) => {
  try {
    if (!B_API_KEY || !B_API_SECRET)
      return res.status(400).json({ error: 'Missing API keys' });

    const { symbol, side, quantity } = req.body as {
      symbol: string;
      side: 'BUY' | 'SELL';
      quantity: string;
    };

    const ts = Date.now();
    const params = new URLSearchParams({
      symbol,
      side,
      type: 'MARKET',
      quantity,
      timestamp: String(ts),
    });
    const sig = signQuery(params.toString());
    const url = `${REST_BASE}/api/v3/order?${params.toString()}&signature=${sig}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': B_API_KEY },
    });
    const data = await r.json();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'trade failed' });
  }
});

// WS proxy: /ws/stream?symbol=btcusdt
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/stream' });

wss.on('connection', (client: WebSocket, req: IncomingMessage) => {
  try {
    const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
    const symbol = (urlObj.searchParams.get('symbol') || 'btcusdt').toLowerCase();
    const upstream = new WebSocket(`${WS_BASE}/${symbol}@trade`);

    upstream.on('message', (data: Buffer) => {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
    upstream.on('error', () => { try { client.close(); } catch {} });
    upstream.on('close', () => { try { client.close(); } catch {} });

    client.on('close', () => { try { upstream.close(); } catch {} });
  } catch {
    try { client.close(); } catch {}
  }
});

server.listen(PORT, () => {
  console.log(`Backend up on :${PORT} (testnet=${USE_TESTNET})`);
});
