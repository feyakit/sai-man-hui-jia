import { expect, test, vi } from 'vitest';
const assets=vi.hoisted(() => ({load:vi.fn(async (_file: string): Promise<unknown> => undefined)}));
vi.mock('../client/assets/scripts/services/OptionalResources',() => ({loadArt:assets.load}));
vi.mock('../client/assets/scripts/services/SoundEffects',() => ({SoundEffects:class { play=vi.fn(); }}));
vi.mock('cc',() => {
  class Color { static WHITE=new Color(); constructor(..._args: number[]) {} }
  class UITransform { setContentSize=vi.fn(); }
  class Node {
    static EventType={NODE_DESTROYED:'destroy'};
    isValid=true; active=true; angle=0; children: Node[]=[]; components=new Map(); parent?: Node;
    constructor(public name='') {}
    addComponent(Type: new () => any) { const c=new Type(); c.node=this; this.components.set(Type,c); return c; }
    getComponent(Type: any) { return this.components.get(Type); }
    addChild(node: Node) { this.children.push(node); node.parent=this; }
    setPosition=vi.fn(); setScale=vi.fn(); on=vi.fn(); once=vi.fn();
    getChildByName(name: string) { return this.children.find(n => n.name===name); }
  }
  class Graphics { clear=vi.fn(); roundRect=vi.fn(); rect=vi.fn(); fill=vi.fn(); moveTo=vi.fn(); lineTo=vi.fn(); close=vi.fn(); circle=vi.fn(); stroke=vi.fn(); }
  class Sprite { static SizeMode={CUSTOM:0}; static Type={SLICED:1}; spriteFrame?: unknown; enabled=false; color?: unknown; node: any; }
  return {Color,UITransform,Node,Graphics,Sprite,Label:class {},Vec3:class {},Layers:{Enum:{UI_2D:1}},
    Tween:{stopAllByTarget:vi.fn()},Game:{EVENT_HIDE:'hide'},game:{on:vi.fn(),off:vi.fn()},
    sys:{getSafeAreaRect:() => ({x:0,y:0,width:750,height:1334})},view:{getVisibleSize:() => ({width:750,height:1334})}};
});
import { Graphics, Label, Node, Sprite, UITransform } from 'cc';
import { StagePage } from '../client/assets/scripts/pages/StagePage';
import { stage1 } from '../client/assets/scripts/core/stage1';
import fixture from './fixtures/v1/stage1.solution.json';
import type { PieceDef, Rotation } from '../client/assets/scripts/core/types';
import { computeStageLayout, controlContentLayout, vehicleLook } from '../client/assets/scripts/ui/StageArt';
import { drawItemFeature, itemTone } from '../client/assets/scripts/ui/ItemArt';
import { ITEMS } from '../client/assets/scripts/core/items';
import { itemKey, itemMeta, itemScale } from '../client/assets/scripts/core/items';
interface TestPage { drawPiece(piece: PieceDef, rotation: Rotation, size: number, held: boolean): void }
test('each item shows a code-drawn card with its short label until its art arrives',() => {
  const level=stage1('2027-01-15');
  const page=new StagePage(new Node(),level,() => 0,vi.fn());
  const piece=level.pieces.at(-1)!;
  const root=page.node.getChildByName(`Piece${piece.id}`)!;
  const image=root.getChildByName(`Sprite${piece.id}`)!;
  const title=root.getChildByName(`Item${piece.id}`)!;
  expect(image.getComponent(Sprite)!.enabled).toBe(false);
  expect(title.active).toBe(true);
  expect(title.getComponent(Label)!.string).toBe('白酒');
  for (const rotation of [0,1,2,3] as const) {
    (page as unknown as TestPage).drawPiece(piece,rotation,40,false);
    expect(image.getComponent(Sprite)!.enabled).toBe(false);
    expect(title.active).toBe(true);
  }
  expect(image.getComponent(UITransform)!.setContentSize).toHaveBeenCalled();
  expect(page.node.children.filter(n => n.name.startsWith('Piece'))).toHaveLength(level.pieces.length);
});

test('loaded item art replaces the card and rotates the whole picture',async () => {
  const frame={name:'liquor-art'};
  assets.load.mockImplementation(async (file: string) => file === 'items/liquor' ? frame : undefined);
  const level=stage1('2027-01-15');
  const page=new StagePage(new Node(),level,() => 0,vi.fn());
  const piece=level.pieces.find(p => p.shape === 'I2')!;
  (page as unknown as TestPage).drawPiece(piece,0,40,false);
  await new Promise(resolve => setTimeout(resolve,0));
  expect(assets.load.mock.calls.some(([name]) => name === 'items/liquor')).toBe(true);
  const root=page.node.getChildByName(`Piece${piece.id}`)!;
  const image=root.getChildByName(`Sprite${piece.id}`)!;
  const title=root.getChildByName(`Item${piece.id}`)!;
  const feature=root.getChildByName(`Feature${piece.id}`)!.getComponent(Graphics) as unknown as {clear: ReturnType<typeof vi.fn>};
  feature.clear.mockClear();
  (page as unknown as TestPage).drawPiece(piece,1,40,false);
  // The card emblem drawn before the art arrived must not stay painted over the picture.
  expect(feature.clear).toHaveBeenCalled();
  expect(image.getComponent(Sprite)!.enabled).toBe(true);
  expect(image.getComponent(Sprite)!.spriteFrame).toBe(frame);
  expect(title.active).toBe(false);
  expect(image.angle).toBe(90);
  // The art is authored for rotation 0, so the sprite keeps the unrotated 2×1 box.
  expect(image.getComponent(UITransform)!.setContentSize).toHaveBeenLastCalledWith(80*1.025,40*1.025);
  assets.load.mockImplementation(async () => undefined);
});

