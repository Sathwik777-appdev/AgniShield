import { useEffect, useMemo, useState } from 'react';
import { DashboardStats } from './components/DashboardStats';
import { LandingPage } from './components/LandingPage';
import { Navbar } from './components/Navbar';
import { ScanHistory } from './components/ScanHistory';
import { TubesBackground } from './components/TubesBackground';
import { URLScanner } from './components/URLScanner';
import {
  computeDashboardStats,
  fetchHistoricalAudits,
  getInitialDemoHistory,
  scanWebsite,
  type TelemetryPreset,
} from './services/scanService';
import type { PageView, ScanResult } from './types/scan';

export function App() {
  const [activePage, setActivePage] = useState<PageView>('landing');
  const [scanHistory, setScanHistory] = useState<ScanResult[]>(() =>
    getInitialDemoHistory()
  );
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(
    () => scanHistory[0] ?? null
  );
  const [isScanning, setIsScanning] = useState(false);

  // Load previous persistent audits from PostgreSQL (Docker) on startup
  useEffect(() => {
    void fetchHistoricalAudits().then((audits) => {
      if (audits.length > 0) {
        setScanHistory(audits);
        setSelectedResult((prev) => prev ?? audits[0]);
      }
    });
  }, []);

  const dashboardStats = useMemo(
    () => computeDashboardStats(scanHistory),
    [scanHistory]
  );

  const handleScan = async (
    url: string,
    preset: TelemetryPreset = 'auto'
  ): Promise<ScanResult> => {
    setIsScanning(true);
    try {
      const [result] = await Promise.all([
        scanWebsite(url, preset),
        new Promise((resolve) => setTimeout(resolve, 7000)),
      ]);
      setScanHistory((prev) => [result, ...prev]);
      setSelectedResult(result);
      return result;
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanFromHero = (url: string) => {
    setActivePage('scanner');
    void handleScan(url);
  };

  const handleOpenResult = (result: ScanResult) => {
    setSelectedResult(result);
    setActivePage('scanner');
  };

  return (
    <div className="min-h-screen relative bg-[#050505] text-white flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 3D Cursor Tubes Background */}
      <TubesBackground />

      {/* Main Content Overlay */}
      <div className="content-overlay flex-1 flex flex-col min-h-screen z-10">
        <Navbar activePage={activePage} onNavigate={setActivePage} />

        {activePage === 'landing' ? (
          <main className="flex-1 flex flex-col">
            <LandingPage
              onScanFromHero={handleScanFromHero}
              onNavigate={setActivePage}
            />
          </main>
        ) : (
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {activePage === 'dashboard' && (
              <DashboardStats
                stats={dashboardStats}
                recentScans={scanHistory}
                onOpenResult={handleOpenResult}
                onGoToScanner={() => setActivePage('scanner')}
              />
            )}

            {activePage === 'scanner' && (
              <URLScanner
                onScan={handleScan}
                selectedResult={selectedResult}
                isScanning={isScanning}
              />
            )}

            {activePage === 'history' && (
              <ScanHistory
                items={scanHistory}
                onOpenResult={handleOpenResult}
              />
            )}
          </main>
        )}
      </div>
    </div>
  );
}

export default App;
