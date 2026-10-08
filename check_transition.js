const { spawn } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testTransition() {
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
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('BROWSER LOG:', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.log('BROWSER EXCEPTION:', JSON.stringify(msg.params.exceptionDetails));
    }
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

  await sleep(5000);

  const state = await sendCommand('Runtime.evaluate', {
    expression: `(() => {
      const infoSkel = document.getElementById("pInfoSkel");
      const imgSkel = document.getElementById("pImgSkeleton");
      const imgEl = document.getElementById("pImg");
      const formWrap = document.getElementById("formWrap");
      return {
        infoSkel_display: infoSkel ? infoSkel.style.display : null,
        infoSkel_computedDisplay: infoSkel ? window.getComputedStyle(infoSkel).display : null,
        infoSkel_classList: infoSkel ? Array.from(infoSkel.classList) : null,
        imgSkel_display: imgSkel ? imgSkel.style.display : null,
        imgSkel_opacity: imgSkel ? imgSkel.style.opacity : null,
        imgEl_src: imgEl ? imgEl.src : null,
        imgEl_opacity: imgEl ? imgEl.style.opacity : null,
        formWrap_display: formWrap ? formWrap.style.display : null,
        formWrap_opacity: formWrap ? window.getComputedStyle(formWrap).opacity : null
      };
    })()`,
    returnByValue: true
  });

  console.log('Transition state:', JSON.stringify(state.result.value, null, 2));
  ws.close();
  chromeProcess.kill();
  process.exit(0);
}

testTransition().catch(err => {
  console.error(err);
  process.exit(1);
});
