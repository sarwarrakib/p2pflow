#!/usr/bin/env node
'use strict';

const path = require('path');
const { runProductionPreflight } = require('../lib/productionPreflight');

const args = process.argv.slice(2);
function value(name) {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] || '') : '';
}

const installRoot = path.resolve(value('--install-root') || value('--root') || process.env.CRM_INSTALL_ROOT || '/opt/p2pflow');
const envFile = path.resolve(value('--env') || process.env.CRM_ENV_FILE || path.join(installRoot, 'shared', '.env'));
const jsonOnly = args.includes('--json');
const quiet = args.includes('--quiet');
const configOnly = args.includes('--config-only');

(async () => {
  const result = await runProductionPreflight({ envFile, installRoot, configOnly });
  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (!quiet || !result.ok) {
    console.log(`Production preflight: ${result.ok ? 'PASS' : 'FAIL'}`);
    console.log(`Environment: ${result.envFile}`);
    console.log(`Node.js: ${result.info.nodeVersion}`);
    if (result.info.database) {
      console.log(`${result.info.database.providerLabel || result.info.database.provider || 'Database'}: ${result.info.database.reachable ? 'reachable' : 'unreachable'}${result.info.database.name ? ` (${result.info.database.name})` : ''}`);
    }
    if (result.info.storedState) {
      console.log(`Stored application state: ${result.info.storedState.exists ? `present (revision ${result.info.storedState.revision || 0})` : 'empty'}`);
    }
    for (const warning of result.warnings) console.warn(`WARNING [${warning.code}]: ${warning.message}`);
    for (const error of result.errors) console.error(`ERROR [${error.code}]: ${error.message}${error.detail ? `\n  ${error.detail}` : ''}`);
  }
  process.exit(result.ok ? 0 : 1);
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
