import { _decorator, Component, Director, Layers, Node, ResolutionPolicy, director, view } from 'cc';
import { EDITOR } from 'cc/env';
import { GAME_TITLE } from './config/brand';
import { shanghaiDate } from './core/date';
import { stage1 } from './core/stage1';
import type { Level } from './core/types';
import { StagePage } from './pages/StagePage';
import { WebPlatform } from './platform/WebPlatform';
import { Api } from './services/Api';
import { label, uiNode } from './ui/UIKit';

const {ccclass} = _decorator;

@ccclass('Bootstrap')
export class Bootstrap extends Component {
  private stage?: StagePage;
  private readonly platform = new WebPlatform();
  private readonly api = new Api(this.platform);

  start(): void {
    if (this.platform.hasLevelOverride()) void this.challenge();
    else this.show(stage1(shanghaiDate()));
  }

  update(): void { this.stage?.tick(); }

  private show(level: Level): void {
    this.node.destroyAllChildren();
    this.stage = new StagePage(this.node,level,() => this.platform.now(),() => {
      if (level.stage === 1) void this.challenge();
      else this.message('行李塞满了，回家！',() => this.show(stage1(shanghaiDate())));
    });
  }

  private async challenge(): Promise<void> {
    this.message('正在装载今天的挑战关');
    try {
      const level = await this.api.loadChallenge();
      if (this.node.isValid) this.show(level);
    } catch {
      if (this.node.isValid) this.message('挑战关读取失败，点屏幕重试',() => void this.challenge());
    }
  }

  private message(text: string, onTap?: () => void): void {
    this.stage = undefined;
    this.node.destroyAllChildren();
    const size = view.getVisibleSize();
    const screen = uiNode('Message',this.node,size.width,size.height);
    label(screen,'Brand',GAME_TITLE,62,0,90);
    label(screen,'Message',text,32,0,0);
    if (onTap) screen.once('touch-end',onTap);
  }
}

if (!EDITOR) {
  director.on(Director.EVENT_AFTER_SCENE_LAUNCH, (scene: Node) => {
    const canvas = scene.getChildByName('Canvas');
    if (!canvas) return;
    view.setDesignResolutionSize(750,1334,ResolutionPolicy.FIXED_WIDTH);
    let root = canvas.getChildByName('GameRoot');
    if (!root) {
      root = new Node('GameRoot');
      root.layer = Layers.Enum.UI_2D;
      canvas.addChild(root);
    }
    if (!root.getComponent(Bootstrap)) root.addComponent(Bootstrap);
  });
}
