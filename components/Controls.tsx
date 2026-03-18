import React, { useState, useEffect } from 'react';
import { SpiroConfig, Theme } from '../types';
import { SpiroLogo } from './SpiroLogo';
import { PRESET_COLORS, LEVEL_CONFIG, DEFAULT_LEVEL } from '../constants';
import {
  Play,
  Pause,
  Trash2,
  Download,
  Eye,
  EyeOff,
  X,
  Shuffle,
  Sun,
  Moon,
  Monitor,
  Maximize,
  Minimize,
  FileText,
  Palette,
  Heart,
  RotateCcw,
  ArrowRightLeft,
  Upload,
} from 'lucide-react';

// Tiled backgrounds for the settings (Controls) panel
import lightSettingsBg from '../assets/bg.jpg';
import darkSettingsBg from '../assets/bg-dark.png';

// ── Custom rotation icons ─────────────────────────────────────────────────────
//
// Both use the exact Lucide RotateCcw geometry (guaranteed perfect circle arc)
// wrapped in a rotation so the arrow sits at the desired clock position.
//
// RotateRight: arrow at 3 o'clock (rightmost point). Rotation = +169.7°
const RotateRight = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    className={className}
  >
    <g transform="rotate(169.7, 12, 12)">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </g>
  </svg>
);


interface ControlsProps {
  config: SpiroConfig;
  setConfig: React.Dispatch<React.SetStateAction<SpiroConfig>>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onClear: () => void;
  onDownload: (withStats: boolean) => void;
  onClose?: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onStartScreensaver: () => void;
  /** Opens the share modal — wired up in App.tsx */
  onShare: () => void;
  onAutoZoom?: (config: SpiroConfig) => void;
  level: number;
  onLevelChange: (level: number) => void;
}

// ── Ellipse circumference (Ramanujan approximation) ───────────────────────────
const calculateEllipseCircumference = (radius: number, aspect: number): number => {
  const a = radius;
  const b = radius * aspect;
  if (aspect === 1) return 2 * Math.PI * radius;
  const h = Math.pow(a - b, 2) / Math.pow(a + b, 2);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
};

// ── Reusable slider + number-input pair ──────────────────────────────────────
const SliderControl: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  theme: Theme;
}> = ({ label, value, min, max, step = 1, onChange, theme }) => {
  const [inputValue, setInputValue] = useState(value.toString());

  useEffect(() => {
    if (parseFloat(inputValue) !== value) {
      const display = step < 1 ? parseFloat(value.toFixed(4)).toString() : value.toString();
      setInputValue(display);
    }
  }, [value, step]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) onChange(val);
  };

  const handleBlur = () => {
    if (inputValue === '' || isNaN(parseFloat(inputValue))) {
      setInputValue(value.toString());
    } else {
      const display = step < 1 ? parseFloat(value.toFixed(4)).toString() : value.toString();
      setInputValue(display);
    }
  };

  return (
    <div className="mb-2">
      <div
        className={`flex justify-between items-center text-xs mb-1 ${
          theme === 'dark' ? 'text-slate-400' : 'text-slate-600'
        }`}
      >
        <span>{label}</span>
        <input
          type="number"
          min={min}
          max={max}
          step="any"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          className={`
            w-20 bg-transparent text-right font-mono focus:outline-none border-b
            ${theme === 'dark'
              ? 'border-slate-700 focus:border-slate-500 text-slate-300'
              : 'border-slate-300 focus:border-slate-500 text-slate-900'
            }
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
          `}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const val = Number(e.target.value);
          setInputValue(val.toString());
          onChange(val);
        }}
        className={`
          w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400/50
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-colors
          [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:transition-colors
          ${theme === 'dark'
            ? 'bg-slate-700 [&::-webkit-slider-thumb]:bg-slate-400 [&::-moz-range-thumb]:bg-slate-400'
            : 'bg-slate-300 [&::-webkit-slider-thumb]:bg-slate-500 [&::-moz-range-thumb]:bg-slate-500'
          }
        `}
      />
    </div>
  );
};

