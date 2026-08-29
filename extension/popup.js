const $ = (id) => document.getElementById(id);
let polling = null;

function setStatus(message) { $("status").textContent = message || ""; }
function setBusy(isBusy) {
  ["saveConfig", "pollNow", "collect", "activeCollect"].forEach(id => { const el = $(id); if (el) el.disabled = isBusy; });
}

function serverPermissionPattern(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); }
  catch (_) { throw new Error('Please enter a valid CRM server URL.'); }
  if (!['http:','https:'].includes(url.protocol)) throw new Error('CRM server URL must use HTTP or HTTPS.');
  const host = url.hostname.includes(':') ? `[${url.hostname}]` : url.hostname;
  return `${url.protocol}//${host}/*`;
}

async function ensureServerPermission(serverUrl) {
  const pattern = serverPermissionPattern(serverUrl);
  const existing = await chrome.permissions.contains({ origins:[pattern] });
  if (existing) return pattern;
  const granted = await chrome.permissions.request({ origins:[pattern] });
  if (!granted) throw new Error('Chrome host permission is required for the selected CRM server.');
  return pattern;
}

function validateAdvertiserUrl(raw) {
  let url;
  try { url = new URL(String(raw || "").trim()); }
  catch (_) { throw new Error("Please paste a valid Binance advertiserDetail URL."); }
  if (url.hostname !== "c2c.binance.com") throw new Error("Only https://c2c.binance.com advertiserDetail links are supported.");
  if (!url.pathname.includes("/advertiserDetail")) throw new Error("The link must be an advertiserDetail page.");
  if (!url.searchParams.get("advertiserNo")) throw new Error("The URL must include advertiserNo=...");
  return url.toString();
}
async function loadConfig() {
  const response = await chrome.runtime.sendMessage({ type: "GET_CONFIG" });
  if (response?.ok && response.config) {
    $("serverUrl").value = response.config.serverUrl || "http://localhost:8080";
    $("token").value = response.config.token || "";
    $("pollingEnabled").checked = response.config.pollingEnabled !== false;
    if ($("maxConcurrent")) $("maxConcurrent").value = response.config.maxConcurrent || 3;
  }
}
async function saveConfig() {
  try {
    setBusy(true);
    const config = {
      serverUrl: $("serverUrl").value.trim() || "http://localhost:8080",
      token: $("token").value.trim(),
      pollingEnabled: $("pollingEnabled").checked,
      maxConcurrent: Math.min(6, Math.max(1, Number($("maxConcurrent")?.value || 3)))
    };
    if (config.pollingEnabled && !config.token) throw new Error("Token is required for CRM click collection.");
    await ensureServerPermission(config.serverUrl);
    const response = await chrome.runtime.sendMessage({ type: "SAVE_CONFIG", config });
    if (!response?.ok) throw new Error(response?.error || "Could not save config.");
    setStatus(config.pollingEnabled ? "Saved. Waiting for P2P Info click tasks from CRM..." : "Saved. CRM click collection is off.");
    startStatusPolling();
  } catch (error) {
    setStatus(`Error: ${error.message || error}`);
  } finally { setBusy(false); }
}
async function pollNow() {
  try {
    setBusy(true);
    const response = await chrome.runtime.sendMessage({ type: "POLL_NOW" });
    if (!response?.ok) throw new Error(response?.error || "Poll failed.");
    setStatus("Checked CRM. Waiting for status...");
    startStatusPolling();
  } catch (error) { setStatus(`Error: ${error.message || error}`); }
  finally { setBusy(false); }
}
function startStatusPolling() {
  if (polling) clearInterval(polling);
  polling = setInterval(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
      if (response?.status?.message) setStatus(`${response.status.message}\n${response.status.updatedAt || ""}`);
    } catch (_) {}
  }, 1000);
}
async function collectFromNewTab() {
  try {
    const url = validateAdvertiserUrl($("url").value);
    setBusy(true);
    setStatus("Starting manual background collection...");
    const response = await chrome.runtime.sendMessage({ type: "START_NEW_TAB", url, autoClose: $("autoClose").checked });
    if (!response?.ok) throw new Error(response?.error || "Could not start collection.");
    setStatus(response.message || "Started. Preview will open automatically.");
    startStatusPolling();
  } catch (error) { setStatus(`Error: ${error.message || error}`); }
  finally { setBusy(false); }
}
async function collectFromActiveTab() {
  try {
    setBusy(true);
    setStatus("Starting collection from the current Binance tab...");
    const response = await chrome.runtime.sendMessage({ type: "START_ACTIVE_TAB" });
    if (!response?.ok) throw new Error(response?.error || "Could not start collection.");
    setStatus(response.message || "Started. Preview will open automatically.");
    startStatusPolling();
  } catch (error) { setStatus(`Error: ${error.message || error}`); }
  finally { setBusy(false); }
}
$("saveConfig").addEventListener("click", saveConfig);
$("pollNow").addEventListener("click", pollNow);
$("collect").addEventListener("click", collectFromNewTab);
$("activeCollect").addEventListener("click", collectFromActiveTab);
loadConfig().then(startStatusPolling);
