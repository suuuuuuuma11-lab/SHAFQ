const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function find320Overflow() {
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

  const res = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const docW = document.documentElement.clientWidth;
      const elements = Array.from(document.querySelectorAll('*'));
      const overflowing = [];
      for (const el of elements) {
        // Skip drawer elements because fixed off-screen is expected unless it causes doc scroll
        const rect = el.getBoundingClientRect();
        if (rect.right > docW + 0.5) {
          overflowing.push({
            tag: el.tagName,
            className: el.className,
            id: el.id,
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            left: Math.round(rect.left),
            styleWidth: el.style.width,
            parent: el.parentElement ? (el.parentElement.className || el.parentElement.tagName) : null
          });
        }
      }
      return {
        docW,
        scrollW: document.documentElement.scrollWidth,
        bodyScrollW: document.body.scrollWidth,
        overflowing
      };
    })()`,
    returnByValue: true
  });

  console.log('320px Overflow details:', JSON.stringify(res.result.value, null, 2));
  ws.close();
  chromeProcess.kill();
  process.exit(0);
}

find320Overflow().catch(err => {
  console.error(err);
  process.exit(1);
});
