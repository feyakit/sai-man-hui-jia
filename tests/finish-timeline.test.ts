import { expect, test } from 'vitest';
import { createConfettiPool, FINISH_CUES, FinishPlayback, finishButtons, finishTimeline, MAX_CONFETTI, updateConfetti } from '../client/assets/scripts/game/FinishTimeline';

test('4.9 boundaries: drop, lid, weighted suspension, two tail light flashes, celebration and delayed buttons',() => {
  for (const t of [0,299]) expect(finishTimeline(t)).toMatchObject({lidVisible:false,bodySink:0,celebration:false,buttons:false});
  expect(finishTimeline(300)).toMatchObject({lidVisible:true,lidProgress:0});
  expect(finishTimeline(500).lidProgress).toBe(.5);
  expect(finishTimeline(700)).toMatchObject({lidProgress:1,bodySink:0});
  expect(finishTimeline(850).bodySink).toBe(12);
  expect(finishTimeline(1000).bodySink).toBe(6);
  for (const t of [1000,1149,1300,1449]) expect(finishTimeline(t).tailLights).toBe(true);
  for (const t of [999,1150,1299,1450,1600]) expect(finishTimeline(t).tailLights).toBe(false);
  expect(finishTimeline(1199).celebration).toBe(false);
  expect(finishTimeline(1200)).toMatchObject({celebration:true,particleCount:120});
  expect(finishTimeline(2499).buttons).toBe(false);
  expect(finishTimeline(2500)).toMatchObject({buttons:true,particleCount:0});
  expect(finishTimeline(Infinity)).toEqual(finishTimeline(2500));
  expect(finishTimeline(-5)).toEqual(finishTimeline(0));
});
test('cues cross once even with low frame rate, and skip never replays sounds or vibration',() => {
  const cues: unknown[]=[]; const play=new FinishPlayback(cue => cues.push(cue));
  play.advance(699); expect(cues).toEqual([]);
  play.advance(700); expect(cues).toEqual([FINISH_CUES[0]]);
  play.advance(1400); play.advance(1400); play.advance(3000);
  expect(cues).toEqual(FINISH_CUES);
  for (const t of [0,350,900,1250,2499]) {
    const emitted: unknown[]=[]; const p=new FinishPlayback(cue => emitted.push(cue));
    p.advance(t); const before=emitted.length;
    expect(p.skip()).toEqual(finishTimeline(2500));
    p.advance(2600); expect(emitted).toHaveLength(before);
  }
});
test('pool remains bounded, reuses identities, and recycles every particle at end/skip',() => {
  const pool=createConfettiPool(), identities=[...pool];
  for (let t=0;t<=2600;t+=10) {
    updateConfetti(pool,t,750,1334);
    expect(pool.filter(p => p.active)).toHaveLength(finishTimeline(t).particleCount);
    expect(pool.length).toBe(MAX_CONFETTI);
  }
  expect(pool).toEqual(identities);
  updateConfetti(pool,1500,750,1334); updateConfetti(pool,new FinishPlayback(() => {}).skip().time,750,1334);
  expect(pool.every(p => !p.active && p.x === 0 && p.y === 0)).toBe(true);
});
test('stage buttons keep mom as an explicit interface',() => {
  expect(finishButtons(1)).toEqual([{title:'下一关',action:'next'}]);
  expect(finishButtons(2)).toEqual([{title:'再来一次',action:'replay'},{title:'试试妈妈模式',action:'mom'}]);
});
