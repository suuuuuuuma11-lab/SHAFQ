const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testFix() {
  const chromeProcess = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox'
  ]);

  await sleep(2000);
  const newTabRes = await fetch('http://localhost:9222/json/new?http://localhost:3000/product.html', { method: 'PUT' });
  const tabData = await newTabRes.json();
  const ws = new WebSocket(tabData.webSocketDebuggerUrl);

  let idCounter = 1;
  const pendingRequests = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pendingRequests.has(msg.id)) {
      const { resolve, reject } = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  });

  await new Promise(r => ws.addEventListener('open', r));

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendCommand('Runtime.enable');
  await sendCommand('Page.enable');
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 800,
    deviceScaleFactor: 2,
    mobile: true
  });

  await sleep(2500);

  // Apply overflow-x: hidden and check
  const beforeFix = await sendCommand('Runtime.evaluate', {
    expression: `(() => ({
      docW: document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      scrollX: window.scrollX
    }))()`,
    returnByValue: true
  });
  console.log('Before fix:', beforeFix.result.value);

  const afterFix = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      document.documentElement.style.overflowX = 'hidden';
      document.body.style.overflowX = 'hidden';
      const drawer = document.getElementById('cartDrawer');
      if (drawer && !drawer.classList.contains('open')) {
        drawer.style.visibility = 'hidden';
      }
      return {
        docW: document.documentElement.clientWidth,
        scrollW: document.documentElement.scrollWidth,
        scrollX: window.scrollX
      };
    })()`,
    returnByValue: true
  });
  console.log('After fix:', afterFix.result.value);

  ws.close();
  chromeProcess.kill();
  process.exit(0);
}

testFix().catch(err => {
  console.error(err);
  process.exit(1);
});
