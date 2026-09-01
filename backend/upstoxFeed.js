const WebSocket = require('ws');
const protobuf = require('protobufjs');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

class UpstoxFeedHandler {
  constructor(onDataCallback) {
    this.onDataCallback = onDataCallback;
    this.ws = null;
    this.protoRoot = null;
    this.FeedResponse = null;
    this.isSimulator = false;
    this.simulatorInterval = null;
    this.candles = [];
    this.instrumentKey = "NSE_INDEX|Nifty 50";
    
    // Seed initial 1-min candles for simulator/historical buffer
    this.seedInitialCandles();
  }

  seedInitialCandles() {
    const now = Math.floor(Date.now() / 60000) * 60; // Start of current minute in seconds
    let basePrice = 24850.0;
    const numCandles = 60;

    for (let i = numCandles; i >= 0; i--) {
      const time = now - (i * 60);
      const volatility = 8.0 + Math.random() * 12.0;
      const change = (Math.random() - 0.49) * volatility;
      const open = basePrice;
      const close = Math.round((open + change) * 100) / 100;
      const high = Math.round((Math.max(open, close) + Math.random() * 6.0) * 100) / 100;
      const low = Math.round((Math.min(open, close) - Math.random() * 6.0) * 100) / 100;
      const volume = Math.floor(1000 + Math.random() * 5000);

      this.candles.push({ time, open, high, low, close, volume });
      basePrice = close;
    }
  }

  async initProtobuf() {
    try {
      const protoPath = path.join(__dirname, 'proto', 'MarketDataFeed.proto');
      this.protoRoot = await protobuf.load(protoPath);
      this.FeedResponse = this.protoRoot.lookupType('com.upstox.marketdata.feed.v2.FeedResponse');
      console.log('[Upstox Feed] Protobuf schema loaded successfully.');
    } catch (err) {
      console.error('[Upstox Feed] Failed to load Protobuf schema:', err.message);
    }
  }

  async getAccessToken() {
    const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, AUTH_CODE, ACCESS_TOKEN } = process.env;

    if (ACCESS_TOKEN && ACCESS_TOKEN !== 'YOUR_ACCESS_TOKEN_HERE') {
      console.log('[Upstox Auth] Using Access Token from .env');
      return ACCESS_TOKEN;
    }

    if (AUTH_CODE && CLIENT_ID && CLIENT_SECRET && REDIRECT_URI &&
        AUTH_CODE !== 'YOUR_AUTH_CODE_HERE') {
      try {
        console.log('[Upstox Auth] Requesting Access Token via OAuth endpoint...');
        const response = await axios.post(
          'https://api.upstox.com/v2/login/authorization/token',
          new URLSearchParams({
            code: AUTH_CODE,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json'
            }
          }
        );

        if (response.data && response.data.access_token) {
          console.log('[Upstox Auth] Successfully obtained Access Token.');
          return response.data.access_token;
        }
      } catch (err) {
        console.warn('[Upstox Auth] OAuth Token Exchange failed:', err.response?.data || err.message);
      }
    }

