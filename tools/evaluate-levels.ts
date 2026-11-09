import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { SHAPES } from '../client/assets/scripts/core/shapes';
import { VEHICLES } from '../client/assets/scripts/core/vehicles';
import { generateDaily, integer, run } from './level-data';

run(async () => {
  const {values} = parseArgs({options:{vehicle:{type:'string'},samples:{type:'string'}}});
  const vehicle = VEHICLES.find(({id}) => id === values.vehicle);
  if (!vehicle) throw new Error(`--vehicle must be one of ${VEHICLES.map(({id}) => id).join(', ')}`);
  const samples = integer(values.samples,'--samples');
  process.stdout.write('sample,vehicle,pieces,size2,size3,size4,size5,size6,solutions,nodesToFirst,totalNodes,milliseconds\n');
  for (let index=1; index<=samples; index++) {
    const start = performance.now();
    const {level,stats} = generateDaily('2027-01-01',`evaluate:${vehicle.id}:${index}`,vehicle);
    const sizes = [2,3,4,5,6].map(size => level.pieces.filter(piece => SHAPES[piece.shape].length === size).length);
    const row = [index,vehicle.id,level.pieces.length,...sizes,stats.solutionCount,stats.nodesToFirst,stats.totalNodes,(performance.now()-start).toFixed(2)];
    process.stdout.write(row.join(',')+'\n');
  }
});
