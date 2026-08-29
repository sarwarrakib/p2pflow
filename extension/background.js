const TASK_PREFIX = "c2c_task_";
const STATUS_KEY = "c2c_last_status";
const CONFIG_KEY = "c2c_crm_config";
const POLL_ALARM = "c2c_crm_poll";

function taskKey(tabId) { return `${TASK_PREFIX}${tabId}`; }
function cleanServerUrl(url) { return String(url || "").trim().replace(/\/+$/, ""); }

const BRIDGE_SCRIPT_ID = "p2pflow-crm-bridge";
function serverPermissionPattern(raw) {
  const url = new URL(cleanServerUrl(raw));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("CRM server must use HTTP or HTTPS.");
  const host = url.hostname.includes(":") ? `[${url.hostname}]` : url.hostname;
  return `${url.protocol}//${host}/*`;
}
async function syncBridgeContentScript(cfg = null) {
  const config = cfg || await getConfig();
  await chrome.scripting.unregisterContentScripts({ ids: [BRIDGE_SCRIPT_ID] }).catch(() => {});
  if (!config.serverUrl) return;
  const match = serverPermissionPattern(config.serverUrl);
  const allowed = await chrome.permissions.contains({ origins: [match] });
  if (!allowed) throw new Error("Chrome permission for the configured CRM server is missing. Open the extension popup and Save & Connect again.");
  await chrome.scripting.registerContentScripts([{
    id: BRIDGE_SCRIPT_ID,
    matches: [match],
    js: ["bridge.js"],
    runAt: "document_idle",
    persistAcrossSessions: true
  }]);
}


async function setStatus(status) {
  await chrome.storage.local.set({ [STATUS_KEY]: { ...status, updatedAt: new Date().toISOString() } });
}
async function getConfig() {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  return { serverUrl: "http://localhost:8080", token: "", pollingEnabled: true, pollSeconds: 2, maxConcurrent: 3, ...(stored[CONFIG_KEY] || {}) };
}
async function setConfig(next) {
  const current = await getConfig();
  const cfg = { ...current, ...next };
  cfg.serverUrl = cleanServerUrl(cfg.serverUrl || "http://localhost:8080");
  cfg.token = String(cfg.token || "").trim();
  cfg.pollSeconds = Math.max(1, Number(cfg.pollSeconds || 2));
  cfg.maxConcurrent = Math.min(6, Math.max(1, Number(cfg.maxConcurrent || 3)));
  await chrome.storage.local.set({ [CONFIG_KEY]: cfg });
  await syncBridgeContentScript(cfg);
  await configureAlarm(cfg);
  return cfg;
}
async function configureAlarm(cfg = null) {
  const config = cfg || await getConfig();
  await chrome.alarms.clear(POLL_ALARM);
  if (isCrmPollingEnabled(config)) {
    // Chrome alarms are the wake-up fallback. The fast in-memory loop below handles near-immediate polling while the browser/extension worker is awake.
    chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  }
}
async function getTask(tabId) {
  const key = taskKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return stored[key] || null;
}
async function setTask(tabId, task) { await chrome.storage.local.set({ [taskKey(tabId)]: task }); }
async function clearTask(tabId) { await chrome.storage.local.remove(taskKey(tabId)); }

