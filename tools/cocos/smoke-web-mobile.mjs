import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, devices } from 'playwright';
import { solve } from '../../client/assets/scripts/core/dlx.ts';
import { parseLevel } from '../../client/assets/scripts/core/level.ts';
import { stage1 } from '../../client/assets/scripts/core/stage1.ts';

const build = resolve(process.argv[2] ?? 'client/build/web-mobile');
const evidence = resolve(process.argv[3] ?? 'tools/out/web-mobile-smoke');
assert.ok((await stat(join(build,'index.html'))).isFile(),'Web Mobile index.html is required');
const challenge = parseLevel(JSON.parse(await readFile('client/assets/resources/dev-levels/demo.json','utf8')));
const levels = [stage1(challenge.date),challenge];
const solutions = levels.map(level => {
  const {firstSolution} = solve(level,{maxSolutions:1,maxNodes:300000});
  assert.ok(firstSolution,'Test fixture must be solvable');
  return new Map(firstSolution.map(placement => [placement.pieceId,placement]));
});
const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json',
  '.wasm':'application/wasm', '.png':'image/png',
};
const server = createServer(async (request,response) => {
  try {
    const url = new URL(request.url,'http://localhost');
    const path = resolve(build,'.'+decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(build+sep) || !(await stat(path)).isFile()) throw new Error('Not found');
    response.writeHead(200,{'content-type':mime[extname(path)] ?? 'application/octet-stream'});
    createReadStream(path).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done,reject) => server.listen(0,'127.0.0.1',done).once('error',reject));
const url = `http://127.0.0.1:${server.address().port}/`;
await mkdir(evidence,{recursive:true});
let browser;

async function game(page) {
  return page.evaluate(async () => {
    const cc = await globalThis.System.import('cc');
    const canvas = cc.director.getScene()?.getChildByName('Canvas');
    const root = canvas?.getChildByName('GameRoot');
    const stage = root?.getComponent('Bootstrap')?.stage;
    const message = root?.getChildByName('Message')?.getChildByName('Message')?.getComponent(cc.Label)?.string;
    if (!stage) return {message};
    const {board,cell,slots,buttons,session} = stage;
    return {
      level:stage.level.stage,board,cell,message,remaining:session.remainingSeconds,
      placements:session.placements,
      slots:slots.map(({piece,rect}) => ({id:piece.id,rotation:session.rotationFor(piece.id),rect})),
      buttons:buttons.map(({rect}) => rect),
    };
  });
}

async function until(read, label) {
  let lastError;
  for (let i=0; i<100; i++) {
    try {
      const value = await read();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}`,{cause:lastError});
}

const center = rect => ({x:rect.x+rect.w/2,y:rect.y+rect.h/2});

async function coords(page,points) {
  return page.evaluate(async values => {
    const cc = await globalThis.System.import('cc');
    const canvas = cc.director.getScene().getChildByName('Canvas');
    const stage = canvas.getChildByName('GameRoot').getComponent('Bootstrap').stage;
    const transform = stage.node.getComponent(cc.UITransform);
    const camera = canvas.getComponent(cc.Canvas).cameraComponent;
    const element = document.querySelector('canvas');
    const rect = element.getBoundingClientRect();
    return values.map(({x,y}) => {
      const world = transform.convertToWorldSpaceAR(new cc.Vec3(x-stage.width/2,stage.height/2-y,0));
      const screen = camera.worldToScreen(world);
      return {x:rect.x+screen.x*rect.width/element.width,y:rect.y+rect.height-screen.y*rect.height/element.height};
    });
  },points);
}

async function tap(page,touch,point) {
  const [target] = await coords(page,[point]);
  if (touch) await page.touchscreen.tap(target.x,target.y);
  else await page.mouse.click(target.x,target.y);
}

async function drag(page,touch,start,end) {
  const [from,mid,to] = await coords(page,[start,{x:start.x,y:start.y-20},end]);
  if (touch) {
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[mid]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[to]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } else {
    await page.mouse.move(from.x,from.y);
    await page.mouse.down();
    await page.mouse.move(mid.x,mid.y);
    await page.mouse.move(to.x,to.y,{steps:4});
    await page.mouse.up();
  }
}

const slotPoint = slot => ({x:slot.rect.x+18,y:slot.rect.y+18});
const dropPoint = ({board,cell},placement) =>
  ({x:board.x+(placement.x+.5)*cell,y:board.y+(placement.y+.5)*cell+22});

async function clear(page,touch,index) {
  for (let i=0; i<levels[index].pieces.length; i++) {
    const view = await game(page);
    const slot = view.slots[0];
    const goal = solutions[index].get(slot.id);
    const turns = (slot.rotation-goal.rotation+4)%4;
    for (let r=0; r<turns; r++) await tap(page,touch,slotPoint(slot));
    await drag(page,touch,slotPoint(slot),dropPoint(view,goal));
    if (i+1 < levels[index].pieces.length) {
      await until(async () => (await game(page)).placements?.some(item => item.pieceId === slot.id),`piece ${slot.id}`);
    }
  }
}

async function exercise(name,context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  const touch = name === 'mobile' ? cdp : undefined;
  try {
    await page.goto(url);
    const view = await until(async () => {
      const state = await game(page);
      return state.level === 1 && state;
    },'stage one');
    await page.screenshot({path:join(evidence,`${name}-stage-one.png`)});
    await tap(page,touch,slotPoint(view.slots[0]));
    await until(async () => (await game(page)).slots?.[0].rotation === 3,'clockwise tap');
    await tap(page,touch,center(view.buttons[1]));
    const slot = slotPoint(view.slots[0]);
    await drag(page,touch,slot,dropPoint(view,{x:1,y:0}));
    assert.equal((await game(page)).placements.length,0,'Out-of-bounds placement was rejected');
    await drag(page,touch,slot,dropPoint(view,{x:0,y:0}));
    await until(async () => (await game(page)).placements?.length === 1,'valid snap');
    await drag(page,touch,{x:view.board.x+view.cell/2,y:view.board.y+view.cell/2},slot);
    await until(async () => (await game(page)).placements?.length === 0,'drag back to tray');
    await clear(page,touch,0);
    await until(async () => (await game(page)).level === 2,'stage two after stage one clear');
    await page.screenshot({path:join(evidence,`${name}-stage-two.png`)});
    await clear(page,touch,1);
    await until(async () => (await game(page)).message === '行李塞满了，回家！','stage two clear');

    await page.goto(url+'?level=demo');
    await until(async () => (await game(page)).level === 2,'query-selected challenge');
    if (name === 'desktop') {
      const before = (await game(page)).remaining;
      const background = await context.newPage();
      await background.bringToFront();
      await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
      await delay(10000);
      await cdp.send('Page.setWebLifecycleState',{state:'active'});
      await page.bringToFront();
      await background.close();
      const elapsed = before-(await game(page)).remaining;
      assert.ok(elapsed >= 10 && elapsed <= 12,`Expected ten background seconds, got ${elapsed}`);
    }
    assert.deepEqual(errors,[]);
    console.log(`${name}: two stages cleared, invalid drop rejected, rotate and return passed, query override passed`);
  } catch (error) {
    await page.screenshot({path:join(evidence,`${name}-failure.png`)}).catch(() => {});
    if (errors.length) console.error(errors);
    throw error;
  } finally {
    await context.close();
  }
}

try {
  browser = await chromium.launch({
    executablePath:process.env.CHROMIUM_PATH || undefined,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  });
  await exercise('desktop',await browser.newContext({viewport:{width:1280,height:900}}));
  await exercise('mobile',await browser.newContext({...devices['Pixel 7'],defaultBrowserType:undefined}));
} finally {
  await browser?.close();
  server.close();
}