// ── Main Controls component ───────────────────────────────────────────────────
export const Controls: React.FC<ControlsProps> = ({
  config,
  setConfig,
  isPlaying,
  onTogglePlay,
  onClear,
  onDownload,
  onClose,
  theme,
  onToggleTheme,
  isFullscreen,
  onToggleFullscreen,
  onStartScreensaver,
  onShare,
  onAutoZoom,
  level,
  onLevelChange,
}) => {
  const [numerator,    setNumerator]    = useState<number>(config.numerator    || 2);
  const [denominator,  setDenominator]  = useState<number>(config.denominator  || 3);
  const [isLogoHovered, setIsLogoHovered] = useState(false);

  const updateConfig = <K extends keyof SpiroConfig>(key: K, value: SpiroConfig[K]) => {
    setConfig((prev) => {
      const updates: any = { [key]: value };
      if (key === 'outerRadius' || key === 'innerRadius') {
        updates.numerator   = undefined;
        updates.denominator = undefined;
      }
      return { ...prev, ...updates };
    });
  };

  const outerCircumference = calculateEllipseCircumference(config.outerRadius, config.statorAspect);

  const applyRatioValues = (num: number, den: number) => {
    if (num <= 0 || den <= 0) return;
    const targetRatio             = num / den;
    const targetInnerCircumference = outerCircumference * targetRatio;
    const unitInnerCircumference   = calculateEllipseCircumference(1, config.rotorAspect);
    const newInnerRadius           = targetInnerCircumference / unitInnerCircumference;
    const clampedRadius            = Math.max(10, Math.min(400, newInnerRadius));

    setConfig((prev) => ({
      ...prev,
      innerRadius: clampedRadius,
      numerator:   num,
      denominator: den,
    }));
    onClear();
  };

  const handleApplyRatio = () => applyRatioValues(numerator, denominator);

  const getRandomInt = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  const handleRandomRatio = () => {
    let n, d;
    do {
      n = getRandomInt(2, 100);
      d = getRandomInt(2, 100);
    } while (n === d);
    setNumerator(n);
    setDenominator(d);

    const outerC       = calculateEllipseCircumference(config.outerRadius, config.statorAspect);
    const targetInnerC = outerC * (n / d);
    const unitInnerC   = calculateEllipseCircumference(1, config.rotorAspect);
    const newInnerRadius = Math.max(10, Math.min(400, targetInnerC / unitInnerC));
    const newPenOffset   = Math.floor(newInnerRadius * (0.4 + Math.random() * 0.8));

    const nextConfig = {
      ...config,
      innerRadius: newInnerRadius,
      penOffset:   newPenOffset,
      numerator:   n,
      denominator: d,
    };
    setConfig(nextConfig);
    onClear();
    if (!isPlaying) onTogglePlay();
    if (onAutoZoom) onAutoZoom(nextConfig);
  };

  const handleRandom = () => {
    const levelCfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG[DEFAULT_LEVEL];
    let n, d;
    do {
      n = getRandomInt(2, 100);
      d = getRandomInt(2, 100);
    } while (n === d);
    setNumerator(n);
    setDenominator(d);

    const randomEcc = () => Number((0.2 + Math.random() * 1.8).toFixed(2));
    const sAspect   = randomEcc();
    const rAspect   = randomEcc();

    const outerC       = calculateEllipseCircumference(config.outerRadius, sAspect);
    const targetInnerC = outerC * (n / d);
    const unitInnerC   = calculateEllipseCircumference(1, rAspect);
    const newInnerRadius = Math.max(10, Math.min(400, targetInnerC / unitInnerC));
    const newPenOffset   = Math.floor(newInnerRadius * (0.4 + Math.random() * 0.8));

    const availableColors = PRESET_COLORS.filter(
      (c) => c !== (theme === 'dark' ? '#000000' : '#ffffff')
    );
    const randomColor  = availableColors[Math.floor(Math.random() * availableColors.length)];
    const initialAngle = levelCfg.randomisesAngle ? (Math.random() * 360 - 180) : 0;

    const nextConfig = {
      ...config,
      statorAspect: sAspect,
      rotorAspect:  rAspect,
      innerRadius:  newInnerRadius,
      penOffset:    newPenOffset,
      numerator:    n,
      denominator:  d,
      penColor:     randomColor,
      speed:        1,
      initialAngle,
    };
    setConfig(nextConfig);
    onClear();
    if (!isPlaying) onTogglePlay();
    if (onAutoZoom) onAutoZoom(nextConfig);
    if (onClose) onClose();
  };
  const bgMain       = theme === 'dark' ? 'border-r border-white/10'        : 'border-r border-slate-900/10';
  const textPrimary  = theme === 'dark' ? 'text-slate-300'                   : 'text-slate-900';
  const textSecondary= theme === 'dark' ? 'text-slate-400'                   : 'text-slate-600';
  const bgPanel      = theme === 'dark' ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-100/40 border-slate-200/50';
  const bgInput      = theme === 'dark' ? 'bg-slate-900/60 border-slate-700'    : 'bg-white/60 border-slate-300';

  const greyBtnClass = theme === 'dark'
    ? 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'
    : 'bg-slate-200/60 text-slate-600 hover:text-slate-800 hover:bg-slate-300/80';

  const primaryBtnClass = theme === 'dark'
    ? 'bg-green-700 text-slate-800 hover:bg-green-600 shadow-lg shadow-green-500/20'
    : 'bg-green-600 text-slate-200 hover:bg-green-700 shadow-lg shadow-green-500/20';

  // Icon buttons in the pane header (Share, Fullscreen, Theme, Close)
  const iconBtnClass = theme === 'dark'
    ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
    : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100';

  // Tiled background for the settings sidebar
  const containerStyle: React.CSSProperties = {
    backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
    backgroundImage: theme === 'dark' ? `url(${darkSettingsBg})` : `url(${lightSettingsBg})`,
    backgroundRepeat: 'repeat',
    backgroundSize: 'auto',
  };

  return (
    <div
      className={`flex flex-col w-full md:w-80 overflow-y-auto transition-colors duration-300 ${bgMain}`}
      style={{ ...containerStyle, height: '100%', WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain' }}
    >
      {/* ── Pane header ──────────────────────────────────────────────────────── */}
      {/*                                                                         */}
      {/* Desktop (md+):  logo | Share | Fullscreen | Theme                       */}
      {/* Mobile:         logo |                     Theme | × close              */}
      {/*                                                                         */}
      {/* Fullscreen is a browser concept — hidden on mobile.                     */}
      {/* Share is in the mobile top bar already — hidden here on mobile.         */}
      <div className="p-4 pb-2 flex justify-between items-start shrink-0" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>
        {/* Logo */}
        <a
          href="https://igormineyev.github.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col group pl-0"
          onMouseEnter={() => setIsLogoHovered(true)}
          onMouseLeave={() => setIsLogoHovered(false)}
        >
          <div className="inline-block">
            <SpiroLogo
              textColor="#2e7d32"
              dotColor="#ef4444"
              theme={theme}
              isHovered={isLogoHovered}
              style={{ height: '48px' }}
            />
          </div>
        </a>

        {/* Right-side icon group */}
        <div className="flex gap-2 items-center">

          {/* Share — desktop only (already in mobile top bar) */}
          <button
            onClick={onShare}
            className={`hidden md:flex p-2 rounded-lg transition-colors ${iconBtnClass}`}
            title="Share"
          >
            <Upload size={20} />
          </button>

          {/* Fullscreen — desktop only (not applicable on phones) */}
          <button
            onClick={onToggleFullscreen}
            className={`hidden md:flex p-2 rounded-lg transition-colors ${iconBtnClass}`}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>

          {/* Theme toggle — always visible */}
          <button
            onClick={onToggleTheme}
            className={`p-2 rounded-lg transition-colors ${iconBtnClass}`}
            title="Switch theme"
          >
            {theme === 'dark'
              ? <Sun  size={20} fill="currentColor" />
              : <Moon size={20} fill="currentColor" />
            }
          </button>

          {/* Close — mobile only (slides the pane away) */}
          {onClose && (
            <button
              onClick={onClose}
              className={`md:hidden p-2 rounded-lg transition-colors ${iconBtnClass}`}
              aria-label="Close settings"
            >
              <X size={24} />
            </button>
          )}
        </div>
      </div>

      {/* ── Controls body ────────────────────────────────────────────────────── */}
      <div className="p-4 pt-2 flex-1 space-y-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>

        {/* Level selector + Random + Screensaver */}
        <div className="space-y-2">

          {/* Level selector */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium shrink-0 ${textSecondary}`}>Level</span>
            <div className="flex flex-1 gap-2">
              {Object.keys(LEVEL_CONFIG).map((lvl) => {
                const n = Number(lvl);
                const active = n === level;
                return (
                  <button
                    key={n}
                    onClick={() => onLevelChange(n)}
                    className={`flex-1 h-8 rounded-lg text-sm font-bold transition-colors ${
                      active
                        ? theme === 'dark'
                          ? 'bg-green-700 text-white'
                          : 'bg-green-600 text-white'
                        : greyBtnClass
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleRandom}
            className={`w-full p-2 pl-4 rounded-lg transition-colors flex items-center justify-start gap-3 text-base font-bold ${primaryBtnClass}`}
            title="Draw a random spiro curve"
          >
            <RotateRight size={22} className="shrink-0" />
            <span>Draw a random spiro curve</span>
          </button>

          <button
            onClick={onStartScreensaver}
            className={`w-full p-2 rounded-lg transition-colors flex items-center justify-center gap-3 text-xs font-medium ${greyBtnClass}`}
          >
            <Monitor size={20} className="shrink-0" />
            <span>Screensaver</span>
          </button>
        </div>

        {/* Play / Clear */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onTogglePlay}
            className={`flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition-all ${greyBtnClass}`}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            {isPlaying ? 'Pause' : 'Start'}
          </button>

          <button
            onClick={onClear}
            className={`flex items-center justify-center gap-2 p-3 rounded-lg transition-all ${greyBtnClass}`}
          >
            <Trash2 size={18} />
            Clear
          </button>
        </div>

        {/* Download */}
        <div>
          <div className="grid grid-cols-6 gap-2">
            <button
              onClick={() => onDownload(false)}
              className={`col-span-5 flex items-center justify-center gap-3 p-2 rounded-lg transition-all ${greyBtnClass}`}
              title="Download image"
            >
              <Download size={20} />
              <div className="flex flex-col items-start">
                <span className={`text-[10px] leading-tight ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                  If you like this picture,
                </span>
                <span className="leading-tight">download it.</span>
              </div>
            </button>

            <button
              onClick={() => onDownload(true)}
              className={`col-span-1 flex items-center justify-center p-2 rounded-lg transition-all ${greyBtnClass}`}
              title="Download image with settings"
            >
              <FileText size={20} />
            </button>
          </div>

          <a
            href="https://igormineyev.github.io/#donate"
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full mt-2 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-wider font-medium opacity-60 hover:opacity-80 transition-opacity ${
              theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            <Heart size={10} strokeWidth={2.5} />
            <span>Support meditative math art</span>
          </a>
        </div>

        {/* Speed */}
        <SliderControl
          label="Speed"
          value={config.speed}
          min={0.1}
          max={20}
          step={0.1}
          onChange={(v) => updateConfig('speed', v)}
          theme={theme}
        />

        {/* Pen color + thickness + opacity */}
        <div className="space-y-1">
          <div className="mb-2">
            <div className="flex justify-between items-center mb-2">
              <label className={`text-xs block ${textSecondary}`}>Pen color</label>

              <div className="relative group flex items-center">
                <input
                  type="color"
                  value={config.penColor}
                  onChange={(e) => updateConfig('penColor', e.target.value)}
                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                />
                <div
                  className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 font-medium transition-colors ${
                    theme === 'dark'
                      ? 'bg-slate-800/60 border-slate-700/50 text-slate-400 group-hover:text-slate-200'
                      : 'bg-slate-100/60 border-slate-200/50 text-slate-600 group-hover:text-slate-900'
                  }`}
                >
                  <Palette size={10} />
                  <span>Custom</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => updateConfig('penColor', color)}
                  className={`w-full aspect-square rounded-md border-2 ${
                    config.penColor === color
                      ? theme === 'dark' ? 'border-white' : 'border-slate-400'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <SliderControl
            label="Thickness"
            value={config.lineWidth}
            min={0.5}
            max={15}
            step={0.1}
            onChange={(v) => updateConfig('lineWidth', v)}
            theme={theme}
          />

          <SliderControl
            label="Opacity"
            value={config.opacity}
            min={0.1}
            max={1}
            step={0.1}
            onChange={(v) => updateConfig('opacity', v)}
            theme={theme}
          />
        </div>

        {/* Show gears / Reverse */}
        <div className="flex items-center justify-between py-2 mb-2 gap-2">
          <button
            onClick={() => updateConfig('showGears', !config.showGears)}
            className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg transition-colors text-xs font-medium ${greyBtnClass}`}
          >
            {config.showGears ? <EyeOff size={16} /> : <Eye size={16} />}
            <span>{config.showGears ? 'Hide gears' : 'Show gears'}</span>
          </button>

          {/* Highlighted when clockwise (non-default); standard when counterclockwise (default) */}
          <button
            onClick={() => updateConfig('reverse', !config.reverse)}
            className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg transition-colors text-xs font-medium ${
              !config.reverse
                ? theme === 'dark'
                  ? 'bg-slate-600/80 text-slate-200 hover:bg-slate-500/80'
                  : 'bg-slate-400/80 text-slate-900 hover:bg-slate-500/80'
                : greyBtnClass
            }`}
          >
            <ArrowRightLeft size={16} />
            <span>Reverse</span>
          </button>
        </div>

        {/* Rotor / stator ratio */}
        <div className="space-y-1">
          <div className={`rounded-lg p-3 border space-y-3 ${bgPanel}`}>
            <div className="flex items-center justify-center gap-3">
              <span className={`text-xs ${textSecondary}`}>Rotor/stator ratio =</span>

              <div className="flex flex-col items-center w-24">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={numerator}
                  onChange={(e) => setNumerator(parseInt(e.target.value) || 1)}
                  className={`w-full border rounded px-2 py-1 text-sm text-center focus:outline-none ${bgInput} ${textPrimary}`}
                />
                <div
                  className={`w-full h-[2px] my-1 rounded-full ${
                    theme === 'dark' ? 'bg-slate-700/50' : 'bg-slate-300/50'
                  }`}
                />
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={denominator}
                  onChange={(e) => setDenominator(parseInt(e.target.value) || 1)}
                  className={`w-full border rounded px-2 py-1 text-sm text-center focus:outline-none ${bgInput} ${textPrimary}`}
                />
              </div>
            </div>

            <button
              onClick={handleApplyRatio}
              className={`w-full text-xs font-medium p-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${greyBtnClass}`}
            >
              Set rotor radius to fit ratio
            </button>

            <button
              onClick={handleRandomRatio}
              className={`w-full text-xs font-medium py-2 rounded border transition-colors flex items-center justify-center gap-1 ${greyBtnClass}`}
              title="Randomize ratio"
            >
              <Shuffle size={14} />
              <span>Random ratio only</span>
            </button>
          </div>
        </div>

        {/* Radius / pen sliders */}
        <div className="space-y-1 pt-2">
          <SliderControl
            label="Stator radius"
            value={config.outerRadius}
            min={50}
            max={400}
            onChange={(v) => updateConfig('outerRadius', v)}
            theme={theme}
          />
          <SliderControl
            label="Rotor radius"
            value={config.innerRadius}
            min={10}
            max={400}
            onChange={(v) => updateConfig('innerRadius', v)}
            theme={theme}
          />
          <SliderControl
            label="Pen offset"
            value={config.penOffset}
            min={10}
            max={400}
            onChange={(v) => updateConfig('penOffset', v)}
            theme={theme}
          />
        </div>

        {/* Eccentricity sliders */}
        <div className="space-y-1">
          <SliderControl
            label="Stator eccentricity"
            value={config.statorAspect}
            min={0.2}
            max={2.0}
            step={0.01}
            onChange={(v) => updateConfig('statorAspect', v)}
            theme={theme}
          />
          <SliderControl
            label="Rotor eccentricity"
            value={config.rotorAspect}
            min={0.2}
            max={2.0}
            step={0.01}
            onChange={(v) => updateConfig('rotorAspect', v)}
            theme={theme}
          />
          {(LEVEL_CONFIG[level] ?? LEVEL_CONFIG[DEFAULT_LEVEL]).showStatorAngle && (
            <SliderControl
              label="Stator angle"
              value={config.initialAngle ?? 0}
              min={-180}
              max={180}
              step={1}
              onChange={(v) => updateConfig('initialAngle', v)}
              theme={theme}
            />
          )}
        </div>

        {/* Safe-area spacer — ensures the last slider scrolls fully clear
            of the iPad/iPhone home indicator */}
        <div style={{ height: 'max(1.5rem, env(safe-area-inset-bottom))' }} />

      </div>
    </div>
  );
};
