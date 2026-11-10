import { Color, Graphics, Node, Sprite, UITransform } from 'cc';
import { createConfettiPool, finishButtons, type FinishAction, type FinishState, updateConfetti } from '../game/FinishTimeline';
import type { Rect } from '../game/InteractionGeometry';
import { inRect } from '../game/InteractionGeometry';
import { loadArt } from '../services/OptionalResources';
import { fill, label, uiNode } from './UIKit';
import { drawHomeRoad } from './JourneyArt';

const red=new Color(184,27,43), bright=new Color(238,65,48), gold=new Color(255,205,114);
const pale=new Color(255,238,194), dark=new Color(88,22,38), tire=new Color(43,25,34);
const lightGlow=new Color(255,124,70,95);
const confettiColors=[gold,bright,pale,new Color(255,136,107)];

/** Allocates its nodes once on clear; render mutates existing states and nodes only. */
export class FinishView {
  readonly node: Node;
  readonly pool=createConfettiPool();
  private readonly backdrop: Node;
  private readonly car: Node;
  private readonly body: Graphics;
  private readonly lid: Node;
  private readonly lidFallback: Graphics;
  private readonly lidImage: Sprite;
  private readonly lights: Graphics;
  private readonly headline: Node;
  private readonly actions: Node;
  private readonly particles: {node: Node; sprite: Sprite; fallback: Graphics}[]=[];
  private readonly buttonRects: {rect: Rect; action: FinishAction}[]=[];
  private readonly choices;
  private height=1334;
  private carY=0;
  private lidHeight=0;
  private lightsOn=false;
  private state?: FinishState;

  constructor(parent: Node, stage: number, private readonly onAction: (action: FinishAction) => void) {
    this.node=uiNode('Finish',parent,750,1334);
    this.choices=finishButtons(stage);
    this.backdrop=uiNode('HomewardNight',this.node,750,1334);
    this.backdrop.addComponent(Graphics);
    this.car=uiNode('LoadedCar',this.node,700,600);
    this.body=this.car.addComponent(Graphics);
    this.lid=uiNode('TrunkLid',this.car,600,400);
    this.lidFallback=this.lid.addComponent(Graphics);
    this.lidImage=uiNode('LidImage',this.lid,600,400).addComponent(Sprite);
    this.lidImage.sizeMode=Sprite.SizeMode.CUSTOM; this.lidImage.trim=false; this.lidImage.enabled=false;
    void loadArt('vehicles/sedan_v1_lid').then(frame => {
      if (!frame || !this.node.isValid) return;
      this.lidImage.spriteFrame=frame; this.lidImage.enabled=true; this.lidFallback.enabled=false;
    });
    this.lights=uiNode('TailLights',this.car,700,100).addComponent(Graphics);
    label(this.car,'Plate','年货满载 · 平安回家',23,0,0).color=dark;
    this.headline=uiNode('Celebration',this.node,750,250);
    const banner=this.headline.addComponent(Graphics);
    fill(banner,dark,-353,-70,706,140,24);
    fill(banner,gold,-343,-60,686,120,20);
    fill(banner,red,-337,-54,674,108,16);
    label(this.headline,'FinishTitle','塞满了！回家！',62,0,1).color=pale;
    label(this.headline,'FinishSubtitle','把一整年的牵挂，装进回家的路',25,0,-104).color=gold;
    this.actions=uiNode('FinishActions',this.node,750,320);
    const buttons=this.actions.addComponent(Graphics);
    for (let i=0;i<this.choices.length;i++) {
      const y=-i*108;
      fill(buttons,i === 0 ? gold : dark,-250,y-40,500,80,22);
      const text=label(this.actions,`FinishButton${i}`,this.choices[i].title,32,0,y);
      text.color=i === 0 ? dark : gold;
    }
    for (let i=0;i<this.pool.length;i++) {
      const node=uiNode(`Confetti${i}`,this.node,18,24);
      const fallback=node.addComponent(Graphics);
      fill(fallback,confettiColors[i%4],-5,-10,10,20,2);
      const sprite=uiNode('Image',node,24,24).addComponent(Sprite);
      sprite.sizeMode=Sprite.SizeMode.CUSTOM; sprite.enabled=false;
      this.particles.push({node,sprite,fallback}); node.active=false;
    }
    for (let variant=0;variant<4;variant++) void loadArt(`fx/confetti_${variant+1}`).then(frame => {
      if (!frame || !this.node.isValid) return;
      for (let i=variant;i<this.particles.length;i+=4) {
        this.particles[i].sprite.spriteFrame=frame; this.particles[i].sprite.enabled=true;
        this.particles[i].fallback.enabled=false;
      }
    });
    label(this.node,'SkipHint','轻点屏幕 · 立即出发',23,0,-600).color=gold;
    this.node.once(Node.EventType.NODE_DESTROYED,() => updateConfetti(this.pool,2500,750,this.height));
  }

