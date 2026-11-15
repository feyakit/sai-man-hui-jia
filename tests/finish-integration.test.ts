import { beforeEach, expect, test, vi } from 'vitest';
const effects=vi.hoisted(() => ({play:vi.fn(),load:vi.fn()}));
vi.mock('../client/assets/scripts/services/OptionalResources',() => ({loadArt:effects.load}));
vi.mock('../client/assets/scripts/services/SoundEffects',() => ({SoundEffects:class { play=effects.play; }}));
vi.mock('cc/env',() => ({EDITOR:true}));
vi.mock('cc',() => {
  class Vec3 { constructor(public x=0,public y=0,public z=0) {} clone() { return new Vec3(this.x,this.y,this.z); } set(x: number,y: number,z: number) { this.x=x; this.y=y; this.z=z; } }
  class Color { static WHITE=new Color(); constructor(..._args: number[]) {} }
  class UITransform { setContentSize=vi.fn(); convertToNodeSpaceAR(p: Vec3) { return p; } }
  class Node {
    static EventType={NODE_DESTROYED:'destroy',TOUCH_START:'start',TOUCH_END:'end'};
    isValid=true; active=true; angle=0; children: Node[]=[]; components=new Map(); position=new Vec3();
    events=new Map<string,Function>();
    constructor(public name='') {}
    addComponent(Type: new () => any) { const c=new Type(); c.node=this; this.components.set(Type,c); return c; }
    getComponent(Type: any) { return this.components.get(Type); }
    addChild(node: Node) { this.children.push(node); }
    setPosition(x: number | Vec3,y=0,z=0) { this.position=typeof x === 'number' ? new Vec3(x,y,z) : x; }
    setScale=vi.fn(); on=vi.fn(); once(event: string,fn: Function) { this.events.set(event,fn); }
    setSiblingIndex=vi.fn(); getSiblingIndex() { return 1; }
    getChildByName(name: string) { return this.children.find(n => n.name===name); }
    destroyAllChildren() { for (const n of this.children) n.destroy(); this.children=[]; }
    destroy() { this.isValid=false; this.events.get('destroy')?.(); for (const n of this.children) n.destroy(); }
  }
  class Graphics { enabled=true; clear=vi.fn(); roundRect=vi.fn(); rect=vi.fn(); fill=vi.fn(); moveTo=vi.fn(); lineTo=vi.fn(); stroke=vi.fn(); circle=vi.fn(); close=vi.fn(); }
  class Sprite { static SizeMode={CUSTOM:0}; spriteFrame?: unknown; enabled=false; }
  const tween=() => { const t={to:() => t,start:vi.fn()}; return t; };
  return {_decorator:{ccclass:() => (Type: unknown) => Type},Component:class {},
    Director:{},ResolutionPolicy:{},director:{},profiler:{},JsonAsset:class {},resources:{},
    Color,UITransform,Node,Graphics,Sprite,Label:class {},Vec3,Layers:{Enum:{UI_2D:1}},tween,
    Tween:{stopAllByTarget:vi.fn()},Game:{EVENT_HIDE:'hide'},game:{on:vi.fn(),off:vi.fn()},
    sys:{getSafeAreaRect:() => ({x:0,y:0,width:750,height:1334})},view:{getVisibleSize:() => ({width:750,height:1334})}};
});
import { Node, Sprite, Graphics } from 'cc';
import { Bootstrap } from '../client/assets/scripts/Bootstrap';
import { parseLevel } from '../client/assets/scripts/core/level';
import stage2 from '../client/assets/resources/levels/v1/stage2.json';
import momLevel from '../client/assets/resources/levels/v1/mom.json';
import { StagePage } from '../client/assets/scripts/pages/StagePage';
import { FinishView } from '../client/assets/scripts/ui/FinishView';
import { finishTimeline } from '../client/assets/scripts/game/FinishTimeline';
import { stage1 } from '../client/assets/scripts/core/stage1';
import fixture from './fixtures/v1/stage1.solution.json';
import momSolution from './fixtures/v1/mom.solution.json';

beforeEach(() => { effects.play.mockReset(); effects.load.mockReset().mockResolvedValue(undefined); vi.unstubAllGlobals(); });

