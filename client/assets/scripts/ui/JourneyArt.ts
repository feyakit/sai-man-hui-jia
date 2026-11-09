import { Color, Graphics } from 'cc';
import { fill } from './UIKit';

const ink = new Color(51,30,42);
const night = new Color(70,38,48);
const hillside = new Color(106,51,52);
const roofs = new Color(126,60,52);
const gold = new Color(255,194,101);
const lantern = new Color(204,63,55);
const windowLight = new Color(255,214,141);

export function drawHomeRoad(graphics: Graphics, width: number, height: number, top: number): void {
  const y = (value: number) => height/2-top-value;
  const x = (value: number) => value-width/2;
  const rect = (left: number, at: number, w: number, h: number, color: Color, radius = 0) => {
    fill(graphics,color,x(left),y(at+h),w,h,radius);
  };
  const polygon = (points: readonly (readonly [number,number])[], color: Color) => {
    graphics.fillColor = color;
    graphics.moveTo(x(points[0][0]),y(points[0][1]));
    for (const [px,py] of points.slice(1)) graphics.lineTo(x(px),y(py));
    graphics.close();
    graphics.fill();
  };
  const circle = (left: number, at: number, radius: number, color: Color) => {
    graphics.fillColor = color;
    graphics.circle(x(left),y(at),radius);
    graphics.fill();
  };

  rect(0,0,width,248,night);
  circle(627,112,40,new Color(184,93,63));
  polygon([[0,190],[92,145],[165,171],[265,157],[345,190],[460,153],[555,183],[652,141],[750,184],[750,248],[0,248]],hillside);
  polygon([[0,210],[153,197],[283,213],[414,192],[574,210],[686,191],[750,207],[750,248],[0,248]],ink);
  polygon([[0,248],[750,248],[450,220],[403,212],[369,213],[418,224],[165,248]],roofs);
  polygon([[256,248],[333,248],[390,233],[379,232]],gold);
  polygon([[408,228],[425,228],[443,224],[435,223]],gold);

  for (const [left,base,w] of [[85,220,48],[137,213,37],[599,225,55],[659,219,38]]) {
    rect(left,base-24,w,24,roofs);
    polygon([[left-7,base-24],[left+w/2,base-44],[left+w+7,base-24]],ink);
    rect(left+10,base-15,8,9,windowLight,2);
    rect(left+w-18,base-15,8,9,windowLight,2);
  }
  for (const [left,at] of [[52,64],[698,70]]) {
    rect(left-1,0,2,at-14,gold);
    rect(left-16,at-13,32,29,lantern,12);
    rect(left-9,at-15,18,4,gold,2);
    rect(left-9,at+13,18,4,gold,2);
    rect(left-1,at+17,2,13,gold);
  }
}

export function drawWelcomeHome(graphics: Graphics): void {
  const red = new Color(164,55,46);
  const brick = new Color(207,126,86);
  fill(graphics,new Color(247,224,191),-245,10,490,240,30);
  fill(graphics,brick,-138,35,276,127,5);
  graphics.fillColor = ink;
  graphics.moveTo(-162,152);
  graphics.lineTo(0,224);
  graphics.lineTo(162,152);
  graphics.close();
  graphics.fill();
  fill(graphics,red,-37,35,74,91,5);
  fill(graphics,gold,-9,72,18,18,4);
  for (const left of [-111,69]) {
    fill(graphics,ink,left-4,79,52,48,6);
    fill(graphics,windowLight,left,83,44,40,3);
    fill(graphics,ink,left+20,83,3,40);
    fill(graphics,ink,left,101,44,3);
  }
  for (const left of [-181,149]) {
    fill(graphics,red,left,116,32,43,13);
    fill(graphics,gold,left+7,111,18,5,2);
  }
  fill(graphics,red,-104,27,208,7,3);
}
