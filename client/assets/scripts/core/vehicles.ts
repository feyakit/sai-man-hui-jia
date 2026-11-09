import type { Cell, ShapeId, VehicleTemplate } from './types';
const wulingBlocked: Cell[] = [[0,0],[10,0],[0,8],[10,8]];
for (let y = 0; y < 9; y++) {
 if (y !== 4) wulingBlocked.push([5,y]);
}
const motoBlocked: Cell[] = [];
for (let y = 0; y < 10; y++) motoBlocked.push([3,y],[8,y]);
for (const x of [0,1,2]) motoBlocked.push([x,0],[x,1]);
for (const x of [9,10]) motoBlocked.push([x,8],[x,9]);

const pickupSquares = Array<ShapeId>(17).fill('O4');

export const VEHICLES: VehicleTemplate[] = [
 {
  id:'wuling',name:'五菱宏光',width:11,height:9,blocked:wulingBlocked,
  preferredInventories: [
   ['Z4','Y5','L3','Y5','I2','Y5','Z4','Z4','Y5','Z4','Y5','Z4','Y5','Z4','R6','Y5','Z4','Y5','Y5','I3'],
  ],
 },
 {
  id:'suv',name:'SUV',width:11,height:9,
  blocked:[[0,3],[0,4],[0,5],[1,4],[9,4],...Array.from({length:9},(_,y):Cell=>[10,y])],
  preferredInventories: [
   ['O4','L3','Z5','O4','O4','O4','I3','Z5','O4','Z5','O4','Z5','O4','L3','Z5','R6','Z5','O4','O4','O4'],
  ],
 },
 {
  id:'pickup',name:'皮卡',width:11,height:8,blocked:[[0,0],[0,7],[10,7]],
  preferredInventories: [
   ['I2','I4','P5','R6',...pickupSquares],
   ['I2','I4','N5','R6',...pickupSquares],
   ['I3','I3','P5','R6',...pickupSquares],
   ['I3','I3','L5','R6',...pickupSquares],
   ['I3','I3','N5','R6',...pickupSquares],
   ['I3','L3','P5','R6',...pickupSquares],
  ],
 },
 {
  id:'etrike',name:'电动三轮',width:10,height:10,
  blocked:[[0,0],[1,0],[2,0],[9,0],[8,0],[7,0],[0,1],[1,1],[9,1],[8,1],[0,2],[9,2],[0,3],[9,3],[0,4],[9,4],[0,5],[9,5]],
  preferredInventories: [
   ['R6','L3','I3','I2','O4','O4','O4','O4','O4','O4','O4','O4','O4','O4','O4','O4','O4','O4','O4','O4','O4'],
  ],
 },
 {
  id:'moto',name:'摩托车',width:11,height:10,blocked:motoBlocked,
  preferredInventories: [
   ['O4','O4','O4','I2','I3','I2','O4','O4','O4','U5','O4','O4','O4','R6','O4','O4','O4','R6','O4','O4'],
   ['O4','O4','O4','S4','I2','O4','O4','O4','I3','L3','O4','O4','O4','R6','O4','O4','O4','R6','O4','O4'],
  ],
 },
 {
  id:'train',name:'绿皮火车',width:11,height:9,
  blocked:Array.from({length:11},(_,x): Cell => [x,3]),
  preferredInventories: [
   ['J4','Z5','L3','Z5','O4','J4','O4','O4','O4','Z4','Z5','O4','Z5','I2','Z5','Z4','Z5','L3','O4','Z4','R6'],
  ],
 },
];
