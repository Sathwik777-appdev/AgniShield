/**
 * AgniShield Chrome Extension - Background Service Worker (Manifest V3)
 * Intercepts tab navigation, queries the AgniShield 200-Tree ML backend,
 * persists verdicts in chrome.storage.session across service worker restarts,
 * deduplicates concurrent requests, and warns on Dangerous pages.
 */

const API_BASE = "https://agnishield.onrender.com/api/v1/scan";
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes cache
const FETCH_TIMEOUT_MS = 15000;
const SHORTENER_HOSTS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "adf.ly",
  "tiny.cc",
]);

const scanCache = new Map();
const pendingScans = new Map();

function isAnalyzable(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Preserve path for URL shorteners/raw IPs so bit.ly/a vs bit.ly/b don't collide
function getCacheKey(url) {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  if (isIp || SHORTENER_HOSTS.has(host)) {
    return `${parsed.protocol}//${host}${parsed.pathname}`;
  }
  return `${parsed.protocol}//${host}`;
}

async function getCachedScan(cacheKey) {
  const mem = scanCache.get(cacheKey);
  if (mem && Date.now() - mem.timestamp < CACHE_TTL_MS) {
    return mem.result;
  }
  try {
    const stored = await chrome.storage.session.get(cacheKey);
    const entry = stored?.[cacheKey];
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
      scanCache.set(cacheKey, entry);
      return entry.result;
    }
  } catch {
    // storage.session unavailable or key missing
  }
  return null;
}

async function setCachedScan(cacheKey, result) {
  const entry = { result, timestamp: Date.now() };
  scanCache.set(cacheKey, entry);
  try {
    await chrome.storage.session.set({ [cacheKey]: entry });
  } catch {
    // Ignore storage quota errors
  }
}

async function queryAgniShield(url, forceRefresh = false) {
  if (!isAnalyzable(url)) return null;
  const cacheKey = getCacheKey(url);

  if (!forceRefresh) {
    const cached = await getCachedScan(cacheKey);
    if (cached) return { error: null, scan: cached };
  }

  if (pendingScans.has(cacheKey)) {
    return pendingScans.get(cacheKey);
  }

  const reqPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, preset: "auto" }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errDetail = `API returned status ${res.status}`;
        try {
          const body = await res.json();
          if (body?.detail) errDetail = body.detail;
        } catch {}
        return { error: errDetail, scan: null };
      }

      const result = await res.json();
      await setCachedScan(cacheKey, result);
      return { error: null, scan: result };
    } catch (err) {
      console.warn("[AgniShield Sentinel] Scan request failed:", err);
      return { error: err.message, scan: null };
    } finally {
      clearTimeout(timer);
      pendingScans.delete(cacheKey);
    }
  })();

  pendingScans.set(cacheKey, reqPromise);
  return reqPromise;
}

function updateBadge(tabId, riskCategory) {
  if (!riskCategory) {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    return;
  }

  if (riskCategory === "Dangerous") {
    chrome.action.setBadgeText({ tabId, text: "!" }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#f43f5e" }).catch(() => {});
  } else if (riskCategory === "Suspicious") {
    chrome.action.setBadgeText({ tabId, text: "WARN" }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#f59e0b" }).catch(() => {});
  } else {
    chrome.action.setBadgeText({ tabId, text: "SAFE" }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#10b981" }).catch(() => {});
  }
}

// Listen to both loading and complete events (deduped) so Dangerous warnings never race content script injection
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    (changeInfo.status === "loading" || changeInfo.status === "complete") &&
    tab.url &&
    isAnalyzable(tab.url)
  ) {
    const response = await queryAgniShield(tab.url);
    const scanResult = response?.scan;
    if (!scanResult) {
      updateBadge(tabId, null);
      return;
    }

    updateBadge(tabId, scanResult.riskCategory);

    if (scanResult.riskCategory === "Dangerous") {
      chrome.tabs
        .sendMessage(tabId, {
          type: "AGNISHIELD_THREAT_DETECTED",
          scan: scanResult,
        })
        .catch(() => {
          // Content script may still be initializing; will receive on status === "complete" or GET_TAB_THREAT_STATUS
        });
    }
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === "GET_TAB_THREAT_STATUS") {
    if (!isAnalyzable(request.url)) {
      sendResponse({ scan: null, unsupported: true });
      return false;
    }
    const cacheKey = getCacheKey(request.url);
    getCachedScan(cacheKey).then((result) => {
      sendResponse({ scan: result, error: null });
    });
    return true;
  }

  if (request.type === "MANUAL_SCAN_REQUEST") {
    if (!isAnalyzable(request.url)) {
      sendResponse({ scan: null, unsupported: true });
      return false;
    }
    queryAgniShield(request.url, true).then((res) => {
      sendResponse({ scan: res?.scan || null, error: res?.error || null });
    });
    return true;
  }
});
