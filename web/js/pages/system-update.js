// P2PFlow v2 signed atomic deployment console.
// The running process never overwrites its own executable. Release archives are
// verified/staged beside the active release and an external fixed updater can
// atomically switch the current symlink before a controlled service rollout.
function systemVersionLabel(value) {
  const text = String(value || '').trim().replace(/^v/i, '');
  const match = text.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!match) return text || '-';
  return Number(match[3]) === 0 && !match[4] ? `${match[1]}.${match[2]}` : `${match[1]}.${match[2]}.${match[3]}${match[4]}`;
}


function systemVersionCompare(a, b) {
  const parse = value => {
    const m = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), String(m[4] || '')] : [0,0,0,String(value || '')];
  };
  const left = parse(a), right = parse(b);
  for (let i=0; i<3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  if (left[3] === right[3]) return 0;
  if (!left[3]) return 1;
  if (!right[3]) return -1;
  return left[3].localeCompare(right[3]);
}

function updateStatusBadge(status='') {
  const value = String(status || '').toLowerCase();
  if (['active','runtime','activation_handoff_complete'].includes(value)) return badge(value === 'runtime' ? 'Current' : value.replaceAll('_',' '), 'ok');
  if (['staged','activation_requested'].includes(value)) return badge(value.replaceAll('_',' '), 'warn');
  if (value.includes('failed')) return badge(value.replaceAll('_',' '), 'danger');
  return badge(value || 'unknown', '');
}

async function systemUpdateFileSha(file) {
  if (!file || !crypto?.subtle) return '';
  const buffer = await file.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return Array.from(digest, b => b.toString(16).padStart(2,'0')).join('');
}

function systemUpdateSignatureMessage(version, sha256) {
  return `p2pflow-release:v1\nversion=${String(version || '').trim()}\nsha256=${String(sha256 || '').trim().toLowerCase()}\n`;
}

