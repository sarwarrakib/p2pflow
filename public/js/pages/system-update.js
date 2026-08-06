// Owner-only signed release management. First-run setup is never used for software updates.

function systemUpdateSecurityRows(config = {}) {
  const rows = [
    ['Private GitHub repository', config.repositoryConfigured],
    ['Repository read token', config.tokenConfigured],
    ['Signed release verification', !config.signatureRequired || config.publicKeyConfigured]
  ];
  return rows.map(([label, ok]) => `<div class="summary-row"><span>${escapeHtml(label)}</span>${badge(ok ? 'Ready' : 'Required', ok ? 'ok' : 'warn')}</div>`).join('');
}

function systemUpdateEngineRow(config = {}) {
  const ready = Boolean(config.automaticInstallReady);
  return `<div class="summary-row"><span>Automatic update engine</span>${badge(ready ? 'Ready' : 'One-time migration', ready ? 'ok' : 'warn')}</div>`;
}

function systemUpdateDate(value) {
  if (!value) return '-';
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
}

function systemUpdateRestartWait(version) {
  $('#content').innerHTML = `<div class="card"><div class="update-restart-state"><div class="spinner"></div><h3>Restarting P2PFlow</h3><p>Version ${escapeHtml(version || '')} is being activated. Database data and transactions are not rolled back.</p><small id="updateRestartMessage">Waiting for the service...</small></div></div>`;
  let attempts = 0;
  const poll = async () => {
    attempts += 1;
    try {
      const response = await fetch('/ready', { cache:'no-store', credentials:'include' });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        $('#updateRestartMessage').textContent = `Version ${data.version || version} is online. Reloading...`;
        setTimeout(() => window.location.reload(), 700);
        return;
      }
    } catch {}
    if (attempts > 90) {
      $('#updateRestartMessage').textContent = 'Restart is taking longer than expected. Check the hosting application log, then reload this page.';
      return;
    }
    setTimeout(poll, 2000);
  };
  setTimeout(poll, 1500);
}

function ownerAuthorizationModal(title, buttonText, callback, notice = '') {
  const secretRequired = state.bootstrap?.settings?.requireLoginSecretCode !== false;
  modal(title, `<form id="ownerUpdateAuthForm" class="form-grid">
    ${notice ? `<div class="full-row notice">${notice}</div>` : ''}
    <div><label>Owner Password</label><input name="password" type="password" required autocomplete="current-password" /></div>
    ${secretRequired ? '<div><label>6 Digit Owner Secret</label><input name="secretCode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" /></div>' : ''}
    <div class="full-row actions"><button type="submit" class="success">${escapeHtml(buttonText)}</button><button type="button" class="secondary close-owner-update-modal">Cancel</button></div>
  </form>`);
  $('.close-owner-update-modal').onclick = closeModal;
  $('#ownerUpdateAuthForm').onsubmit = async event => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Please wait...';
    try {
      await callback({ password: form.password.value, secretCode: form.secretCode?.value || '' });
    } catch (error) {
      button.disabled = false;
      button.textContent = buttonText;
    }
  };
}

function openSystemUpdateAuthorization(action, version) {
  const title = action === 'rollback' ? `Roll back code to ${version}` : `Install ${version}`;
  const actionText = action === 'rollback' ? 'Roll Back Code' : 'Install Update';
  ownerAuthorizationModal(title, actionText, async auth => {
    const result = await api(`/api/system-update/${action === 'rollback' ? 'rollback' : 'apply'}`, {
      method:'POST',
      body: JSON.stringify({ version, ...auth })
    });
    closeModal();
    systemUpdateRestartWait(result.version || version);
  }, action === 'rollback'
    ? 'Only application code changes. The current database, orders, transactions and histories remain unchanged.'
    : 'P2PFlow will finish active writes, create a database backup, switch the verified release and restart.');
}

function githubRepositoryValue() { return ($('#githubRepository')?.value || '').trim(); }
function githubTokenValue() { return ($('#githubToken')?.value || '').trim(); }

async function testGithubConnection() {
  const button = $('#testGithubConnectionBtn');
  button.disabled = true; button.textContent = 'Testing...';
  try {
    const result = await api('/api/system-update/config/test', {
      method:'POST',
      body: JSON.stringify({ repository: githubRepositoryValue(), token: githubTokenValue(), requireSignature: true })
    });
    const repo = result.repository || {};
    const privacy = repo.private ? 'Private repository verified.' : 'Warning: this repository is public.';
    const release = result.latestRelease?.version
      ? ` Latest published release: ${result.latestRelease.version}.`
      : ` ${result.releaseMessage || 'Repository connected. No published production release exists yet.'}`;
    $('#githubConnectionResult').className = `notice ${repo.private ? 'okbox' : 'warn'}`;
    $('#githubConnectionResult').textContent = `${privacy}${release}`;
    notify('GitHub connection verified.', repo.private ? 'ok' : 'warn');
  } finally {
    button.disabled = false; button.textContent = 'Test Connection';
  }
}

