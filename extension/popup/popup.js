/**
 * AgniShield Popup Controller
 */

document.addEventListener("DOMContentLoaded", async () => {
  const urlEl = document.getElementById("tab-url");
  const scoreEl = document.getElementById("safety-score");
  const badgeEl = document.getElementById("threat-badge");
  const telemetryEl = document.getElementById("telemetry-info");
  const rescanBtn = document.getElementById("rescan-btn");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    urlEl.textContent = "No active web page detected";
    rescanBtn.disabled = true;
    return;
  }

  urlEl.textContent = tab.url;

  const isHttp = tab.url.startsWith("http://") || tab.url.startsWith("https://");
  if (!isHttp) {
    scoreEl.textContent = "N/A";
    scoreEl.style.color = "#94a3b8";
    badgeEl.className = "status-badge badge-safe";
    badgeEl.textContent = "SYSTEM";
    telemetryEl.textContent = "Browser internal pages do not require threat scanning.";
    rescanBtn.disabled = true;
    return;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function displayScan(scan, errorMsg) {
    if (!scan) {
      scoreEl.textContent = errorMsg ? "Offline" : "Unscanned";
      scoreEl.style.color = "#94a3b8";
      badgeEl.className = errorMsg ? "status-badge badge-warn" : "status-badge badge-safe";
      badgeEl.textContent = errorMsg ? "RETRY" : "READY";
      telemetryEl.textContent =
        errorMsg || "Click 'Re-Scan Active Tab' to run a 200-tree assessment.";
      return;
    }

    scoreEl.textContent = `${scan.safetyScore} / 100`;

    if (scan.riskCategory === "Dangerous") {
      scoreEl.style.color = "#f43f5e";
      badgeEl.className = "status-badge badge-danger";
      badgeEl.textContent = "THREAT";
    } else if (scan.riskCategory === "Suspicious") {
      scoreEl.style.color = "#f59e0b";
      badgeEl.className = "status-badge badge-warn";
      badgeEl.textContent = "WARNING";
    } else {
      scoreEl.style.color = "#10b981";
      badgeEl.className = "status-badge badge-safe";
      badgeEl.textContent = "SAFE";
    }

    const reasons = (scan.reasons || []).slice(0, 3).map((r) => `• ${escapeHtml(r)}`).join("<br>");
    telemetryEl.innerHTML = `
      <strong>Verdict:</strong> ${escapeHtml(scan.c2Verdict)}<br>
      ${reasons || "• Baseline DNS/TLS parameters normal."}
    `;
  }

  function triggerScan() {
    rescanBtn.textContent = "Scanning with 200 trees...";
    rescanBtn.disabled = true;

    chrome.runtime.sendMessage({ type: "MANUAL_SCAN_REQUEST", url: tab.url }, (res) => {
      rescanBtn.textContent = "Re-Scan Active Tab";
      rescanBtn.disabled = false;
      if (chrome.runtime.lastError || !res || !res.scan) {
        displayScan(
          null,
          res?.error || "Website does not exist or DNS could not be resolved."
        );
        return;
      }
      displayScan(res.scan);
    });
  }

  chrome.runtime.sendMessage({ type: "GET_TAB_THREAT_STATUS", url: tab.url }, (res) => {
    if (chrome.runtime.lastError) {
      triggerScan();
      return;
    }
    if (res && res.scan) {
      displayScan(res.scan);
    } else {
      triggerScan();
    }
  });

  rescanBtn.addEventListener("click", triggerScan);
});