test('uses each piece item key before its shape default', async () => {
  const frame={name:'duck-art'};
  assets.load.mockImplementation(async (file: string) => file === 'items/duck' ? frame : undefined);
  const level=stage1('2027-01-15');
  const base=level.pieces[0];
  const piece={...base,item:'duck'};
  expect(itemKey(piece)).toBe('duck');
  expect(itemMeta(piece).name).toBe('腊鸭');
  expect(itemTone(piece).hex).toBe(itemTone({...base,shape:'Z4',item:'duck'}).hex);
  const page=new StagePage(new Node(),{...level,pieces:[...level.pieces.slice(1),piece]},() => 0,vi.fn());
  (page as unknown as TestPage).drawPiece(piece,0,40,false);
  await new Promise(resolve => setTimeout(resolve,0));
  expect(assets.load.mock.calls.some(([name]) => name === 'items/duck')).toBe(true);
  const root=page.node.getChildByName(`Piece${piece.id}`)!;
  const image=root.getChildByName(`Sprite${piece.id}`)!;
  expect(image.getComponent(Sprite)!.spriteFrame).toBe(frame);
  expect(image.getComponent(Sprite)!.enabled).toBe(true);
  assets.load.mockImplementation(async () => undefined);
});

test('falls back to the shape item key when level data has an unknown skin', () => {
  const piece={...stage1('2027-01-15').pieces[0],item:'not-a-cargo'};
  expect(itemKey(piece)).toBe('sugarcane');
  expect(itemMeta(piece).name).toBe('甘蔗');
});

test('keeps only the slim sausage and lotus-root art stretched vertically',() => {
  const level=stage1('2027-01-15');
  expect(itemScale({...level.pieces[0],shape:'I3',item:'sausage'})).toEqual({x:1,y:1.6});
  expect(itemScale({...level.pieces[0],shape:'N5',item:'lotusroot'})).toEqual({x:1,y:1.12});
  expect(itemScale(level.pieces[0])).toEqual({x:1,y:1});
});

test('phone layout reserves separate header, open trunk and tray bands',() => {
  const level={width:8,height:6,mode:'normal' as const};
  const frame=computeStageLayout(level,1623,0,0);
  expect(frame.board.x).toBeGreaterThanOrEqual(frame.trunk.x);
  expect(frame.board.y).toBeGreaterThanOrEqual(frame.trunk.y);
  expect(frame.board.x+frame.board.w).toBeLessThanOrEqual(frame.trunk.x+frame.trunk.w);
  expect(frame.board.y+frame.board.h).toBeLessThanOrEqual(frame.trunk.y+frame.trunk.h);
  expect(frame.trunk.y).toBeGreaterThan(216);
  expect(frame.trunk.y-35-216).toBeGreaterThanOrEqual(100);
  expect(frame.car.y+frame.car.h).toBeLessThan(frame.tray.y);
  expect(frame.tray.y+frame.tray.h).toBeLessThan(frame.buttonY);
  expect(frame.buttonH).toBeGreaterThanOrEqual(120);
  expect(frame.cell).toBeGreaterThanOrEqual(76);
  expect(vehicleLook('sedan_v1').body).not.toBe(vehicleLook('train').body);
});

test('grid cell caps at 110 design pixels',() => {
  const frame=computeStageLayout({width:1,height:1,mode:'normal'},1334,0,0);
  expect(frame.cell).toBe(110);
});

test('every cargo category has a distinct cool-to-warm palette and deep outline',() => {
  const entries=Object.entries(ITEMS).map(([shape,meta]) => itemTone({id:1,shape:shape as any,item:meta.key,initialRotation:0}));
  expect(new Set(entries.map(tone => tone.hex)).size).toBe(entries.length);
  expect(entries.every(tone => tone.hex.startsWith('#'))).toBe(true);
});

test('draws a representative emblem for every cargo item',() => {
  const g=new Graphics();
  for (const [shape,meta] of Object.entries(ITEMS)) {
    const piece={id:1,shape:shape as any,item:meta.key,initialRotation:0 as const} as PieceDef;
    drawItemFeature(g,piece,60,120,60,22,itemTone(piece));
  }
  const graphics=g as unknown as {fill:{mock:{calls:unknown[]}};stroke:{mock:{calls:unknown[]}}};
  expect(graphics.fill.mock.calls.length).toBeGreaterThan(Object.keys(ITEMS).length*2);
  expect(graphics.stroke.mock.calls.length).toBeGreaterThan(Object.keys(ITEMS).length);
});

test('keeps each control icon in its own left column away from the text',() => {
  for (const rect of [{x:45,y:1400,w:180,h:112},{x:295,y:1400,w:160,h:112},{x:515,y:1400,w:160,h:112}]) {
    const content=controlContentLayout(rect);
    expect(content.iconX-rect.x).toBe(34);
    expect(content.textX-content.iconX).toBeGreaterThanOrEqual(66);
  }
});

test('turns an emptied stage-one tray into a loaded-state departure plaque',() => {
  const page=new StagePage(new Node(),stage1(fixture.date),() => 0,vi.fn());
  const p=page as any;
  for (const placement of fixture.placements) p.session.drop(placement);
  p.sync();
  expect(p.trayEmpty.active).toBe(true);
  expect(p.trayEmptyTitle.string).toBe('已全部装车');
  expect(p.trayEmptyHint.string).toContain('准备出发');
  p.session.undo(); p.sync();
  expect(p.trayEmpty.active).toBe(false);
});
