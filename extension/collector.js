(() => {
  const VERSION = "6.1.6";

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function smartClick(el) {
    if (!el) return false;
    let target = el;
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.tagName === "BUTTON" || node.getAttribute("role") === "button" || style.cursor === "pointer") {
        target = node;
        break;
      }
    }
    target.scrollIntoView({ block: "center", inline: "center" });
    const rect = target.getBoundingClientRect();
    const options = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + Math.max(1, rect.width / 2),
      clientY: rect.top + Math.max(1, rect.height / 2)
    };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      target.dispatchEvent(new MouseEvent(type, options));
    }
    if (typeof target.click === "function") target.click();
    return true;
  }

  function textOf(el) {
    return normalizeText(el?.innerText || el?.textContent || "");
  }

  function findTextElement(regex, root = document) {
    const nodes = Array.from(root.querySelectorAll("button, [role='tab'], div, span, p"));
    return nodes.find((el) => visible(el) && regex.test(textOf(el)));
  }

  async function waitFor(predicate, timeout = 8000, interval = 150) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const result = predicate();
        if (result) return result;
      } catch (_) {}
      await wait(interval);
    }
    return null;
  }

  function linesFrom(text) {
    return normalizeText(text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  }

  function firstMatch(text, regex) {
    const match = normalizeText(text).match(regex);
    return match ? match[1].trim() : "";
  }

  function parseTradeInfoFromText(text) {
    const out = {};
    const compact = normalizeText(text);

    const all = compact.match(/All Trades\s+([\d,]+)\s*(?:Time\(s\))?(?:\s+Buy\s*([\d,]+)\s*(?:\/|\|)\s*Sell\s*([\d,]+))?/i);
    if (all) {
      out.allTrades = all[1];
      if (all[2]) out.buyTrades = all[2];
      if (all[3]) out.sellTrades = all[3];
    }

    const thirty = compact.match(/30d Trades\s+([\d,]+)(?:\s*Time\(s\))?/i);
    if (thirty) out.trades30d = thirty[1];

    const completion = compact.match(/30d Completion Rate\s+([\d,.]+)\s*%/i);
    if (completion) out.completionRate30d = `${completion[1]}%`;

    const release = compact.match(/Avg\.\s*Release Time\s+([\d,.]+)\s*Minute\(s\)/i);
    if (release) out.avgReleaseTime = `${release[1]} Minute(s)`;

    const pay = compact.match(/Avg\.\s*Pay Time\s+([\d,.]+)\s*Minute\(s\)/i);
    if (pay) out.avgPayTime = `${pay[1]} Minute(s)`;

    const firstTrade = compact.match(/First Trade\s+([\d,]+)\s*Day\(s\)\s*Ago/i);
    if (firstTrade) out.firstTrade = `${firstTrade[1]} Day(s) Ago`;

    const counterparties = compact.match(/Trading Counterparties\s+([\d,]+)/i);
    if (counterparties) out.counterparties = counterparties[1];

    return out;
  }

  function parseProfileSummary() {
    const bodyText = normalizeText(document.body.innerText);
    const nameEl = document.querySelector(".headline3[class*='text-primaryText'], [class*='headline3'][class*='text-primaryText']");
    const name = textOf(nameEl) || firstMatch(bodyText, /\n([A-Za-z0-9_.\-]+)\s+Online\s+Joined on/i);

    const joinedOn = firstMatch(bodyText, /Joined on\s+(\d{4}-\d{2}-\d{2})/i);
    const status = /\bOnline\b/i.test(bodyText) ? "Online" : "";
    const verifications = ["Email", "SMS", "ID Verification", "KYC", "Address"].filter((v) => new RegExp(`\\b${v.replace(/ /g, "\\s+")}\\b`, "i").test(bodyText));

    const feedbackTab = firstMatch(bodyText, /Feedback\s*\((\d+)\)/i);
    const positiveTab = firstMatch(bodyText, /Positive\s*\((\d+)\)/i);
    const negativeTab = firstMatch(bodyText, /Negative\s*\((\d+)\)/i);
    const reviewCount = firstMatch(bodyText, /(\d+)\s+Reviews/i) || feedbackTab;
    const positivePercent = firstMatch(bodyText, /(\d+(?:\.\d+)?)\s*%\s+\d+\s+Reviews/i);
    const followingCount = firstMatch(bodyText, /([\d,]+)\s+Following/i);
    const followersCount = firstMatch(bodyText, /([\d,]+)\s+Followers/i);
    const adsCount = firstMatch(bodyText, /Ads\s*\(([\d,]+)\)/i);
    const verified = /Verified user|\bVerified\b|✓\s*Verified/i.test(bodyText);

    return {
      name,
      status,
      joinedOn,
      verifications,
      followingCount,
      followersCount,
      adsCount,
      verified,
      feedbackSummary: {
        reviews: reviewCount,
        positive: positiveTab,
        negative: negativeTab,
        positivePercent
      },
      visibleTradeStats: parseTradeInfoFromText(bodyText)
    };
  }

  function findTradeInfoButton() {
    const svgs = Array.from(document.querySelectorAll("svg[class*='cursor-pointer'], svg.cursor-pointer"))
      .filter(visible);
    const byEllipsisPath = svgs.find((svg) => (svg.innerHTML || "").includes("3.55") && (svg.innerHTML || "").includes("4.3"));
    if (byEllipsisPath) return byEllipsisPath;

    const label = findTextElement(/^Avg\.\s*Pay Time$/i) || findTextElement(/^Avg\.\s*Release Time$/i);
    if (label) {
      const candidatesAfterLabel = svgs
        .map((svg) => ({ svg, top: svg.getBoundingClientRect().top, left: svg.getBoundingClientRect().left }))
        .filter((x) => x.top >= label.getBoundingClientRect().top - 120);
      if (candidatesAfterLabel.length) return candidatesAfterLabel[candidatesAfterLabel.length - 1].svg;
    }
    return svgs[svgs.length - 1] || null;
  }

  function findDialogWithTradeInfo() {
    const title = findTextElement(/^Trade Info$/i);
    if (!title) return null;
    let best = title;
    for (let node = title; node && node !== document.body; node = node.parentElement) {
      const txt = textOf(node);
      if (/Trade Info/i.test(txt) && /All Trades/i.test(txt) && /First Trade/i.test(txt)) {
        best = node;
      }
    }
    return best;
  }

  async function collectTradeInfo(warnings) {
    const before = parseTradeInfoFromText(document.body.innerText);
    const button = findTradeInfoButton();
    if (!button) {
      warnings.push("Trade Info three-dot button was not found. Collected only visible trade stats.");
      return { ...before, modalOpened: false };
    }

    smartClick(button);
    const dialog = await waitFor(findDialogWithTradeInfo, 5000);
    if (!dialog) {
      warnings.push("Clicked Trade Info button, but the Trade Info modal did not appear in time.");
      return { ...before, modalOpened: false };
    }

    const modalText = textOf(dialog);
    const modalStats = parseTradeInfoFromText(modalText);

    const closeIcon = Array.from(dialog.querySelectorAll("svg"))
      .find((svg) => (svg.innerHTML || "").includes("M6.697 4.575"));
    if (closeIcon) smartClick(closeIcon);
    await wait(300);

    return { ...before, ...modalStats, modalOpened: true };
  }

  async function clickFeedbackMainTab(warnings) {
    const tab = document.querySelector("[data-tab-key='reviews']") || findTextElement(/^Feedback\s*\(\d+\)$/i);
    if (!tab) {
      warnings.push("Feedback tab was not found.");
      return false;
    }
    smartClick(tab);
    const ok = await waitFor(() => document.querySelector("#bn-tab-pane-reviews[aria-hidden='false'], #bn-tab-pane-reviews.active, [data-tab-key='1'], [data-tab-key='3']") || /Positive\s*\(\d+\)|Negative\s*\(\d+\)|No feedback/i.test(document.body.innerText || ""), 7000);
    if (!ok) warnings.push("Feedback tab was clicked, but feedback content was not detected in time.");
    await wait(700);
    return Boolean(ok);
  }

  async function clickFeedbackType(type, warnings) {
    const key = type === "positive" ? "1" : "3";
    const label = type === "positive" ? /^Positive\s*\(/i : /^Negative\s*\(/i;
    const tab = document.querySelector(`[data-tab-key='${key}']`) || findTextElement(label);
    if (!tab) {
      warnings.push(`${type} feedback tab was not found.`);
      return false;
    }
    smartClick(tab);
    await waitFor(() => {
      const pane = document.querySelector(`#bn-tab-pane-${key}`);
      if (pane && visible(pane)) return pane;
      return document.querySelector("#bn-tab-pane-reviews .bn-tab-pane.active");
    }, 7000);
    await wait(1300);
    return true;
  }

  function activeFeedbackPane(type) {
    const key = type === "positive" ? "1" : type === "negative" ? "3" : "all";
    const pane = document.querySelector(`#bn-tab-pane-${key}`);
    if (pane && visible(pane)) return pane;
    const visiblePanes = Array.from(document.querySelectorAll("#bn-tab-pane-reviews .bn-tab-pane"))
      .filter((el) => visible(el) && /\d{4}-\d{2}-\d{2}|No feedback/i.test(textOf(el)));
    return visiblePanes[0] || document.querySelector("#bn-tab-pane-reviews") || document.body;
  }

  function extractFeedbackRows(type) {
    const pane = activeFeedbackPane(type);
    const rowCandidates = Array.from(pane.querySelectorAll("[class*='border-b'][class*='py-xl']"))
      .filter((row) => {
        const txt = textOf(row);
        return /\d{4}-\d{2}-\d{2}/.test(txt) && /feedback|No feedback|[\u0980-\u09FF]|[A-Za-z]/i.test(txt);
      });

    const rows = rowCandidates.map((row, index) => {
      const rawText = textOf(row);
      const nameEl = row.querySelector("[class*='t-subtitle1'][class*='text-PrimaryText'], [class*='t-subtitle1'][class*='text-primaryText']");
      const commentEl = row.querySelector("[class*='t-body2'][class*='text-SecondaryText'], [class*='t-body2'][class*='text-secondaryText']");
      const dateMatch = rawText.match(/(?:Edited on\s*)?(\d{4}-\d{2}-\d{2})/);
      const postedMatch = rawText.match(/Posted on\s*(\d{4}-\d{2}-\d{2})/i);
      const tertiaryEls = Array.from(row.querySelectorAll("[class*='t-body3'][class*='text-TertiaryText'], [class*='t-body3'][class*='text-tertiaryText']"));
      const paymentEl = tertiaryEls.find((el) => {
        const txt = textOf(el);
        return txt && !/\d{4}-\d{2}-\d{2}|Edited on|Posted on/i.test(txt);
      });
      const lowVolume = /\bLow volume\b/i.test(rawText);
      const negativeIcon = row.querySelector("svg[class*='text-error'], [class*='text-error'] svg");
      const positiveIcon = row.querySelector("svg[class*='text-success'], [class*='text-success'] svg");
      const sentiment = negativeIcon ? "negative" : positiveIcon ? "positive" : type;

      return {
        index: index + 1,
        sentiment,
        reviewer: textOf(nameEl) || (rawText.includes("Anonymous User") ? "Anonymous User" : ""),
        paymentMethod: textOf(paymentEl),
        date: dateMatch ? dateMatch[1] : "",
        postedOn: postedMatch ? postedMatch[1] : "",
        lowVolume,
        comment: textOf(commentEl),
        rawText
      };
    });

    return rows;
  }

  async function collect() {
    const warnings = [];
    await waitFor(() => document.readyState === "complete" || document.body?.innerText?.length > 100, 12000);
    await waitFor(() => /Feedback\s*\(\d+\)|Online Ads|All Trades|Avg\.\s*Pay Time/i.test(document.body.innerText || ""), 25000, 250);
    await wait(1800);

    const meta = {
      sourceUrl: location.href,
      collectedAt: new Date().toISOString(),
      extensionVersion: VERSION,
      collectionMode: "visible_dom_user_initiated"
    };

    const profileBefore = parseProfileSummary();
    const tradeInfo = await collectTradeInfo(warnings);
    const feedbackMainClicked = await clickFeedbackMainTab(warnings);
    await wait(500);
    const profileAfterFeedback = parseProfileSummary();

    let positiveFirstPage = [];
    let negativeFirstPage = [];

    if (feedbackMainClicked) {
      // Negative first, matching the CRM Feedback tab default.
      const negativeClicked = await clickFeedbackType("negative", warnings);
      if (negativeClicked) negativeFirstPage = extractFeedbackRows("negative");

      const positiveClicked = await clickFeedbackType("positive", warnings);
      if (positiveClicked) positiveFirstPage = extractFeedbackRows("positive");
    }

    const profile = {
      ...profileBefore,
      ...profileAfterFeedback,
      tradeInfo,
      feedbackSummary: {
        ...profileBefore.feedbackSummary,
        ...profileAfterFeedback.feedbackSummary
      }
    };

    return {
      ok: true,
      meta,
      profile,
      feedback: {
        positiveFirstPage,
        negativeFirstPage
      },
      warnings
    };
  }

  window.__c2cAdvertiserCollector = { collect };
})();