async function openResults(data) {
  const id = `c2c_result_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await chrome.storage.local.set({ [id]: data });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`results.html?id=${encodeURIComponent(id)}`), active: true });
}

async function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function isCrmPollingEnabled(cfg = {}) {
  return Boolean(cfg && cfg.serverUrl && cfg.token && cfg.pollingEnabled !== false);
}

const activeServerTabs = new Map();
const activeServerUserNos = new Set();
let fastPollTimer = null;
let idlePollStreak = 0;

function validateAdvertiserUrl(raw) {
  const url = new URL(String(raw || "").trim());
  if (url.protocol !== "https:" || url.hostname !== "c2c.binance.com" || !url.pathname.includes("/advertiserDetail") || !url.searchParams.get("advertiserNo")) {
    throw new Error("Only Binance c2c advertiserDetail URLs are allowed.");
  }
  return url.toString();
}

function sameOriginUrl(a, b) {
  try { return new URL(a).origin === new URL(b).origin; } catch (_) { return false; }
}

function activeServerCollectionCount() {
  return activeServerTabs.size;
}

function clearFastPollTimer() {
  if (fastPollTimer) {
    clearTimeout(fastPollTimer);
    fastPollTimer = null;
  }
}

async function scheduleFastPoll(delayMs = 1000) {
  clearFastPollTimer();
  const cfg = await getConfig().catch(() => null);
  if (!isCrmPollingEnabled(cfg)) return;
  const base = Math.max(1000, Number(cfg.pollSeconds || 2) * 1000);
  const idleMultiplier = idlePollStreak <= 1 ? 1 : Math.min(7.5, 1 + (idlePollStreak - 1) * 0.75);
  const effectiveDelay = activeServerCollectionCount() > 0 ? Math.min(base, 1000) : Math.max(Number(delayMs) || base, Math.min(15000, base * idleMultiplier));
  fastPollTimer = setTimeout(async () => {
    fastPollTimer = null;
    try { await pollCrmTask(); } catch (_) {}
    try { await scheduleFastPoll(Math.max(1000, Number((await getConfig()).pollSeconds || 2) * 1000)); } catch (_) {}
  }, Math.max(250, effectiveDelay));
}

async function waitForTabComplete(tabId, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) throw new Error("Collection tab was closed before it loaded.");
    if (tab.status === "complete" && /^https:\/\/c2c\.binance\.com\//.test(tab.url || "")) return tab;
    await wait(500);
  }
  throw new Error("Binance advertiser page did not finish loading in time.");
}

function feedbackNeedsReload(result) {
  const warnings = Array.isArray(result?.warnings) ? result.warnings.join(' | ') : '';
  const summary = result?.profile?.feedbackSummary || {};
  const feedback = result?.feedback || {};
  const reviews = Number(String(summary.reviews || '').replace(/,/g, '')) || 0;
  const posRows = Array.isArray(feedback.positiveFirstPage) ? feedback.positiveFirstPage.length : 0;
  const negRows = Array.isArray(feedback.negativeFirstPage) ? feedback.negativeFirstPage.length : 0;
  return /Feedback tab was not found|feedback content was not detected/i.test(warnings) || (reviews > 0 && posRows === 0 && negRows === 0 && /Feedback/i.test(warnings));
}

async function injectAndCollect(tabId) {
  await waitForTabComplete(tabId);
  let lastError = null;
  let lastPartial = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
      await chrome.scripting.executeScript({ target: { tabId }, files: ["collector.js"] });
      const response = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          if (!window.__c2cAdvertiserCollector) throw new Error("Collector was not loaded.");
          return await window.__c2cAdvertiserCollector.collect();
        }
      });
      const result = response && response[0] && response[0].result;
      if (!result || !result.ok) throw new Error("No data was returned from the page.");
      lastPartial = result;
      if (feedbackNeedsReload(result) && attempt < 3) {
        result.warnings = [...(result.warnings || []), `Feedback tab missing on attempt ${attempt}; reloading advertiser page.`];
        await chrome.tabs.reload(tabId);
        await waitForTabComplete(tabId, 45000);
        await wait(1800);
        continue;
      }
      if (feedbackNeedsReload(result) && attempt >= 3) {
        result.warnings = [...(result.warnings || []), "Feedback tab still missing after retries. Saved available profile/trade data only."];
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await chrome.tabs.reload(tabId).catch(() => {});
        await waitForTabComplete(tabId, 45000).catch(() => {});
      }
      await wait(1200 * attempt);
    }
  }
  if (lastPartial) return lastPartial;
  throw lastError || new Error("No data was returned from the page.");
}

async function postTaskResult(task, payload) {
  const serverUrl = cleanServerUrl(task.serverUrl);
  const token = String(task.token || "").trim();
  const taskToken = String(task.resultToken || task.taskResultToken || "").trim();
  if (!serverUrl || (!token && !taskToken) || !task.crmTaskId) return;
  const resultUrl = taskToken
    ? `${serverUrl}/api/p2p-extension/result?taskToken=${encodeURIComponent(taskToken)}`
    : `${serverUrl}/api/p2p-extension/result?token=${encodeURIComponent(token)}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-P2P-Extension-Token"] = token;
  if (taskToken) headers["X-P2P-Extension-Task-Token"] = taskToken;
  const res = await fetch(resultUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      taskId: task.crmTaskId,
      crmTaskId: task.crmTaskId,
      task: { id: task.crmTaskId, userNo: task.userNo },
      token,
      resultToken: taskToken,
      taskResultToken: taskToken,
      orderId: task.orderId,
      orderNo: task.orderNo,
      userNo: task.userNo,
      ...payload
    })
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data?.ok === false) {
    const hint = data?.hint ? ` (${data.hint})` : '';
    throw new Error((data?.error || `CRM result upload failed: ${res.status}`) + hint);
  }
  return data;
}

