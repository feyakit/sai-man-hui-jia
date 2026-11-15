import { Color, Graphics, Label, Layers, Node, UITransform } from 'cc';

export function uiNode(name: string, parent: Node, width: number, height: number): Node {
  const node = new Node(name);
  node.layer = Layers.Enum.UI_2D;
  node.addComponent(UITransform).setContentSize(width,height);
  parent.addChild(node);
  return node;
}

export function label(parent: Node, name: string, text: string, size: number, x: number, y: number): Label {
  const node = uiNode(name,parent,720,size+12);
  node.setPosition(x,y);
  const result = node.addComponent(Label);
  result.string = text;
  result.fontSize = size;
  result.lineHeight = size+6;
  result.color = new Color(74,44,26);
  return result;
}

export function fill(graphics: Graphics, color: Color, x: number, y: number, width: number, height: number, radius = 0): void {
  graphics.fillColor = color;
  if (radius) graphics.roundRect(x,y,width,height,radius);
  else graphics.rect(x,y,width,height);
  graphics.fill();
}
