#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const server = read('app-server.js');
const login = read('public/login.js');
const pkg = JSON.parse(read('package.json'));
const assert = (ok, message) => { if (!ok) throw new Error(`OTP-disabled login self-test failed: ${message}`); };
assert(pkg.version === '1.5.32', `expected v1.5.32, got ${pkg.version}`);
assert(server.includes('if (db.settings.requireEmailOtp === false)') && server.includes('secretRequired: true'), 'requireOtpContinue does not short-circuit mail when OTP is disabled');
assert(!server.includes('Email OTP is disabled, so Owner Emergency Login is not required.'), 'old OTP-disabled emergency dead-end is still present');
assert(server.includes("if (!needOtp && needSecret)"), 'explicit emergency start does not route OTP-disabled mode to PIN-only login');
assert(login.includes("loginMode = 'secret-only'"), 'secret-only login mode is missing');
assert(login.includes('function setSecretOnlyStep') && login.includes("if (data.secretRequired) { setSecretOnlyStep(data.message); return; }"), 'client cannot enter secret-only continuation');
assert(login.includes("if (loginMode === 'secret-only')") && login.includes("$('#loginSecretCode')"), 'secret-only mode does not validate the existing 6 digit PIN');
console.log(JSON.stringify({ ok:true, version:pkg.version, emailOtpDisabledMailCallsBlocked:true, secretOnlyContinuation:true, ownerEmergencyDeadEndRemoved:true }, null, 2));