  layout(height: number, board: Rect): void {
    this.height=height;
    this.node.getComponent(UITransform)!.setContentSize(750,height);
    this.carY=height/2-board.y-board.h/2;
    const w=Math.min(680,Math.max(510,board.w+80)), h=board.h+90;
    this.lidHeight=board.h+16;
    this.body.clear();
    fill(this.body,tire,-w/2-14,-h/2-30,52,135,18);
    fill(this.body,tire,w/2-38,-h/2-30,52,135,18);
    // Four rails leave the packed board visible while the lid travels down.
    fill(this.body,dark,-w/2-12,-h/2-36,w+24,75,28);
    fill(this.body,red,-w/2,-h/2-20,w,65,20);
    fill(this.body,red,-w/2,-h/2+40,(w-board.w)/2,h-40,18);
    fill(this.body,red,board.w/2,-h/2+40,(w-board.w)/2,h-40,18);
    fill(this.body,red,-w/2,board.h/2,w,42,18);
    fill(this.body,gold,-w/2+12,-h/2-1,w-24,12,6);
    fill(this.body,gold,-165,-h/2-5,330,43,8);
    this.car.getChildByName('Plate')!.setPosition(0,-h/2+16);
    this.lid.getComponent(UITransform)!.setContentSize(board.w+16,this.lidHeight);
    this.lidImage.node.getComponent(UITransform)!.setContentSize(board.w+16,this.lidHeight);
    this.lidFallback.clear();
    fill(this.lidFallback,red,-board.w/2-8,-this.lidHeight/2,board.w+16,this.lidHeight,20);
    fill(this.lidFallback,gold,-board.w/2+8,this.lidHeight/2-24,board.w-16,7,3);
    fill(this.lidFallback,dark,-40,-8,80,16,8);
    this.lights.node.setPosition(0,-h/2+68);
    this.drawLights(false);
    const bg=this.backdrop.getComponent(Graphics)!; bg.clear();
    fill(bg,red,-375,-height/2,750,height);
    drawHomeRoad(bg,750,height,0);
    // Long gold side ornaments and road markings frame the loaded car.
    fill(bg,gold,-352,-height/2+32,3,height-304);
    fill(bg,gold,349,-height/2+32,3,height-304);
    for (let i=0;i<5;i++) fill(bg,new Color(224,91,62),-7,-height/2+80+i*95,14,44,4);
    this.headline.setPosition(0,-110);
    this.actions.setPosition(0,-height/2+330);
    this.buttonRects.length=0;
    for (let i=0;i<this.choices.length;i++) this.buttonRects.push({
      rect:{x:125,y:height-370+i*108,w:500,h:80},action:this.choices[i].action,
    });
    this.node.getChildByName('SkipHint')!.setPosition(0,-height/2+74);
    if (this.state) this.render(this.state);
  }
  private drawLights(on: boolean): void {
    this.lightsOn=on; this.lights.clear();
    for (const x of [-225,155]) {
      if (on) fill(this.lights,lightGlow,x-14,-29,98,58,20);
      fill(this.lights,on ? pale : bright,x,-15,70,30,8);
      fill(this.lights,gold,x+4,-3,62,4,2);
    }
  }
  render(state: FinishState): void {
    this.state=state;
    this.backdrop.active=state.time >= 700;
    this.car.active=state.lidVisible;
    this.car.setPosition(0,this.carY-state.bodySink);
    this.lid.setPosition(0,(1-state.lidProgress)*(this.height/2-this.carY+this.lidHeight));
    this.lid.setScale(1,0.7+state.lidProgress*.3,1);
    if (this.lightsOn !== state.tailLights) this.drawLights(state.tailLights);
    this.headline.active=state.celebration;
    this.actions.active=state.buttons;
    this.node.getChildByName('SkipHint')!.active=!state.buttons;
    updateConfetti(this.pool,state.time,750,this.height);
    for (let i=0;i<this.pool.length;i++) {
      const p=this.pool[i], v=this.particles[i]; v.node.active=p.active;
      if (p.active) { v.node.setPosition(p.x-375,this.height/2-p.y); v.node.angle=p.angle; }
    }
  }
  press(x: number,y: number): void {
    if (!this.state?.buttons) return;
    for (const b of this.buttonRects) if (inRect({x,y},b.rect)) { this.onAction(b.action); return; }
  }
}
