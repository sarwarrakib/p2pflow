// P2PFlow System Update - compact owner workflow.
let systemUpdateReleasePollTimer = null;
let systemUpdateReleasePollCount = 0;
let systemUpdateStagePollGeneration = 0;

function systemVersionLabel(value) {
  const text = String(value || '').trim().replace(/^v/i, '');
  const match = text.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!match) return text || '-';
  return Number(match[3]) === 0 && !match[4] ? `${match[1]}.${match[2]}` : `${match[1]}.${match[2]}.${match[3]}${match[4]}`;
}

function systemUpdateDate(value) {
  if (!value) return '-';
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
}

function systemUpdateRestartWait(version) {
  const label = systemVersionLabel(version);
  $('#content').innerHTML = `<div class="card"><div class="update-restart-state"><div class="spinner"></div><h3>Installing version ${escapeHtml(label)}</h3><p>Database backup is complete. P2PFlow is restarting with the verified code.</p><small id="updateRestartMessage">Waiting for the service...</small></div></div>`;
  let attempts = 0;
  const poll = async () => {
    attempts += 1;
    try {
      const response = await fetch('/ready', { cache:'no-store', credentials:'include' });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok) {
        $('#updateRestartMessage').textContent = `Version ${systemVersionLabel(data.version || version)} is online. Reloading...`;
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
  const label = systemVersionLabel(version);
  const title = action === 'rollback' ? `Roll back to ${label}` : `Install ${label}`;
  const actionText = action === 'rollback' ? 'Roll Back Code' : 'Install Update';
  ownerAuthorizationModal(title, actionText, async auth => {
    const result = await api(`/api/system-update/${action === 'rollback' ? 'rollback' : 'apply'}`, {
      method:'POST',
      body: JSON.stringify({ version, ...auth })
    });
    closeModal();
    systemUpdateRestartWait(result.version || version);
  }, action === 'rollback'
    ? 'Only application code changes. Current orders, ledger, accounting and database records remain unchanged.'
    : 'P2PFlow will finish active writes, create a database backup, activate the verified release and restart.');
}

function githubRepositoryValue() { return ($('#githubRepository')?.value || '').trim(); }
function githubTokenValue() { return ($('#githubToken')?.value || '').trim(); }

async function testGithubConnection() {
  const button = $('#testGithubConnectionBtn');
  button.disabled = true;
  button.textContent = 'Testing...';
  try {
    const result = await api('/api/system-update/config/test', {
      method:'POST',
      body: JSON.stringify({ repository: githubRepositoryValue(), token: githubTokenValue(), requireSignature: true })
    });
    const repo = result.repository || {};
    const release = result.latestRelease?.version
      ? `Latest release: ${systemVersionLabel(result.latestRelease.version)}`
      : (result.sourceVersion?.version
        ? `Source ${systemVersionLabel(result.sourceVersion.version)} uploaded; signed Release pending.`
        : (result.releaseMessage || 'Connected. No release published yet.'));
    $('#githubConnectionResult').className = `notice ${repo.private ? 'okbox' : 'warn'}`;
    $('#githubConnectionResult').textContent = `${repo.private ? 'Private repository verified.' : 'Repository is public.'} ${release}`;
  } finally {
    button.disabled = false;
    button.textContent = 'Test';
  }
}

function saveGithubConnection() {
  const repository = githubRepositoryValue();
  const token = githubTokenValue();
  ownerAuthorizationModal('Save GitHub Connection', 'Save', async auth => {
    await api('/api/system-update/config', {
      method:'POST',
      body: JSON.stringify({ repository, token, requireSignature: true, ...auth })
    });
    closeModal();
    notify('GitHub connection saved.', 'ok');
    await renderSystemUpdate();
  }, 'The read-only token is encrypted inside the application database.');
}

function openGithubConnectionSettings(config = {}) {
  modal('GitHub Connection', `<div class="form-grid update-connection-modal">
    <div class="full-row"><label>Private Repository</label><input id="githubRepository" value="${escapeAttr(config.repository || '')}" placeholder="owner/repository" autocomplete="off" /></div>
    <div class="full-row"><label>Read-only Token</label><input id="githubToken" type="password" placeholder="${config.tokenConfigured ? 'Saved - leave blank to keep it' : 'github_pat_...'}" autocomplete="new-password" /></div>
    <div id="githubConnectionResult" class="notice hidden"></div>
    <div class="full-row actions"><button id="testGithubConnectionBtn" type="button" class="secondary">Test</button><button id="saveGithubConnectionBtn" type="button">Save Connection</button><button type="button" class="secondary close-github-modal">Cancel</button></div>
  </div>`);
  $('#testGithubConnectionBtn').onclick = testGithubConnection;
  $('#saveGithubConnectionBtn').onclick = saveGithubConnection;
  $('.close-github-modal').onclick = closeModal;
}

function generateReleaseSigningKey() {
  ownerAuthorizationModal('Generate Signing Key', 'Generate Key', async auth => {
    const result = await api('/api/system-update/config/generate-signing-key', {
      method:'POST', body: JSON.stringify(auth)
    });
    const repository = state.systemUpdateRepository || '';
    const secretUrl = repository && repository.includes('/') ? `https://github.com/${repository}/settings/secrets/actions/new` : 'https://github.com/settings/personal-access-tokens';
    modal('Copy Signing Key Once', `<div class="notice warn"><b>Copy the private key now.</b> P2PFlow stores only the public verification key.</div>
      <div class="form-grid">
        <div class="full-row"><label>GitHub Secret Name</label><input value="${escapeAttr(result.githubSecretName || 'UPDATE_SIGNING_PRIVATE_KEY')}" readonly /></div>
        <div class="full-row"><label>Private Signing Key</label><textarea id="generatedSigningPrivateKey" rows="9" readonly>${escapeHtml(result.privateKey || '')}</textarea></div>
        <div class="full-row actions"><button id="copySigningPrivateKeyBtn" type="button">Copy Key</button><a class="button secondary" href="${escapeAttr(secretUrl)}" target="_blank" rel="noopener">Open GitHub Secret</a><button class="secondary close-signing-key-modal" type="button">Done</button></div>
      </div>`);
    $('#copySigningPrivateKeyBtn').onclick = async () => {
      await navigator.clipboard.writeText(result.privateKey || '');
      notify('Private signing key copied.', 'ok');
    };
    $('.close-signing-key-modal').onclick = async () => { closeModal(); await renderSystemUpdate(); };
  }, 'This key signs every production release created by GitHub Actions.');
}

function systemUpdateDelay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function systemUpdateStageStatusRequest(timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/system-update/stage-status', { credentials:'include', cache:'no-store', signal:controller.signal, headers:{ Accept:'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || data.message || `Stage status failed (${response.status})`);
    return data.job || {};
  } finally {
    clearTimeout(timer);
  }
}

