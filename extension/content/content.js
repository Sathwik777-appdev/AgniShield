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

  const LOGO_DATA_URI = "data:image/png;base64,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";

  function renderThreatWarning(scan) {
    if (hasInjected) return;
    // Strict guard: Only Dangerous sites display the full-screen modal
    if (!scan || scan.riskCategory !== "Dangerous") return;
    hasInjected = true;

    const isDangerous = true;
    const headerColor = "#f43f5e";
    const badgeText = "MALICIOUS C2 / DGA THREAT";

    // Top warning banner container
    const overlay = document.createElement("div");
    overlay.id = "agnishield-threat-overlay";
    overlay.innerHTML = `
      <div class="agnishield-dialog">
        <div class="agnishield-header">
          <div class="agnishield-brand">
            <img src="${LOGO_DATA_URI}" class="agnishield-logo" alt="AgniShield Logo" />
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
