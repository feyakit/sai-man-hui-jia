import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, devices } from 'playwright';
import { solve } from '../../client/assets/scripts/core/dlx.ts';
import { parseLevel } from '../../client/assets/scripts/core/level.ts';
import { dimensions } from '../../client/assets/scripts/game/InteractionGeometry.ts';
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
      height:stage.height,tray:stage.tray,selected:stage.selected?.id,modal:stage.modal,landscape:stage.landscape,
      held:stage.drag.active ? {rotation:stage.drag.active.rotation,mode:stage.drag.active.mode} : undefined,
      pieces:Array.from(stage.pieces,([id,value]) => ({id,rect:value.rect,x:value.node.position.x+375,
        y:stage.height/2-value.node.position.y,scale:value.node.scale.x})),
      placements:session.placements,
      route:stage.node.getChildByName('Route')?.getComponent(cc.Label)?.string,
      packed:stage.node.getChildByName('Packed')?.getComponent(cc.Label)?.string,

      slots:slots.map(({piece,rect}) => ({id:piece.id,shape:piece.shape,rotation:session.rotationFor(piece.id),rect,placed:session.placements.some(p => p.pieceId === piece.id)})),
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

const slotPoint = slot => center(slot.rect);
const dropPoint = ({board,cell},placement,piece) => {
  const box=dimensions(piece,placement.rotation);
  return {x:board.x+(placement.x+box.w/2)*cell,y:board.y+(placement.y+box.h/2)*cell+Math.max(1.2*cell,120)};
};

async function clear(page,touch,index) {
  for (let i=0; i<levels[index].pieces.length; i++) {
    const view = await game(page);
    const slot = view.slots.find(s => !s.placed);
    const goal = solutions[index].get(slot.id);
    const turns = (slot.rotation-goal.rotation+4)%4;
    if (view.selected !== slot.id) await tap(page,touch,slotPoint(slot));
    for (let r=0; r<turns; r++) await tap(page,touch,center(view.buttons[0]));
    await drag(page,touch,slotPoint(slot),dropPoint(view,goal,slot));
    if (i+1 < levels[index].pieces.length) {
      await until(async () => (await game(page)).placements?.some(item => item.pieceId === slot.id),`piece ${slot.id}`);
    }
  }
}

function assertTray(state) {
  const t=state.tray;
  for (const {rect:a,id} of state.slots) {
    assert.ok(a.x >= t.x && a.y >= t.y && a.x+a.w <= t.x+t.w && a.y+a.h <= t.y+t.h,'Slot inside tray');
    for (const {rect:b,id:other} of state.slots) if (id !== other) {
      assert.ok(a.x+a.w <= b.x || b.x+b.w <= a.x || a.y+a.h <= b.y || b.y+b.h <= a.y,'Disjoint slots');
    }
  }
}

async function showV1(page,twelve) {
  await page.evaluate(async twelve => {
    const cc=await globalThis.System.import('cc');
    const bootstrap=cc.director.getScene().getChildByName('Canvas').getChildByName('GameRoot').getComponent('Bootstrap');
    const asset=await new Promise((resolve,reject) => cc.resources.load('levels/v1/stage2',cc.JsonAsset,(e,a) => e ? reject(e) : resolve(a)));
    const level=JSON.parse(JSON.stringify(asset.json));
    // A layout-only 12-piece variant; normal completion below uses the unchanged V1 fixture.
    if (twelve) while (level.pieces.length < 12) level.pieces.push({...level.pieces[0],id:100+level.pieces.length});
    bootstrap.show(level);
  },twelve);
}