async function waitForSystemUpdateStage(version, options = {}) {
  const generation = ++systemUpdateStagePollGeneration;
  const openAuthorization = options.openAuthorization !== false;
  for (let attempt = 0; attempt < 180 && generation === systemUpdateStagePollGeneration; attempt += 1) {
    let job;
    try { job = await systemUpdateStageStatusRequest(); }
    catch { await systemUpdateDelay(2200); continue; }
    if (job.status === 'failed') {
      notify(job.error || 'Release verification failed. Open System Update for the saved error details.', 'danger', 9000);
      await renderSystemUpdate();
      return;
    }
    if (job.status === 'ready' || job.status === 'done') {
      const result = job.result || {};
      if (!result.staged && result.reason === 'no_release') {
        notify('No published release exists yet.', 'warn');
        await renderSystemUpdate();
        return;
      }
      if (!result.staged && result.reason === 'already_current') {
        notify('P2PFlow is already up to date.', 'ok');
        await renderSystemUpdate();
        return;
      }
      if (result.staged) {
        if (openAuthorization) openSystemUpdateAuthorization('apply', version || job.version || result.release?.version);
        else await renderSystemUpdate();
        return;
      }
    }
    await systemUpdateDelay(2200);
  }
  if (generation === systemUpdateStagePollGeneration) {
    notify('Release verification is still running in the background. You can leave this page and return later.', 'warn', 8000);
    await renderSystemUpdate();
  }
}

