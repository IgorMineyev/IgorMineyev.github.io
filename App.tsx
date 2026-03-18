import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Controls } from './components/Controls';
import { SpirographRenderer } from './components/SpirographRenderer';
import { SpiroConfig, Theme } from './types';
import { DEFAULT_CONFIG, LEVEL_CONFIG, DEFAULT_LEVEL, PRESET_COLORS, BACKGROUND_TEXTURE } from './constants';
import {
  Settings, X, Maximize, Minimize, ZoomIn, ZoomOut, Shuffle, Download,
  Infinity as InfinityIcon, Clock, FileText, Sun, Moon, Monitor,
  RotateCcw, Upload, Check, Link, LogOut
} from 'lucide-react';
import { SpiroLogo } from './components/SpiroLogo';

// Tiled backgrounds — same assets used by the Controls pane
import lightSettingsBg from './assets/bg.jpg';
import darkSettingsBg  from './assets/bg-dark.png';

// ── Custom Crossed-Infinity icon ───────────────────────────────────────────
const InfinityOff = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    className={className}
  >
    <path d="M12 12c-2-2.3-4-4-7-4a4 4 0 1 0 0 8c3 0 5-1.7 7-4m0 0c2 2.3 4 4 7 4a4 4 0 1 0 0-8c-3 0-5-1.7-7 4" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

// ── Global cursor helper ───────────────────────────────────────────────────
const toggleGlobalCursor = (hidden: boolean) => {
  const action = hidden ? 'add' : 'remove';
  document.documentElement.classList[action]('app-no-cursor');
  document.body.classList[action]('app-no-cursor');
  const styleId = 'force-cursor-none';
  const existingStyle = document.getElementById(styleId);
  if (hidden) {
    if (!existingStyle) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `*, *::before, *::after { cursor: none !important; }`;
      document.head.appendChild(style);
    }
  } else if (existingStyle) {
    existingStyle.remove();
  }
};

// ── Persistent CSS ─────────────────────────────────────────────────────────
const PERSISTENT_STYLES = `
    .force-cursor-visible, .force-cursor-visible * { cursor: default !important; }
    .force-cursor-visible button, .force-cursor-visible a, .force-cursor-visible [role="button"],
    .force-cursor-visible [role="slider"],
    .force-cursor-visible input { cursor: pointer !important; }

    input[type="number"].themed-spin::-webkit-inner-spin-button,
    input[type="number"].themed-spin::-webkit-outer-spin-button {
        opacity: 0.5;
        cursor: pointer;
        filter: invert(0.6) sepia(1) saturate(2) hue-rotate(180deg);
    }
    input[type="number"].themed-spin:hover::-webkit-inner-spin-button {
        opacity: 1;
    }

    html.screensaver-active,
    html.screensaver-active body,
    html.screensaver-active #root,
    html.screensaver-active :fullscreen,
    html.screensaver-active ::backdrop {
        background-color: #000000 !important;
        background: #000000 !important;
        overscroll-behavior: none !important;
        color-scheme: dark !important;
    }
`;

// ── Utility functions ──────────────────────────────────────────────────────
const calculateResponsiveLineWidth = (k: number, width: number, height: number) => {
  const minDim = Math.min(width, height);
  const targetVisualWidth = Math.max(1.1, minDim / 450);
  const computedLineWidth = targetVisualWidth / (k || 1);
  return Math.max(0.1, Math.min(30, computedLineWidth));
};

const generateRandomConfig = (currentTheme: Theme = 'light', level: number = DEFAULT_LEVEL): SpiroConfig => {
  let n, d;
  do {
    n = Math.floor(Math.random() * 99) + 2;
    d = Math.floor(Math.random() * 99) + 2;
  } while (n === d);
  const ratio = n / d;
  const outerRadius = Math.floor(60 + Math.random() * 50);
  const innerRadius = Math.floor(outerRadius * ratio);
  const penOffset = Math.floor(innerRadius * (0.4 + Math.random() * 0.8));
  const availableColors = PRESET_COLORS.filter(c => c !== (currentTheme === 'dark' ? '#000000' : '#ffffff'));
  const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];
  const levelCfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG[DEFAULT_LEVEL];
  const initialAngle = levelCfg.randomisesAngle ? (Math.random() * 360 - 180) : 0;
  return {
    ...DEFAULT_CONFIG,
    outerRadius, innerRadius, penOffset,
    statorAspect: 0.6 + Math.random() * 0.8,
    rotorAspect:  0.6 + Math.random() * 0.8,
    penColor: randomColor,
    showGears: true, speed: 1,
    numerator: n, denominator: d,
    initialAngle,
  };
};

