// Headless renders of the KESTREL K1 Mk II viewer (studio environment, soft + contact shadows, bloom, neutral tone mapping).
//   node render.mjs [threeDir] [outDir] [scale] [view1,view2,...]
// threeDir: a folder containing node_modules/three (CDN imports, including the post-processing addons,
// are routed there, so it renders offline with no network assets).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const threeDir = process.argv[2] || path.join(here, "..", "..", "..", "node_modules");
const outDir = process.argv[3] || path.join(here, "..", "renders");
const scale = parseFloat(process.argv[4] || "1");
const only = process.argv[5] ? process.argv[5].split(",") : null;
fs.mkdirSync(outDir, { recursive: true });

const JOBS = [
  // name, query, width, height
  ["01_front", "view=front", 1100, 1500],
  ["02_rear", "view=rear", 1100, 1500],
  ["03_left", "view=left", 1100, 1500],
  ["04_right", "view=right", 1100, 1500],
  ["05_threequarter_front", "view=threequarter_front", 1100, 1500],
  ["06_threequarter_rear", "view=threequarter_rear", 1100, 1500],
  ["07_head_detail", "view=head", 1200, 1200],
  ["08_hand_detail", "view=hands", 1200, 1200],
  ["09_hip_knee_joints_ghost", "view=hip_knee&mode=ghost", 1200, 1400],
  ["10_skeleton_front", "view=threequarter_front&mode=skeleton", 1100, 1500],
  ["11_skeleton_rear", "view=threequarter_rear&mode=skeleton", 1100, 1500],
  ["12_exploded", "view=exploded&explode=1", 1300, 1500],
  ["13_exploded_skeleton", "view=exploded&explode=1&mode=skeleton", 1300, 1500],
  ["14_ghost_threequarter", "view=threequarter_front&mode=ghost", 1100, 1500],
  ["15_shoulder_ghost", "view=shoulder&mode=ghost", 1200, 1200],
  ["16_foot_ankle_ghost", "view=foot&mode=ghost", 1200, 1000],
  ["17_torso_ghost", "view=torso&mode=ghost", 1200, 1300],
  ["18_KA130K_cutaway", "model=ka130k_cutaway.glb&view=actuator", 1200, 1200],
  ["19_KA130K_exploded", "model=ka130k_cutaway.glb&view=actuator_exploded&explode=0.55", 1200, 1400],
  ["20_KH25_cutaway", "model=kh25_cutaway.glb&view=actuator", 1200, 1200],
];

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const p = path.join(here, decodeURIComponent(req.url.split("?")[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
// one page per model: the GLB is parsed and the shaders compiled once, then every view of that model is
// set through the viewer's window hooks (mode, explode, view) and the viewport is resized per job
const parse = (q) => Object.fromEntries(new URLSearchParams(q));
const byModel = new Map();
for (const job of JOBS) {
  if (only && !only.some((o) => job[0].includes(o))) continue;
  const m = parse(job[1]).model || "kestrel_k1.glb";
  if (!byModel.has(m)) byModel.set(m, []);
  byModel.get(m).push(job);
}
for (const [model, jobs] of byModel) {
  const [n0, q0, w0, h0] = jobs[0];
  const page = await browser.newPage({ viewport: { width: w0, height: h0 }, deviceScaleFactor: scale });
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, async (route) => {
    const rel = route.request().url().replace(/^.*three@[^/]+\//, "");
    const f = path.join(threeDir, "three", rel);
    route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(f) });
  });
  page.on("pageerror", (e) => console.log(model, "pageerror", e.message));
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/index.html?bare=1&theme=light&${q0}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  console.log("loaded", model, ((Date.now() - t0) / 1000).toFixed(0), "s");
  await page.evaluate(() => { window.__pause = true; });
  for (const [name, q, w, h] of jobs) {
    const t1 = Date.now();
    const p = parse(q);
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(300);
    await page.evaluate(({ mode, explode, view }) => {
      window.__applyMode(mode || "full"); window.__setExplode(parseFloat(explode || "0")); window.__setView(view || "threequarter_front");
      window.__renderOnce(); window.__renderOnce();
    }, p);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, `${name}.png`), timeout: 600000 });
    console.log("rendered", name, ((Date.now() - t1) / 1000).toFixed(0), "s");
  }
  await page.close();
}
await browser.close();
server.close();
