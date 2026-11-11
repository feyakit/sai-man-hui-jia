import { beforeEach, expect, test, vi } from 'vitest';
const effects=vi.hoisted(() => ({play:vi.fn(),load:vi.fn()}));
const animation=vi.hoisted(() => ({tweens:[] as {target:unknown;duration:number;props:any}[]}));
vi.mock('../client/assets/scripts/services/OptionalResources',() => ({loadArt:effects.load}));
vi.mock('../client/assets/scripts/services/SoundEffects',() => ({SoundEffects:class { play=effects.play; }}));
vi.mock('cc/env',() => ({EDITOR:true}));
vi.mock('cc',() => {
  class Vec3 { constructor(public x=0,public y=0,public z=0) {} clone() { return new Vec3(this.x,this.y,this.z); } set(x: number,y: number,z: number) { this.x=x; this.y=y; this.z=z; } }
  class Color { static WHITE=new Color(); r:number; g:number; b:number; a:number;
    constructor(r=255,g=255,b=255,a=255) { this.r=r; this.g=g; this.b=b; this.a=a; } }
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
  const tween=(target: unknown) => {
    const chain: any={to:(duration: number,props: any) => { animation.tweens.push({target,duration,props}); return chain; },
      set:() => chain,by:() => chain,call:() => chain,start:() => chain};
    return chain;
  };
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

beforeEach(() => { effects.play.mockReset(); effects.load.mockReset().mockResolvedValue(undefined); animation.tweens.length=0; vi.unstubAllGlobals(); });

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

test('settings gear opens a red-gold panel clear of the trunk and persists both toggles',() => {
  const values=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key: string) => values.get(key) ?? null,
    setItem:(key: string,value: string) => { values.set(key,value); }});
  const page=new StagePage(new Node(),stage1(fixture.date),() => 0,vi.fn());
  const p=page as any;
  const tap=(x: number,y: number) => p.start({getID:() => 1,getUILocation:() => ({x:x-375,y:p.height/2-y})});
  const gear=p.settingsGearRect();
  tap(gear.x+gear.w/2,gear.y+gear.h/2);
  expect(p.settingsOpen).toBe(true);
  expect(p.settingsPanel.active).toBe(true);
  const panel=p.settingsPanelRect();
  expect(panel.y+panel.h).toBeLessThan(p.trunk.y);
  expect(p.soundState.string).toBe('开');
  expect(p.vibrationState.string).toBe('开');
  tap(500,202);
  expect(p.settings.sound).toBe(false);
  expect(p.soundState.string).toBe('关');
  tap(500,246);
  expect(p.settings.vibration).toBe(false);
  expect(p.vibrationState.string).toBe('关');
  expect(JSON.parse(values.get('smhj.game-settings.v1')!)).toEqual({sound:false,vibration:false});
  tap(gear.x+gear.w/2,gear.y+gear.h/2);
  expect(p.settingsOpen).toBe(false);

  const restored=new StagePage(new Node(),stage1(fixture.date),() => 0,vi.fn()) as any;
  expect(restored.settings).toEqual({sound:false,vibration:false});
  restored.settings.sound=true; restored.applySettings();
  expect(JSON.parse(values.get('smhj.game-settings.v1')!)).toEqual({sound:true,vibration:false});
});

test('restart confirms first and timeout freezes the board behind the retry prompt',() => {
  let now=0; const page=new StagePage(new Node(),stage1(fixture.date),() => now,vi.fn());
  const p=page as any;
  const tap=(x: number,y: number) => p.start({getID:() => 1,getUILocation:() => ({x:x-375,y:p.height/2-y})});
  const placement=fixture.placements[0];
  expect(p.session.drop(placement)).toBe(true); p.sync();
  const restart=p.buttons[2].rect;
  tap(restart.x+restart.w/2,restart.y+restart.h/2);
  expect(p.modal).toBe('restart');
  expect(p.overlayText.string).toBe('重新装车？');
  tap(375,847);
  expect(p.modal).toBeUndefined();
  expect(p.session.placements).toEqual([placement]);
  tap(restart.x+restart.w/2,restart.y+restart.h/2);
  tap(375,747);
  expect(p.modal).toBeUndefined();
  expect(p.session.placements).toEqual([]);

  expect(p.session.drop(placement)).toBe(true); p.sync();
  now=60000; page.tick();
  expect(p.modal).toBe('timeout');
  expect(p.overlayText.string).toBe('时间到 · 再装一次');
  const before=p.session.placements.length;
  tap(375,600);
  expect(p.drag.active).toBeUndefined();
  expect(p.session.placements).toHaveLength(before);
  tap(375,747);
  expect(p.modal).toBeUndefined();
  expect(p.session.placements).toEqual([]);
  expect(p.session.remainingSeconds).toBe(60);
});

