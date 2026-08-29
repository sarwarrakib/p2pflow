'use strict';

function normalizeDatabaseProvider(value, connectionString = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (['mysql', 'mariadb', 'mysql-compatible', 'mysql_compatible'].includes(raw)) return 'mysql';
  if (['postgres', 'postgresql', 'pg'].includes(raw)) return 'postgres';
  const url = String(connectionString || '').trim().toLowerCase();
  if (url.startsWith('mysql://') || url.startsWith('mariadb://')) return 'mysql';
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgres';
  return 'mysql';
}

function databaseProviderLabel(provider) {
  return normalizeDatabaseProvider(provider) === 'postgres' ? 'PostgreSQL' : 'MariaDB / MySQL';
}

function createStateStore(options = {}) {
  const provider = normalizeDatabaseProvider(options.provider, options.connectionString);
  if (provider === 'postgres') {
    const { PostgresStateStore } = require('./postgresStateStore');
    return new PostgresStateStore({ ...options, provider });
  }
  const { MySqlStateStore } = require('./mysqlStateStore');
  return new MySqlStateStore({ ...options, provider });
}

module.exports = { normalizeDatabaseProvider, databaseProviderLabel, createStateStore };
