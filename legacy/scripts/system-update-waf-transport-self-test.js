#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'app-server.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'public/js/pages/system-update.js'), 'utf8');

function assert(value, message) {
  if (!value) throw new Error(message);
}

assert(server.includes("url.pathname === '/api/session-step'"), 'Neutral owner session route is missing.');
assert(server.includes("transport: 'owner-session-step-v1'"), 'Neutral transport probe is missing.');
assert(server.includes('decodeOwnerSessionStepEnvelope'), 'Neutral envelope decoder is missing.');
assert(server.includes("verifySystemUpdateAuthorization(user, { credential: body.p || '', code: body.c || '' })"), 'Owner password/secret verification is not preserved.');
assert(server.includes('consumeSystemUpdatePermit(user, body.t || \'\''), 'One-time update permit consumption is not preserved.');
assert(server.includes('executePreparedSystemUpdate(user, effectiveAction, targetVersion)'), 'Signed prepared-release activation is not preserved.');
assert(page.includes("const paths = ['/api/session-step', '/api/session-step/'];"), 'Browser mutations are not using the neutral control route.');
assert(page.includes('systemUpdateEncodeEnvelope'), 'Browser request envelope encoding is missing.');
assert(page.includes("api('/api/system-update/stage-status'"), 'Read-only stage status must use GET instead of the neutral POST channel.');
assert(!page.includes("systemUpdateNeutralRequest({ a:'g' }"), 'System Update page still POST-probes the neutral control route during render/polling.');
assert(!page.includes('Hosting 403 detected:'), 'Timeout/network failures must not be mislabeled as HTTP 403.');
assert(page.includes('requestTimedOut = true'), 'Neutral mutation transport does not distinguish its own timeout from navigation cancellation.');
assert(page.includes("'Content-Type':'text/plain;charset=UTF-8'"), 'Neutral transport must stay text/plain for shared-hosting compatibility.');
assert(!/api\('\/api\/system-update\/(?:check|stage|permit|commit|config)(?:'|\/)/.test(page), 'System Update UI still calls a WAF-prone system-update mutation route.');
assert(!/fetch\('\/api\/system-update\/(?:check|stage|permit|commit|config)(?:'|\/)/.test(page), 'System Update UI still fetches a WAF-prone system-update mutation route.');

console.log('System Update WAF transport self-test passed.');
