import { expect, it } from 'vitest';
import { solve } from '../client/assets/scripts/core/dlx';
import { orientations, SHAPES } from '../client/assets/scripts/core/shapes';
import type { Level, Placement, ShapeId } from '../client/assets/scripts/core/types';
import { validateSolution } from '../client/assets/scripts/core/validate';

function enumerate(level: Level): number {
 const seen = new Set<string>();
 const visit=(placements: Placement[]) => {
  if (placements.length===level.pieces.length) {
   if (!validateSolution(level,placements).ok) return;
   const groups = new Map<ShapeId,string[]>();
   for (const p of placements) {
    const shape=level.pieces.find(piece=>piece.id===p.pieceId)!.shape;
    const value=orientations(shape).find(o=>o.rotation===p.rotation)!;
    const cells=value.cells.map(([x,y])=>`${x+p.x},${y+p.y}`).sort().join(';');
    const list=groups.get(shape) ?? [];
    list.push(cells);
    groups.set(shape,list);
   }
   seen.add([...groups].sort(([a],[b])=>a.localeCompare(b)).map(([shape,cells])=>shape+':'+cells.sort().join('|')).join('/'));
   return;
  }
  const piece=level.pieces[placements.length];
  for(const orientation of orientations(piece.shape)) for(let y=0;y<level.height;y++) for(let x=0;x<level.width;x++)
   visit([...placements,{pieceId:piece.id,rotation:orientation.rotation,x,y}]);
 };
 visit([]);
 return seen.size;
}
it('matches independent exhaustive enumeration for all small two-piece cases',()=>{
 const shapes=Object.keys(SHAPES) as ShapeId[];
 for(const a of shapes) for(const b of shapes) {
  if(SHAPES[a].length+SHAPES[b].length!==6) continue;
  const level: Level={date:'2027-01-01',stage:2,vehicle:'test',width:3,height:2,blocked:[],timeLimitSec:180,pieces:[
   {id:1,shape:a,item:'',initialRotation:0},{id:2,shape:b,item:'',initialRotation:0}
  ]};
  const expected=enumerate(level);
  const result=solve(level,{maxSolutions:1000,maxNodes:100000});
  expect(result.nodeLimitReached,`${a},${b}`).toBe(false);
  expect(result.solutionCount,`${a},${b}`).toBe(expected);
 }
});

it('counts mixed repeated shapes with a blocked cell without label permutations', () => {
 const shapes: ShapeId[] = ['I2','O4','I2'];
 for (const blocked of [[[0,0]],[[1,1]],[[2,1]]] as const) {
  const level: Level = {
   date:'2027-01-01', stage:2, vehicle:'test', width:3, height:3, blocked:[...blocked], timeLimitSec:180,
   pieces:shapes.map((shape,index) => ({id:index+1,shape,item:'',initialRotation:0})),
  };
  const result = solve(level,{maxSolutions:1000,maxNodes:100000});
  expect(result.nodeLimitReached).toBe(false);
  expect(result.solutionCount).toBe(enumerate(level));
  if (result.firstSolution) expect(validateSolution(level,result.firstSolution)).toEqual({ok:true});
 }
});
