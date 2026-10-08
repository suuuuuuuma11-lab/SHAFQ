const { spawn } = require('child_process');
const fs = require('fs');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function captureSkeletonPure() {
  const chromeProcess = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1280,950'
  ]);

  await sleep(2000);

  const newTabRes = await fetch('http://localhost:9222/json/new?about:blank', { method: 'PUT' });
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
  await sendCommand('Network.enable');

  // Block firestore requests so the page stays permanently in skeleton loading mode
  await sendCommand('Network.setBlockedURLs', {
    urls: ['*firestore.googleapis.com*', '*identitytoolkit.googleapis.com*']
  });

  await sendCommand('Page.navigate', { url: 'http://localhost:3000/product.html' });
  await sleep(1200);

  // Capture Desktop Skeleton
  const shotDesktop = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\Users\\Salem\\.gemini\\antigravity-ide\\brain\\41cd1576-d58b-45d6-b173-ff48a6b9794a\\scratch\\screenshot_skeleton_desktop.png', Buffer.from(shotDesktop.data, 'base64'));
  console.log('Saved screenshot_skeleton_desktop.png');

  // Switch to mobile 390px
  await sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });
  await sleep(400);

  // Capture Mobile Skeleton
  const shotMobile = await sendCommand('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:\\Users\\Salem\\.gemini\\antigravity-ide\\brain\\41cd1576-d58b-45d6-b173-ff48a6b9794a\\scratch\\screenshot_skeleton_mobile.png', Buffer.from(shotMobile.data, 'base64'));
  console.log('Saved screenshot_skeleton_mobile.png');

  ws.close();
  chromeProcess.kill();
  process.exit(0);
}

captureSkeletonPure().catch(err => {
  console.error(err);
  process.exit(1);
});