async function installAvailableUpdate(version) {
  const button = $('#installSystemUpdateBtn');
  if (button) { button.disabled = true; button.textContent = 'Verifying...'; }
  try {
    const result = await api('/api/system-update/stage', { method:'POST', body:'{}' });
    const job = result.job || {};
    if (job.status === 'failed') throw new Error(job.error || 'Release verification failed.');
    await waitForSystemUpdateStage(version || job.version, { openAuthorization:true });
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = 'Update Now'; }
  }
}

function updateStatusPill(label, ok, waitingLabel = 'Required') {
  return `<div class="update-mini-status"><span>${escapeHtml(label)}</span>${badge(ok ? 'Ready' : waitingLabel, ok ? 'ok' : 'warn')}</div>`;
}

async function renderSystemUpdate() {
  setTitle('System Update');
  const status = await api('/api/system-update');
  const release = status.availableRelease;
  const updateAvailable = Boolean(status.availableVersion && release);
  const config = status.config || {};
  const stageJob = status.stageJob || {};
  const stageRunning = stageJob.status === 'verifying';
  const connectionReady = Boolean(config.connectionReady || (config.repositoryConfigured && config.tokenConfigured));
  const securityReady = Boolean(config.releaseSecurityReady || (!config.signatureRequired || config.publicKeyConfigured));
  const automaticInstallReady = Boolean(config.automaticInstallReady || config.ready);
  const staged = Boolean((status.installedReleases || []).some(item => item.version === status.availableVersion));
  const latestBackup = (status.backups || [])[0] || null;
  const currentLabel = systemVersionLabel(status.currentVersion);
  const availableLabel = systemVersionLabel(status.availableVersion);
  const sourceLabel = systemVersionLabel(status.repositorySourceVersion);
  const sourcePending = Boolean(status.repositorySourceVersion && compareVersionText(status.repositorySourceVersion, status.currentVersion) > 0 && !updateAvailable);
  state.systemUpdateRepository = config.repository || '';

  const headline = updateAvailable ? `Version ${availableLabel} is ready` : (sourcePending ? `Version ${sourceLabel} is publishing` : 'Your system is up to date');
  const headlineNote = updateAvailable
    ? (release?.name || 'A verified GitHub release is available.')
    : (sourcePending
      ? 'The new GitHub source is detected. P2PFlow will check automatically until the signed Release is published.'
      : (status.lastCheckMessage || 'Push the next version to GitHub, then press Check Now.'));

  $('#content').innerHTML = `
    <div class="system-update-page">
      <main class="system-update-main">
        <section class="update-hero-card ${updateAvailable ? 'has-update' : ''}">
          <div class="update-hero-copy">
            <span class="update-eyebrow">P2PFlow ${escapeHtml(currentLabel)}</span>
            <h2>${escapeHtml(headline)}</h2>
            <p>${escapeHtml(headlineNote)}</p>
          </div>
          <div class="update-hero-actions">
            <button id="checkSystemUpdateBtn" class="secondary" ${!connectionReady ? 'disabled' : ''}>Check Now</button>
            ${updateAvailable ? `<button id="installSystemUpdateBtn" class="success" ${!automaticInstallReady || !securityReady || stageRunning ? 'disabled' : ''}>${stageRunning ? 'Verifying...' : (staged ? 'Install Now' : 'Update Now')}</button>` : ''}
          </div>
        </section>

        ${status.lastCheckError ? `<div class="error update-page-message">${escapeHtml(status.lastCheckError)}</div>` : ''}
        ${status.lastResult?.error ? `<div class="error update-page-message">${escapeHtml(status.lastResult.error)}</div>` : ''}
        ${stageJob.status === 'failed' && stageJob.error ? `<div class="error update-page-message"><b>Update verification failed:</b> ${escapeHtml(stageJob.error)}</div>` : ''}

        <section class="update-overview-grid">
          <div class="update-overview-card"><span>Current version</span><b>${escapeHtml(currentLabel)}</b><small>Schema ${escapeHtml(status.schemaVersion)}</small></div>
          <div class="update-overview-card"><span>GitHub</span><b>${connectionReady ? 'Connected' : 'Not connected'}</b><small>${escapeHtml(config.repository || 'Connection required')}</small></div>
          <div class="update-overview-card"><span>Last backup</span><b>${latestBackup ? 'Ready' : 'Not created'}</b><small>${latestBackup ? escapeHtml(systemUpdateDate(latestBackup.created_at)) : 'Created before installation'}</small></div>
        </section>

        ${updateAvailable ? `<section class="update-release-card">
          <div class="section-head"><div><h3>${escapeHtml(release.name || `P2PFlow ${availableLabel}`)}</h3><p>${release.publishedAt ? `Published ${escapeHtml(systemUpdateDate(release.publishedAt))}` : 'Verified release from your private repository'}</p></div>${badge(staged ? 'Verified' : 'New', staged ? 'ok' : 'warn')}</div>
          ${release.body ? `<div class="update-release-summary">${escapeHtml(String(release.body).split(/\r?\n/).filter(Boolean).slice(0, 4).join(' '))}</div>` : ''}
          <div class="update-safe-line"><b>No data loss:</b> active writes finish first, then a database backup is created before code activation.</div>
        </section>` : `<section class="update-release-card update-empty-state"><b>No new release</b><span>Upload the next source version to GitHub and press Check Now.</span></section>`}

        <section class="update-settings-card">
          <div class="update-settings-row">
            <div><span>Repository</span><b>${escapeHtml(config.repository || 'Not connected')}</b></div>
            <button id="openGithubConnectionBtn" class="secondary small">${connectionReady ? 'Connection Settings' : 'Connect GitHub'}</button>
          </div>
          <div class="update-settings-row">
            <div><span>Release signature</span><b>${securityReady ? 'Ed25519 verification ready' : 'Signing key required'}</b></div>
            <button id="generateSigningKeyBtn" class="secondary small">${config.publicKeyConfigured ? 'Replace Key' : 'Generate Key'}</button>
          </div>
        </section>

        <details class="update-details-card">
          <summary>Installed versions <span>${(status.installedReleases || []).length}</span></summary>
          <div class="table-wrap"><table><thead><tr><th>Version</th><th>Installed</th><th>Status</th><th>Action</th></tr></thead><tbody>
            ${(status.installedReleases || []).map(item => `<tr><td><b>${escapeHtml(systemVersionLabel(item.version))}</b></td><td>${escapeHtml(systemUpdateDate(item.installedAt))}</td><td>${item.current ? badge('Current','ok') : badge('Ready','muted')}</td><td>${item.current ? '-' : (compareVersionText(item.version, status.currentVersion) < 0 ? `<button class="danger small" data-rollback-version="${escapeAttr(item.version)}" ${!automaticInstallReady ? 'disabled' : ''}>Roll Back</button>` : `<button class="success small" data-install-version="${escapeAttr(item.version)}" ${!automaticInstallReady ? 'disabled' : ''}>Install</button>`)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No version history yet.</td></tr>'}
          </tbody></table></div>
        </details>

        <details class="update-details-card">
          <summary>Database backups <span>${(status.backups || []).length}</span></summary>
          <div class="table-wrap"><table><thead><tr><th>Label</th><th>Revision</th><th>Version</th><th>Created</th></tr></thead><tbody>
            ${(status.backups || []).map(item => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.source_revision)}</td><td>${escapeHtml(systemVersionLabel(item.app_version || '-'))}</td><td>${escapeHtml(systemUpdateDate(item.created_at))}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">A backup will be created before the first installation.</td></tr>'}
          </tbody></table></div>
        </details>
      </main>

      <aside class="update-note-panel">
        <div class="update-note-pin">NOTE</div>
        <h3>Update guide</h3>
        <ol>
          <li>Copy the new source files into your GitHub Desktop repository.</li>
          <li>Commit and Push origin.</li>
          <li>Wait for the GitHub Release workflow to finish.</li>
          <li>Open this page and press Check Now.</li>
          <li>Press Update Now.</li>
          <li>Confirm Owner password and secret code.</li>
        </ol>
        <div class="update-note-statuses">
          ${updateStatusPill('GitHub connection', connectionReady, 'Connect')}
          ${updateStatusPill('Signed release', securityReady, 'Key needed')}
          ${updateStatusPill('Automatic install', automaticInstallReady, 'Hosting setup')}
        </div>
        <div class="update-note-safety"><b>Data safety</b><span>Orders, ledger, accounting, users and settings stay in the database. Code rollback never deletes later transactions.</span></div>
      </aside>
    </div>`;

  if (systemUpdateReleasePollTimer) { clearTimeout(systemUpdateReleasePollTimer); systemUpdateReleasePollTimer = null; }
  if (sourcePending && connectionReady && systemUpdateReleasePollCount < 20) {
    systemUpdateReleasePollCount += 1;
    systemUpdateReleasePollTimer = setTimeout(async () => {
      if (!$('#checkSystemUpdateBtn')) return;
      try { await api('/api/system-update/check', { method:'POST', body:'{}' }); await renderSystemUpdate(); } catch {}
    }, 15000);
  } else if (!sourcePending) {
    systemUpdateReleasePollCount = 0;
  }
  if (stageRunning) {
    setTimeout(async () => {
      if (!$('#installSystemUpdateBtn')) return;
      try {
        const job = await systemUpdateStageStatusRequest(6000);
        if (job.status !== 'verifying') await renderSystemUpdate();
      } catch {}
    }, 3000);
  }

  $('#openGithubConnectionBtn').onclick = () => openGithubConnectionSettings(config);
  $('#generateSigningKeyBtn').onclick = generateReleaseSigningKey;
  $('#checkSystemUpdateBtn').onclick = async () => {
    const button = $('#checkSystemUpdateBtn');
    button.disabled = true;
    button.textContent = 'Checking...';
    try {
      const result = await api('/api/system-update/check', { method:'POST', body:'{}' });
      notify(result.release?.version ? 'Release check complete.' : 'No new release found.', 'ok');
      await renderSystemUpdate();
    } catch {
      button.disabled = false;
      button.textContent = 'Check Now';
    }
  };
  if ($('#installSystemUpdateBtn')) $('#installSystemUpdateBtn').onclick = () => installAvailableUpdate(status.availableVersion);
  $$('[data-rollback-version]').forEach(button => button.onclick = () => openSystemUpdateAuthorization('rollback', button.dataset.rollbackVersion));
  $$('[data-install-version]').forEach(button => button.onclick = () => openSystemUpdateAuthorization('apply', button.dataset.installVersion));
}

function compareVersionText(a, b) {
  const av = String(a || '').replace(/^v/i,'').split(/[.-]/).slice(0,3).map(Number);
  const bv = String(b || '').replace(/^v/i,'').split(/[.-]/).slice(0,3).map(Number);
  for (let i=0;i<3;i+=1) { const diff=(av[i]||0)-(bv[i]||0); if (diff) return diff; }
  return String(a || '').localeCompare(String(b || ''));
}
