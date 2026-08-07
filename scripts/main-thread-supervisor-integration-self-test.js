#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { computeReleaseTreeSha256 } = require('../lib/releaseIntegrity');

const sourceRoot = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2pflow-main-supervisor-'));
const testRoot = path.join(temp, 'app');
fs.mkdirSync(testRoot, { recursive:true });
fs.mkdirSync(path.join(testRoot, 'lib'), { recursive:true });
fs.mkdirSync(path.join(testRoot, 'public'), { recursive:true });
fs.copyFileSync(path.join(sourceRoot, 'server.js'), path.join(testRoot, 'server.js'));
fs.copyFileSync(path.join(sourceRoot, 'lib', 'releaseIntegrity.js'), path.join(testRoot, 'lib', 'releaseIntegrity.js'));

const fakeApp = `'use strict';\nconst http=require('http');\nconst path=require('path');\nconst pkg=require('./package.json');\nconst sup=global.__P2PFLOW_SUPERVISOR__;\nif(!sup) throw new Error('inline supervisor missing');\nconst fail=Boolean(pkg.failStartup);\nlet server=null;\nsup.register(message=>{\n  if(message&&message.type==='launcher-ack'&&global.__pendingResponse){const res=global.__pendingResponse;global.__pendingResponse=null;res.writeHead(message.accepted?202:500,{'Content-Type':'application/json'});res.end(JSON.stringify(message));}\n  if(message&&message.type==='shutdown-for-switch'&&server){server.close(()=>process.exit(0));}\n});\nif(fail){sup.send({type:'app-startup-failed',code:'TEST_FAIL',message:'test startup failure',detail:'forced integration failure',version:pkg.version});setTimeout(()=>process.exit(1),80);}\nelse {\n  server=http.createServer((req,res)=>{\n    const u=new URL(req.url,'http://localhost');\n    if(u.pathname==='/ready'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,version:pkg.version}));}\n    if(u.pathname==='/switch'){global.__pendingResponse=res;sup.send({type:'apply-release',requestId:'req-'+Date.now(),version:u.searchParams.get('version'),targetDir:u.searchParams.get('dir'),mode:u.searchParams.get('mode')||'update'});return;}\n    res.writeHead(200,{'Content-Type':'text/plain'});res.end(pkg.version);\n  });\n  server.listen(Number(process.env.PORT),()=>sup.send({type:'app-ready',version:pkg.version,schemaVersion:26}));\n}\n`;

function writePackage(dir, version, failStartup = false) {
  fs.mkdirSync(dir, { recursive:true });
  fs.mkdirSync(path.join(dir, 'lib'), { recursive:true });
  fs.mkdirSync(path.join(dir, 'public'), { recursive:true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name:'p2pflow-test', version, failStartup }, null, 2));
  fs.writeFileSync(path.join(dir, 'app-server.js'), fakeApp);
  fs.copyFileSync(path.join(sourceRoot, 'server.js'), path.join(dir, 'server.js'));
  fs.copyFileSync(path.join(sourceRoot, 'lib', 'releaseIntegrity.js'), path.join(dir, 'lib', 'releaseIntegrity.js'));
  fs.writeFileSync(path.join(dir, 'public', 'index.html'), version);
}
function writeManifest(dir, version) {
  const tree = computeReleaseTreeSha256(dir);
  fs.writeFileSync(path.join(dir, 'release-manifest.json'), JSON.stringify({
    format:2, product:'p2pflow', dataCompatibilityEpoch:1, version, tag:`v${version}`,
    node:'>=20.0.0', schema:{ min:26, max:2147483647 }, localInstall:true,
    treeSha256:tree.sha256, treeFiles:tree.fileCount, treeBytes:tree.totalBytes,
    installedAt:new Date().toISOString(), source:'integration-test'
  }, null, 2));
}
function freePort() {
  return new Promise((resolve, reject) => {
    const s=net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p=s.address().port; s.close(()=>resolve(p)); });
  });
}
function start(port) {
  const child=spawn(process.execPath, ['server.js'], { cwd:testRoot, env:{...process.env, PORT:String(port)}, stdio:['ignore','pipe','pipe'] });
  let log=''; child.stdout.on('data',d=>{log+=d}); child.stderr.on('data',d=>{log+=d}); child.testLog=()=>log; return child;
}
async function waitReady(port, version, timeout=10000) {
  const end=Date.now()+timeout;
  let last='';
  while(Date.now()<end){
    try { const r=await fetch(`http://127.0.0.1:${port}/ready`,{cache:'no-store'}); const j=await r.json(); if(r.ok&&j.version===version)return j; last=JSON.stringify(j); } catch(e){ last=e.message; }
    await new Promise(r=>setTimeout(r,120));
  }
  throw new Error(`ready timeout for ${version}: ${last}`);
}
function waitExit(child, timeout=10000) {
  return new Promise((resolve,reject)=>{ let done=false; const timer=setTimeout(()=>{if(done)return;done=true;reject(new Error('process exit timeout\n'+child.testLog()));},timeout); child.once('exit',(code,signal)=>{if(done)return;done=true;clearTimeout(timer);resolve({code,signal});}); });
}

(async()=>{
  try {
    writePackage(testRoot, '1.3.1', false);
    const releases=path.join(testRoot,'releases');
    const r140=path.join(releases,'1.4.0'); writePackage(r140,'1.4.0',false); writeManifest(r140,'1.4.0');
    const r150=path.join(releases,'1.5.0'); writePackage(r150,'1.5.0',true); writeManifest(r150,'1.5.0');
    const port=await freePort();

    let child=start(port); await waitReady(port,'1.3.1');
    let response=await fetch(`http://127.0.0.1:${port}/switch?version=1.4.0&dir=${encodeURIComponent(r140)}`);
    if(response.status!==202) throw new Error(`1.4 switch was not accepted: ${response.status} ${await response.text()}`);
    await waitExit(child);

    child=start(port); await waitReady(port,'1.4.0');
    const pointer140=JSON.parse(fs.readFileSync(path.join(testRoot,'shared','current-release.json'),'utf8'));
    if(pointer140.version!=='1.4.0') throw new Error('pointer did not activate 1.4.0');

    response=await fetch(`http://127.0.0.1:${port}/switch?version=1.5.0&dir=${encodeURIComponent(r150)}`);
    if(response.status!==202) throw new Error(`1.5 switch was not accepted: ${response.status} ${await response.text()}`);
    await waitExit(child);

    child=start(port); await waitExit(child);
    const pointerRecovered=JSON.parse(fs.readFileSync(path.join(testRoot,'shared','current-release.json'),'utf8'));
    if(pointerRecovered.version!=='1.4.0') throw new Error(`failed release did not restore previous pointer: ${pointerRecovered.version}`);

    child=start(port); await waitReady(port,'1.4.0');
    child.kill('SIGTERM'); await waitExit(child).catch(()=>{});
    if(fs.existsSync(path.join(testRoot,'shared','pending-activation.json'))) throw new Error('pending activation was not cleared after rollback recovery');

    console.log(JSON.stringify({ok:true,mainThreadStart:true,releaseRestartSwitch:true,failedReleasePointerRollback:true,finalVersion:'1.4.0'},null,2));
  } finally {
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error.stack||error.message);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}process.exit(1);});
