/**
 * AgniShield Popup Controller
 */

document.addEventListener("DOMContentLoaded", async () => {
  const urlEl = document.getElementById("tab-url");
  const scoreEl = document.getElementById("safety-score");
  const badgeEl = document.getElementById("threat-badge");
  const telemetryEl = document.getElementById("telemetry-info");
  const rescanBtn = document.getElementById("rescan-btn");

  // Query active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    urlEl.textContent = "No active web page detected";
    return;
  }

  urlEl.textContent = tab.url;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function displayScan(scan) {
    if (!scan) {
      scoreEl.textContent = "Unscanned";
      scoreEl.style.color = "#94a3b8";
      badgeEl.className = "status-badge badge-safe";
      badgeEl.textContent = "READY";
      telemetryEl.innerHTML = "Click 'Re-Scan Active Tab' to run a deep 200-tree assessment.";
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

  // Get cached status from background worker
  chrome.runtime.sendMessage({ type: "GET_TAB_THREAT_STATUS", url: tab.url }, (res) => {
    if (res && res.scan) {
      displayScan(res.scan);
    } else {
      // Trigger scan automatically
      triggerScan();
    }
  });

  function triggerScan() {
    rescanBtn.textContent = "Scanning with 200 trees...";
    rescanBtn.disabled = true;

    chrome.runtime.sendMessage({ type: "MANUAL_SCAN_REQUEST", url: tab.url }, (res) => {
      rescanBtn.textContent = "Re-Scan Active Tab";
      rescanBtn.disabled = false;
      if (res && res.scan) {
        displayScan(res.scan);
      }
    });
  }

  rescanBtn.addEventListener("click", triggerScan);
});
