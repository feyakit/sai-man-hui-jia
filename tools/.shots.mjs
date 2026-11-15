import { chromium } from 'playwright';
const [base,out,...specs]=process.argv.slice(2);
const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for (const spec of specs){ const [w,h,stage]=spec.split('x');
 const c=await b.newContext({viewport:{width:+w,height:+h},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const p=await c.newPage(); await p.goto(`${base}?mode=stack&stage=${stage}&api=off`);
 await p.waitForFunction(()=>window.__stack?.getState().clickable?.length>0,undefined,{timeout:60000}); await p.waitForTimeout(3500);
 await p.screenshot({path:`${out}/${w}x${h}-level${stage}.png`}); await c.close(); }
await b.close();