async function openErrorResult(sourceUrl, error, extraWarnings = []) {
  const data = {
    ok: false,
    meta: { sourceUrl: sourceUrl || "", collectedAt: new Date().toISOString(), extensionVersion: "6.1.9", collectionMode: "visible_dom_user_initiated" },
    profile: {},
    feedback: { positiveFirstPage: [], negativeFirstPage: [] },
    warnings: [String(error?.message || error || "Unknown error"), ...extraWarnings]
  };
  await openResults(data);
}

async function runCollection(tabId, task) {
  if (!task || task.state === "running" || task.state === "done") return;
  await setTask(tabId, { ...task, state: "running" });
  const serverMode = task.mode === "server";
  await setStatus({ state: "running", message: serverMode ? `Collecting CRM P2P data for user ${task.userNo || task.crmTaskId}...` : "Binance page loaded. Collecting Trade Info and Feedback...", tabId });
  try {
    const result = await injectAndCollect(tabId);
    if (serverMode) {
      await postTaskResult(task, { ok: true, data: result });
      await setStatus({ state: "done", message: `CRM P2P user data saved for ${task.userNo || task.crmTaskId}.`, tabId });
      await chrome.tabs.remove(tabId).catch(() => {});
    } else {
      await openResults(result);
      await setStatus({ state: "done", message: "Done. Preview opened.", tabId });
      if (task.autoClose) await chrome.tabs.remove(tabId).catch(() => {});
    }
  } catch (error) {
    if (serverMode) {
      await postTaskResult(task, { ok: false, error: String(error?.message || error) }).catch(() => {});
      await setStatus({ state: "error", message: String(error?.message || error), tabId });
      await chrome.tabs.remove(tabId).catch(() => {});
    } else {
      await openErrorResult(task.url, error, ["If Binance login/CAPTCHA/risk check is visible, complete it manually and then use Collect from current Binance tab."]);
      await setStatus({ state: "error", message: String(error?.message || error), tabId });
    }
  } finally {
    if (serverMode) {
      activeServerTabs.delete(tabId);
      const userKey = String(task.userNo || task.crmTaskId || '').trim();
      if (userKey) activeServerUserNos.delete(userKey);
      scheduleFastPoll(250).catch(() => {});
    }
    await clearTask(tabId).catch(() => {});
  }
}

