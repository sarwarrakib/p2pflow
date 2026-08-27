#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'public/js/pages/system-update.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'app-server.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
function assert(value, message) { if (!value) throw new Error(`v${pkg.version} system-update transport self-test failed: ${message}`); }

assert(pkg.version === '1.7.9', 'package version mismatch');
assert(server.includes("if (req.method === 'GET' && action === 'stage-status')"), 'GET stage-status server endpoint missing');
assert(page.includes("api('/api/system-update/stage-status'"), 'stage polling is not GET based');
assert(!page.includes("systemUpdateNeutralRequest({ a:'g' }"), 'render/status flow still POST probes /api/session-step');
assert(!page.includes('Hosting 403 detected:'), 'generic transport errors are still labeled as 403');
assert(page.includes('requestTimedOut = true'), 'neutral POST own-timeout tracking missing');
assert(page.includes('lastError.timeout = true'), 'neutral POST timeout is not typed');
assert(page.includes("const automaticInstallReady = Boolean(config.automaticInstallReady || config.ready);"), 'install readiness still depends on a render-time POST probe');
assert(page.includes("const paths = ['/api/session-step', '/api/session-step/'];"), 'neutral mutation transport was removed');
assert(page.includes("'Content-Type':'text/plain;charset=UTF-8'"), 'neutral mutation body lost shared-hosting-safe content type');
console.log(JSON.stringify({ ok:true, version:pkg.version, renderPostProbe:false, stageStatusTransport:'GET', false403LabelRemoved:true, neutralMutationTransportPreserved:true }));
