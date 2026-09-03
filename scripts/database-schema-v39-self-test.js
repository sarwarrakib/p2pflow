'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
for (const file of ['database/schema-v39-mysql.sql','database/schema-v39-postgres.sql']) {
  const sql = fs.readFileSync(path.join(root, file), 'utf8');
  for (const table of ['workspaces_v39','orders_v39','ads_v39','payment_accounts_v39','chats_v39','ledger_v39']) assert(sql.includes(table), `${file}: missing ${table}`);
  for (const index of ['orders_status_v39','orders_agent_v39','chat_order_v39','ledger_account_v39']) assert(sql.includes(index), `${file}: missing ${index}`);
}
console.log(JSON.stringify({ ok:true, schema:39, normalizedTargets:6, mysql:true, postgres:true }));
