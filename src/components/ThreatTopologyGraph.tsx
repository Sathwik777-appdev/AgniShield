import React, { useEffect, useRef, useState } from 'react';
import type { ScanResult } from '../types/scan';

interface ThreatTopologyGraphProps {
  recentScans: ScanResult[];
  onSelectScan?: (scan: ScanResult) => void;
}

interface GraphNode {
  id: string;
  label: string;
  fullDomain: string;
  type: 'hub' | 'safe' | 'suspicious' | 'dangerous';
  score: number;
  count: number;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  radius: number;
  scanData?: ScanResult;
}

interface GraphLink {
  targetId: string;
  status: 'safe' | 'suspicious' | 'dangerous';
  pulse: number;
  speed: number;
  curveOffset: number;
}

function extractDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase() || rawUrl;
  } catch {
    return rawUrl.replace(/^https?:\/\//i, '').split('/')[0] || rawUrl;
  }
}

export const ThreatTopologyGraph: React.FC<ThreatTopologyGraphProps> = ({
  recentScans,
  onSelectScan,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoveredNodeRef = useRef<GraphNode | null>(null);
  const onSelectScanRef = useRef(onSelectScan);
  useEffect(() => {
    onSelectScanRef.current = onSelectScan;
  }, [onSelectScan]);

  const [hoveredInfo, setHoveredInfo] = useState<GraphNode | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<
    'all' | 'safe' | 'suspicious' | 'dangerous'
  >('all');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const height = 430;
    let width = canvas.parentElement?.clientWidth || 760;

    const setupSize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.parentElement.clientWidth;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setupSize();

    // Deduplicate scans by domain so repeated scans don't clutter the topology
    const sourceScans: ScanResult[] =
      recentScans.length > 0
        ? recentScans
        : ([
            { id: 'demo-1', url: 'https://github.com', safetyScore: 98, riskCategory: 'Safe', c2Verdict: 'No C2 Activity' },
            { id: 'demo-2', url: 'https://google.com', safetyScore: 96, riskCategory: 'Safe', c2Verdict: 'No C2 Activity' },
            { id: 'demo-3', url: 'https://cloudflare.com', safetyScore: 94, riskCategory: 'Safe', c2Verdict: 'No C2 Activity' },
            { id: 'demo-4', url: 'https://secure-login-verify.example.com', safetyScore: 44, riskCategory: 'Suspicious', c2Verdict: 'Potential C2 Beaconing' },
            { id: 'demo-5', url: 'http://bit.ly/free-bank-claim', safetyScore: 26, riskCategory: 'Dangerous', c2Verdict: 'High-Confidence C2 / DGA' },
            { id: 'demo-6', url: 'https://x9k2m7q8z4v1p3w6.xyz', safetyScore: 19, riskCategory: 'Dangerous', c2Verdict: 'High-Confidence C2 / DGA' },
          ] as unknown as ScanResult[]);

    const deduped = new Map<string, { scan: ScanResult; count: number }>();
    for (const scan of sourceScans) {
      const domain = extractDomain(scan.url);
      const existing = deduped.get(domain);
      if (!existing) {
        deduped.set(domain, { scan, count: 1 });
      } else {
        existing.count += 1;
      }
    }

    const uniqueEntries = Array.from(deduped.entries()).slice(0, 14);
    const cx = width / 2;
    const cy = height / 2;

    const nodes: GraphNode[] = [
      {
        id: 'AGNISHIELD_CORE',
        label: 'AgniShield Engine',
        fullDomain: '200-Tree RF Core',
        type: 'hub',
        score: 100,
        count: uniqueEntries.length,
        x: cx,
        y: cy,
        homeX: cx,
        homeY: cy,
        vx: 0,
        vy: 0,
        radius: 22,
      },
    ];

    // Arrange nodes in clean elliptical tiers by risk level so labels never collide
    const tierRadii: Record<'dangerous' | 'suspicious' | 'safe', number> = {
      dangerous: 0.48,
      suspicious: 0.72,
      safe: 0.92,
    };

    const count = uniqueEntries.length;
    uniqueEntries.forEach(([domain, { scan, count: scanCount }], i) => {
      const category = (scan.riskCategory || 'Safe').toLowerCase() as
        | 'safe'
        | 'suspicious'
        | 'dangerous';
      const angle = (i / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
      const tierScale = tierRadii[category] ?? 0.85;
      const rx = Math.min(width * 0.38, 300) * tierScale;
      const ry = Math.min(height * 0.36, 155) * tierScale;

      const hx = cx + Math.cos(angle) * rx;
      const hy = cy + Math.sin(angle) * ry;

      nodes.push({
        id: scan.id || `node-${i}`,
        label: domain.length > 22 ? `${domain.slice(0, 19)}…` : domain,
        fullDomain: domain,
        type: category,
        score: scan.safetyScore ?? 85,
        count: scanCount,
        x: hx,
        y: hy,
        homeX: hx,
        homeY: hy,
        vx: 0,
        vy: 0,
        radius: category === 'dangerous' ? 14 : category === 'suspicious' ? 12 : 10,
        scanData: scan,
      });
    });

    const links: GraphLink[] = nodes
      .filter((n) => n.type !== 'hub')
      .map((n, idx) => ({
        targetId: n.id,
        status: n.type as 'safe' | 'suspicious' | 'dangerous',
        pulse: (idx * 0.19) % 1,
        speed: n.type === 'dangerous' ? 0.014 : n.type === 'suspicious' ? 0.01 : 0.007,
        curveOffset: (idx % 2 === 0 ? 1 : -1) * 22,
      }));

    const handleResize = () => {
      setupSize();
      nodes[0].homeX = width / 2;
      nodes[0].homeY = height / 2;
    };
    window.addEventListener('resize', handleResize);

    let draggingNode: GraphNode | null = null;
    let dragMoved = false;

    const getPos = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const findNodeAt = (mx: number, my: number): GraphNode | null => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (
          node.type !== 'hub' &&
          selectedCategory !== 'all' &&
          node.type !== selectedCategory
        ) {
          continue;
        }
        const dx = node.x - mx;
        const dy = node.y - my;
        if (Math.hypot(dx, dy) <= node.radius + 8) {
          return node;
        }
      }
      return null;
    };

    const handleMouseDown = (e: MouseEvent) => {
      const { x, y } = getPos(e);
      const hit = findNodeAt(x, y);
      if (hit && hit.type !== 'hub') {
        draggingNode = hit;
        dragMoved = false;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const { x, y } = getPos(e);
      if (draggingNode) {
        dragMoved = true;
        draggingNode.x = Math.max(40, Math.min(width - 40, x));
        draggingNode.y = Math.max(36, Math.min(height - 42, y));
        draggingNode.homeX = draggingNode.x;
        draggingNode.homeY = draggingNode.y;
        return;
      }

      const found = findNodeAt(x, y);
      if (hoveredNodeRef.current?.id !== found?.id) {
        hoveredNodeRef.current = found;
        setHoveredInfo(found ? { ...found } : null);
      }
      canvas.style.cursor = found && found.type !== 'hub' ? 'pointer' : 'default';
    };

    const handleMouseUp = () => {
      if (draggingNode && !dragMoved && draggingNode.scanData && onSelectScanRef.current) {
        onSelectScanRef.current(draggingNode.scanData);
      } else if (!draggingNode && hoveredNodeRef.current?.scanData && onSelectScanRef.current) {
        onSelectScanRef.current(hoveredNodeRef.current.scanData);
      }
      draggingNode = null;
    };

    const handleMouseLeave = () => {
      draggingNode = null;
      hoveredNodeRef.current = null;
      setHoveredInfo(null);
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    const COLORS = {
      hub: '#e2e8f0',
      safe: '#10b981',
      suspicious: '#f59e0b',
      dangerous: '#f43f5e',
    };

    let time = 0;
    let animId: number;

    const render = () => {
      time += 0.015;
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      nodes[0].x = centerX;
      nodes[0].y = centerY;

      // Subtle spring toward home + gentle node-node repulsion to prevent label overlap
      for (let i = 1; i < nodes.length; i++) {
        const n = nodes[i];
        if (draggingNode?.id === n.id) continue;

        const targetX = n.homeX + Math.sin(time + i * 1.1) * 4;
        const targetY = n.homeY + Math.cos(time + i * 1.3) * 4;
        n.vx += (targetX - n.x) * 0.04;
        n.vy += (targetY - n.y) * 0.04;

        for (let j = 1; j < nodes.length; j++) {
          if (i === j) continue;
          const other = nodes[j];
          const dx = n.x - other.x;
          const dy = n.y - other.y;
          const dist = Math.hypot(dx, dy) || 1;
          const minDist = 78;
          if (dist < minDist) {
            const push = ((minDist - dist) / minDist) * 0.65;
            n.vx += (dx / dist) * push;
            n.vy += (dy / dist) * push;
          }
        }

        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x = Math.max(48, Math.min(width - 48, n.x + n.vx));
        n.y = Math.max(36, Math.min(height - 44, n.y + n.vy));
      }

      // Draw subtle concentric elliptical telemetry rings
      ctx.save();
      ctx.lineWidth = 1;
      [0.48, 0.72, 0.92].forEach((scale, idx) => {
        const rx = Math.min(width * 0.38, 300) * scale;
        const ry = Math.min(height * 0.36, 155) * scale;
        ctx.strokeStyle =
          idx === 0
            ? 'rgba(244, 63, 94, 0.12)'
            : idx === 1
            ? 'rgba(245, 158, 11, 0.10)'
            : 'rgba(148, 163, 184, 0.10)';
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.restore();

      // Draw curved quadratic Bezier links & animated telemetry pulses
      for (const link of links) {
        const target = nodes.find((n) => n.id === link.targetId);
        if (!target) continue;
        if (selectedCategory !== 'all' && target.type !== selectedCategory) continue;

        const isHovered = hoveredNodeRef.current?.id === target.id;
        const mx = (centerX + target.x) / 2;
        const my = (centerY + target.y) / 2;
        const dx = target.x - centerX;
        const dy = target.y - centerY;
        const len = Math.hypot(dx, dy) || 1;
        const cpx = mx + (-dy / len) * link.curveOffset;
        const cpy = my + (dx / len) * link.curveOffset;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.quadraticCurveTo(cpx, cpy, target.x, target.y);
        ctx.strokeStyle =
          target.type === 'dangerous'
            ? isHovered
              ? 'rgba(244, 63, 94, 0.85)'
              : 'rgba(244, 63, 94, 0.35)'
            : target.type === 'suspicious'
            ? isHovered
              ? 'rgba(245, 158, 11, 0.85)'
              : 'rgba(245, 158, 11, 0.32)'
            : isHovered
            ? 'rgba(16, 185, 129, 0.75)'
            : 'rgba(16, 185, 129, 0.24)';
        ctx.lineWidth = isHovered ? 2 : 1.1;
        ctx.stroke();

        // Point along quadratic Bezier at t = link.pulse
        link.pulse = (link.pulse + link.speed) % 1;
        const t = link.pulse;
        const omt = 1 - t;
        const px = omt * omt * centerX + 2 * omt * t * cpx + t * t * target.x;
        const py = omt * omt * centerY + 2 * omt * t * cpy + t * t * target.y;

        ctx.beginPath();
        ctx.arc(px, py, target.type === 'dangerous' ? 2.8 : 2, 0, Math.PI * 2);
        ctx.fillStyle = COLORS[target.type];
        ctx.fill();
      }

      // Draw Nodes
      for (const node of nodes) {
        if (
          node.type !== 'hub' &&
          selectedCategory !== 'all' &&
          node.type !== selectedCategory
        ) {
          continue;
        }

        const isHub = node.type === 'hub';
        const isHovered = hoveredNodeRef.current?.id === node.id;
        const baseColor = COLORS[node.type];

        // Soft halo
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + (isHovered ? 7 : 4), 0, Math.PI * 2);
        ctx.fillStyle = isHub
          ? 'rgba(255, 255, 255, 0.08)'
          : node.type === 'dangerous'
          ? 'rgba(244, 63, 94, 0.16)'
          : node.type === 'suspicious'
          ? 'rgba(245, 158, 11, 0.15)'
          : 'rgba(16, 185, 129, 0.13)';
        ctx.fill();

        // Node fill
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        if (isHub) {
          ctx.fillStyle = '#0f172a';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#e2e8f0';
          ctx.stroke();
        } else {
          ctx.fillStyle = baseColor;
          ctx.fill();
          ctx.lineWidth = isHovered ? 2.2 : 1.2;
          ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.7)';
          ctx.stroke();
        }

        // Hub inner shield glyph / score inside node
        ctx.fillStyle = isHub ? '#f8fafc' : '#050505';
        ctx.font = isHub ? 'bold 10px ui-monospace, monospace' : 'bold 9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isHub ? 'RF' : String(node.score), node.x, node.y + 0.5);

        // Domain label below node
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = isHovered ? '#ffffff' : '#cbd5e1';
        ctx.font = isHub
          ? '600 11px system-ui, -apple-system, sans-serif'
          : '500 10.5px system-ui, -apple-system, sans-serif';
        const labelText =
          !isHub && node.count > 1 ? `${node.label} ×${node.count}` : node.label;
        ctx.fillText(labelText, node.x, node.y + node.radius + 14);
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [recentScans, selectedCategory]);

  return (
    <div className="relative w-full rounded-2xl bg-[#070a12]/90 border border-white/10 overflow-hidden shadow-xl p-4">
      {/* Top Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2.5 border-b border-white/[0.07]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
            C2 &amp; Domain Threat Topology
          </h4>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          {(['all', 'dangerous', 'suspicious', 'safe'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedCategory(filter)}
              className={`px-2.5 py-1 rounded-lg capitalize transition-colors cursor-pointer ${
                selectedCategory === filter
                  ? filter === 'dangerous'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : filter === 'suspicious'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : filter === 'safe'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-white/15 text-white border border-white/25'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Canvas */}
      <div className="relative w-full h-[430px]">
        <canvas ref={canvasRef} className="block w-full h-full" />

        {/* Floating Hover Inspector */}
        {hoveredInfo && hoveredInfo.type !== 'hub' && (
          <div className="pointer-events-none absolute top-3 left-3 max-w-xs rounded-xl bg-black/85 backdrop-blur-md border border-white/15 px-3.5 py-2.5 text-xs shadow-2xl space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-white truncate">
                {hoveredInfo.fullDomain}
              </span>
              <span className="font-mono font-bold text-slate-200 shrink-0">
                {hoveredInfo.score}/100
              </span>
            </div>
            {hoveredInfo.scanData && (
              <div className="text-[11px] font-mono text-slate-400 space-y-0.5">
                <div>Verdict: {hoveredInfo.scanData.c2Verdict}</div>
                {hoveredInfo.scanData.domainInfo?.ipAddress && (
                  <div>IP: {hoveredInfo.scanData.domainInfo.ipAddress}</div>
                )}
                <div className="text-slate-300 pt-0.5">
                  Click node to inspect full report • Drag to reposition
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-white/[0.07] text-[10px] text-slate-400 font-mono">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
            RF Core Engine
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            Safe (Outer Tier)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            Suspicious (Mid Tier)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            Dangerous / C2 (Inner Alert Tier)
          </span>
        </div>
        <span className="text-slate-500">
          Deduplicated by host • Drag nodes or click to inspect
        </span>
      </div>
    </div>
  );
};
