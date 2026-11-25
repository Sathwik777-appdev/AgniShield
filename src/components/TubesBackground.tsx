import { useEffect, useRef } from 'react';

interface TubesInstance {
  tubes?: {
    setColors?: (colors: string[]) => void;
    setLightsColors?: (colors: string[]) => void;
    setLightsIntensity?: (intensity: number) => void;
  };
  dispose?: () => void;
}

type TubesFactory = (
  canvas: HTMLCanvasElement,
  options?: {
    sleepRadiusX?: number;
    sleepRadiusY?: number;
    sleepTimeScale1?: number;
    sleepTimeScale2?: number;
    tubes?: {
      colors?: string[];
      lights?: {
        intensity?: number;
        colors?: string[];
      };
    };
  }
) => TubesInstance;

const NEON_PALETTES: string[][] = [
  ['#00f0ff', '#9d00ff', '#00ff88'],
  ['#00f0ff', '#3b82f6', '#a855f7'],
  ['#00ff88', '#00f0ff', '#22d3ee'],
  ['#ff00aa', '#00f0ff', '#9d00ff'],
  ['#38bdf8', '#818cf8', '#34d399'],
];

function getRandomBrightHex(count: number): string[] {
  const randomPalette =
    NEON_PALETTES[Math.floor(Math.random() * NEON_PALETTES.length)];
  if (Math.random() < 0.5 && randomPalette.length >= count) {
    return randomPalette.slice(0, count);
  }
  return Array.from({ length: count }, () => {
    const hue = Math.floor(Math.random() * 360);
    const sat = 90 + Math.floor(Math.random() * 10);
    const light = 52 + Math.floor(Math.random() * 14);
    const a = (sat * Math.min(light, 100 - light)) / 10000;
    const f = (n: number) => {
      const k = (n + hue / 30) % 12;
      const color = light / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color)
        .toString(16)
        .padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  });
}

export function TubesBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let instance: TubesInstance | null = null;

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.closest('button, a, input, select, textarea, label')
      ) {
        return;
      }
      if (!instance?.tubes) return;
      const newTubeColors = getRandomBrightHex(3);
      const newLightColors = [...newTubeColors, '#ffffff'];
      instance.tubes.setColors?.(newTubeColors);
      instance.tubes.setLightsColors?.(newLightColors);
    };

    const initTubes = async () => {
      try {
        const localSrc: string = '/vendor/tubes1.min.js';
        const mod = (await import(/* @vite-ignore */ localSrc)) as {
          default?: TubesFactory;
        };
        if (disposed || !mod.default || !canvasRef.current) return;

        instance = mod.default(canvasRef.current, {
          sleepRadiusX: 460,
          sleepRadiusY: 220,
          sleepTimeScale1: 0.9,
          sleepTimeScale2: 1.35,
          tubes: {
            colors: ['#00f0ff', '#9d00ff', '#00ff88'],
            lights: {
              intensity: 175,
              colors: ['#00f0ff', '#9d00ff', '#00ff88', '#ffffff'],
            },
          },
        });

        document.body.addEventListener('click', handleGlobalClick);
      } catch {
        // Fallback gracefully if WebGL or ES module loading fails
      }
    };

    void initTubes();

    return () => {
      disposed = true;
      document.body.removeEventListener('click', handleGlobalClick);
      try {
        instance?.dispose?.();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      id="tubes-canvas"
      aria-hidden="true"
      className="tubes-canvas opacity-85"
    />
  );
}
