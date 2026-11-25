import { History, LayoutDashboard, Search, ShieldCheck } from 'lucide-react';
import type { PageView } from '../types/scan';

interface SidebarProps {
  activePage: PageView;
  onNavigate: (page: PageView) => void;
}

const SIDEBAR_ITEMS: {
  id: PageView;
  label: string;
  Icon: typeof LayoutDashboard;
}[] = [
  { id: 'dashboard', label: 'Security Dashboard', Icon: LayoutDashboard },
  { id: 'scanner', label: 'Website Scanner', Icon: Search },
  { id: 'history', label: 'Scan History', Icon: History },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-white/10 bg-[#050505]/70 backdrop-blur-xl min-h-[calc(100vh-5rem)] p-4 justify-between">
      <div className="space-y-1.5">
        <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Security Workspace
        </p>
        {SIDEBAR_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activePage === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/15 text-[#00f0ff] border border-cyan-500/35 shadow-[0_0_15px_rgba(0,240,255,0.12)]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon
                className={`w-4 h-4 ${
                  isActive ? 'text-[#00f0ff]' : 'text-gray-500'
                }`}
              />
              {label}
            </button>
          );
        })}
      </div>

      <div className="glass rounded-xl p-4 space-y-2 border-emerald-500/25 bg-emerald-500/[0.04]">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#00ff88]">
          <ShieldCheck className="w-4 h-4 text-[#00ff88]" />
          Live Defense Engine
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          Powered by 200-tree scikit-learn Random Forest, live DNS &amp; TLS telemetry, and MITRE ATT&amp;CK C2 mapping.
        </p>
      </div>
    </aside>
  );
}
