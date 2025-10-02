# AI Options Bot Backend (Binance Proxy)

This server lets your frontend avoid direct Binance WebSocket/REST calls.
- **/ws/stream?symbol=btcusdt** → WS proxy to Binance trade stream
- **/api/klines?symbol=BTCUSDT&interval=1m&limit=200** → public candles
- **/api/trade** (POST) → example MARKET order (Spot)

## Deploy (Render)
1. Create new **Web Service** from this repo/zip.
2. Build command: `npm run build`
3. Start command: `npm start`
4. Add environment:
   - `BINANCE_TESTNET=true`
   - `BINANCE_API_KEY`, `BINANCE_API_SECRET`
   - `CORS_ORIGIN=https://bot.cabcompare.in`
   - (optional) `BASIC_USER`, `BASIC_PASS`
5. Note the Web Service URL (e.g., `https://ai-bot-api.onrender.com`).

## Frontend wiring
Set in your frontend (via `config.js`):
```html
<script>
  window.API_BASE_HTTP = "https://YOUR-API/render.com";
  window.API_BASE_WS = "wss://YOUR-API/render.com/ws";
</script>
```
And in code, prefer these bases over Binance endpoints.