test('legal last drop keeps stage, freezes controls, plays cues once, and exposes next only after finish',() => {
  let now=0; const route=vi.fn(), vibrate=vi.fn(); vi.stubGlobal('navigator',{vibrate});
  const page=new StagePage(new Node(),stage1(fixture.date),() => now,route);
  const p=page as any;
  for (const placement of fixture.placements.slice(0,-1)) p.session.drop(placement);
  const last=fixture.placements.at(-1)!;
  const piece=p.level.pieces.find((item: any) => item.id === last.pieceId);
  p.drag.release=() => ({tap:false,gesture:{mode:'drag',piece,rotation:0,current:{x:0,y:0}}});
  p.updateHeld=() => { p.previewPlacement=last; };
  p.end({getID:() => 1,getUILocation:() => ({x:0,y:0})});
  expect(p.session.solved).toBe(true); expect(p.cleared).toBe(true);
  expect(route).not.toHaveBeenCalled(); expect(effects.play).toHaveBeenCalledWith('drop');
  const finish=p.finishView as FinishView;
  expect(finish.node.getChildByName('LoadedCar')!.active).toBe(false);
  now=299; page.tick();
  expect(finish.node.getChildByName('LoadedCar')!.active).toBe(false);
  expect(effects.play).not.toHaveBeenCalledWith('trunk_slam');
  const undo=vi.spyOn(p.session,'undo'), restart=vi.spyOn(p.session,'restart');
  // Once the end frame is shown, old controls must still be blocked.
  now=700; page.tick(); expect(vibrate).toHaveBeenCalledWith(40);
  for (const t of [1000,1200,1300,1600,2500,2600]) { now=t; page.tick(); }
  expect(effects.play.mock.calls.filter(([sound]) => sound === 'horn')).toHaveLength(2);
  expect(effects.play.mock.calls.filter(([sound]) => sound === 'trunk_slam')).toHaveLength(1);
  expect(finish.pool.every(p => !p.active)).toBe(true);
  expect(finish.node.getChildByName('FinishActions')!.active).toBe(true);
  for (const button of p.buttons) p.start({getUILocation:() => ({
    x:button.rect.x+button.rect.w/2-375,y:667-button.rect.y-button.rect.h/2,
  })});
  expect(undo).not.toHaveBeenCalled(); expect(restart).not.toHaveBeenCalled();
  expect(p.modal).toBeUndefined(); expect(p.session.solved).toBe(true);
  finish.press(375,1004); expect(route).toHaveBeenCalledWith('next');
});

test('screen touch skips from animation to final frame without firing pending cues or clicking through',() => {
  const route=vi.fn(); const page=new StagePage(new Node(),stage1(fixture.date),() => 0,route);
  const p=page as any; p.beginFinish();
  p.start({getUILocation:() => ({x:0,y:-337})});
  expect(p.finish.state.buttons).toBe(true);
  expect(p.finishView.pool.every((particle: any) => !particle.active)).toBe(true);
  expect(route).not.toHaveBeenCalled();
  page.tick(); expect(effects.play).not.toHaveBeenCalled();
  p.start({getUILocation:() => ({x:0,y:-337})});
  expect(route).toHaveBeenCalledWith('next');
});

test('optional lid/confetti frames, fallback, stage 2 hit targets, and destroy cleanup',async () => {
  const route=vi.fn(); const view=new FinishView(new Node(),2,route);
  view.layout(1334,{x:155,y:350,w:440,h:330});
  view.render(finishTimeline(1500));
  expect(view.pool.filter(p => p.active)).toHaveLength(120);
  const lid=view.node.getChildByName('LoadedCar')!.getChildByName('TrunkLid')!;
  expect(lid.getComponent(Graphics)!.enabled).toBe(true);
  view.press(375,1004); expect(route).not.toHaveBeenCalled();
  view.render(finishTimeline(2500)); view.press(375,1004); view.press(375,1112);
  expect(route.mock.calls).toEqual([['replay'],['mom']]);
  view.render(finishTimeline(1500)); view.node.destroy();
  expect(view.pool.every(p => !p.active)).toBe(true);
  effects.load.mockResolvedValue({name:'replacement'});
  const loaded=new FinishView(new Node(),1,route);
  await Promise.resolve();
  const loadedLid=loaded.node.getChildByName('LoadedCar')!.getChildByName('TrunkLid')!;
  expect(loadedLid.getComponent(Graphics)!.enabled).toBe(false);
  expect(loadedLid.getChildByName('LidImage')!.getComponent(Sprite)!.enabled).toBe(true);
  const confetti=loaded.node.getChildByName('Confetti0')!;
  expect(confetti.getComponent(Graphics)!.enabled).toBe(false);
});

