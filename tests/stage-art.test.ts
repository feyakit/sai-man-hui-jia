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
  class Graphics { clear=vi.fn(); roundRect=vi.fn(); rect=vi.fn(); fill=vi.fn(); moveTo=vi.fn(); lineTo=vi.fn(); stroke=vi.fn(); }
  class Sprite { static SizeMode={CUSTOM:0}; spriteFrame?: unknown; }
  return {Color,UITransform,Node,Graphics,Sprite,Label:class {},Vec3:class {},Layers:{Enum:{UI_2D:1}},
    Tween:{stopAllByTarget:vi.fn()},Game:{EVENT_HIDE:'hide'},game:{on:vi.fn(),off:vi.fn()},
    sys:{getSafeAreaRect:() => ({x:0,y:0,width:750,height:1334})},view:{getVisibleSize:() => ({width:750,height:1334})}};
});
import { Node, Sprite, UITransform } from 'cc';
import { StagePage } from '../client/assets/scripts/pages/StagePage';
import { stage1 } from '../client/assets/scripts/core/stage1';
import type { PieceDef, Rotation } from '../client/assets/scripts/core/types';
interface TestPage { drawPiece(piece: PieceDef, rotation: Rotation, size: number, held: boolean): void }
test('one Sprite per item, fallback remains until frame arrives; full image rotates and resizes',async () => {
  let resolve!: (frame: any) => void;
  assets.load.mockImplementation(() => new Promise(done => { resolve=done; }));
  const level=stage1('2027-01-15');
  const page=new StagePage(new Node(),level,() => 0,vi.fn());
  const piece=level.pieces.at(-1)!;
  const root=page.node.getChildByName(`Piece${piece.id}`)!;
  const image=root.getChildByName(`Sprite${piece.id}`)!;
  const title=root.getChildByName(`Item${piece.id}`)!;
  expect(image.getComponent(Sprite)!.enabled).toBe(false);
  expect(title.active).toBe(true);
  const frame={name:'file replacement'}; resolve(frame); await Promise.resolve();
  expect(image.getComponent(Sprite)!.spriteFrame).toBe(frame);
  expect(title.active).toBe(false);
  for (const rotation of [0,1,2,3] as const) {
    (page as unknown as TestPage).drawPiece(piece,rotation,40,false);
    expect(image.angle).toBe(rotation*90);
  }
  expect(image.getComponent(UITransform)!.setContentSize).toHaveBeenCalled();
  expect(page.node.children.filter(n => n.name.startsWith('Piece'))).toHaveLength(level.pieces.length);
});
test('late image callback does not touch destroyed stage',async () => {
  let resolve!: (frame: any) => void;
  assets.load.mockImplementation(() => new Promise(done => { resolve=done; }));
  const page=new StagePage(new Node(),stage1('2027-01-15'),() => 0,vi.fn());
  Object.defineProperty(page.node,'isValid',{value:false});
  resolve({}); await Promise.resolve();
});