async function startNewTab(url, autoClose) {
  const tab = await chrome.tabs.create({ url, active: true });
  await chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});
  const task = { url, autoClose: Boolean(autoClose), state: "waiting", createdAt: new Date().toISOString(), mode: "manual" };
  await setTask(tab.id, task);
  await setStatus({ state: "waiting", message: "Opened Binance tab. Waiting for page load...", tabId: tab.id });
  waitForTabComplete(tab.id).then(() => runCollection(tab.id, task)).catch(async (error) => {
    await setStatus({ state: "error", message: String(error?.message || error), tabId: tab.id });
  });
  return { ok: true, message: "Started. You can leave the popup; the background worker will continue." };
}

async function startActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url || !tab.url.startsWith("https://c2c.binance.com/")) throw new Error("Open the Binance advertiserDetail page in the current tab first.");
  await setTask(tab.id, { url: tab.url, autoClose: false, state: "waiting", createdAt: new Date().toISOString(), mode: "manual" });
  await runCollection(tab.id, { url: tab.url, autoClose: false, state: "waiting", mode: "manual" });
  return { ok: true, message: "Started collection from current Binance tab." };
}


async function startServerCollectionTask(task, cfg = null, serverUrlOverride = "") {
  const config = cfg || await getConfig();
  const serverUrl = cleanServerUrl(serverUrlOverride || config.serverUrl);
  const token = String(config.token || "").trim();
  if (!task || !task.id || !task.advertiserUrl) throw new Error("CRM task is missing advertiserUrl or task id.");
  task = { ...task, advertiserUrl: validateAdvertiserUrl(task.advertiserUrl) };
  const taskToken = String(task.resultToken || task.taskResultToken || "").trim();
  if (!serverUrl || (!token && !taskToken)) throw new Error("CRM server URL and extension token must be saved in the extension popup first.");
  const userKey = String(task.userNo || task.id || '').trim();
  if (userKey && activeServerUserNos.has(userKey)) {
    return { ok: true, alreadyRunning: true, message: `Collection is already running for user ${userKey}.` };
  }
  const tab = await chrome.tabs.create({ url: task.advertiserUrl, active: false });
  await chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});
  const extTask = {
    mode: "server",
    state: "waiting",
    url: task.advertiserUrl,
    crmTaskId: task.id,
    orderId: task.orderId,
    orderNo: task.orderNo,
    userNo: task.userNo,
    resultToken: task.resultToken || task.taskResultToken || "",
    serverUrl,
    token,
    autoClose: true,
    createdAt: new Date().toISOString()
  };
  await setTask(tab.id, extTask);
  activeServerTabs.set(tab.id, extTask);
  if (userKey) activeServerUserNos.add(userKey);
  await setStatus({ state: "waiting", message: `P2P Info clicked: opened hidden Binance tab for user ${task.userNo || task.id}.`, tabId: tab.id });
  waitForTabComplete(tab.id).then(() => runCollection(tab.id, extTask)).catch(async (error) => {
    await postTaskResult(extTask, { ok: false, error: String(error?.message || error) }).catch(() => {});
    await setStatus({ state: "error", message: String(error?.message || error), tabId: tab.id });
    await chrome.tabs.remove(tab.id).catch(() => {});
    activeServerTabs.delete(tab.id);
    if (userKey) activeServerUserNos.delete(userKey);
    scheduleFastPoll(250).catch(() => {});
  });
  return { ok: true, tabId: tab.id, message: "Hidden Binance collection tab opened." };
}

