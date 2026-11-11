import { expect, test } from 'vitest';
import { countdownFrame } from '../client/assets/scripts/game/CountdownFeedback';

test('only the final ten seconds warn, bounce and tick once per second',() => {
  for (const seconds of [11,12,60]) expect(countdownFrame(seconds,seconds+1)).toMatchObject({warning:false,tick:false,bounce:false});
  for (let seconds=10;seconds>=1;seconds--) {
    expect(countdownFrame(seconds,seconds+1)).toMatchObject({warning:true,tick:true,bounce:true});
  }
  expect(countdownFrame(0,1)).toMatchObject({warning:true,tick:false,bounce:false,label:'距出发 0 秒'});
  expect(countdownFrame(10,10)).toMatchObject({tick:false,bounce:false});
  expect(countdownFrame(Infinity,Infinity)).toMatchObject({warning:false,tick:false,label:'慢慢装，不限时'});
});
