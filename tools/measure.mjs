
const port = process.argv[2] || '9333';
const url = process.argv[3];

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((p) => p.url && p.url.startsWith('http'));
if (!page) { console.log('AUCUNE PAGE'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};

const RECORDER = `
window.__t0 = performance.now();
window.__frames = [];
window.__introAt = null;
window.__bodyAt = null;
(function loop(prev) {
  requestAnimationFrame(function (now) {
    if (prev) window.__frames.push(now - prev);
    loop(now);
  });
})(0);
(function poll() {
  if (window.__bodyAt === null && document.body) window.__bodyAt = performance.now() - window.__t0;
  if (window.__introAt === null && document.getElementById('daxi-cinematic')) {
    window.__introAt = performance.now() - window.__t0;
  }
  if (window.__introAt === null || window.__bodyAt === null) setTimeout(poll, 8);
})();
`;

const REPORT = `(function () {
  var f = (window.__frames || []).filter(function (d) { return d > 0 && d < 500; });
  var sorted = f.slice().sort(function (a, b) { return a - b; });
  var pick = function (q) { return sorted.length ? sorted[Math.floor(sorted.length * q)] : 0; };
  var jank = f.filter(function (d) { return d > 32; }).length;
  return JSON.stringify({
    body_apparait_a: Math.round(window.__bodyAt),
    intro_demarre_a: Math.round(window.__introAt),
    images: f.length,
    delta_median: +pick(0.5).toFixed(1),
    delta_p95: +pick(0.95).toFixed(1),
    pire_delta: +(sorted[sorted.length - 1] || 0).toFixed(1),
    images_sup_32ms: jank,
    part_janky: f.length ? +(jank / f.length * 100).toFixed(1) : 0,
    intro_terminee: !!window._daxiIntroDone
  }, null, 2);
})()`;

await new Promise((r) => { ws.onopen = r; });
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
await send('Page.navigate', { url });
console.log('navigation lancee, mesure sur 14 s...\n');
await new Promise((r) => setTimeout(r, 14000));

const res = await send('Runtime.evaluate', { expression: REPORT, returnByValue: true });
console.log(res.result?.result?.value ?? JSON.stringify(res.result));
ws.close();
process.exit(0);