const calculateOptimalScale = (cfg: SpiroConfig, width: number, height: number): number => {
  const R = cfg.outerRadius; const r = cfg.innerRadius; const d = cfg.penOffset;
  const sAspect = cfg.statorAspect || 1; const rAspect = cfg.rotorAspect || 1;
  const maxR = R * Math.max(1, sAspect); const maxr = r * Math.max(1, rAspect);
  const centerDist = Math.abs(R - r); const traceExtent = centerDist + d;
  const gearExtent = cfg.showGears ? (centerDist + maxr) : 0;
  const statorExtent = maxR; const maxExtent = Math.max(traceExtent, gearExtent, statorExtent);
  const minDim = Math.min(width, height);
  return Math.max(0.1, Math.min(5, (minDim / 2 * 0.9) / (maxExtent || 1)));
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ── URL config encoding / decoding ─────────────────────────────────────────

// f4: 4 decimal places for display-only values (speed, opacity, angle)
// f6: 6 decimal places for geometry values (radii, eccentricities)
const f4 = (v: number) => parseFloat(v.toFixed(4)).toString();
const f6 = (v: number) => parseFloat(v.toFixed(6)).toString();

const encodeConfigToURL = (cfg: SpiroConfig, level: number = DEFAULT_LEVEL): string => {
  const p = new URLSearchParams();
  p.set('l',   level.toString());
  p.set('sr',  f6(cfg.outerRadius));
  p.set('rr',  f6(cfg.innerRadius));
  p.set('po',  f6(cfg.penOffset));
  p.set('col', cfg.penColor.replace('#', ''));
  p.set('sp',  f4(cfg.speed));
  p.set('op',  f4(cfg.opacity));
  p.set('sg',  cfg.showGears ? '1' : '0');
  p.set('r',   cfg.reverse    ? '1' : '0');
  p.set('se',  f6(cfg.statorAspect ?? 1));
  p.set('re',  f6(cfg.rotorAspect  ?? 1));
  p.set('s',   f4(cfg.initialAngle ?? 0));
  if (cfg.numerator   != null) p.set('n', cfg.numerator.toString());
  if (cfg.denominator != null) p.set('d', cfg.denominator.toString());
  return p.toString();
};

// Reads a parameter by trying a list of candidate key names in order,
// returning the raw string value of the first one present, or null.
const getParam = (p: URLSearchParams, ...keys: string[]): string | null => {
  for (const k of keys) { const v = p.get(k); if (v !== null) return v; }
  return null;
};

const decodeConfigFromURL = (): { config: Partial<SpiroConfig>; level: number } | null => {
  const p = new URLSearchParams(window.location.search);
  // Accept both current names (sr/rr) and legacy names (or/ir)
  const hasSR = p.has('sr') || p.has('or');
  const hasRR = p.has('rr') || p.has('ir');
  if (!hasSR || !hasRR) return null;
  const level = p.has('l') ? Math.max(1, parseInt(p.get('l')!)) : DEFAULT_LEVEL;
  const config: Partial<SpiroConfig> = {
    outerRadius:  parseFloat(getParam(p, 'sr', 'or')!),
    innerRadius:  parseFloat(getParam(p, 'rr', 'ir')!),
    penOffset:    parseFloat(getParam(p, 'po')         ?? '70'),
    penColor:    '#' + (getParam(p, 'col')             ?? '22c55e'),
    speed:        parseFloat(getParam(p, 'sp', 'spd')  ?? '1'),
    opacity:      parseFloat(getParam(p, 'op')         ?? '1'),
    showGears:    getParam(p, 'sg')                    === '1',
    reverse:      getParam(p, 'r', 'rev')              === '1',
    statorAspect: parseFloat(getParam(p, 'se', 'sa')   ?? '1'),
    rotorAspect:  parseFloat(getParam(p, 're', 'ra')   ?? '1'),
    initialAngle: (() => {
      const raw = getParam(p, 's');
      if (raw !== null) return parseFloat(raw);
      // Legacy 'ia' key stored radians — convert to degrees
      const legacy = getParam(p, 'ia');
      return legacy !== null ? parseFloat(legacy) * (180 / Math.PI) : 0;
    })(),
    numerator:    p.has('n') ? parseInt(p.get('n')!)   : undefined,
    denominator:  p.has('d') ? parseInt(p.get('d')!)   : undefined,
  };
  return { config, level };
};

// ── Share Modal ────────────────────────────────────────────────────────────
const ShareModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  onCopyUrl: () => void;
  onNativeShareUrl: () => void;
  onShareImage: (withStats: boolean) => void;
  urlCopied: boolean;
  isSharingImage: boolean;
}> = ({ isOpen, onClose, theme, onCopyUrl, onNativeShareUrl, onShareImage, urlCopied, isSharingImage }) => {
  if (!isOpen) return null;

  const canNativeShare = typeof navigator.share === 'function' && navigator.maxTouchPoints > 0;

  const bg          = theme === 'dark' ? 'bg-slate-900 border-slate-700/60' : 'bg-white border-slate-200';
  const textPrimary = theme === 'dark' ? 'text-slate-100'                    : 'text-slate-900';
  const textMuted   = theme === 'dark' ? 'text-slate-400'                    : 'text-slate-500';
  const btnClass    = theme === 'dark'
    ? 'bg-slate-800/70 hover:bg-slate-700/80 text-slate-200 border-slate-700/50'
    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className={`relative w-full max-w-sm rounded-2xl border shadow-2xl p-5 ${bg}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-base font-semibold ${textPrimary}`}>{canNativeShare ? 'Share' : 'To share'}</h2>
          <button onClick={onClose} className={`p-1 rounded-lg transition-opacity opacity-60 hover:opacity-100 ${textMuted}`}><X size={20} /></button>
        </div>
        <div className="space-y-2">
          {canNativeShare ? (
            <>
              <button onClick={onNativeShareUrl} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${btnClass}`}>
                <Link size={18} className="shrink-0" />
                <div>
                  <div className="text-sm font-medium">Share link</div>
                  <div className={`text-xs mt-0.5 ${textMuted}`}>Includes all current curve settings</div>
                </div>
              </button>
              <button onClick={() => onShareImage(false)} disabled={isSharingImage} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${btnClass} disabled:opacity-50`}>
                <Upload size={18} className="shrink-0" />
                <div>
                  <div className="text-sm font-medium">Share image</div>
                  <div className={`text-xs mt-0.5 ${textMuted}`}>Share a picture of the current curve</div>
                </div>
              </button>
              <button onClick={() => onShareImage(true)} disabled={isSharingImage} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${btnClass} disabled:opacity-50`}>
                <FileText size={18} className="shrink-0" />
                <div>
                  <div className="text-sm font-medium">Share image with settings</div>
                  <div className={`text-xs mt-0.5 ${textMuted}`}>Image includes all curve parameters</div>
                </div>
              </button>
              {isSharingImage && <p className={`text-xs text-center pt-1 ${textMuted}`}>Preparing image…</p>}
            </>
          ) : (
            <>
              <button onClick={onCopyUrl} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${btnClass}`}>
                {urlCopied ? <Check size={18} className="shrink-0 text-green-500" /> : <Link size={18} className="shrink-0" />}
                <div>
                  <div className="text-sm font-medium">{urlCopied ? 'Link copied!' : 'Copy link'}</div>
                  <div className={`text-xs mt-0.5 ${textMuted}`}>Includes all current curve settings</div>
                </div>
              </button>
              <button onClick={() => { onShareImage(false); onClose(); }} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${btnClass}`}>
                <Download size={18} className="shrink-0" />
                <div>
                  <div className="text-sm font-medium">Download image</div>
                  <div className={`text-xs mt-0.5 ${textMuted}`}>Save the current curve as an image to share</div>
                </div>
              </button>
              <button onClick={() => { onShareImage(true); onClose(); }} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${btnClass}`}>
                <FileText size={18} className="shrink-0" />
                <div>
                  <div className="text-sm font-medium">Download image with current curve settings</div>
                  <div className={`text-xs mt-0.5 ${textMuted}`}>Image includes all current curve parameters</div>
                </div>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Screensaver Modal (mobile only) ───────────────────────────────────────
