const axios = require('axios');
const WebSocket = require('ws');

async function testApp() {
  console.log('=======================================================');
  console.log('   DREGRO FULL-STACK INTEGRATION TEST SUITE           ');
  console.log('=======================================================\n');

  let passedTests = 0;
  let totalTests = 4;

  // Test 1: Python FastAPI Health Check
  try {
    const pyHealth = await axios.get('http://localhost:8000/health');
    if (pyHealth.status === 200 && pyHealth.data.status === 'ok') {
      console.log('✔ Test 1 PASS: Python FastAPI Microservice Health Check (http://localhost:8000/health)');
      console.log('   Response:', JSON.stringify(pyHealth.data));
      passedTests++;
    } else {
      console.error('✘ Test 1 FAIL: Unexpected FastAPI health response:', pyHealth.data);
    }
  } catch (e) {
    console.error('✘ Test 1 FAIL: Python FastAPI unreachable:', e.message);
  }
  console.log('');

  // Test 2: Node.js Backend Health Check
  try {
    const nodeHealth = await axios.get('http://localhost:4000/health');
    if (nodeHealth.status === 200 && nodeHealth.data.status === 'ok') {
      console.log('✔ Test 2 PASS: Node.js Backend Server Health Check (http://localhost:4000/health)');
      console.log('   Response:', JSON.stringify(nodeHealth.data));
      passedTests++;
    } else {
      console.error('✘ Test 2 FAIL: Unexpected Node.js health response:', nodeHealth.data);
    }
  } catch (e) {
    console.error('✘ Test 2 FAIL: Node.js Backend unreachable:', e.message);
  }
  console.log('');

  // Test 3: React Frontend Dashboard HTTP Check
  try {
    const feRes = await axios.get('http://localhost:3000');
    if (feRes.status === 200 && feRes.data.includes('DREGRO')) {
      console.log('✔ Test 3 PASS: React Frontend Dashboard HTTP Server (http://localhost:3000)');
      console.log('   HTML Title & Root element rendered properly.');
      passedTests++;
    } else {
      console.error('✘ Test 3 FAIL: React Frontend returned unexpected status or content:', feRes.status);
    }
  } catch (e) {
    console.error('✘ Test 3 FAIL: React Frontend unreachable:', e.message);
  }
  console.log('');

  // Test 4: WebSocket Real-Time Feed Streaming
  console.log('--- Test 4: Real-Time WebSocket Streaming (ws://localhost:4000) ---');
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:4000');

    let initialReceived = false;
    let tickReceived = false;

    ws.on('open', () => {
      console.log('   Connected to WebSocket Server (ws://localhost:4000)...');
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log(`   -> WS Event Received: [${msg.type}]`);

      if (msg.type === 'INITIAL_STATE') {
        initialReceived = true;
        console.log(`      Candles Count: ${msg.data.candles?.length}`);
        console.log(`      Current Nifty 50 LTP: ₹${msg.data.ltp}`);
        console.log(`      Initial Active SMC Zones: ${msg.data.smcZones?.length}`);
        console.log(`      AI Trend Model Output: ${JSON.stringify(msg.data.aiTrend)}`);
      } else if (msg.type === 'MARKET_TICK' || msg.type === 'SMC_UPDATE') {
        tickReceived = true;
        console.log(`      Live Tick Stream: LTP ₹${msg.data.ltp} | Timestamp: ${msg.data.timestamp}`);
      }

      if (initialReceived && tickReceived) {
        console.log('✔ Test 4 PASS: WebSocket Live Stream & SMC Coordinates Streaming Verified!');
        passedTests++;
        ws.close();
        finish();
      }
    });

    ws.on('error', (err) => {
      console.error('✘ Test 4 FAIL: WebSocket connection error:', err.message);
      finish();
    });

    setTimeout(() => {
      if (!initialReceived || !tickReceived) {
        console.log('⚠️ Test 4 TIMEOUT: Did not receive both snapshot and live tick within 6 seconds.');
        ws.close();
        finish();
      }
    }, 6000);

    function finish() {
      console.log('\n=======================================================');
      console.log(`   INTEGRATION TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
      console.log('=======================================================\n');
      resolve(passedTests === totalTests ? 0 : 1);
    }
  });
}

testApp().then((code) => process.exit(code));
