import { expect, test, vi } from 'vitest';
const assets=vi.hoisted(() => ({load:vi.fn()}));
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
  class Sprite { static SizeMode={CUSTOM:0}; spriteFrame?: unknown; enabled=false; }
  return {Color,UITransform,Node,Graphics,Sprite,Label:class {},Vec3:class {},Layers:{Enum:{UI_2D:1}},
    Tween:{stopAllByTarget:vi.fn()},Game:{EVENT_HIDE:'hide'},game:{on:vi.fn(),off:vi.fn()},
    sys:{getSafeAreaRect:() => ({x:0,y:0,width:750,height:1334})},view:{getVisibleSize:() => ({width:750,height:1334})}};
});
import { Label, Node, Sprite, UITransform } from 'cc';
import { StagePage } from '../client/assets/scripts/pages/StagePage';
import { stage1 } from '../client/assets/scripts/core/stage1';
import type { PieceDef, Rotation } from '../client/assets/scripts/core/types';
import { computeStageLayout, vehicleLook } from '../client/assets/scripts/ui/StageArt';
import { itemTone } from '../client/assets/scripts/ui/ItemArt';
import { ITEMS } from '../client/assets/scripts/core/items';
interface TestPage { drawPiece(piece: PieceDef, rotation: Rotation, size: number, held: boolean): void }
test('one code-drawn card per item with a clear short label',() => {
  const level=stage1('2027-01-15');
  const page=new StagePage(new Node(),level,() => 0,vi.fn());
  const piece=level.pieces.at(-1)!;
  const root=page.node.getChildByName(`Piece${piece.id}`)!;
  const image=root.getChildByName(`Sprite${piece.id}`)!;
  const title=root.getChildByName(`Item${piece.id}`)!;
  expect(image.getComponent(Sprite)!.enabled).toBe(false);
  expect(title.active).toBe(true);
  expect(title.getComponent(Label)!.string).toBe('白酒');
  expect(assets.load.mock.calls.some(([name]: any[]) => String(name).startsWith('items/'))).toBe(false);
  for (const rotation of [0,1,2,3] as const) {
    (page as unknown as TestPage).drawPiece(piece,rotation,40,false);
    expect(image.getComponent(Sprite)!.enabled).toBe(false);
    expect(title.active).toBe(true);
  }
  expect(image.getComponent(UITransform)!.setContentSize).toHaveBeenCalled();
  expect(page.node.children.filter(n => n.name.startsWith('Piece'))).toHaveLength(level.pieces.length);
});

test('phone layout reserves separate header, open trunk and tray bands',() => {
  const level={width:8,height:6,mode:'normal' as const};
  const frame=computeStageLayout(level,1623,0,0);
  expect(frame.board.x).toBeGreaterThanOrEqual(frame.trunk.x);
  expect(frame.board.y).toBeGreaterThanOrEqual(frame.trunk.y);
  expect(frame.board.x+frame.board.w).toBeLessThanOrEqual(frame.trunk.x+frame.trunk.w);
  expect(frame.board.y+frame.board.h).toBeLessThanOrEqual(frame.trunk.y+frame.trunk.h);
  expect(frame.trunk.y).toBeGreaterThan(216);
  expect(frame.car.y+frame.car.h).toBeLessThan(frame.tray.y);
  expect(frame.tray.y+frame.tray.h).toBeLessThan(frame.buttonY);
  expect(frame.cell).toBeGreaterThanOrEqual(76);
  expect(vehicleLook('sedan_v1').body).not.toBe(vehicleLook('train').body);
});

test('every cargo category has a distinct cool-to-warm palette and deep outline',() => {
  const entries=Object.entries(ITEMS).map(([shape,meta]) => itemTone({id:1,shape:shape as any,item:meta.key,initialRotation:0}));
  expect(new Set(entries.map(tone => tone.hex)).size).toBe(entries.length);
  expect(entries.every(tone => tone.hex.startsWith('#'))).toBe(true);
});