// Always dark to match the screensaver.
// Panel is semi-transparent so the curve is visible through it.
// ✕ top-right  → close modal, stay in screensaver
// "Exit…"      → leave screensaver (red, visually distinct)
//
// Download + Share layout:
//   [ Light  ] [ Light+data ] [ Share  ]
//   [ Dark   ] [ Dark+data  ] [ (tall) ]
// The Share button spans both rows on the right side.
const ScreensaverModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onExit: () => void;
  onNextCurve: () => void;
  onShare: () => void;
  config: SpiroConfig;
  setConfig: React.Dispatch<React.SetStateAction<SpiroConfig>>;
  isInfinityMode: boolean;
  setIsInfinityMode: React.Dispatch<React.SetStateAction<boolean>>;
  timeLeft: number;
  durationInput: string;
  onDurationChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownload: (opts: { theme: 'light' | 'dark'; withStats: boolean }) => void;
}> = ({
  isOpen, onClose, onExit, onNextCurve, onShare,
  config, setConfig,
  isInfinityMode, setIsInfinityMode,
  timeLeft, durationInput, onDurationChange,
  onDownload,
}) => {
  if (!isOpen) return null;

  const mutedText   = 'text-slate-600';
  // All regular buttons share this style
  const btnClass    = `bg-slate-800 hover:bg-slate-700 transition-colors rounded-xl ${mutedText}`;
  const sliderClass = 'w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-500';

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 pb-6" onClick={onClose}>
      {/* No backdrop div — the curve remains fully visible behind the panel */}
      {/* Panel — bg at 50% opacity so the curve shows through clearly */}
      <div
        data-screensaver-modal
        className="relative w-full max-w-sm rounded-2xl border border-slate-700/60 bg-slate-950/50 shadow-2xl p-5 space-y-4 overflow-y-auto max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className={`text-sm font-semibold tracking-wide uppercase ${mutedText}`}>Screensaver</h2>
          <button onClick={onClose} title="Close menu (stay in screensaver)" className={`p-1.5 rounded-lg hover:bg-slate-800 transition-colors ${mutedText}`}>
            <X size={20} />
          </button>
        </div>

        {/* New random curve + double-tap hint */}
        <div className="space-y-1.5">
          <button onClick={() => { onNextCurve(); onClose(); }} className={`w-full flex items-center justify-center gap-2 py-3 text-sm font-medium ${btnClass}`}>
            <RotateCcw size={18} />
            <span>New random curve</span>
          </button>
          <p className={`text-center text-[11px] ${mutedText}`}>Or double-tap the screensaver.</p>
        </div>

        {/* Speed */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className={`text-xs font-medium ${mutedText}`}>Speed</span>
            <span className={`text-xs font-mono ${mutedText}`}>{config.speed.toFixed(1)}</span>
          </div>
          <input type="range" min={0.1} max={15} step={0.1} value={config.speed}
            onChange={e => setConfig(c => ({ ...c, speed: parseFloat(e.target.value) }))}
            className={sliderClass}
          />
        </div>

        {/* Thickness */}
        <div>
          <div className="flex justify-between mb-1.5">
            <span className={`text-xs font-medium ${mutedText}`}>Thickness</span>
            <span className={`text-xs font-mono ${mutedText}`}>{config.lineWidth.toFixed(2)}</span>
          </div>
          <input type="range" min={0.1} max={15} step={0.1} value={config.lineWidth}
            onChange={e => setConfig(c => ({ ...c, lineWidth: parseFloat(e.target.value) }))}
            className={sliderClass}
          />
        </div>

        {/* Infinity mode + timer */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsInfinityMode(v => !v)}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs ${btnClass} ${isInfinityMode ? 'bg-slate-700' : ''}`}
          >
            {isInfinityMode ? <InfinityOff size={16} /> : <InfinityIcon size={16} />}
            <span>{isInfinityMode ? 'Infinity on' : 'Infinity off'}</span>
          </button>
          {!isInfinityMode && (
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700/50 font-mono text-xs ${mutedText}`}>
              <Clock size={14} />
              <span className="w-10 text-center">{formatTime(timeLeft)}</span>
              <div className="w-px h-3 bg-slate-700 mx-1" />
              <span>every</span>
              <input type="number" min="0.1" step="0.1" value={durationInput} onChange={onDurationChange}
                className={`themed-spin w-8 bg-transparent text-center border-b border-slate-700 focus:outline-none ${mutedText}`}
              />
              <span>min</span>
            </div>
          )}
        </div>

        {/* Download + Share layout:
              Left side: 2×2 download grid (flex-1, takes most space)
              Right side: Share button auto-width (just fits the word)
        */}
        <div>
          <p className={`text-xs font-medium mb-2 ${mutedText}`}>Download / Share</p>
          <div className="flex gap-2 items-stretch">
            {/* 2×2 download grid — grows to fill available width */}
            <div className="flex-1 grid grid-cols-2 gap-2">
              <button onClick={() => onDownload({ theme: 'light', withStats: false })} className={`flex items-center justify-center gap-1 py-2 text-xs ${btnClass}`}>
                <Download size={13} /><span>Light</span>
              </button>
              <button onClick={() => onDownload({ theme: 'light', withStats: true })} className={`flex items-center justify-center gap-1 py-2 text-xs ${btnClass}`}>
                <FileText size={13} /><span>Light+data</span>
              </button>
              <button onClick={() => onDownload({ theme: 'dark', withStats: false })} className={`flex items-center justify-center gap-1 py-2 text-xs ${btnClass}`}>
                <Download size={13} /><span>Dark</span>
              </button>
              <button onClick={() => onDownload({ theme: 'dark', withStats: true })} className={`flex items-center justify-center gap-1 py-2 text-xs ${btnClass}`}>
                <FileText size={13} /><span>Dark+data</span>
              </button>
            </div>
            {/* Share button — auto width, just fits its content */}
            <button
              onClick={() => { onShare(); onClose(); }}
              className={`flex flex-col items-center justify-center gap-1.5 px-3 text-xs ${btnClass}`}
            >
              <Upload size={16} />
              <span>Share</span>
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-700/60" />

        {/* Exit — red, cannot be confused with ✕ */}
        <button
          onClick={onExit}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-red-950/60 hover:bg-red-900/70 text-red-400 hover:text-red-300 border border-red-900/50 transition-colors"
        >
          <LogOut size={18} />
          <span>Exit screensaver</span>
        </button>
      </div>
    </div>
  );
};

