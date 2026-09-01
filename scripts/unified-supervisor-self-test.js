#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
for (const file of ['server.js','app-server.js','lib/releaseIntegrity.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root,file)], { encoding:'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${file} syntax check failed`);
}
const supervisor = fs.readFileSync(path.join(root,'server.js'),'utf8');
const app = fs.readFileSync(path.join(root,'app-server.js'),'utf8');
if (supervisor.includes('new Worker(')) throw new Error('Unified shared-hosting supervisor must not use Worker HTTP servers.');
if (supervisor.includes('.fork(') || supervisor.includes('fork(serverPath')) throw new Error('Unified shared-hosting supervisor must not fork an application HTTP server.');
for (const marker of [
  "global.__P2PFLOW_SUPERVISOR__",
  "require(appPath)",
  "message.type === 'apply-release'",
  "type:'shutdown-for-switch'",
  'ensureRootSnapshot()',
  'switchPointer(target)',
  "status:'recovering'"
]) {
  if (!supervisor.includes(marker)) throw new Error(`Main-thread supervisor marker missing: ${marker}`);
}
for (const marker of ['INLINE_SUPERVISOR', "requestLauncherSwitch(release, mode = 'update')", 'targetDir: release.directory, mode']) {
  if (!app.includes(marker)) throw new Error(`Application supervisor bridge marker missing: ${marker}`);
}
console.log(JSON.stringify({
  ok:true,
  supervisor:'main-thread-restart',
  workerHttpServer:false,
  childProcessProxy:false,
  managedReleaseSwitch:true,
  automaticRollbackPointer:true
}, null, 2));
