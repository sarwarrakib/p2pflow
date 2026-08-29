function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[ch]));
}

function qs(id) { return document.getElementById(id); }

function item(label, value) {
  return `<div class="item"><div class="label">${esc(label)}</div><div class="value">${esc(value || "-")}</div></div>`;
}

function renderSummary(data) {
  const p = data.profile || {};
  const t = p.tradeInfo || {};
  const f = p.feedbackSummary || {};
  qs("summary").innerHTML = [
    item("Advertiser", p.name),
    item("Status", p.status),
    item("Joined on", p.joinedOn),
    item("Verifications", (p.verifications || []).join(", ")),
    item("All Trades", t.allTrades ? `${t.allTrades} Time(s)` : ""),
    item("Buy / Sell", [t.buyTrades, t.sellTrades].filter(Boolean).join(" / ")),
    item("30d Trades", t.trades30d ? `${t.trades30d} Time(s)` : ""),
    item("30d Completion Rate", t.completionRate30d),
    item("Avg. Release Time", t.avgReleaseTime),
    item("Avg. Pay Time", t.avgPayTime),
    item("First Trade", t.firstTrade),
    item("Trade Info modal opened", t.modalOpened ? "Yes" : "No"),
    item("Reviews", f.reviews),
    item("Positive", f.positive),
    item("Negative", f.negative),
    item("Positive %", f.positivePercent ? `${f.positivePercent}%` : "")
  ].join("");
}

function renderFeedback(id, rows) {
  if (!rows || !rows.length) {
    qs(id).innerHTML = `<div class="empty">No rows collected from this first page.</div>`;
    return;
  }
  qs(id).innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th><th>Type</th><th>Reviewer</th><th>Payment</th><th>Date</th><th>Comment</th><th>Tags</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${esc(row.index)}</td>
            <td>${esc(row.sentiment)}</td>
            <td>${esc(row.reviewer || "-")}</td>
            <td>${esc(row.paymentMethod || "-")}</td>
            <td>${esc(row.date || "-")}${row.postedOn ? `<br><span class="badge">Posted: ${esc(row.postedOn)}</span>` : ""}</td>
            <td>${esc(row.comment || "-")}</td>
            <td>${row.lowVolume ? `<span class="badge">Low volume</span>` : ""}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

async function load() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    qs("meta").textContent = "No result id provided.";
    return;
  }
  const stored = await chrome.storage.local.get(id);
  const data = stored[id];
  if (!data) {
    qs("meta").textContent = "Result not found in extension storage.";
    return;
  }

  qs("meta").textContent = `${data.meta?.sourceUrl || ""} | Collected: ${data.meta?.collectedAt || ""}`;
  renderSummary(data);
  renderFeedback("positive", data.feedback?.positiveFirstPage || []);
  renderFeedback("negative", data.feedback?.negativeFirstPage || []);
  qs("raw").textContent = JSON.stringify(data, null, 2);

  if (data.warnings && data.warnings.length) {
    qs("warningsCard").hidden = false;
    qs("warnings").innerHTML = data.warnings.map((w) => `<li>${esc(w)}</li>`).join("");
  }

  qs("copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    qs("copy").textContent = "Copied";
    setTimeout(() => { qs("copy").textContent = "Copy JSON"; }, 1200);
  });

  qs("download").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = (data.profile?.name || "advertiser").replace(/[^a-z0-9_.-]+/gi, "_");
    a.href = url;
    a.download = `c2c-feedback-${name}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

load();
