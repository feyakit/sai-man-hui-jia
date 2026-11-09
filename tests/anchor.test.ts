import {it, expect} from 'vitest';
import {SHAPES,orientations} from '../client/assets/scripts/core/shapes';
import type {ShapeId} from '../client/assets/scripts/core/types';
it('same anchor orientations do not overlap',()=>{
 for(const shape of Object.keys(SHAPES) as ShapeId[]) {
  const variants=orientations(shape);
  for(let i=0;i<variants.length;i++) for(let j=i+1;j<variants.length;j++) {
   const cells=new Set(variants[i].cells.map(c=>c.join(',')));
   expect(variants[j].cells.some(c=>cells.has(c.join(','))),shape).toBe(true);
  }
 }
});