// ── Main App ───────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const urlDecoded = decodeConfigFromURL();
  const [level, setLevel] = useState<number>(urlDecoded?.level ?? DEFAULT_LEVEL);
  const [config, setConfig] = useState<SpiroConfig>(() => {
    if (urlDecoded) return { ...DEFAULT_CONFIG, ...urlDecoded.config };
    return generateRandomConfig('light', DEFAULT_LEVEL);
  });

  const [isPlaying,            setIsPlaying]            = useState<boolean>(true);
  const [shouldClear,          setShouldClear]          = useState<boolean>(false);
  const [downloadState,        setDownloadState]        = useState<{ active: boolean; theme?: 'dark' | 'light'; withStats?: boolean }>({ active: false });
  const [captureState,         setCaptureState]         = useState<{ active: boolean; withStats: boolean } | null>(null);
  const [showControls,         setShowControls]         = useState<boolean>(false);
  const [theme,                setTheme]                = useState<Theme>('light');
  const [isFullscreen,         setIsFullscreen]         = useState<boolean>(false);
  const [isScreensaver,        setIsScreensaver]        = useState<boolean>(false);
  const [isInfinityMode,       setIsInfinityMode]       = useState<boolean>(false);
  const [timeLeft,             setTimeLeft]             = useState<number>(0);
  const [screensaverDuration,  setScreensaverDuration]  = useState<number>(300000);
  const [durationInput,        setDurationInput]        = useState<string>('5');
  const [viewTransform,        setViewTransform]        = useState({ x: 0, y: 0, k: 1 });
  const [isIdle,               setIsIdle]               = useState<boolean>(false);
  const [isLogoHovered,        setIsLogoHovered]        = useState(false);
  const [showShareModal,       setShowShareModal]       = useState(false);
  const [urlCopied,            setUrlCopied]            = useState(false);
  const [isSharingImage,       setIsSharingImage]       = useState(false);
  const [showScreensaverModal, setShowScreensaverModal] = useState(false);

  const previousThemeRef   = useRef<Theme>(theme);
  const nextSwitchTimeRef  = useRef<number>(0);
  const lastTapTimeRef     = useRef<number>(0);
  const singleTapTimerRef  = useRef<number>(0);
  const isMultiTouchRef    = useRef<boolean>(false);
  // Track touch start position to distinguish taps from drags
  const touchStartXRef     = useRef<number>(0);
  const touchStartYRef     = useRef<number>(0);
  // Drag threshold in pixels — moves beyond this are treated as drags, not taps
  const DRAG_THRESHOLD = 10;

  // ── Initial responsive scale ─────────────────────────────────────────────
  useEffect(() => {
    const k = calculateOptimalScale(config, window.innerWidth, window.innerHeight);
    setConfig(prev => ({ ...prev, lineWidth: calculateResponsiveLineWidth(k, window.innerWidth, window.innerHeight) * 4 }));
    setViewTransform(prev => ({ ...prev, k }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync config → URL ────────────────────────────────────────────────────
  useEffect(() => {
    if (isScreensaver) return;
    window.history.replaceState(null, '', '?' + encodeConfigToURL(config, level));
  }, [config, level, isScreensaver]);

  // ── Screensaver body/meta styling ────────────────────────────────────────
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (isScreensaver) {
      html.classList.add('screensaver-active');
      body.style.backgroundColor = '#000000';
      let metaTheme = document.querySelector('meta[name="theme-color"]');
      if (!metaTheme) {
        metaTheme = document.createElement('meta');
        metaTheme.setAttribute('name', 'theme-color');
        document.head.appendChild(metaTheme);
      }
      metaTheme.setAttribute('content', '#000000');
    } else {
      html.classList.remove('screensaver-active');
      body.style.backgroundColor = '';
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) metaTheme.setAttribute('content', theme === 'dark' ? '#020617' : '#ffffff');
    }
  }, [theme, isScreensaver]);

  // ── Stop screensaver → returns to curve view, not settings pane ──────────
  const stopScreensaver = useCallback(() => {
    setIsScreensaver(false);
    setIsInfinityMode(false);
    setShowScreensaverModal(false);
    toggleGlobalCursor(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    setTheme(previousThemeRef.current);
    setConfig(prev => ({ ...prev, showGears: true }));
    // No setShowControls(true) — land on curve view
  }, []);

  // ── Next screensaver curve ───────────────────────────────────────────────
  const triggerNextScreensaverImage = useCallback(() => {
    const newConfig = generateRandomConfig('dark', 2);
    const k = calculateOptimalScale(newConfig, window.innerWidth, window.innerHeight);
    newConfig.lineWidth = calculateResponsiveLineWidth(k, window.innerWidth, window.innerHeight) * 4;
    setConfig(newConfig);
    setShouldClear(true);
    setIsPlaying(true);
    setViewTransform({ x: 0, y: 0, k });
    nextSwitchTimeRef.current = Date.now() + screensaverDuration;
  }, [screensaverDuration]);

  // ── Randomize outside screensaver ────────────────────────────────────────
  const handleRandomize = useCallback(() => {
    const newConfig = generateRandomConfig(theme, level);
    const k = calculateOptimalScale(newConfig, window.innerWidth, window.innerHeight);
    newConfig.lineWidth = calculateResponsiveLineWidth(k, window.innerWidth, window.innerHeight) * 4;
    setConfig(newConfig);
    setShouldClear(true);
    setIsPlaying(true);
    setViewTransform({ x: 0, y: 0, k });
    setShowControls(false);
  }, [theme, level]);

  // ── Screensaver keyboard shortcuts (desktop) ─────────────────────────────
  useEffect(() => {
    if (!isScreensaver) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); stopScreensaver(); return; }
      if (e.key === ' ' || e.code === 'Space') {
        if (!(e.target instanceof HTMLInputElement)) { e.preventDefault(); triggerNextScreensaverImage(); }
      } else {
        const modifiers = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];
        if (!modifiers.includes(e.key)) stopScreensaver();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isScreensaver, triggerNextScreensaverImage, stopScreensaver]);

  // ── Fullscreen change ────────────────────────────────────────────────────
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
      if (!isNowFullscreen && isScreensaver) stopScreensaver();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isScreensaver, stopScreensaver]);

  // ── Screensaver touch + idle handling ────────────────────────────────────
  //
  // Desktop:  mousemove → idle timer → bottom overlay (unchanged)
  //
  // Mobile touch gesture model:
  //   touchstart  — record finger position; set multi-touch flag if >1 finger
  //   touchend    — if it was a drag (moved > DRAG_THRESHOLD px) → ignore
  //                 if multi-touch → ignore
  //                 double-tap (second tap within 400 ms) → next curve
  //                 single tap (no second tap within 350 ms) → open modal
  //   touchcancel — reset flags
  //
  // This means:
  //   • Dragging to pan the curve NEVER opens the modal
  //   • Pinch-to-zoom NEVER opens the modal
  //   • A clean brief tap opens the modal
  //   • A clean brief double-tap triggers the next curve
  useLayoutEffect(() => {
    if (!isScreensaver) { setIsIdle(false); toggleGlobalCursor(false); return; }
    setIsIdle(true);
    toggleGlobalCursor(true);

    const isMobile = navigator.maxTouchPoints > 0;
    let idleTimer: number;

    const onMouseMove = () => {
      setIsIdle(false);
      toggleGlobalCursor(false);
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        setIsIdle(true);
        toggleGlobalCursor(true);
      }, 3000);
    };

    // Record start position; track multi-touch
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        isMultiTouchRef.current = true;
        clearTimeout(singleTapTimerRef.current);
      } else {
        isMultiTouchRef.current = false;
        touchStartXRef.current = e.touches[0].clientX;
        touchStartYRef.current = e.touches[0].clientY;
      }
    };

    // Interpret gesture on finger-lift
    const onTouchEnd = (e: TouchEvent) => {
      // Multi-touch (pinch/pan): ignore entirely
      if (isMultiTouchRef.current) {
        if (e.touches.length === 0) isMultiTouchRef.current = false;
        return;
      }

      // Ignore taps that land inside the modal
      const target = e.target as Element;
      if (target.closest('[data-screensaver-modal]')) return;

      // Drag: if the finger moved too far, treat as pan/move, not a tap
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartXRef.current;
      const dy = touch.clientY - touchStartYRef.current;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        // It was a drag — cancel any pending single-tap timer and do nothing
        clearTimeout(singleTapTimerRef.current);
        lastTapTimeRef.current = 0;
        return;
      }

      const now = Date.now();
      const sinceLastTap = now - lastTapTimeRef.current;

      if (sinceLastTap < 400 && sinceLastTap > 30) {
        // Double-tap → next curve
        clearTimeout(singleTapTimerRef.current);
        lastTapTimeRef.current = 0;
        setShowScreensaverModal(false);
        triggerNextScreensaverImage();
      } else {
        // Single tap → open modal after delay so double-tap can cancel it
        lastTapTimeRef.current = now;
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = window.setTimeout(() => {
          setShowScreensaverModal(true);
        }, 350);
      }
    };

    const onTouchCancel = () => {
      isMultiTouchRef.current = false;
      clearTimeout(singleTapTimerRef.current);
    };

    window.addEventListener('mousemove', onMouseMove);
    if (isMobile) {
      window.addEventListener('touchstart',  onTouchStart,  { passive: true });
      window.addEventListener('touchend',    onTouchEnd,    { passive: true });
      window.addEventListener('touchcancel', onTouchCancel);
    }
    return () => {
      window.removeEventListener('mousemove',   onMouseMove);
      window.removeEventListener('touchstart',  onTouchStart);
      window.removeEventListener('touchend',    onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
      clearTimeout(idleTimer);
      clearTimeout(singleTapTimerRef.current);
    };
  }, [isScreensaver, triggerNextScreensaverImage]);

  // ── Start screensaver ────────────────────────────────────────────────────
  const startScreensaver = () => {
    setIsScreensaver(true);
    setShowControls(false);
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { });
    previousThemeRef.current = theme;
    setTheme('dark');
    const k = calculateOptimalScale(config, window.innerWidth, window.innerHeight);
    setConfig(prev => ({
      ...prev,
      lineWidth: calculateResponsiveLineWidth(k, window.innerWidth, window.innerHeight) * 4,
      speed: 1,
    }));
    setViewTransform({ x: 0, y: 0, k });
    nextSwitchTimeRef.current = Date.now() + screensaverDuration;
    setTimeLeft(Math.ceil(screensaverDuration / 1000));
  };

  // ── Screensaver auto-advance timer ───────────────────────────────────────
  useEffect(() => {
    if (!isScreensaver || isInfinityMode) return;
    const interval = setInterval(() => {
      const diff = nextSwitchTimeRef.current - Date.now();
      if (diff <= 0) triggerNextScreensaverImage();
      else setTimeLeft(Math.ceil(diff / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isScreensaver, isInfinityMode, triggerNextScreensaverImage]);

  // ── Screensaver duration input ───────────────────────────────────────────
  const handleDurationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setDurationInput(valStr);
    const val = parseFloat(valStr);
    if (!isNaN(val) && val > 0) {
      const newDuration = val * 60 * 1000;
      setScreensaverDuration(newDuration);
      if (isScreensaver && !isInfinityMode) {
        nextSwitchTimeRef.current = Date.now() + newDuration;
        setTimeLeft(Math.ceil(newDuration / 1000));
      }
    }
  };

  // ── Share handlers ───────────────────────────────────────────────────────
  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      const el = document.createElement('textarea');
      el.value = window.location.href;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }, []);

  const handleNativeShareUrl = useCallback(async () => {
    try {
      await navigator.share({ title: 'My SpiroGraph curve', url: window.location.href });
      setShowShareModal(false);
    } catch { /* user cancelled */ }
  }, []);

  const handleShareImage = useCallback((withStats: boolean) => {
    if (typeof navigator.share === 'function' && navigator.maxTouchPoints > 0) {
      setIsSharingImage(true);
      setCaptureState({ active: true, withStats });
    } else {
      setDownloadState({ active: true, withStats });
      setShowShareModal(false);
    }
  }, []);

  const handleImageCaptured = useCallback(async (blob: Blob) => {
    setCaptureState(null);
    setIsSharingImage(false);
    setShowShareModal(false);
    try {
      const file = new File([blob], 'spirograph.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My SpiroGraph curve' });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'spirograph.png'; a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* user cancelled */ }
  }, []);

  // ── Style helpers ────────────────────────────────────────────────────────
  const greyBtnClass             = theme === 'dark'
    ? 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
    : 'bg-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-300';
  const screensaverBtnClass      = 'bg-slate-900 text-slate-500 hover:bg-slate-800 hover:text-slate-400 shadow-lg transition-colors';
  const screensaverLightBtnClass = 'bg-slate-500 text-slate-900 hover:bg-slate-400 hover:text-slate-950 shadow-lg transition-colors';
  const settingsBtnClass         = theme === 'dark' ? 'text-slate-400 hover:bg-slate-800'                         : 'text-slate-600 hover:bg-slate-100';
  const headerActionBtnClass     = theme === 'dark' ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-900/10';

  // Desktop overlay visible on hover; hidden on mobile during screensaver
  const overlayOpacity = isScreensaver
    ? (isIdle ? 'opacity-0 md:opacity-0' : 'opacity-0 md:opacity-100')
    : 'opacity-0 group-hover:opacity-100';

  const backgroundStyle = isScreensaver
    ? { backgroundColor: '#000000' }
    : { backgroundColor: theme === 'dark' ? '#0f172a' : '#f8fafc' };

  const mobileTopBarStyle: React.CSSProperties = {
    backgroundColor:  theme === 'dark' ? '#0f172a' : '#ffffff',
    backgroundImage:  theme === 'dark' ? `url(${darkSettingsBg})` : `url(${lightSettingsBg})`,
    backgroundRepeat: 'repeat',
    backgroundSize:   'auto',
  };

  return (
    <div
      className={`flex flex-col md:flex-row h-screen w-screen relative overflow-hidden transition-colors duration-300 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'} ${isScreensaver ? 'cursor-none' : ''}`}
      style={backgroundStyle}
    >
      <style>{PERSISTENT_STYLES}</style>

      {/* ── Share Modal ──────────────────────────────────────────────────── */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        theme={theme}
        onCopyUrl={handleCopyUrl}
        onNativeShareUrl={handleNativeShareUrl}
        onShareImage={handleShareImage}
        urlCopied={urlCopied}
        isSharingImage={isSharingImage}
      />

      {/* ── Screensaver Modal (mobile only) ──────────────────────────────── */}
      <ScreensaverModal
        isOpen={showScreensaverModal}
        onClose={() => setShowScreensaverModal(false)}
        onExit={stopScreensaver}
        onNextCurve={triggerNextScreensaverImage}
        onShare={() => setShowShareModal(true)}
        config={config}
        setConfig={setConfig}
        isInfinityMode={isInfinityMode}
        setIsInfinityMode={setIsInfinityMode}
        timeLeft={timeLeft}
        durationInput={durationInput}
        onDurationChange={handleDurationInputChange}
        onDownload={({ theme: t, withStats }) => setDownloadState({ active: true, theme: t, withStats })}
      />

      {/* ── Mobile top bar ───────────────────────────────────────────────── */}
      {!isScreensaver && (
        <div
          className={`md:hidden flex items-center px-3 py-3 z-30 shrink-0 ${
            theme === 'dark' ? 'border-b border-white/10' : 'border-b border-slate-900/10'
          }`}
          style={mobileTopBarStyle}
        >
          {/* Logo — fixed left, natural width */}
          <a
            href="https://igormineyev.github.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center group shrink-0 mr-1"
            onMouseEnter={() => setIsLogoHovered(true)}
            onMouseLeave={() => setIsLogoHovered(false)}
          >
            <SpiroLogo textColor="#22c55e" dotColor="#ef4444" theme={theme} isHovered={isLogoHovered} style={{ height: '36px' }} />
          </a>

          {/* 6 icon buttons — evenly distributed across remaining space */}
          <div className="flex flex-1 justify-evenly items-center">
            <button onClick={handleRandomize} className={`p-2 rounded-lg transition-colors ${headerActionBtnClass}`} title="Random curve">
              <RotateCcw size={20} />
            </button>
            <button onClick={() => setShowShareModal(true)} className={`p-2 rounded-lg transition-colors ${headerActionBtnClass}`} title="Share">
              <Upload size={20} />
            </button>
            <button onClick={() => setDownloadState({ active: true, withStats: false })} className={`p-2 rounded-lg transition-colors ${headerActionBtnClass}`} title="Download pattern">
              <Download size={20} />
            </button>
            <button onClick={startScreensaver} className={`p-2 rounded-lg transition-colors ${headerActionBtnClass}`} title="Start screensaver">
              <Monitor size={20} />
            </button>
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className={`p-2 rounded-lg transition-colors ${headerActionBtnClass}`} title="Switch theme">
              {theme === 'dark' ? <Sun size={20} fill="currentColor" /> : <Moon size={20} fill="currentColor" />}
            </button>
            <button onClick={() => setShowControls(true)} className={`p-2 rounded-lg transition-colors ${settingsBtnClass}`} aria-label="Open settings">
              <Settings size={20} />
            </button>
          </div>
        </div>
      )}

      {/* ── Controls sidebar ─────────────────────────────────────────────── */}
      <div
        className={`fixed inset-x-0 top-0 z-[110] transition-transform duration-300 ease-in-out ${showControls ? 'translate-x-0' : '-translate-x-full'} ${!isScreensaver ? 'md:static md:translate-x-0 md:flex md:h-full' : 'md:fixed'}`}
        style={{ height: '100dvh' }}
      >
        <Controls
          config={config}
          setConfig={setConfig}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(!isPlaying)}
          onClear={() => setShouldClear(true)}
          onDownload={(ws) => setDownloadState({ active: true, withStats: ws })}
          onClose={() => setShowControls(false)}
          theme={theme}
          onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => !document.fullscreenElement
            ? document.documentElement.requestFullscreen()
            : document.exitFullscreen()
          }
          onStartScreensaver={startScreensaver}
          onShare={() => setShowShareModal(true)}
          level={level}
          onLevelChange={(newLevel) => {
            if (newLevel === level) return;                // no-op if same level
            setLevel(newLevel);
            // Always reset speed to default when switching level
            setConfig(prev => ({ ...prev, speed: DEFAULT_CONFIG.speed }));
            if (newLevel > level) {
              // Stepping up (e.g. 1 → 2): current curve continues uninterrupted.
              // No config change, no clear, no play-state change.
              return;
            }
            // Stepping down (e.g. 2 → 1): start a fresh random curve.
            const newConfig = generateRandomConfig(theme, newLevel);
            const k = calculateOptimalScale(newConfig, window.innerWidth, window.innerHeight);
            newConfig.lineWidth = calculateResponsiveLineWidth(k, window.innerWidth, window.innerHeight) * 4;
            setConfig(newConfig);
            setViewTransform({ x: 0, y: 0, k });
            setShouldClear(true);
            setIsPlaying(true);
          }}
          onAutoZoom={(c) => {
            const k = calculateOptimalScale(c, window.innerWidth, window.innerHeight);
            setConfig(prev => ({ ...c, lineWidth: calculateResponsiveLineWidth(k, window.innerWidth, window.innerHeight) * 4 }));
            setViewTransform({ x: 0, y: 0, k });
          }}
        />
      </div>

      {/* ── Canvas area ──────────────────────────────────────────────────── */}
      <div className="flex-1 relative h-full w-full overflow-hidden group">
        <SpirographRenderer
          config={config}
          isPlaying={isPlaying}
          shouldClear={shouldClear}
          onCleared={() => setShouldClear(false)}
          downloadState={downloadState}
          onDownloaded={() => setDownloadState({ active: false })}
          captureState={captureState}
          onImageCaptured={handleImageCaptured}
          theme={theme}
          transform={viewTransform}
          onTransformChange={setViewTransform}
          isCursorHidden={isScreensaver && isIdle}
        />

        {/* ── Canvas overlay (desktop zoom + screensaver controls) ── */}
        <div
          className={`absolute bottom-0 left-0 p-4 pb-16 md:p-10 z-30 flex items-end transition-opacity duration-300 w-full ${overlayOpacity} force-cursor-visible`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-4 md:gap-0">
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              <button onClick={() => setViewTransform(prev => ({ ...prev, k: prev.k * 1.2 }))}
                className={`hidden md:flex p-2 rounded-full ${isScreensaver ? screensaverBtnClass : greyBtnClass}`} title="Zoom In">
                <ZoomIn size={20} />
              </button>
              <button onClick={() => setViewTransform({ x: 0, y: 0, k: calculateOptimalScale(config, window.innerWidth, window.innerHeight) })}
                className={`hidden md:flex p-2 rounded-full ${isScreensaver ? screensaverBtnClass : greyBtnClass}`} title="Reset View">
                <Maximize size={20} />
              </button>
              <button onClick={() => setViewTransform(prev => ({ ...prev, k: prev.k / 1.2 }))}
                className={`hidden md:flex p-2 rounded-full ${isScreensaver ? screensaverBtnClass : greyBtnClass}`} title="Zoom Out">
                <ZoomOut size={20} />
              </button>

              {isScreensaver && (
                <>
                  <button onClick={triggerNextScreensaverImage} className={`p-2 rounded-full ${screensaverBtnClass}`} title="New Random Pattern"><RotateCcw size={20} /></button>

                  <div className="flex items-center gap-4 md:gap-6 md:ml-4 bg-slate-900 p-3 rounded-xl shadow-lg border border-slate-800/50">
                    <div className="flex justify-between text-[10px] text-slate-500 font-medium px-1">
                      <span>Speed</span>
                      <span className="text-slate-500">{config.speed.toFixed(1)}</span>
                    </div>
                    <input type="range" min={0.1} max={15} step={0.1} value={config.speed}
                      onChange={(e) => setConfig(c => ({ ...c, speed: parseFloat(e.target.value) }))}
                      className="h-1 bg-slate-950 rounded-full appearance-none cursor-pointer focus:outline-none transition-colors [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-600 hover:[&::-webkit-slider-thumb]:bg-slate-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1 w-20 md:w-28">
                    <div className="flex justify-between text-[10px] text-slate-500 font-medium px-1">
                      <span>Thickness</span>
                      <span className="text-slate-500">{config.lineWidth.toFixed(2)}</span>
                    </div>
                    <input type="range" min={0.1} max={15} step={0.1} value={config.lineWidth}
                      onChange={(e) => setConfig(c => ({ ...c, lineWidth: parseFloat(e.target.value) }))}
                      className="h-1 bg-slate-950 rounded-full appearance-none cursor-pointer focus:outline-none transition-colors [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-600 hover:[&::-webkit-slider-thumb]:bg-slate-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 md:gap-4 md:ml-4">
                    <button onClick={() => setIsInfinityMode(!isInfinityMode)} className={`p-2 rounded-full ${screensaverBtnClass}`} title={isInfinityMode ? 'Disable Infinity Mode' : 'Enable Infinity Mode'}>
                      {isInfinityMode ? <InfinityOff size={20} /> : <InfinityIcon size={20} />}
                    </button>
                    {!isInfinityMode && (
                      <div className="flex items-center gap-2 px-2 md:px-3 py-2 rounded-lg font-mono text-[10px] md:text-xs shadow-lg transition-colors select-none bg-slate-900 text-slate-500 border border-slate-800/50">
                        <Clock size={16} />
                        <span className="w-10 md:w-12 text-center">{formatTime(timeLeft)}</span>
                        <div className="w-px h-4 bg-slate-800 mx-1" />
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-600">every</span>
                          <input type="number" min="0.1" step="0.1" value={durationInput} onChange={handleDurationInputChange}
                            className="themed-spin w-8 md:w-10 bg-transparent text-center border-b border-slate-700 text-slate-500 focus:outline-none focus:border-slate-500 hover:border-slate-600 transition-colors"
                          />
                          <span className="text-[10px] text-slate-600">min</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {isScreensaver && (
              <div className="flex items-center gap-2 mt-2 md:mt-0 justify-end">
                {/* Share button — same style as other screensaver buttons */}
                <button onClick={() => setShowShareModal(true)} className={`p-2 rounded-full ${screensaverBtnClass}`} title="Share">
                  <Upload size={20} />
                </button>
                <div className="w-px h-6 bg-slate-800 mx-1 md:mx-2" />
                <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-full border border-slate-800/50">
                  <button onClick={() => setDownloadState({ active: true, theme: 'light', withStats: false })} className={`p-2 rounded-full ${screensaverLightBtnClass} shadow-none`} title="Download Light Image"><Download size={20} /></button>
                  <button onClick={() => setDownloadState({ active: true, theme: 'light', withStats: true  })} className={`p-2 rounded-full ${screensaverLightBtnClass} shadow-none`} title="Download Light Image with Data"><FileText size={20} /></button>
                </div>
                <div className="w-px h-6 bg-slate-800 mx-1 md:mx-2" />
                <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-full border border-slate-800/50">
                  <button onClick={() => setDownloadState({ active: true, theme: 'dark', withStats: false })} className={`p-2 rounded-full ${screensaverBtnClass} shadow-none`} title="Download Dark Image"><Download size={20} /></button>
                  <button onClick={() => setDownloadState({ active: true, theme: 'dark', withStats: true  })} className={`p-2 rounded-full ${screensaverBtnClass} shadow-none`} title="Download Dark Image with Data"><FileText size={20} /></button>
                </div>
                <button onClick={stopScreensaver} className={`p-2.5 rounded-full ${screensaverBtnClass} border-slate-800/50 text-slate-500 hover:text-slate-300 ml-1 md:ml-2`} title="Exit">
                  <X size={22} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