let pollBusy = false;
async function pollCrmTask() {
  if (pollBusy) return;
  const cfg = await getConfig();
  if (!isCrmPollingEnabled(cfg)) return;
  pollBusy = true;
  let started = 0;
  try {
    const serverUrl = cleanServerUrl(cfg.serverUrl);
    const maxConcurrent = Math.min(6, Math.max(1, Number(cfg.maxConcurrent || 3)));
    while (activeServerCollectionCount() < maxConcurrent) {
      const res = await fetch(`${serverUrl}/api/p2p-extension/task?token=${encodeURIComponent(cfg.token)}`, {
        method: "GET",
        headers: { "X-P2P-Extension-Token": cfg.token, "Cache-Control": "no-cache" }
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `CRM polling failed: ${res.status}`);
      if (data.pollSeconds) {
        const nextPoll = Math.min(2, Math.max(1, Number(data.pollSeconds || 2)));
        if (Number(cfg.pollSeconds) !== nextPoll) await setConfig({ pollSeconds: nextPoll });
      }
      if (!data.task) {
        if (!started && activeServerCollectionCount() === 0) {
          idlePollStreak = Math.min(20, idlePollStreak + 1);
          await setStatus({ state: "idle", message: "Connected to CRM. Waiting for SELL order P2P Info tasks." });
        }
        break;
      }
      idlePollStreak = 0;
      const task = data.task;
      await startServerCollectionTask(task, cfg, serverUrl);
      started += 1;
      // Immediately ask for the next pending task so many tasks can run in parallel.
      await wait(150);
    }
    if (started > 0) {
      idlePollStreak = 0;
      await setStatus({ state: "running", message: `Started ${started} CRM collection task(s). Active: ${activeServerCollectionCount()}.` });
    }
  } catch (error) {
    await setStatus({ state: "error", message: String(error?.message || error) });
  } finally {
    pollBusy = false;
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab?.url?.startsWith("https://c2c.binance.com/")) return;
  (async () => {
    const task = await getTask(tabId);
    if (task && task.state === "waiting") await runCollection(tabId, task);
  })().catch(async (error) => {
    await setStatus({ state: "error", message: String(error?.message || error), tabId }).catch(() => {});
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) pollCrmTask().catch(() => {});
});
async function initializeExtensionRuntime() {
  const cfg = await getConfig();
  await syncBridgeContentScript(cfg).catch(() => {});
  await configureAlarm(cfg);
  await scheduleFastPoll(500);
}
chrome.runtime.onInstalled.addListener(() => { initializeExtensionRuntime().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { initializeExtensionRuntime().catch(() => {}); });
initializeExtensionRuntime().catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "SAVE_CONFIG") {
        const cfg = await setConfig(message.config || {});
        sendResponse({ ok: true, config: { ...cfg, token: cfg.token ? "saved" : "" } });
        if (isCrmPollingEnabled(cfg)) { scheduleFastPoll(250).catch(() => {}); pollCrmTask().catch(() => {}); }
        return;
      }
      if (message?.type === "GET_CONFIG") {
        const cfg = await getConfig();
        sendResponse({ ok: true, config: cfg });
        return;
      }
      if (message?.type === "START_CRM_TASK_DIRECT") {
        const pageUrl = sender?.tab?.url || sender?.url || '';
        const requestedServer = message.serverUrl || '';
        if (!pageUrl || !sameOriginUrl(pageUrl, requestedServer)) throw new Error("CRM direct task origin mismatch.");
        const cfg = await getConfig();
        if (!sameOriginUrl(cfg.serverUrl, requestedServer)) throw new Error("This page does not match the CRM server saved in the extension.");
        const task = { ...(message.task || {}), advertiserUrl: validateAdvertiserUrl(message.task?.advertiserUrl || '') };
        const response = await startServerCollectionTask(task, cfg, requestedServer);
        sendResponse(response);
        return;
      }
      if (message?.type === "POLL_NOW") {
        await pollCrmTask();
        sendResponse({ ok: true });
        return;
      }
      if (message?.type === "START_NEW_TAB") {
        const response = await startNewTab(message.url, message.autoClose);
        sendResponse(response);
        return;
      }
      if (message?.type === "START_ACTIVE_TAB") {
        const response = await startActiveTab();
        sendResponse(response);
        return;
      }
      if (message?.type === "GET_STATUS") {
        const stored = await chrome.storage.local.get(STATUS_KEY);
        sendResponse({ ok: true, status: stored[STATUS_KEY] || null });
        return;
      }
      sendResponse({ ok: false, error: "Unknown command." });
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();
  return true;
});