test('missing vibration API and a throwing device never prevent finishing',() => {
  for (const navigator of [{},{vibrate:() => { throw new Error('device'); }}]) {
    vi.stubGlobal('navigator',navigator);
    let now=0; const page=new StagePage(new Node(),stage1(fixture.date),() => now,vi.fn());
    const p=page as any; p.beginFinish(); now=2500;
    expect(() => page.tick()).not.toThrow(); expect(p.finish.state.buttons).toBe(true);
  }
});

test('stage 1 opens with a looping guide from the first tray item to a legal drop',() => {
  let now=0; const page=new StagePage(new Node(),stage1(fixture.date),() => now,vi.fn());
  const p=page as any;
  expect(p.guideNode.active).toBe(true);
  expect(p.guidePlacement.pieceId).toBe(1);
  expect(p.session.canDrop(p.guidePlacement)).toBe(true);
  const start=p.guideHand.position.clone();
  now=560; page.tick();
  expect(p.guideHand.position.x).not.toBeCloseTo(start.x,3);
  expect(p.guideHand.position.y).not.toBeCloseTo(start.y,3);
});

test('first touch hides stage 1 guide for the rest of the round',() => {
  const page=new StagePage(new Node(),stage1(fixture.date),() => 0,vi.fn());
  const p=page as any;
  expect(p.guideNode.active).toBe(true);
  p.start({getID:() => 1,getUILocation:() => ({x:100,y:100})});
  expect(p.guideNode.active).toBe(false);
  p.restartStage(); page.tick();
  expect(p.guideNode.active).toBe(false);
});

test('stage 2 and mom mode never show the first-level guide',() => {
  for (const level of [parseLevel(stage2),parseLevel(momLevel)]) {
    const page=new StagePage(new Node(),level,() => 0,vi.fn());
    expect((page as any).guideNode.active).toBe(false);
  }
});


test('Bootstrap routes next, replay, mom, and back to stage 1 without stale pages',async () => {
  const app=new Bootstrap(), root=new Node();
  app.node=root;
  const bootstrap=app as any;
  const load=vi.spyOn(bootstrap.api,'loadChallenge').mockResolvedValue(stage2);
  const loadMom=vi.spyOn(bootstrap.api,'loadMom').mockResolvedValue(parseLevel(momLevel));
  bootstrap.show(stage1(fixture.date));
  const first=bootstrap.stage;
  first.beginFinish(); first.start({getUILocation:() => ({x:0,y:-337})});
  first.start({getUILocation:() => ({x:0,y:-337})});
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(1);
  expect(first.node.isValid).toBe(false);
  const second=bootstrap.stage;
  expect(second.level).toBe(stage2);
  second.beginFinish(); second.start({getUILocation:() => ({x:0,y:-337})});
  second.start({getUILocation:() => ({x:0,y:-337})});
  const replay=bootstrap.stage;
  expect(second.node.isValid).toBe(false);
  expect(replay.level).toBe(stage2); expect(replay.cleared).toBe(false);
  replay.beginFinish(); replay.start({getUILocation:() => ({x:0,y:-445})});
  replay.start({getUILocation:() => ({x:0,y:-445})});
  await Promise.resolve(); await Promise.resolve();
  expect(loadMom).toHaveBeenCalledTimes(1);
  expect(bootstrap.stage.level).toBeTruthy();
  expect(bootstrap.stage.level.mode).toBe('mom');
  const momPage=bootstrap.stage;
  momPage.beginFinish(); momPage.start({getUILocation:() => ({x:0,y:-337})});
  momPage.start({getUILocation:() => ({x:0,y:-337})});
  momPage.finishView.press(375,1112);
  expect(bootstrap.stage.level.stage).toBe(1);
  expect(bootstrap.stage.level.mode).toBeUndefined();
  expect(replay.node.isValid).toBe(false);
  expect(load).toHaveBeenCalledTimes(1);
});

test('?mode=mom enters mom mode directly and normal stage completion never auto-appends',async () => {
  vi.stubGlobal('window',{location:{search:'?mode=mom'}});
  const app=new Bootstrap(), root=new Node(); app.node=root;
  const bootstrap=app as any;
  const loadMom=vi.spyOn(bootstrap.api,'loadMom').mockResolvedValue(parseLevel(momLevel));
  app.start(); await Promise.resolve();
  expect(loadMom).toHaveBeenCalledTimes(1);
  expect(bootstrap.stage.level.mode).toBe('mom');

  const normal=new StagePage(new Node(),{...parseLevel(momLevel),mode:'normal'},() => 0,vi.fn());
  const page=normal as any;
  for (const placement of momSolution.placements.filter(entry => entry.pieceId <= 7)) page.session.drop(placement);
  page.tick();
  expect(page.session.pendingBatches).toBe(0);
  expect(page.mom).toBeUndefined();
});

