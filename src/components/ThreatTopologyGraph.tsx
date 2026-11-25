import React, { useEffect, useRef, useState } from 'react';
import type { ScanResult } from '../types/scan';

interface ThreatTopologyGraphProps {
  recentScans: ScanResult[];
  onSelectScan?: (scan: ScanResult) => void;
}

interface Node {
  id: string;
  label: string;
  type: 'hub' | 'safe' | 'suspicious' | 'dangerous';
  score: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  scanData?: ScanResult;
}

interface Link {
  source: string;
  target: string;
  status: 'safe' | 'suspicious' | 'dangerous';
  pulse: number;
}

export const ThreatTopologyGraph: React.FC<ThreatTopologyGraphProps> = ({
  recentScans,
  onSelectScan,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'safe' | 'suspicious' | 'dangerous'>('all');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 700);
    let height = (canvas.height = 420);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = 420;
    };
    window.addEventListener('resize', handleResize);

    // Build Nodes & Links
    const nodes: Node[] = [
      {
        id: 'AGNISHIELD_CORE',
        label: 'AgniShield Core',
        type: 'hub',
        score: 100,
        x: width / 2,
        y: height / 2,
        vx: 0,
        vy: 0,
        radius: 24,
      },
    ];

    // Build scan nodes or fallback rich network nodes
    const scansToDisplay = recentScans.length > 0 ? recentScans.slice(0, 10) : [
      { id: '1', url: 'https://github.com', safetyScore: 98, riskCategory: 'Safe' },
      { id: '2', url: 'https://google.com', safetyScore: 96, riskCategory: 'Safe' },
      { id: '3', url: 'https://cloudflare.com', safetyScore: 94, riskCategory: 'Safe' },
      { id: '4', url: 'http://bit.ly/free-bank-claim', safetyScore: 28, riskCategory: 'Dangerous' },
      { id: '5', url: 'https://secure-login-verify.example.com', safetyScore: 42, riskCategory: 'Suspicious' },
      { id: '6', url: 'https://aws.amazon.com', safetyScore: 92, riskCategory: 'Safe' },
      { id: '7', url: 'http://185.220.101.5/beacon', safetyScore: 12, riskCategory: 'Dangerous' },
    ] as unknown as ScanResult[];

    const count = scansToDisplay.length;
    scansToDisplay.forEach((scan, i) => {
      const angle = (i / count) * Math.PI * 2;
      const dist = 125 + (i % 2) * 45;
      const category = (scan.riskCategory || 'Safe').toLowerCase() as 'safe' | 'suspicious' | 'dangerous';

      try {
        const domain = new URL(scan.url).hostname || scan.url;
        nodes.push({
          id: scan.id || `node-${i}`,
          label: domain.length > 22 ? domain.slice(0, 20) + '…' : domain,
          type: category,
          score: scan.safetyScore ?? 85,
          x: width / 2 + Math.cos(angle) * dist,
          y: height / 2 + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          radius: category === 'dangerous' ? 15 : category === 'suspicious' ? 13 : 11,
          scanData: scan,
        });
      } catch {
        nodes.push({
          id: scan.id || `node-${i}`,
          label: scan.url.slice(0, 18),
          type: category,
          score: scan.safetyScore ?? 80,
          x: width / 2 + Math.cos(angle) * dist,
          y: height / 2 + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          radius: 12,
          scanData: scan,
        });
      }
    });

    const links: Link[] = nodes
      .filter((n) => n.id !== 'AGNISHIELD_CORE')
      .map((n) => ({
        source: 'AGNISHIELD_CORE',
        target: n.id,
        status: n.type as 'safe' | 'suspicious' | 'dangerous',
        pulse: Math.random(),
      }));

    // Mouse interactions
    let mouseX = -1000;
    let mouseY = -1000;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;

      let found: Node | null = null;
      for (const node of nodes) {
        const dx = node.x - mouseX;
        const dy = node.y - mouseY;
        if (Math.sqrt(dx * dx + dy * dy) < node.radius + 6) {
          found = node;
          break;
        }
      }
      setHoveredNode(found);
      canvas.style.cursor = found && found.type !== 'hub' ? 'pointer' : 'default';
    };

    const handleClick = () => {
      if (hoveredNode && hoveredNode.scanData && onSelectScan) {
        onSelectScan(hoveredNode.scanData);
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    // Animation Loop
    let time = 0;
    const render = () => {
      time += 0.02;
      ctx.clearRect(0, 0, width, height);

      // Keep Hub Centered
      nodes[0].x = width / 2;
      nodes[0].y = height / 2;

      // Particle physics & floating drift
      for (let i = 1; i < nodes.length; i++) {
        const node = nodes[i];
        node.x += Math.sin(time + i) * 0.35;
        node.y += Math.cos(time + i * 1.5) * 0.35;

        // Keep inside bounds
        node.x = Math.max(30, Math.min(width - 30, node.x));
        node.y = Math.max(30, Math.min(height - 30, node.y));
      }

      // Draw Grid / Radar circles
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      ctx.lineWidth = 1;
      [80, 140, 200].forEach((r) => {
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Rotating radar beam line
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
      ctx.beginPath();
      ctx.moveTo(width / 2, height / 2);
      ctx.lineTo(
        width / 2 + Math.cos(time * 0.8) * 210,
        height / 2 + Math.sin(time * 0.8) * 210
      );
      ctx.stroke();
      ctx.restore();

      // Draw Links
      links.forEach((link) => {
        const targetNode = nodes.find((n) => n.id === link.target);
        if (!targetNode) return;

        if (selectedCategory !== 'all' && targetNode.type !== selectedCategory) {
          return;
        }

        const isThreat = targetNode.type === 'dangerous';
        const isSuspicious = targetNode.type === 'suspicious';
        const strokeColor = isThreat
          ? 'rgba(244, 63, 94, 0.45)'
          : isSuspicious
          ? 'rgba(245, 158, 11, 0.4)'
          : 'rgba(16, 185, 129, 0.3)';

        ctx.beginPath();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isThreat ? 2 : 1;
        if (isThreat) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.moveTo(width / 2, height / 2);
        ctx.lineTo(targetNode.x, targetNode.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Animated packet signal along the line
        link.pulse = (link.pulse + 0.015) % 1;
        const px = width / 2 + (targetNode.x - width / 2) * link.pulse;
        const py = height / 2 + (targetNode.y - height / 2) * link.pulse;

        ctx.beginPath();
        ctx.arc(px, py, isThreat ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = isThreat ? '#f43f5e' : isSuspicious ? '#fbbf24' : '#34d399';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Draw Nodes
      nodes.forEach((node) => {
        if (node.type !== 'hub' && selectedCategory !== 'all' && node.type !== selectedCategory) {
          return;
        }

        const isHub = node.type === 'hub';
        const isDangerous = node.type === 'dangerous';
        const isSuspicious = node.type === 'suspicious';
        const isHovered = hoveredNode?.id === node.id;

        // Outer glow
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + (isHovered ? 6 : 2), 0, Math.PI * 2);
        if (isHub) {
          ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
        } else if (isDangerous) {
          ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
        } else if (isSuspicious) {
          ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        } else {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
        }
        ctx.fill();

        // Node Body
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        if (isHub) {
          const grad = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, node.radius);
          grad.addColorStop(0, '#00f0ff');
          grad.addColorStop(1, '#0284c7');
          ctx.fillStyle = grad;
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 15;
        } else if (isDangerous) {
          ctx.fillStyle = '#f43f5e';
          ctx.shadowColor = '#f43f5e';
          ctx.shadowBlur = 12;
        } else if (isSuspicious) {
          ctx.fillStyle = '#f59e0b';
          ctx.shadowColor = '#f59e0b';
          ctx.shadowBlur = 10;
        } else {
          ctx.fillStyle = '#10b981';
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 8;
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border ring
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = isHovered ? 2.5 : 1.2;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#f1f5f9';
        ctx.font = isHub ? 'bold 11px sans-serif' : '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + node.radius + 14);

        if (!isHub) {
          ctx.fillStyle = isDangerous ? '#fca5a5' : isSuspicious ? '#fde68a' : '#a7f3d0';
          ctx.font = '9px monospace';
          ctx.fillText(`Score ${node.score}`, node.x, node.y + node.radius + 25);
        }
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [recentScans, selectedCategory, onSelectScan, hoveredNode]);

  return (
    <div className="relative w-full rounded-2xl bg-slate-950/80 border border-slate-800/80 overflow-hidden shadow-2xl p-4">
      {/* Top Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 font-mono">
            Interactive C2 & Threat Topology Graph
          </h4>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          {(['all', 'dangerous', 'suspicious', 'safe'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedCategory(filter)}
              className={`px-2.5 py-1 rounded-lg capitalize transition-all cursor-pointer ${
                selectedCategory === filter
                  ? filter === 'dangerous'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                    : filter === 'suspicious'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                    : filter === 'safe'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.3)]'
                  : 'text-slate-400 hover:text-white bg-slate-900/60 border border-transparent'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full h-[420px]">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Floating Tooltip if Hovered */}
        {hoveredNode && hoveredNode.type !== 'hub' && (
          <div
            className="absolute z-20 pointer-events-none p-3 rounded-xl bg-slate-900/95 border border-cyan-500/40 backdrop-blur-md shadow-2xl text-left"
            style={{
              left: Math.min(Math.max(10, hoveredNode.x - 70), 450),
              top: Math.max(10, hoveredNode.y - 85),
            }}
          >
            <p className="text-xs font-bold text-white truncate max-w-[200px]">
              {hoveredNode.scanData?.url || hoveredNode.label}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                  hoveredNode.type === 'dangerous'
                    ? 'bg-rose-500/20 text-rose-400'
                    : hoveredNode.type === 'suspicious'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}
              >
                {hoveredNode.type}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Safety: {hoveredNode.score}/100
              </span>
            </div>
            <p className="text-[9px] text-cyan-400/80 mt-1">Click to view full inspection</p>
          </div>
        )}
      </div>

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60 mt-1 font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f0ff]" /> Central Neural Engine
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Benign
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Suspicious DGA
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Active C2 Beacon
          </span>
        </div>
        <span className="text-[10px] text-cyan-400/80">Real-time force-directed topology</span>
      </div>
    </div>
  );
};