async function interactions(page,touch,view,name) {
  const slot=view.slots[0], pick=slotPoint(slot), originRotation=slot.rotation;
  await tap(page,touch,pick);
  let state=await game(page);
  assert.equal(state.slots[0].rotation,originRotation,'Tap does not rotate');
  assert.equal(state.selected,slot.id,'Tap selects');
  await tap(page,touch,pick); assert.equal((await game(page)).selected,undefined,'Tap deselects');
  const rectangles=view.slots.map(s => s.rect);
  const blank={x:view.tray.x+2,y:view.tray.y+2};
  await drag(page,touch,blank,{x:blank.x+200,y:blank.y});
  assert.deepEqual((await game(page)).slots.map(s => s.rect),rectangles,'Horizontal tray gesture cannot scroll slots');
  await drag(page,touch,pick,dropPoint(view,{x:100,y:100,rotation:originRotation},slot));
  await delay(220);
  state=await game(page); assert.deepEqual(state.placements,view.placements,'Invalid release preserves board');
  assert.deepEqual(state.pieces.find(p => p.id === slot.id).rect,view.pieces.find(p => p.id === slot.id).rect,'Invalid returns to original slot');
  // Release inside the canvas but entirely outside the trunk.
  await drag(page,touch,pick,{x:20,y:250}); await delay(220);
  assert.deepEqual((await game(page)).placements,view.placements,'Outside release preserves board');
  const heldFinger={x:375,y:view.board.y+view.board.h/2+120};
  const [from,to,button]=await coords(page,[pick,heldFinger,center(view.buttons[0])]);
  if (touch) {
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:0}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...to,id:0}]});
  } else {
    await page.mouse.move(from.x,from.y); await page.mouse.down(); await page.mouse.move(to.x,to.y);
  }
  state=await game(page);
  const held=state.pieces.find(p => p.id === slot.id);
  assert.ok(heldFinger.y-held.y >= 119.9,'Center is at least 120 design pixels above finger');
  assert.ok(Math.abs(held.scale-1.05) < .001,'Pickup scale');
  const rotation=state.held.rotation;
  if (touch) {
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...to,id:0},{...button,id:1}]});
    assert.equal((await game(page)).held.rotation,(rotation+3)%4,'Second finger rotates held piece');
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{...to,id:0}]});
    assert.equal((await game(page)).held.mode,'drag','Second finger release does not release primary');
    // Cancel the drag without changing the board or tray orientation.
    await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  } else {
    await page.mouse.move(5,5); await page.mouse.up();
  }
  await delay(220);
  await page.screenshot({path:join(evidence,`${name}-interaction.png`)});
  // Restart confirmation is exercised with an actual successful placement.
  // First piece is horizontal in stage1; for the V1 layout variant use its fixture goal.
  const goal=view.level === 1 ? {x:0,y:0,rotation:0,pieceId:slot.id} :
    JSON.parse(await readFile('tests/fixtures/v1/stage2.solution.json','utf8')).placements.find(p => p.pieceId === slot.id);
  state=await game(page);
  if (state.selected !== slot.id) await tap(page,touch,pick);
  for (let r=0;r<(originRotation-goal.rotation+4)%4;r++) await tap(page,touch,center(view.buttons[0]));
  await drag(page,touch,pick,dropPoint(view,goal,slot));
  state=await game(page); assert.ok(state.placements.some(p => p.pieceId === slot.id),'Valid drop');
  const packed=state.placements;
  const box=dimensions(slot,goal.rotation);
  const boardPick={x:view.board.x+(goal.x+box.w/2)*view.cell,y:view.board.y+(goal.y+box.h/2)*view.cell};
  await drag(page,touch,boardPick,{x:20,y:250}); await delay(220);
  assert.deepEqual((await game(page)).placements,packed,'Placed item returns to original board location');
  await drag(page,touch,boardPick,pick);
  assert.ok(!(await game(page)).placements.some(p => p.pieceId === slot.id),'Return to tray');
  await tap(page,touch,center(view.buttons[1]));
  assert.deepEqual((await game(page)).placements,packed,'Undo tray return');
  assert.equal((await game(page)).selected,undefined,'Undo clears selection');
  await tap(page,touch,center(view.buttons[2]));
  assert.equal((await game(page)).modal,'restart');
  assert.deepEqual((await game(page)).placements,packed,'Restart waits for confirmation');
  await tap(page,touch,{x:375,y:view.height/2+180});
  assert.equal((await game(page)).modal,undefined,'Cancel restart');
  assert.deepEqual((await game(page)).placements,packed);
  await tap(page,touch,center(view.buttons[2]));
  await tap(page,touch,{x:375,y:view.height/2+80});
  assert.equal((await game(page)).placements.length,0,'Confirm restart clears board');
  assert.equal((await game(page)).slots[0].rotation,originRotation,'Restart resets rotation');
}

