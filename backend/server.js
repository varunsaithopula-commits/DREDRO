const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');
const UpstoxFeedHandler = require('./upstoxFeed');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'http://localhost:8000/api/analyze';

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let latestMarketData = {
  ltp: 24850.0,
  instrument: "NSE_INDEX|Nifty 50",
  timestamp: Math.floor(Date.now() / 1000),
  isSimulator: true,
  candles: [],
  smcZones: [],
  aiTrend: { trend: "Neutral", confidence: 50.0 }
};

let lastPythonCallTime = 0;

// Initialize Upstox Feed Handler
const feedHandler = new UpstoxFeedHandler((data) => {
  latestMarketData.ltp = data.ltp;
  latestMarketData.instrument = data.instrument;
  latestMarketData.timestamp = data.timestamp;
  latestMarketData.isSimulator = data.isSimulator;
  latestMarketData.candles = data.candles;

  // Broadcast live market data tick immediately
  broadcastToClients({
    type: 'MARKET_TICK',
    data: {
      ltp: latestMarketData.ltp,
      timestamp: latestMarketData.timestamp,
      candles: latestMarketData.candles,
      smcZones: latestMarketData.smcZones,
      aiTrend: latestMarketData.aiTrend,
      isSimulator: latestMarketData.isSimulator
    }
  });

  // Call Python FastAPI microservice periodically (every 2 seconds) for SMC & ML analysis
  const now = Date.now();
  if (now - lastPythonCallTime >= 2000) {
    lastPythonCallTime = now;
    analyzeWithPythonEngine(data.candles);
  }
});

async function analyzeWithPythonEngine(candles) {
  try {
    const response = await axios.post(PYTHON_ENGINE_URL, { candles }, { timeout: 3000 });
    if (response.data) {
      latestMarketData.smcZones = response.data.smc_zones || [];
      latestMarketData.aiTrend = response.data.ai_trend || { trend: "Neutral", confidence: 50.0 };

      // Broadcast analysis update to React clients
      broadcastToClients({
        type: 'SMC_UPDATE',
        data: {
          smcZones: latestMarketData.smcZones,
          aiTrend: latestMarketData.aiTrend
        }
      });
    }
  } catch (err) {
    // If Python engine is not running yet, gracefully log warning
    console.warn(`[Node Server] Python Engine call failed (${PYTHON_ENGINE_URL}): ${err.message}`);
  }
}

function broadcastToClients(message) {
  const jsonStr = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonStr);
    }
  });
}

// WebSocket Connection Handler for React Frontend
wss.on('connection', (ws) => {
  console.log('[WebSocket Server] React Client connected.');

  // Send initial snapshot
  ws.send(JSON.stringify({
    type: 'INITIAL_STATE',
    data: {
      ltp: latestMarketData.ltp,
      instrument: latestMarketData.instrument,
      candles: feedHandler.getCandles(),
      smcZones: latestMarketData.smcZones,
      aiTrend: latestMarketData.aiTrend,
      isSimulator: latestMarketData.isSimulator
    }
  }));

  ws.on('close', () => {
    console.log('[WebSocket Server] React Client disconnected.');
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    activeClients: wss.clients.size,
    latestLtp: latestMarketData.ltp,
    isSimulator: latestMarketData.isSimulator
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  DREGRO Algorithmic Trading Backend Listening on :${PORT}`);
  console.log(`  Local WebSocket Server Ready for React Frontend`);
  console.log(`=======================================================`);
  feedHandler.start();
});