    return null;
  }

  async getAuthorizedWsUrl(accessToken) {
    try {
      const response = await axios.get('https://api.upstox.com/v2/feed/market-data-feed/authorize', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.data && response.data.data.authorizedRedirectUri) {
        return response.data.data.authorizedRedirectUri;
      }
    } catch (err) {
      console.warn('[Upstox Auth] Authorized WebSocket URL fetch failed:', err.response?.data || err.message);
    }
    return null;
  }

  async start() {
    await this.initProtobuf();
    const accessToken = await this.getAccessToken();

    if (accessToken) {
      const wsUrl = await this.getAuthorizedWsUrl(accessToken);
      if (wsUrl) {
        this.connectUpstoxWs(wsUrl);
        return;
      }
    }

    console.warn('[Upstox Feed] Upstox credentials unavailable or unauthenticated. Starting high-realism Nifty 50 simulator feed.');
    this.startSimulator();
  }

  connectUpstoxWs(wsUrl) {
    console.log(`[Upstox Feed] Connecting to Upstox Market Data Feed v2 WebSocket...`);
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('[Upstox Feed] Connected! Subscribing to Nifty 50 in FULL mode...');
      
      // Upstox v2 Protobuf WebSocket binary subscription packet
      const subPayload = {
        guid: "nifty50_full_feed",
        method: "sub",
        params: {
          mode: "full",
          instrumentKeys: [this.instrumentKey]
        }
      };

      this.ws.send(Buffer.from(JSON.stringify(subPayload)));
    });

    this.ws.on('message', (binaryData) => {
      try {
        if (!this.FeedResponse) return;
        const decodedMessage = this.FeedResponse.decode(Buffer.from(binaryData));
        const decodedObj = this.FeedResponse.toObject(decodedMessage, {
          enums: String,
          longs: Number,
          bytes: String,
          defaults: true,
          oneofs: true
        });

        console.log('[Upstox Feed] Decoded Protobuf Feed:', JSON.stringify(decodedObj, null, 2));

        // Extract tick data
        this.processUpstoxDecodedFeed(decodedObj);
      } catch (err) {
        console.error('[Upstox Feed] Error decoding Protobuf message:', err.message);
      }
    });

    this.ws.on('error', (err) => {
      console.error('[Upstox Feed] WebSocket Error:', err.message);
    });

    this.ws.on('close', (code, reason) => {
      console.warn(`[Upstox Feed] WebSocket connection closed (${code}: ${reason}). Falling back to simulator.`);
      this.startSimulator();
    });
  }

  processUpstoxDecodedFeed(feedObj) {
    if (!feedObj || !feedObj.feeds) return;

    const niftyFeed = feedObj.feeds[this.instrumentKey] || feedObj.feeds[Object.keys(feedObj.feeds)[0]];
    if (!niftyFeed) return;

    let ltp = 0;
    let ts = Math.floor(Date.now() / 1000);

    if (niftyFeed.fullFeed?.indexFF?.ltpc?.ltp) {
      ltp = niftyFeed.fullFeed.indexFF.ltpc.ltp;
      ts = Math.floor((niftyFeed.fullFeed.indexFF.ltpc.ltt || Date.now()) / 1000);
    } else if (niftyFeed.fullFeed?.marketFF?.ltpc?.ltp) {
      ltp = niftyFeed.fullFeed.marketFF.ltpc.ltp;
      ts = Math.floor((niftyFeed.fullFeed.marketFF.ltpc.ltt || Date.now()) / 1000);
    } else if (niftyFeed.ltpc?.ltp) {
      ltp = niftyFeed.ltpc.ltp;
    }

    if (ltp > 0) {
      this.updateCandleWithTick(ltp, ts);
    }
  }

  startSimulator() {
    this.isSimulator = true;
    let currentPrice = this.candles[this.candles.length - 1].close;

    this.simulatorInterval = setInterval(() => {
      const nowTs = Math.floor(Date.now() / 1000);
      const delta = (Math.random() - 0.495) * 4.5;
      currentPrice = Math.round((currentPrice + delta) * 100) / 100;

      this.updateCandleWithTick(currentPrice, nowTs);

      // Log simulated tick format mimicking decoded protobuf output
      console.log(`[Upstox Feed Simulator] Decoded Tick -> Instrument: Nifty 50 | LTP: ${currentPrice} | TS: ${new Date().toLocaleTimeString()}`);
    }, 1000);
  }

  updateCandleWithTick(ltp, ts) {
    const minuteTs = Math.floor(ts / 60) * 60;
    let lastCandle = this.candles[this.candles.length - 1];

    if (!lastCandle || lastCandle.time !== minuteTs) {
      // Start a new 1-minute candle
      lastCandle = {
        time: minuteTs,
        open: ltp,
        high: ltp,
        low: ltp,
        close: ltp,
        volume: Math.floor(100 + Math.random() * 200)
      };
      this.candles.push(lastCandle);
      if (this.candles.length > 200) {
        this.candles.shift();
      }
    } else {
      // Update ongoing candle
      lastCandle.high = Math.max(lastCandle.high, ltp);
      lastCandle.low = Math.min(lastCandle.low, ltp);
      lastCandle.close = ltp;
      lastCandle.volume += Math.floor(10 + Math.random() * 20);
    }

    const payload = {
      isSimulator: this.isSimulator,
      instrument: "NSE_INDEX|Nifty 50",
      ltp: ltp,
      timestamp: ts,
      currentCandle: lastCandle,
      candles: this.candles
    };

    if (this.onDataCallback) {
      this.onDataCallback(payload);
    }
  }

  getCandles() {
    return this.candles;
  }
}

module.exports = UpstoxFeedHandler;
