#!/usr/bin/env node
// Post-build optimiser for the Web Mobile output (run right after build-play.mjs, before publishing):
//  1. opaque full-screen backgrounds ship as JPEG (ImageAsset fmt '1' = .jpg; loads on iOS Safari/WeChat);
//  2. the project script bundle (assets/main/index.js) and the engine are minified with esbuild;
//  3. index.html gets a red-gold loading splash (removed once the first page is up), a proper title, and
//     preload hints so the engine, bundles and the home background download in parallel instead of in a chain.
// usage: node tools/optimize-web.mjs <distDir>
import fs from 'node:fs';
import path from 'node:path';
import { transform } from 'esbuild';
import sharp from 'sharp';

const dist = process.argv[2];
if (!dist || !fs.existsSync(path.join(dist, 'index.html'))) throw new Error('usage: optimize-web.mjs <distDir>');
const report = { jpeg: [], mainJs: null, engine: null, preloads: [] };

// ---------- 1. backgrounds → JPEG ----------
// Only fully opaque art (checked below); 4:4:4 chroma keeps the red/gold edges crisp.
export const JPEG_ART = {
  'art/ui/bg_poster': 86,
  'art/ui/bg_night': 86,
  'art/ui/bg_home': 88,
  'art/vehicles/sedan_v1_trunk': 86,
};
// Home poster art (HomePage loads exactly these; tests/optimize-web.test.ts keeps the lists in sync).
export const HOME_ART = ['ui/bg_poster', 'ui/plaque_poster', 'ui/couplet_left', 'ui/couplet_right', 'ui/car_poster', 'ui/road_home',
  'ui/car_marker', 'ui/btn_start_poster', 'ui/help_poster', 'ui/coin_rank', 'ui/coin_daily', 'ui/coin_classic'];
const rb = path.join(dist, 'assets/resources');
const config = JSON.parse(fs.readFileSync(path.join(rb, 'config.json'), 'utf8'));
const uuidByPath = new Map(Object.entries(config.paths).filter(([, v]) => v[1] === 'cc.ImageAsset').map(([u, v]) => [v[0], u]));
const fullUuid = short => config.uuids[Number(short)] ?? short; // config may store indices
for (const [assetPath, quality] of Object.entries(JPEG_ART)) {
  const uuid = fullUuid(uuidByPath.get(assetPath));
  if (!uuid) { report.jpeg.push({ assetPath, skipped: 'not in bundle' }); continue; }
  const png = path.join(rb, 'native', uuid.slice(0, 2), `${uuid}.png`);
  const importFile = path.join(rb, 'import', uuid.slice(0, 2), `${uuid}.json`);
  if (!fs.existsSync(png)) { report.jpeg.push({ assetPath, skipped: 'already converted' }); continue; }
  const stats = await sharp(png).stats();
  if (!stats.isOpaque) { report.jpeg.push({ assetPath, skipped: 'has transparency' }); continue; }
  const jpg = await sharp(png).flatten().jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
  const before = fs.statSync(png).size;
  if (jpg.length >= before * .8) { report.jpeg.push({ assetPath, skipped: 'jpeg not smaller' }); continue; }
  const data = JSON.parse(fs.readFileSync(importFile, 'utf8'));
  const meta = data[5]?.[0];
  if (!meta || meta.fmt !== '0') throw new Error(`${assetPath}: unexpected ImageAsset import ${JSON.stringify(data)}`);
  meta.fmt = '1'; // extnames[1] === '.jpg'
  fs.writeFileSync(importFile, JSON.stringify(data));
  fs.writeFileSync(path.join(path.dirname(png), `${uuid}.jpg`), jpg);
  fs.rmSync(png);
  report.jpeg.push({ assetPath, beforeKB: +(before / 1024).toFixed(1), afterKB: +(jpg.length / 1024).toFixed(1) });
}

// ---------- 2. minify project scripts ----------
const mainJs = path.join(dist, 'assets/main/index.js');
{
  const source = fs.readFileSync(mainJs, 'utf8');
  if (!source.startsWith('/*min*/')) {
    const out = await transform(source, { minify: true, target: 'es2017', legalComments: 'none', charset: 'utf8' });
    fs.writeFileSync(mainJs, `/*min*/${out.code}`);
    report.mainJs = { beforeKB: +(source.length / 1024).toFixed(1), afterKB: +(out.code.length / 1024).toFixed(1) };
  }
}

// ---------- 2b. minify the engine ----------
// The reused Creator build ships an unminified engine (5.7 MB, ~124k lines). keepNames keeps class/function
// names because parts of the engine (and its error messages) read constructor names.
for (const file of fs.readdirSync(path.join(dist, 'cocos-js')).filter(f => /^_virtual_cc-.*\.js$/.test(f))) {
  const full = path.join(dist, 'cocos-js', file);
  const source = fs.readFileSync(full, 'utf8');
  if (source.startsWith('/*min*/')) continue;
  const out = await transform(source, { minify: true, keepNames: true, target: 'es2017', legalComments: 'none', charset: 'utf8' });
  fs.writeFileSync(full, `/*min*/${out.code}`);
  report.engine = { file, beforeKB: +(source.length / 1024).toFixed(1), afterKB: +(out.code.length / 1024).toFixed(1) };
}

