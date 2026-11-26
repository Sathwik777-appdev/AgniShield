import {
  AlertCircle,
  ArrowRight,
  Fingerprint,
  Globe,
  Lock,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { validateUrl } from '../services/scanService';
import type { PageView } from '../types/scan';

interface LandingPageProps {
  onScanFromHero: (url: string) => void;
  onNavigate: (page: PageView) => void;
}

const TRUST_CARDS = [
  {
    title: 'Instant Analysis',
    description:
      'Live DNS lookups, TLS handshakes, and global lexical scanning completed in seconds.',
    Icon: Zap,
    iconBg: 'bg-cyan-500/10 border-cyan-500/20 text-[#00f0ff]',
    cardHover: 'hover:border-cyan-500/40',
    titleHover: 'group-hover:text-[#00f0ff]',
  },
  {
    title: 'Deep Heuristics',
    description:
      'Multi-layer inspection beyond blacklists using our 200-tree Random Forest & MITRE ATT&CK engine.',
    Icon: Fingerprint,
    iconBg: 'bg-purple-500/10 border-purple-500/20 text-[#9d00ff]',
    cardHover: 'hover:border-purple-500/40',
    titleHover: 'group-hover:text-purple-400',
  },
  {
    title: 'Privacy First',
    description:
      'Encrypted scanning workflow ensures anonymous queries with 1-click IOC blocklist export.',
    Icon: Lock,
    iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-[#00ff88]',
    cardHover: 'hover:border-emerald-500/40',
    titleHover: 'group-hover:text-[#00ff88]',
  },
];

export function LandingPage({
  onScanFromHero,
  onNavigate,
}: LandingPageProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const validation = validateUrl(url);
    if (!validation.valid) {
      setError(validation.error || 'Please enter a valid URL.');
      return;
    }
    setError(null);
    onScanFromHero(url);
  };

  return (
    <div className="flex-1 flex flex-col justify-between relative">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:py-12 text-center max-w-7xl mx-auto w-full">
        {/* Display Headline */}
        <h1
          className="text-5xl md:text-7xl font-bold text-white tracking-tight mb-5 leading-[1.08]"
          style={{ fontFamily: "'Times New Roman', Times, serif" }}
        >
          WEBSITE <br />
          <span>SAFETY CHECKER</span>
        </h1>

        <p className="max-w-2xl text-gray-400 text-base sm:text-lg mb-8 font-medium leading-relaxed">
          Instantly analyze any URL for phishing, C2 beaconing, DGA domains, and
          security vulnerabilities using our neural threat engine. Get a
          detailed safety score in seconds.
        </p>

        {/* URL Scanner Input Area */}
        <div className="w-full max-w-3xl relative">
          <form
            onSubmit={handleSubmit}
            className="relative flex flex-col md:flex-row gap-3 p-2 bg-[#090d16] border border-white/[0.09] rounded-md shadow-2xl"
          >
            <div className="relative flex-1 flex items-center px-4 py-3 bg-[#05070d] rounded-sm border border-white/[0.06] focus-within:border-[#00f0ff]">
              <Globe className="text-gray-400 w-5 h-5 mr-3 shrink-0" />
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="https://enter-website-url.com/scan"
                className="w-full bg-transparent text-white placeholder-gray-500 border-none focus:outline-none focus:ring-0 text-base font-mono"
              />
            </div>
            <button
              type="submit"
              className="bg-white text-neutral-950 font-semibold text-sm sm:text-base px-7 py-3 rounded flex items-center justify-center gap-2 hover:bg-neutral-200 transition-colors active:scale-[0.98] group/btn cursor-pointer shrink-0 shadow-sm"
            >
              <span>Analyze URL</span>
              <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
            </button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-rose-400 flex items-center justify-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          )}

          {/* Description Overlay + Quick Navigation */}
          <p className="mt-4 text-xs text-gray-500 font-mono tracking-wide uppercase">
            Click anywhere to randomize 3D environmental vectors
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-5 text-xs text-gray-400">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="hover:text-[#00f0ff] transition-colors underline-offset-4 hover:underline cursor-pointer"
            >
              Open Security Dashboard
            </button>
            <span className="text-white/20">•</span>
            <button
              type="button"
              onClick={() => onNavigate('scanner')}
              className="hover:text-[#00f0ff] transition-colors underline-offset-4 hover:underline cursor-pointer"
            >
              Advanced URL Telemetry Scanner
            </button>
            <span className="text-white/20">•</span>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="hover:text-[#00f0ff] transition-colors underline-offset-4 hover:underline cursor-pointer"
            >
              View Scan History
            </button>
          </div>
        </div>

        {/* Safety Cards Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
          {TRUST_CARDS.map(({ title, description, Icon, iconBg, cardHover, titleHover }) => (
            <div
              key={title}
              className={`bg-[#090d16] p-6 rounded-md border border-white/[0.08] text-left transition-all hover:border-white/20 ${cardHover}`}
            >
              <div
                className={`w-9 h-9 rounded-sm flex items-center justify-center mb-4 border ${iconBg}`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <h3
                className={`text-base font-bold mb-1.5 text-white transition-colors ${titleHover}`}
              >
                {title}
              </h3>
              <p className="text-gray-400 text-xs leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 sm:px-8 py-8 border-t border-white/10 text-xs text-gray-400 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-white font-semibold">
          <ShieldCheck className="w-4 h-4 text-[#00f0ff]" />
          <span>CYBERGUARD / AGNISHIELD</span>
        </div>
        <p>Powered by 200-Tree Random Forest C2 Classifier &amp; Live DNS Telemetry</p>
        <p>© 2026 AgniShield Security Labs</p>
      </footer>
    </div>
  );
}