async function exercise(name,context) {
  const page = await context.newPage();
  const video = page.video();
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  const touch = name !== 'desktop' ? cdp : undefined;
  try {
    await page.goto(url);
    const view = await until(async () => {
      const state = await game(page);
      return state.level === 1 && state;
    },'stage one');
    assert.deepEqual(view.placements,[],'The trunk starts empty');
    assert.equal(view.packed,'已装车 0 / 4 件');
    await page.screenshot({path:join(evidence,`${name}-stage-one.png`)});
    await interactions(page,touch,view,name);
    await clear(page,touch,0);
    await until(async () => (await game(page)).level === 2,'stage two after stage one clear');
    await page.screenshot({path:join(evidence,`${name}-stage-two.png`)});
    await clear(page,touch,1);
    await until(async () => (await game(page)).message === '行李塞满了，回家！','stage two clear');
    await page.screenshot({path:join(evidence,`${name}-arrival.png`)});

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
    await showV1(page,true);
    await until(async () => (await game(page)).slots?.length === 12,'12-piece tray');
    const twelve=await game(page);
    assertTray(twelve);
    await interactions(page,touch,twelve,`${name}-12`);
    await page.screenshot({path:join(evidence,`${name}-12-piece-tray.png`)});
    await showV1(page,false);
    const fixture=JSON.parse(await readFile('tests/fixtures/v1/stage2.solution.json','utf8'));
    const v1=await game(page);
    for (const goal of fixture.placements) {
      const state=await game(page), slot=state.slots.find(s => s.id === goal.pieceId);
      if (state.selected !== slot.id) await tap(page,touch,slotPoint(slot));
      for (let r=0;r<(slot.rotation-goal.rotation+4)%4;r++) await tap(page,touch,center(state.buttons[0]));
      await drag(page,touch,slotPoint(slot),dropPoint(v1,goal,slot));
    }
    await until(async () => (await game(page)).message === '行李塞满了，回家！','V1 stage2 fixture clear');
    assert.deepEqual(errors,[]);
    console.log(`${name}: legacy stages and V1 stage2 cleared; v1.2 interactions and 12-slot layout checked`);
  } catch (error) {
    await page.screenshot({path:join(evidence,`${name}-failure.png`)}).catch(() => {});
    if (errors.length) console.error(errors);
    throw error;
  } finally {
    await context.close();
    if (video) await video.saveAs(join(evidence,`${name}-playthrough.webm`));
  }
}

try {
  browser = await chromium.launch({
    executablePath:process.env.CHROMIUM_PATH || undefined,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'],
  });
  await exercise('desktop',await browser.newContext({viewport:{width:750,height:1334}}));
  await exercise('mobile',await browser.newContext({...devices['Pixel 7'],defaultBrowserType:undefined,recordVideo:{dir:join(evidence,'video-tmp')}}));
  await exercise('iphone-se',await browser.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true,deviceScaleFactor:2,recordVideo:{dir:join(evidence,'video-tmp')}}));
  await exercise('tall-412',await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,deviceScaleFactor:2}));
} finally {
  await browser?.close();
  server.close();
  await rm(join(evidence,'video-tmp'),{recursive:true,force:true});
}