function saveGithubConnection() {
  const repository = githubRepositoryValue();
  const token = githubTokenValue();
  ownerAuthorizationModal('Save GitHub Connection', 'Save Connection', async auth => {
    await api('/api/system-update/config', {
      method:'POST',
      body: JSON.stringify({ repository, token, requireSignature: true, ...auth })
    });
    closeModal();
    notify('Private GitHub connection saved securely.', 'ok');
    await renderSystemUpdate();
  }, 'The fine-grained read-only token is encrypted inside the application database. It is never placed in source code or shown again.');
}

function generateReleaseSigningKey() {
  ownerAuthorizationModal('Generate Release Signing Key', 'Generate Key', async auth => {
    const result = await api('/api/system-update/config/generate-signing-key', {
      method:'POST', body: JSON.stringify(auth)
    });
    const repository = githubRepositoryValue() || state.systemUpdateRepository || '';
    const secretUrl = repository && repository.includes('/') ? `https://github.com/${repository}/settings/secrets/actions/new` : 'https://github.com/settings/personal-access-tokens';
    modal('Signing Key Created - Copy Once', `<div class="notice warn"><b>Copy this private key now.</b> P2PFlow saved only the public verification key and cannot display this private key again.</div>
      <div class="form-grid">
        <div class="full-row"><label>GitHub Actions Secret Name</label><input value="${escapeAttr(result.githubSecretName || 'UPDATE_SIGNING_PRIVATE_KEY')}" readonly /></div>
        <div class="full-row"><label>Private Signing Key</label><textarea id="generatedSigningPrivateKey" rows="10" readonly>${escapeHtml(result.privateKey || '')}</textarea></div>
        <div class="full-row notice"><b>One GitHub step:</b> Repository - Settings - Secrets and variables - Actions - New repository secret. Use the name above and paste the complete private key.</div>
        <div class="full-row actions"><button id="copySigningPrivateKeyBtn" type="button">Copy Private Key</button><a class="button secondary" href="${escapeAttr(secretUrl)}" target="_blank" rel="noopener">Open GitHub Secret Page</a><button class="secondary close-signing-key-modal" type="button">Done</button></div>
      </div>`);
    $('#copySigningPrivateKeyBtn').onclick = async () => {
      await navigator.clipboard.writeText(result.privateKey || '');
      notify('Private signing key copied.', 'ok');
    };
    $('.close-signing-key-modal').onclick = async () => { closeModal(); await renderSystemUpdate(); };
  }, 'The Ed25519 signing key proves that an update was built by your private GitHub workflow.');
}

