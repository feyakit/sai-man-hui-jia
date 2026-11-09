import type { Cell, VehicleTemplate } from './types';
const corners: Cell[] = [[0,0],[10,0],[0,8],[10,8]];
export const VEHICLES: VehicleTemplate[] = [
 {id:'wuling',name:'五菱宏光',width:11,height:9,blocked:corners},
 {id:'suv',name:'SUV',width:11,height:9,blocked:[[0,3],[0,4],[0,5],[1,4],[10,3],[10,4],[10,5],[9,4]]},
 {id:'pickup',name:'皮卡',width:11,height:8,blocked:[[0,7],[10,7]]},
 {id:'etrike',name:'电动三轮',width:10,height:10,blocked:[[0,0],[1,0],[2,0],[9,0],[8,0],[7,0],[0,1],[1,1],[9,1],[8,1],[0,2],[9,2],[0,3],[9,3],[0,4],[9,4],[0,5],[9,5]]},
 {id:'moto',name:'摩托车',width:11,height:10,blocked:[[3,0],[7,0],[3,1],[7,1],[3,2],[7,2],[3,3],[7,3],[3,4],[7,4],[3,5],[7,5],[3,6],[7,6],[3,7],[7,7],[3,8],[7,8],[3,9],[7,9]]},
 {id:'train',name:'绿皮火车',width:11,height:9,blocked:Array.from({length:11},(_,x): Cell => [x,3])},
];