async function renderSystemUpdate(options={}) {
  if (state.page !== 'system-update') return;
  const renderGuard = beginPageRenderGuard('system-update');
  setTitle('System Update');
  const status = await api('/api/system-update', { signal:renderGuard.signal, navigationScoped:false, silent:!!options.background });
  if (!pageRenderGuardCurrent(renderGuard) || state.page !== 'system-update') return;
  const current = systemVersionLabel(status.currentVersion);
  const config = status.config || {};
  const mode = config.deploymentMode || 'signed-atomic-v2';
  const releases = Array.isArray(status.installedReleases) ? status.installedReleases : [];
  const latestStaged = releases.find(item => ['staged','activation_requested','activation_handoff_complete'].includes(String(item.status || '')) && String(item.version || '') !== String(status.currentVersion || ''));
  const releaseRows = releases.map(item => {
    const rollback = systemVersionCompare(item.version, status.currentVersion) < 0;
    const actionable = !item.current && ['staged','activation_requested','activation_handoff_complete','active'].includes(String(item.status || ''));
    const action = rollback ? 'rollback' : 'apply';
    const label = rollback ? 'Rollback' : 'Activate';
    return `
    <tr>
      <td><b>${escapeHtml(systemVersionLabel(item.version))}</b>${item.current ? '<small class="muted"> · running</small>' : ''}</td>
      <td><code>${escapeHtml(String(item.sha256 || '').slice(0,16) || '-')}</code></td>
      <td>${updateStatusBadge(item.status)}</td>
      <td>${escapeHtml(fmt(item.updatedAt || item.createdAt || ''))}</td>
      <td>${actionable ? `<button class="secondary compact" data-update-action="${action}" data-update-release="${escapeHtml(item.version)}">${label}</button>` : '-'}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" class="muted">No staged release history yet.</td></tr>`;

  $('#content').innerHTML = `
    <div class="system-update-page" data-stable-key="system-update-page">
      <main class="system-update-main" data-stable-key="system-update-main">
        <section class="update-hero-card">
          <div class="update-hero-copy">
            <span class="update-eyebrow">P2PFlow ${escapeHtml(current)}</span>
            <h2>Signed atomic update pipeline</h2>
            <p>${escapeHtml(status.lastCheckMessage || 'Stage, verify and atomically activate a release without modifying the running process in place.')}</p>
          </div>
          <div class="update-hero-actions"><button id="refreshSystemUpdateBtn" class="secondary">Refresh Status</button></div>
        </section>
        <section class="update-overview-grid">
          <div class="update-overview-card"><span>Current version</span><b>${escapeHtml(current)}</b><small>Running application</small></div>
          <div class="update-overview-card"><span>Database schema</span><b>${escapeHtml(status.schemaVersion || '-')}</b><small>Latest applied migration</small></div>
          <div class="update-overview-card"><span>Release security</span><b>${config.releaseSecurityReady ? 'Ready' : 'Needs key'}</b><small>${config.signatureRequired ? 'Ed25519 signature required' : 'Signature optional'}</small></div>
        </section>

        <section class="update-release-card">
          <div class="section-head"><div><h3>Stage verified release</h3><p>ZIP extraction blocks path traversal/symlinks and verifies SHA-256 before the release becomes activatable.</p></div>${badge(config.releaseSecurityReady ? 'Ready' : 'Not ready', config.releaseSecurityReady ? 'ok' : 'danger')}</div>
          <form id="systemReleaseStageForm" class="form-grid">
            <label class="field"><span>Release ZIP</span><input id="systemReleaseFile" name="release" type="file" accept=".zip,application/zip" required></label>
            <label class="field"><span>Version ${config.signatureRequired ? '(required for signature)' : '(optional)'}</span><input id="systemReleaseVersion" name="version" placeholder="2.0.8"></label>
            <label class="field full"><span>SHA-256</span><input id="systemReleaseSha" name="sha256" readonly placeholder="Select a ZIP to calculate SHA-256"></label>
            <label class="field full"><span>Ed25519 signature ${config.signatureRequired ? '(required)' : '(optional)'}</span><textarea id="systemReleaseSignature" name="signature" rows="3" placeholder="Base64url/base64/hex 64-byte signature"></textarea></label>
            <div class="field full"><small id="systemReleaseSignMessage" class="muted">The canonical signature message appears after selecting a ZIP and entering a version.</small></div>
            <div class="form-actions full"><button id="systemReleaseStageBtn" type="submit" class="primary" ${config.releaseSecurityReady ? '' : 'disabled'}>Verify & Stage Release</button></div>
          </form>
        </section>

        ${latestStaged ? `<section class="update-release-card"><div class="section-head"><div><h3>Activation handoff</h3><p>Latest staged release: <b>${escapeHtml(systemVersionLabel(latestStaged.version))}</b></p></div>${updateStatusBadge(latestStaged.status)}</div><div class="update-safe-line"><b>Important:</b> run migrations against the same database, validate a new instance with <code>/ready</code>, then switch traffic/restart instances. Code rollback does not delete or roll back business data.</div><div class="form-actions"><button class="primary" data-update-action="${systemVersionCompare(latestStaged.version, status.currentVersion) < 0 ? 'rollback' : 'apply'}" data-update-release="${escapeHtml(latestStaged.version)}">${systemVersionCompare(latestStaged.version, status.currentVersion) < 0 ? 'Request Atomic Rollback' : 'Request Atomic Activation'}</button></div></section>` : ''}

        <details class="update-details-card" open>
          <summary>Release history <span>${releases.length}</span></summary>
          <div class="table-wrap"><table><thead><tr><th>Version</th><th>SHA-256</th><th>Status</th><th>Updated</th><th>Action</th></tr></thead><tbody>${releaseRows}</tbody></table></div>
        </details>
      </main>
      <aside class="update-note-panel" data-stable-key="update-guide">
        <div class="update-note-pin">SAFE UPDATE</div>
        <h3>Production sequence</h3>
        <ol>
          <li>Take a database backup/snapshot.</li>
          <li>Stage the signed P2PFlow ZIP here.</li>
          <li>Run the staged <code>p2pflow-migrate</code>.</li>
          <li>Start/health-check the new release.</li>
          <li>Atomically switch the <code>current</code> symlink or load balancer.</li>
          <li>Restart/roll instances and verify <code>/ready</code>.</li>
        </ol>
        <div class="update-note-statuses">
          <div class="update-mini-status"><span>Mode</span>${badge('Atomic','ok')}</div>
          <div class="update-mini-status"><span>Checksum</span>${badge('SHA-256','ok')}</div>
          <div class="update-mini-status"><span>Signature</span>${badge(config.signatureRequired ? 'Required' : 'Optional', config.releaseSecurityReady ? 'ok' : 'danger')}</div>
          <div class="update-mini-status"><span>Auto handoff</span>${badge(config.automaticInstallReady ? 'Configured' : 'Manual', config.automaticInstallReady ? 'ok' : 'warn')}</div>
        </div>
        <small class="muted">Release dir: ${escapeHtml(config.releaseDir || '-')}<br>Current link: ${escapeHtml(config.currentLink || '-')}</small>
      </aside>
    </div>`;

  $('#refreshSystemUpdateBtn').onclick = () => renderSystemUpdate({ background:true });
  const fileInput = $('#systemReleaseFile');
  const versionInput = $('#systemReleaseVersion');
  const shaInput = $('#systemReleaseSha');
  const signMessage = $('#systemReleaseSignMessage');
  const updateSignMessage = () => {
    const version = String(versionInput?.value || '').trim();
    const sha = String(shaInput?.value || '').trim();
    signMessage.textContent = version && sha ? systemUpdateSignatureMessage(version, sha) : 'The canonical signature message appears after selecting a ZIP and entering a version.';
  };
  versionInput?.addEventListener('input', updateSignMessage);
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    shaInput.value = '';
    if (!file) return updateSignMessage();
    shaInput.placeholder = 'Calculating SHA-256…';
    try { shaInput.value = await systemUpdateFileSha(file); }
    catch (err) { notify(`Could not calculate release SHA-256: ${err.message || err}`, 'danger'); }
    shaInput.placeholder = 'SHA-256';
    updateSignMessage();
  });
  $('#systemReleaseStageForm').onsubmit = async event => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) return notify('Select a release ZIP first.', 'warn');
    const version = String(versionInput.value || '').trim();
    if (config.signatureRequired && !version) return notify('Enter the exact release version before signing/staging.', 'warn');
    if (!shaInput.value) {
      try { shaInput.value = await systemUpdateFileSha(file); updateSignMessage(); }
      catch (err) { return notify(`SHA-256 calculation failed: ${err.message || err}`, 'danger'); }
    }
    if (config.signatureRequired && !String($('#systemReleaseSignature').value || '').trim()) return notify('This server requires an Ed25519 release signature.', 'warn');
    const button = $('#systemReleaseStageBtn');
    button.disabled = true; button.textContent = 'Verifying & staging…';
    try {
      const fd = new FormData();
      fd.append('release', file, file.name);
      if (version) fd.append('version', version);
      fd.append('sha256', shaInput.value);
      const signature = String($('#systemReleaseSignature').value || '').trim();
      if (signature) fd.append('signature', signature);
      const result = await api('/api/system-update/stage', { method:'POST', body:fd, navigationScoped:false });
      notify(`P2PFlow ${result.release?.version || version} verified and staged.`, 'ok');
      await renderSystemUpdate({ background:true });
    } catch (err) {
      notify(err.message || 'Release staging failed.', 'danger');
      button.disabled = false; button.textContent = 'Verify & Stage Release';
    }
  };
  $$('[data-update-action]').forEach(button => {
    button.onclick = async () => {
      const version = String(button.dataset.updateRelease || '').trim();
      const action = button.dataset.updateAction === 'rollback' ? 'rollback' : 'apply';
      const verb = action === 'rollback' ? 'rollback to' : 'activate';
      if (!version) return;
      if (!confirm(`Request atomic ${verb} P2PFlow ${version}? Verify database migration compatibility and take a backup before switching production traffic.`)) return;
      button.disabled = true;
      try {
        const result = await api(`/api/system-update/${action}`, { method:'POST', body:JSON.stringify({ version }), navigationScoped:false });
        notify(result.message || `${action === 'rollback' ? 'Rollback' : 'Activation'} requested for ${version}.`, result.automatic ? 'ok' : 'warn', 6000);
        if (result.handoffCommand) console.info('P2PFlow update handoff:', result.handoffCommand);
        await renderSystemUpdate({ background:true });
      } catch (err) {
        notify(err.message || `${action === 'rollback' ? 'Rollback' : 'Activation'} request failed.`, 'danger');
        button.disabled = false;
      }
    };
  });
}