test('countdown turns red, ticks and bounces for the final ten seconds',() => {
  let now=0; const page=new StagePage(new Node(),stage1(fixture.date),() => now,vi.fn());
  const p=page as any;
  now=50000; page.tick();
  expect(p.clock.string).toBe('距出发 10 秒');
  expect(p.clock.color).toMatchObject({r:255,g:92,b:76});
  expect(effects.play.mock.calls.filter(([sound]) => sound === 'tick')).toHaveLength(1);
  now=51000; page.tick();
  expect(p.clock.string).toBe('距出发 9 秒');
  expect(effects.play.mock.calls.filter(([sound]) => sound === 'tick')).toHaveLength(2);
});

test('pickup and legal drop vibrate when enabled and stay silent when disabled',() => {
  const placement=fixture.placements[0];
  const run=(enabled: boolean) => {
    const vibrate=vi.fn(); vi.stubGlobal('navigator',{vibrate});
    const page=new StagePage(new Node(),stage1(fixture.date),() => 0,vi.fn());
    const p=page as any; p.settings.vibration=enabled;
    const piece=p.level.pieces.find((item: any) => item.id === placement.pieceId);
    p.drag.release=() => ({tap:false,gesture:{mode:'drag',piece,rotation:placement.rotation,current:{x:0,y:0},fromTray:true}});
    p.updateHeld=() => { p.previewPlacement=placement; };
    p.end({getID:() => 1,getUILocation:() => ({x:0,y:0})});
    return vibrate;
  };
  expect(run(true).mock.calls).toEqual([[10],[20]]);
  expect(run(false)).not.toHaveBeenCalled();
});

test('legal drop squashes to 0.85, rebounds to 1.05, and settles in 220ms',() => {
  const placement=fixture.placements[0];
  const page=new StagePage(new Node(),stage1(fixture.date),() => 0,vi.fn());
  const p=page as any;
  const piece=p.level.pieces.find((item: any) => item.id === placement.pieceId);
  const view=p.pieces.get(piece.id)!;
  p.drag.release=() => ({tap:false,gesture:{mode:'drag',piece,rotation:placement.rotation,current:{x:0,y:0},fromTray:true}});
  p.updateHeld=() => { p.previewPlacement=placement; };
  animation.tweens.length=0;
  p.end({getID:() => 1,getUILocation:() => ({x:0,y:0})});
  const scales=animation.tweens.filter(call => call.target === view.node && call.props.scale)
    .map(call => ({duration:call.duration,y:call.props.scale.y}));
  expect(scales).toEqual([{duration:.06,y:.85},{duration:.06,y:1.05},{duration:.1,y:1}]);
});

test('undo and restart fly changed pieces back over 180ms',() => {
  const placement=fixture.placements[0];
  const page=new StagePage(new Node(),stage1(fixture.date),() => 0,vi.fn());
  const p=page as any;
  const piece=p.level.pieces.find((item: any) => item.id === placement.pieceId);
  const view=p.pieces.get(piece.id)!;
  expect(p.session.drop(placement)).toBe(true); p.sync();
  animation.tweens.length=0;
  p.buttons[1].action();
  expect(animation.tweens.some(call => call.target === view.node && call.duration === .18)).toBe(true);
  expect(p.session.placements).toEqual([]);
  expect(p.session.drop(placement)).toBe(true); p.sync();
  animation.tweens.length=0;
  p.restartStage();
  expect(animation.tweens.some(call => call.target === view.node && call.duration === .18)).toBe(true);
});
