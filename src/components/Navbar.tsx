import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import type { PageView } from '../types/scan';

interface NavbarProps {
  activePage: PageView;
  onNavigate: (page: PageView) => void;
}

const NAV_ITEMS: { id: PageView; label: string }[] = [
  { id: 'landing', label: 'Home' },
  { id: 'scanner', label: 'Scanner' },
  { id: 'dashboard', label: 'Threat Map' },
  { id: 'history', label: 'Scan History' },
];

export function Navbar({ activePage, onNavigate }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSelect = (page: PageView) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050505]/80 backdrop-blur-xl w-full">
      <div className="w-full px-6 sm:px-10 h-16 sm:h-20 flex items-center justify-between">
        {/* Brand - Placed at the edge with custom logo */}
        <button
          type="button"
          onClick={() => handleSelect('landing')}
          className="flex items-center gap-3.5 text-left group cursor-pointer"
        >
          <div className="relative w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center">
            <img
              src="/logo.png"
              alt="AgniShield Logo"
              className="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(0,240,255,0.65)] group-hover:drop-shadow-[0_0_20px_rgba(0,240,255,0.95)] transform group-hover:scale-105 transition-all duration-300"
            />
          </div>
          <span className="text-xl sm:text-2xl font-display font-extrabold tracking-tight text-white">
            AGNI<span className="text-[#00f0ff]">SHIELD</span>
          </span>
        </button>

        {/* Desktop Nav - Placed at the right */}
        <nav className="hidden md:flex items-center gap-4 lg:gap-6 text-sm font-medium text-gray-400">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`px-3 py-1.5 rounded-sm transition-all cursor-pointer font-mono text-xs uppercase tracking-wider ${
                  isActive
                    ? 'text-[#00f0ff] bg-cyan-500/15 border border-cyan-500/35'
                    : 'hover:text-[#00f0ff] hover:bg-white/5 border border-transparent'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="md:hidden p-2 rounded-sm text-gray-300 hover:text-white hover:bg-white/10"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#050505]/95 backdrop-blur-xl px-4 py-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full text-left px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-cyan-500/15 text-[#00f0ff] border border-cyan-500/30'
                    : 'text-gray-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
