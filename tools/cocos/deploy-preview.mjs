// Netlify's file-digest API deploys static builds without a CLI dependency.
import { createHash } from 'node:crypto';
import { readdir, readFile, appendFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
const root = resolve('client/build/web-mobile');
const files = new Map();
async function walk(directory) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    const path = join(directory,entry.name);
    if (entry.isDirectory()) await walk(path);
    else {
      const bytes = await readFile(path);
      files.set('/'+relative(root,path).split(sep).join('/'),{bytes,sha:createHash('sha1').update(bytes).digest('hex')});
    }
  }
}
const endpoint = 'https://api.netlify.com/api/v1';
async function request(path,options = {}) {
  const response = await fetch(endpoint+path,{...options,headers:{Authorization:`Bearer ${process.env.NETLIFY_AUTH_TOKEN}`,...options.headers},signal:AbortSignal.timeout(120000)});
  if (!response.ok) throw new Error(`Netlify ${response.status} at ${path}`);
  return response.json();
}
await walk(root);
const deploy = await request(`/sites/${encodeURIComponent(process.env.NETLIFY_SITE_ID)}/deploys`,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({draft:true,files:Object.fromEntries([...files].map(([path,file]) => [path,file.sha]))}),
});
for (const sha of deploy.required ?? []) {
  const [path,file] = [...files].find(([,file]) => file.sha === sha);
  await request(`/deploys/${deploy.id}/files${path.split('/').map(encodeURIComponent).join('/')}`,{
    method:'PUT',headers:{'content-type':'application/octet-stream'},body:file.bytes,
  });
}
let result;
for (let attempt=0; attempt<60; attempt++) {
  result = await request(`/deploys/${deploy.id}`);
  if (result.state === 'ready') break;
  if (result.state === 'error') throw new Error('Netlify deploy failed');
  await new Promise(done => setTimeout(done,2000));
}
if (result.state !== 'ready') throw new Error('Netlify deploy readiness timed out');
const url = new URL(result.deploy_ssl_url);
if (url.protocol !== 'https:') throw new Error('Expected HTTPS preview URL');
await appendFile(process.env.GITHUB_STEP_SUMMARY,`Preview: [Open playtest](${url.href})\n`);
