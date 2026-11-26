/**
 * AgniShield Chrome Extension - Background Service Worker (Manifest V3)
 * Intercepts tab navigation, queries the local AgniShield 200-Tree ML backend,
 * caches verdicts to keep navigation fast (<10ms for known sites),
 * and dispatches warning messages to the content script if a threat is detected.
 */

const API_BASE = "https://agnishield.onrender.com/api/v1/scan";
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes cache

// In-memory scan cache
const scanCache = new Map();

// Helper: Determine if URL should be analyzed
function isAnalyzable(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    // Skip local dev servers unless testing specifically
    if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
      return false;
    }
    // Skip chrome internal extensions
    if (parsed.protocol.startsWith("chrome")) return false;
    return true;
  } catch {
    return false;
  }
}

// Fetch scan verdict from local AgniShield backend API
async function queryAgniShield(url) {
  const parsed = new URL(url);
  const domainKey = parsed.hostname;

  // Check cache first
  const cached = scanCache.get(domainKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, preset: "auto" }),
    });

    if (!res.ok) {
      throw new Error(`API returned status ${res.status}`);
    }

    const result = await res.json();
    scanCache.set(domainKey, { result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.warn("[AgniShield Sentinel] Unable to reach backend scanner:", err);
    return null;
  }
}

// Update extension badge based on threat level
function updateBadge(tabId, riskCategory, safetyScore) {
  if (!riskCategory) {
    chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }

  if (riskCategory === "Dangerous") {
    chrome.action.setBadgeText({ tabId, text: "!" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#f43f5e" });
  } else if (riskCategory === "Suspicious") {
    chrome.action.setBadgeText({ tabId, text: "WARN" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#f59e0b" });
  } else {
    chrome.action.setBadgeText({ tabId, text: "SAFE" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#10b981" });
  }
}

// Listen to navigation events
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Trigger on initial loading
  if (changeInfo.status === "loading" && tab.url && isAnalyzable(tab.url)) {
    const scanResult = await queryAgniShield(tab.url);
    if (!scanResult) return;

    updateBadge(tabId, scanResult.riskCategory, scanResult.safetyScore);

    // Only show fullscreen blocking warning for Dangerous sites; Suspicious gets WARN badge
    if (scanResult.riskCategory === "Dangerous") {
      chrome.tabs.sendMessage(tabId, {
        type: "AGNISHIELD_THREAT_DETECTED",
        scan: scanResult,
      }).catch(() => {
        // Tab might not have injected content script yet; will catch on onMessage
      });
    }
  }
});

// Respond to messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_TAB_THREAT_STATUS") {
    const domainKey = request.url ? new URL(request.url).hostname : null;
    const cached = domainKey ? scanCache.get(domainKey) : null;
    sendResponse({ scan: cached ? cached.result : null });
    return true;
  }

  if (request.type === "MANUAL_SCAN_REQUEST") {
    queryAgniShield(request.url).then((res) => {
      sendResponse({ scan: res });
    });
    return true; // Keep message port open for async response
  }
});
