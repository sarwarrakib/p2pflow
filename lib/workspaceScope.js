'use strict';

// v1.8.0 prepares the legacy single-workspace database for a future SaaS
// migration without changing current authorization semantics. The current app
// still operates one workspace; records receive workspaceId=1 so a later
// multi-tenant migration has an explicit ownership key instead of guessing.

const DEFAULT_WORKSPACE_ID = 1;
const DEFAULT_WORKSPACE_SLUG = 'primary';
const preparedLengths = new WeakMap();

const SCOPED_COLLECTIONS = [
  'userRoles', 'users', 'apiCredentials', 'agents', 'paymentMethods',
  'paymentAccounts', 'routing', 'orders', 'orderAgentAssignments',
  'paymentSplits', 'ledgers', 'proofFiles', 'auditLogs', 'locks',
  'notifications', 'offlineTransactions', 'chats', 'chatReadStates',
  'coAgentRequests', 'approvalRequests', 'advertisements', 'ownerP2pProfiles',
  'securityRevertTokens', 'sessions', 'p2pExtensionTasks', 'p2pExtensionCache',
  'userActivitySessions', 'businessEntries', 'businessDailyCloses',
  'binanceBalanceSnapshots', 'chatMedia'
];

function nowIso() { return new Date().toISOString(); }

function ensureWorkspaceRoot(target, force = false) {
  if (!target || typeof target !== 'object') return target;
  target.meta = target.meta || {};
  const createdAt = target.meta.createdAt || nowIso();
  if (!Array.isArray(target.workspaces)) target.workspaces = [];
  let primary = target.workspaces.find(row => Number(row && row.id) === DEFAULT_WORKSPACE_ID);
  if (!primary) {
    primary = {
      id: DEFAULT_WORKSPACE_ID,
      slug: DEFAULT_WORKSPACE_SLUG,
      name: 'Primary Workspace',
      status: 'active',
      createdAt,
      updatedAt: nowIso()
    };
    target.workspaces.unshift(primary);
  }
  target.meta.defaultWorkspaceId = DEFAULT_WORKSPACE_ID;
  target.meta.workspaceModelVersion = 1;
  if (!target.meta.workspaceScopePreparedAt || force) target.meta.workspaceScopePreparedAt = nowIso();
  return target;
}

function prepareWorkspaceScope(target, options = {}) {
  if (!target || typeof target !== 'object') return { touched: 0, workspaceId: DEFAULT_WORKSPACE_ID };
  const force = options.force === true;
  ensureWorkspaceRoot(target, force);
  let lengths = preparedLengths.get(target);
  if (!lengths || force) {
    lengths = new Map();
    preparedLengths.set(target, lengths);
  }
  let touched = 0;
  for (const key of SCOPED_COLLECTIONS) {
    const rows = Array.isArray(target[key]) ? target[key] : [];
    const previous = force ? 0 : Number(lengths.get(key) || 0);
    const start = previous <= rows.length ? previous : 0;
    for (let index = start; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row || typeof row !== 'object') continue;
      if (!Number(row.workspaceId || 0)) {
        row.workspaceId = DEFAULT_WORKSPACE_ID;
        touched += 1;
      }
    }
    lengths.set(key, rows.length);
  }
  return { touched, workspaceId: DEFAULT_WORKSPACE_ID };
}

function defaultWorkspaceId() { return DEFAULT_WORKSPACE_ID; }

module.exports = {
  DEFAULT_WORKSPACE_ID,
  SCOPED_COLLECTIONS,
  ensureWorkspaceRoot,
  prepareWorkspaceScope,
  defaultWorkspaceId
};