test('mom reveals every batch, appends only after a cleared tray, and finishes after the last drop',() => {
  let now=0; const route=vi.fn();
  const page=new StagePage(new Node(),parseLevel(momLevel),() => now,route);
  const p=page as any;
  expect(effects.load.mock.calls.some((call: any[]) => call[0] === 'ui/mom')).toBe(true);
  expect(p.momIntro.string).toBe('妈妈说：再带点东西！');
  expect(p.momIntro.node.active).toBe(true);
  const baseIds=new Set(p.level.pieces.map((piece: any) => piece.id));
  for (const placement of (momSolution.placements as any[])
    .filter(entry => baseIds.has(entry.pieceId))) expect(p.session.drop(placement)).toBe(true);
  page.tick();
  expect(p.momLayer.active).toBe(true);
  expect(p.momBubble.string).toBe('等等！还有这个！');
  expect(p.cleared).toBe(false);
  now=700; page.tick();
  expect(p.session.pieces).toHaveLength(p.level.pieces.length+1);
  expect(effects.play).toHaveBeenCalledWith('mom');
  expect(p.cleared).toBe(false);
  now=2000; page.tick();
  expect(p.momLayer.active).toBe(false);
  const basePlacement=p.session.placements[0];
  const basePiece=p.level.pieces.find((piece: any) => piece.id === basePlacement.pieceId);
  p.drag.release=() => ({tap:false,gesture:{mode:'drag',piece:basePiece,rotation:basePlacement.rotation,
    current:{x:p.tray.x+8,y:p.tray.y+8},fromTray:false}});
  p.updateHeld=() => {};
  p.end({getID:() => 2,getUILocation:() => ({x:0,y:0})});
  expect(p.session.placements.some((placed: any) => placed.pieceId === basePlacement.pieceId)).toBe(false);
  const returned=p.slots.find((slot: any) => slot.piece.id === basePlacement.pieceId);
  expect(returned).toBeDefined();
  expect(returned.rect.x).toBeGreaterThanOrEqual(p.tray.x);
  p.session.drop(basePlacement); p.sync();
  for (let batch=0;batch<momLevel.extras.length;batch++) {
    const placements=momSolution.placements.filter(placement =>
      momLevel.extras[batch].some(entry => entry.id === placement.pieceId));
    const beforeLast=batch < momLevel.extras.length-1 ? placements : placements.slice(0,-1);
    for (const placement of beforeLast) expect(p.session.drop(placement)).toBe(true);
    if (batch < momLevel.extras.length-1) {
      page.tick();
      expect(p.momLayer.active).toBe(true);
      now+=700; page.tick();
      now+=1300; page.tick();
      expect(p.momLayer.active).toBe(false);
    }
  }
  const last=momSolution.placements.at(-1)!;
  const piece=p.level.extras.flat().find((entry: any) => entry.id === last.pieceId);
  p.drag.release=() => ({tap:false,gesture:{mode:'drag',piece,rotation:last.rotation,current:{x:0,y:0}}});
  p.updateHeld=() => { p.previewPlacement=last; };
  p.end({getID:() => 1,getUILocation:() => ({x:0,y:0})});
  expect(p.session.solved).toBe(true);
  expect(p.cleared).toBe(true);
  expect(effects.play.mock.calls.filter((call: any[]) => call[0] === 'mom')).toHaveLength(3);
  now+=2500; page.tick();
  const finish=p.finishView as FinishView;
  expect(finish.node.getChildByName('FinishActions')!.active).toBe(true);
  finish.press(375,1004); expect(route).toHaveBeenCalledWith('replay');
  finish.press(375,1112); expect(route).toHaveBeenCalledWith('first');
});

test('restarting mom returns to the first batch and forgets the append sequence',() => {
  let now=0; const page=new StagePage(new Node(),parseLevel(momLevel),() => now,vi.fn());
  const p=page as any;
  for (const placement of momSolution.placements.filter(entry => entry.pieceId <= 7)) p.session.drop(placement);
  page.tick(); now=700; page.tick();
  expect(p.session.pieces).toHaveLength(8);
  expect(p.session.placements).toHaveLength(7);
  p.restartStage(); page.tick();
  expect(p.session.pieces).toHaveLength(7);
  expect(p.session.pendingBatches).toBe(3);
  expect(p.session.placements).toHaveLength(0);
  expect(p.mom).toBeUndefined();
  expect(p.momIntro.node.active).toBe(true);
});
