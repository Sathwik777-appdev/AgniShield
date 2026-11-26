/**
 * AgniShield Content Script - In-Page Threat Alert & Security Shield
 * Renders an alert modal or top banner whenever a site is detected
 * as Dangerous (C2/Malware) or Suspicious (DGA/Phishing).
 */

(() => {
  let hasInjected = false;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderThreatWarning(scan) {
    if (hasInjected) return;
    hasInjected = true;

    const isDangerous = scan.riskCategory === "Dangerous";
    const headerColor = isDangerous ? "#f43f5e" : "#f59e0b";
    const badgeText = isDangerous ? "MALICIOUS C2 / DGA THREAT" : "SUSPICIOUS WEBSITE DETECTED";

    // Top warning banner container
    const overlay = document.createElement("div");
    overlay.id = "agnishield-threat-overlay";
    overlay.innerHTML = `
      <div class="agnishield-dialog">
        <div class="agnishield-header">
          <div class="agnishield-brand">
            <img src="${chrome.runtime.getURL("icons/icon48.png")}" class="agnishield-logo" alt="Logo" />
            <div>
              <div class="agnishield-title">AGNI<span>SHIELD</span> SENTINEL</div>
              <div class="agnishield-subtitle">Autonomous Neural Defense Engine</div>
            </div>
          </div>
          <span class="agnishield-badge" style="background: ${isDangerous ? 'rgba(244,63,94,0.2)' : 'rgba(245,158,11,0.2)'}; color: ${headerColor}; border: 1px solid ${headerColor}">
            ${badgeText}
          </span>
        </div>

        <div class="agnishield-body">
          <div class="agnishield-alert-box" style="border-left: 4px solid ${headerColor}">
            <p class="agnishield-headline">
              <strong>AgniShield intercepted an untrusted connection:</strong>
            </p>
            <p class="agnishield-url-text">${escapeHtml(scan.url)}</p>
            <div class="agnishield-stats">
              <div class="agnishield-stat-item">
                <span class="stat-label">Safety Score</span>
                <span class="stat-val" style="color: ${headerColor}">${escapeHtml(scan.safetyScore)}/100</span>
              </div>
              <div class="agnishield-stat-item">
                <span class="stat-label">C2 Verdict</span>
                <span class="stat-val">${escapeHtml(scan.c2Verdict)}</span>
              </div>
              <div class="agnishield-stat-item">
                <span class="stat-label">Model Engine</span>
                <span class="stat-val">200-Tree Random Forest</span>
              </div>
            </div>
          </div>

          <div class="agnishield-reasons">
            <div class="reasons-title">Forensic Indicators:</div>
            <ul>
              ${(scan.reasons || []).slice(0, 3).map((r) => `<li>• ${escapeHtml(r)}</li>`).join("")}
            </ul>
          </div>

          ${
            scan.mitreAttack
              ? `<div class="agnishield-mitre">
                  <span>MITRE ATT&CK:</span> <code>${escapeHtml(scan.mitreAttack)}</code>
                 </div>`
              : ""
          }
        </div>

        <div class="agnishield-footer">
          <button id="agnishield-leave-btn" class="agnishield-btn-primary">
            ← Take Me Back to Safety (Recommended)
          </button>
          <button id="agnishield-proceed-btn" class="agnishield-btn-secondary">
            Dismiss & Proceed at My Own Risk
          </button>
        </div>
      </div>
    `;

    document.documentElement.appendChild(overlay);

    // Event listeners
    document.getElementById("agnishield-leave-btn").addEventListener("click", () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = "about:blank";
      }
    });

    document.getElementById("agnishield-proceed-btn").addEventListener("click", () => {
      overlay.style.opacity = "0";
      overlay.style.transition = "opacity 0.25s ease";
      setTimeout(() => overlay.remove(), 250);
    });
  }

  // Listen for broadcast messages from background service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "AGNISHIELD_THREAT_DETECTED" && message.scan) {
      renderThreatWarning(message.scan);
    }
  });

  // Also query status on document load
  chrome.runtime.sendMessage({ type: "GET_TAB_THREAT_STATUS", url: window.location.href }, (res) => {
    if (res && res.scan && res.scan.riskCategory === "Dangerous") {
      renderThreatWarning(res.scan);
    }
  });
})();