async function renderSystemUpdate() {
  setTitle('System Update', 'Owner-only private GitHub connection, signed releases and safe code rollback.');
  const status = await api('/api/system-update');
  const release = status.availableRelease;
  const updateAvailable = Boolean(status.availableVersion && release);
  const config = status.config || {};
  const lastResult = status.lastResult || null;
  const databaseLabel = status.storageProvider === 'postgres' ? 'PostgreSQL' : 'MariaDB / MySQL';
  const connectionReady = Boolean(config.connectionReady || (config.repositoryConfigured && config.tokenConfigured));
  const securityReady = Boolean(config.releaseSecurityReady || (!config.signatureRequired || config.publicKeyConfigured));
  const automaticInstallReady = Boolean(config.automaticInstallReady || config.ready);
  const updateLabel = updateAvailable ? escapeHtml(status.availableVersion) : (status.lastCheckMessage?.includes('No published') ? 'No release yet' : 'Up to date');
  state.systemUpdateRepository = config.repository || '';

  $('#content').innerHTML = `
    <div class="notice okbox"><b>Simple update flow:</b> connect the private repository once, add the signing secret once, then every future version pushed from GitHub Desktop is published automatically. P2PFlow checks and verifies it here.</div>

    <div class="stats-grid update-stats">
      <div class="stat"><span>Current Version</span><b>${escapeHtml(status.currentVersion || '-')}</b><small>Schema ${escapeHtml(status.schemaVersion)} - Data epoch ${escapeHtml(status.dataCompatibilityEpoch || '-')}</small></div>
      <div class="stat"><span>Database</span><b>${escapeHtml(databaseLabel)}</b><small>Revision ${escapeHtml(status.databaseRevision || 0)}</small></div>
      <div class="stat"><span>Release Status</span><b>${updateLabel}</b><small>${status.lastCheckedAt ? `Checked ${escapeHtml(systemUpdateDate(status.lastCheckedAt))}` : 'Not checked yet'}</small></div>
      <div class="stat"><span>Update Engine</span><b>${automaticInstallReady ? 'Automatic' : 'Direct hosting'}</b><small>${automaticInstallReady ? 'Prepare, install and rollback enabled' : 'Connection and release check are enabled'}</small></div>
    </div>

    ${status.lastCheckError ? `<div class="error">${escapeHtml(status.lastCheckError)}</div>` : ''}
    ${status.lastCheckMessage && !status.lastCheckError ? `<div class="notice okbox">${escapeHtml(status.lastCheckMessage)}</div>` : ''}
    ${lastResult ? `<div class="notice ${lastResult.status === 'rolled_back' ? 'warn' : 'okbox'}"><b>Last release result:</b> ${escapeHtml(lastResult.status || '')}${lastResult.version ? ` - ${escapeHtml(lastResult.version)}` : ''}${lastResult.error ? `<br/>${escapeHtml(lastResult.error)}` : ''}</div>` : ''}

    <div class="two-col update-layout">
      <div class="card">
        <div class="section-head"><div><h3>Private GitHub Connection</h3><p>One private repository and one fine-grained read-only token.</p></div>${badge(connectionReady ? 'Connected' : 'Not connected', connectionReady ? 'ok' : 'warn')}</div>
        <div class="form-grid">
          <div class="full-row"><label>Private Repository Link or owner/repository</label><input id="githubRepository" value="${escapeAttr(config.repository || '')}" placeholder="https://github.com/YOUR_USERNAME/p2pflow-private" autocomplete="off" /></div>
          <div class="full-row"><label>Fine-grained Personal Access Token</label><input id="githubToken" type="password" placeholder="${config.tokenConfigured ? 'Saved token - leave blank to keep it' : 'github_pat_...'}" autocomplete="new-password" /></div>
          <div class="full-row notice"><b>Minimum token access:</b> Only select this repository; Repository permissions - Contents: Read-only. The token must start with <code>github_pat_</code>.</div>
          <div id="githubConnectionResult" class="notice hidden"></div>
          <div class="full-row actions"><button id="testGithubConnectionBtn" type="button" class="secondary">Test Connection</button><button id="saveGithubConnectionBtn" type="button">Save Connection</button><a class="button secondary" href="https://github.com/new" target="_blank" rel="noopener">Create Private Repository</a><a class="button secondary" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create Fine-grained Token</a></div>
        </div>
      </div>
      <div class="card">
        <div class="section-head"><div><h3>Release Security</h3><p>Every production package must pass tests, hashes and Ed25519 signature verification.</p></div>${badge(securityReady ? 'Ready' : 'Key required', securityReady ? 'ok' : 'warn')}</div>
        <div class="summary-list">${systemUpdateSecurityRows(config)}${systemUpdateEngineRow(config)}</div>
        <div class="actions mt-sm"><button id="generateSigningKeyBtn" type="button" class="secondary">${config.publicKeyConfigured ? 'Replace Signing Key' : 'Generate Signing Key'}</button></div>
        ${automaticInstallReady
          ? '<div class="notice okbox mt-sm"><b>Automatic update engine is ready.</b> Prepare, Install and Roll Back can safely switch versioned releases.</div>'
          : `<div class="notice warn mt-sm"><b>One-time hosting migration needed for automatic installation.</b> GitHub connection and Check Now work already. Deploy the provided v${escapeHtml(status.currentVersion || '')} Hosting Migration package once; after restart this engine becomes Ready. This is not a GitHub or signing error.</div>`}
      </div>
    </div>

    <div class="card">
      <div class="section-head"><div><h3>${updateAvailable ? `Version ${escapeHtml(status.availableVersion)} available` : 'Release Check'}</h3><p>${release?.publishedAt ? `Published ${escapeHtml(systemUpdateDate(release.publishedAt))}` : 'A repository with no release is a valid first-time state and no longer causes a 404 error.'}</p></div><button id="checkSystemUpdateBtn" class="secondary" ${!connectionReady ? 'disabled' : ''}>Check Now</button></div>
      ${updateAvailable ? `<div class="release-notes"><h4>${escapeHtml(release.name || release.version)}</h4><pre>${escapeHtml(release.body || 'No release notes provided.')}</pre></div>
        <div class="actions"><button id="stageSystemUpdateBtn" ${!config.ready ? 'disabled' : ''}>Prepare Update</button><button id="applySystemUpdateBtn" class="success" ${!(status.installedReleases || []).some(item => item.version === status.availableVersion) || !config.ready ? 'disabled' : ''}>Install Update</button></div>
        ${!automaticInstallReady ? '<div class="notice warn mt-sm">The release can be checked, but automatic Prepare/Install is disabled until the one-time Hosting Migration package is deployed.</div>' : ''}`
        : '<div class="empty">No newer published production release is currently available.</div>'}
    </div>

    <div class="card">
      <div class="section-head"><div><h3>Installed Releases</h3><p>Rollback changes application code only. Current database records and transactions remain in place.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Version</th><th>Compatibility</th><th>Installed</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${(status.installedReleases || []).map(item => `<tr><td><b>${escapeHtml(item.version)}</b></td><td>Schema ${escapeHtml(item.schema?.min ?? '-')} - ${escapeHtml(item.schema?.max ?? '-')}<br/><small>Data epoch ${escapeHtml(item.dataCompatibilityEpoch || '-')}</small></td><td>${escapeHtml(systemUpdateDate(item.installedAt))}</td><td>${item.current ? badge('Current','ok') : badge('Available','muted')}</td><td>${item.current ? '-' : (compareVersionText(item.version, status.currentVersion) < 0 ? `<button class="danger small" data-rollback-version="${escapeAttr(item.version)}" ${!config.ready ? 'disabled' : ''}>Roll Back</button>` : `<button class="success small" data-install-version="${escapeAttr(item.version)}" ${!config.ready ? 'disabled' : ''}>Install</button>`)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No managed release is available.</td></tr>'}
      </tbody></table></div>
    </div>

    <div class="card">
      <div class="section-head"><div><h3>Database Backups</h3><p>A database backup is created before every code switch. Code rollback does not delete later transactions.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Label</th><th>Source Revision</th><th>Application</th><th>Created</th></tr></thead><tbody>
        ${(status.backups || []).map(item => `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.source_revision)}</td><td>${escapeHtml(item.app_version || '-')}</td><td>${escapeHtml(systemUpdateDate(item.created_at))}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No update backup has been created yet.</td></tr>'}
      </tbody></table></div>
    </div>`;

  $('#testGithubConnectionBtn').onclick = testGithubConnection;
  $('#saveGithubConnectionBtn').onclick = saveGithubConnection;
  $('#generateSigningKeyBtn').onclick = generateReleaseSigningKey;
  $('#checkSystemUpdateBtn').onclick = async () => {
    const button = $('#checkSystemUpdateBtn'); button.disabled = true; button.textContent = 'Checking...';
    try {
      const result = await api('/api/system-update/check', { method:'POST', body:'{}' });
      notify(result.release?.version ? 'Release check completed.' : 'GitHub connected; no published release yet.', 'ok');
      await renderSystemUpdate();
    } catch {
      button.disabled = false; button.textContent = 'Check Now';
    }
  };
  if ($('#stageSystemUpdateBtn')) $('#stageSystemUpdateBtn').onclick = async () => {
    const button = $('#stageSystemUpdateBtn'); button.disabled = true; button.textContent = 'Verifying...';
    try {
      const result = await api('/api/system-update/stage', { method:'POST', body:'{}' });
      notify(result.reason === 'no_release' ? 'No published release exists yet.' : 'Verified release prepared.', result.reason === 'no_release' ? 'warn' : 'ok');
      await renderSystemUpdate();
    } catch {
      button.disabled = false; button.textContent = 'Prepare Update';
    }
  };
  if ($('#applySystemUpdateBtn')) $('#applySystemUpdateBtn').onclick = () => openSystemUpdateAuthorization('apply', status.availableVersion);
  $$('[data-rollback-version]').forEach(button => button.onclick = () => openSystemUpdateAuthorization('rollback', button.dataset.rollbackVersion));
  $$('[data-install-version]').forEach(button => button.onclick = () => openSystemUpdateAuthorization('apply', button.dataset.installVersion));
}

function compareVersionText(a, b) {
  const av = String(a || '').replace(/^v/i,'').split(/[.-]/).slice(0,3).map(Number);
  const bv = String(b || '').replace(/^v/i,'').split(/[.-]/).slice(0,3).map(Number);
  for (let i=0;i<3;i+=1) { const diff=(av[i]||0)-(bv[i]||0); if (diff) return diff; }
  return String(a || '').localeCompare(String(b || ''));
}