// ---------- 3. index.html: title, splash, preloads ----------
const indexHtml = path.join(dist, 'index.html');
let html = fs.readFileSync(indexHtml, 'utf8');
if (!html.includes('id="smhj-splash"')) {
  const cocos = fs.readdirSync(path.join(dist, 'cocos-js'));
  const engine = cocos.find(f => /^_virtual_cc-.*\.js$/.test(f));
  const exists = f => f && fs.existsSync(path.join(dist, f));
  const listJson = dir => exists(dir) ? fs.readdirSync(path.join(dist, dir), { recursive: true }).filter(f => f.endsWith('.json')).map(f => `${dir}/${f.split(path.sep).join('/')}`) : [];
  // SystemJS loads the engine (and the spine glue) without CORS; Cocos loads bundle scripts, JSON, binaries
  // and images with crossOrigin="anonymous". Mismatched modes would download twice, so keep them apart.
  const scripts = [engine && `cocos-js/${engine}`, 'cocos-js/cc.js', 'src/chunks/bundle.js',
    ...cocos.filter(f => /^spine(-|\.wasm-)[\w-]+\.js$/.test(f)).map(f => `cocos-js/${f}`)].filter(exists);
  const bundles = ['assets/internal/index.js', 'assets/main/index.js', 'assets/resources/index.js'].filter(exists);
  const fetches = ['src/settings.json', 'src/effect.bin', 'assets/internal/config.json', 'assets/main/config.json', 'assets/resources/config.json',
    ...listJson('assets/internal/import'), ...listJson('assets/main/import'),
    ...(exists('cocos-js/assets') ? fs.readdirSync(path.join(dist, 'cocos-js/assets')).filter(f => f.endsWith('.wasm')).map(f => `cocos-js/assets/${f}`) : []),
  ].filter(exists);
  // Home art: fetched once the engine has arrived (it would otherwise steal bandwidth from it) while the
  // engine boots, so the poster is already cached when the home page asks for it.
  const uuidOf = assetPath => fullUuid(uuidByPath.get(`art/${assetPath}`));
  const warm = [];
  for (const assetPath of HOME_ART) {
    const uuid = uuidOf(assetPath);
    if (!uuid) continue;
    const dir = uuid.slice(0, 2);
    const native = ['.jpg', '.png'].map(ext => `assets/resources/native/${dir}/${uuid}${ext}`).find(exists);
    for (const suffix of ['@f9941', '@6c48a', '']) warm.push({ url: `assets/resources/import/${dir}/${uuid}${suffix}.json`, kind: 'json' });
    if (native) warm.push({ url: native, kind: 'image' });
  }
  const links = [
    ...scripts.map(f => `<link rel="preload" href="${f}" as="script">`),
    ...bundles.map(f => `<link rel="preload" href="${f}" as="script" crossorigin="anonymous">`),
    ...fetches.map(f => `<link rel="preload" href="${f}" as="fetch" crossorigin="anonymous">`),
  ];
  report.preloads = [...scripts, ...bundles, ...fetches];
  report.warm = warm.length;
  const warmScript = `<script>
window.__smhjWarm=function(){if(window.__smhjWarmed)return;window.__smhjWarmed=1;var w=${JSON.stringify(warm.map(item => [item.url, item.kind === 'image' ? 1 : 0]))};
w.forEach(function(e){if(e[1]){var i=new Image();i.crossOrigin='anonymous';i.src=e[0];}else if(window.fetch){fetch(e[0],{credentials:'same-origin'}).catch(function(){});}});};
setTimeout(window.__smhjWarm,15000);
</script>`;
  if (engine) links[0] = links[0].replace('as="script">', 'as="script" onload="window.__smhjWarm&&window.__smhjWarm()">');
  const splash = `
<style>
#smhj-splash{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at 50% 38%,#8f1d22 0%,#5a0f17 55%,#2a0710 100%);color:#ffd889;transition:opacity .35s ease;
  font-family:"STKaiti","KaiTi","Kaiti SC","Songti SC",serif;-webkit-user-select:none;user-select:none}
#smhj-splash.done{opacity:0;pointer-events:none}
#smhj-splash .t{font-size:44px;letter-spacing:6px;text-shadow:0 2px 0 #3b0a0f,0 0 18px rgba(255,190,90,.35)}
#smhj-splash .bar{width:180px;height:8px;margin-top:26px;border-radius:6px;background:rgba(255,216,137,.18);overflow:hidden;border:1px solid rgba(255,216,137,.45)}
#smhj-splash .bar i{display:block;height:100%;width:40%;border-radius:6px;background:linear-gradient(90deg,#ffcf6f,#fff0c2);animation:smhjload 1.2s ease-in-out infinite}
#smhj-splash .s{margin-top:14px;font-size:15px;color:#ffe9bd;opacity:.85;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
@keyframes smhjload{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}
</style>
<div id="smhj-splash"><div class="t">塞满回家</div><div class="bar"><i></i></div><div class="s">正在装车…</div></div>
<script>
(function(){var el=document.getElementById('smhj-splash'),t0=Date.now();
function up(){return window.__home||window.__stack||window.__stage}
(function poll(){if(up()||Date.now()-t0>45000){el.className='done';setTimeout(function(){el.parentNode&&el.parentNode.removeChild(el)},400);return}setTimeout(poll,80)})();})();
</script>`;
  html = html
    .replace(/<title>[^<]*<\/title>/, '<title>塞满回家</title>')
    .replace('<link rel="stylesheet" type="text/css" href="style.css"/>', `<link rel="stylesheet" type="text/css" href="style.css"/>\n  ${links.join('\n  ')}`)
    .replace(/<body>/, `<body>${splash}`)
    .replace('<link rel="stylesheet"', `${warmScript}\n  <link rel="stylesheet"`);
  fs.writeFileSync(indexHtml, html);
}
console.log(JSON.stringify(report));
