import React, { useRef, useEffect, useCallback } from 'react';
import { SpiroConfig, Theme } from '../types';
import { COLOR_NAMES } from '../constants';

interface SpirographRendererProps {
  config: SpiroConfig;
  isPlaying: boolean;
  shouldClear: boolean;
  onCleared: () => void;
  downloadState: { active: boolean; theme?: 'dark' | 'light'; withStats?: boolean; };
  onDownloaded: () => void;
  captureState: { active: boolean; withStats: boolean } | null;
  onImageCaptured: (blob: Blob) => void;
  theme: Theme;
  transform: { x: number; y: number; k: number };
  onTransformChange: (newTransform: { x: number; y: number; k: number } | ((prev: { x: number; y: number; k: number }) => { x: number; y: number; k: number })) => void;
  isCursorHidden?: boolean;
}

const calculateEllipseCircumference = (radius: number, aspect: number): number => {
  // Ramanujan's approximation
  const a = radius;
  const b = radius * aspect;
  if (aspect === 1) return 2 * Math.PI * radius;

  const h = Math.pow(a - b, 2) / Math.pow(a + b, 2);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
};

export const SpirographRenderer: React.FC<SpirographRendererProps> = ({
  config,
  isPlaying,
  shouldClear,
  onCleared,
  downloadState,
  onDownloaded,
  captureState,
  onImageCaptured,
  theme,
  transform,
  onTransformChange,
  isCursorHidden = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const traceCanvasRef = useRef<HTMLCanvasElement>(null);
  const gearsCanvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  // Ref for animation loop access without dependencies
  const transformRef = useRef(transform);

  // Sync ref
  useEffect(() => { transformRef.current = transform; }, [transform]);

  // Simulation State
  const angleRef = useRef<number>(0);
  const rotorParamRef = useRef<number>(0);
  const rotorRotationRef = useRef<number>(0);

  // Tracks when the current curve started, for the fade-in and speed ramp
  const gearFadeStartRef = useRef<number>(Date.now());

  // Pending angle change requested by the Initial angle slider.
  // Written by useEffect, consumed atomically at the top of each animate frame
  // to avoid racing with the physics step (which caused NaN crashes).
  const pendingAngleRef = useRef<number | null>(null);

  // History of points for redrawing
  const pointsRef = useRef<{ x: number, y: number }[]>([]);

  // Interaction State
  const pointersRef = useRef<Map<number, { x: number, y: number }>>(new Map());
  const prevPinchDistRef = useRef<number | null>(null);

  // Resize handler
  const handleResize = useCallback(() => {
    if (!containerRef.current || !traceCanvasRef.current || !gearsCanvasRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const dpr = window.devicePixelRatio || 1;

    // Set display size
    traceCanvasRef.current.style.width = `${clientWidth}px`;
    traceCanvasRef.current.style.height = `${clientHeight}px`;
    gearsCanvasRef.current.style.width = `${clientWidth}px`;
    gearsCanvasRef.current.style.height = `${clientHeight}px`;

    // Set actual size
    traceCanvasRef.current.width = clientWidth * dpr;
    traceCanvasRef.current.height = clientHeight * dpr;
    gearsCanvasRef.current.width = clientWidth * dpr;
    gearsCanvasRef.current.height = clientHeight * dpr;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [handleResize]);

  // Handle Clear — start from initialAngle
  useEffect(() => {
    if (shouldClear) {
      pointsRef.current = [];
      angleRef.current = (config.initialAngle ?? 0) * (Math.PI / 180);
      rotorParamRef.current = 0;
      rotorRotationRef.current = 0;
      gearFadeStartRef.current = Date.now(); // restart fade-in + speed ramp
      onCleared();
    }
  }, [shouldClear, onCleared]);

  // Dynamic initial angle — signal the desired new angle to the animate loop.
  // The loop picks it up atomically at the top of the next frame, avoiding any
  // race with the physics step that previously caused NaN crashes.
  // Skip the very first run (mount): the correct starting position is already
  // set via angleRef initialisation and the shouldClear effect.  Firing here on
  // mount would reset the angle to 0 whenever the component re-renders due to
  // unrelated state changes (e.g. switching level), breaking curve continuity.
  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) { isMountedRef.current = true; return; }
    pendingAngleRef.current = (config.initialAngle ?? 0) * (Math.PI / 180);
  }, [config.initialAngle]);

  // --- MATH ENGINE HELPERS ---

  const getGeometry = (
    t: number,
    u: number,
    R: number,
    r: number,
    d: number,
    sAspect: number,
    rAspect: number
  ) => {
    const sx = R * Math.cos(t);
    const sy = R * sAspect * Math.sin(t);
    const stx = -R * Math.sin(t);
    const sty = R * sAspect * Math.cos(t);
    const alpha = Math.atan2(stx, -sty);

    const rtx = -r * Math.sin(u);
    const rty = r * rAspect * Math.cos(u);
    const beta = Math.atan2(rtx * -1, rty);

    const phi = alpha - beta + Math.PI;

    const rcx = r * Math.cos(u);
    const rcy = r * rAspect * Math.sin(u);

    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const rotRcx = rcx * cosPhi - rcy * sinPhi;
    const rotRcy = rcx * sinPhi + rcy * cosPhi;

    const cx = sx - rotRcx;
    const cy = sy - rotRcy;

    const px = cx + d * cosPhi;
    const py = cy + d * sinPhi;

    return { px, py, cx, cy, phi, contactX: sx, contactY: sy };
  };

  const calculateExactStep = (t: number, R: number, r: number, d: number) => {
    const cx = (R - r) * Math.cos(t);
    const cy = (R - r) * Math.sin(t);
    const phi = t * (1 - R / r);
    const px = cx + d * Math.cos(phi);
    const py = cy + d * Math.sin(phi);
    const contactX = R * Math.cos(t);
    const contactY = R * Math.sin(t);
    return { px, py, cx, cy, newU: 0, phi, contactX, contactY };
  };

  const getEllipseMetric = (angle: number, radius: number, aspect: number) => {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const dx = -radius * sin;
    const dy = radius * aspect * cos;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getDerivative = (t: number, u: number, R: number, sAspect: number, r: number, rAspect: number) => {
    const statorSpeed = getEllipseMetric(t, R, sAspect);
    const rotorSpeed = getEllipseMetric(u, r, rAspect);
    return statorSpeed / (rotorSpeed || 0.0001);
  };

  const calculatePhysicsStep = (
    t: number,
    dt: number,
    currentU: number,
    R: number,
    r: number,
    d: number,
    sAspect: number,
    rAspect: number
  ) => {
    const k1 = getDerivative(t, currentU, R, sAspect, r, rAspect);
    const k2 = getDerivative(t + dt / 2, currentU + (dt * k1) / 2, R, sAspect, r, rAspect);
    const k3 = getDerivative(t + dt / 2, currentU + (dt * k2) / 2, R, sAspect, r, rAspect);
    const k4 = getDerivative(t + dt, currentU + dt * k3, R, sAspect, r, rAspect);

    const newU = currentU + (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    const geom = getGeometry(t + dt, newU, R, r, d, sAspect, rAspect);
    return { ...geom, newU };
  };

  const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  };

  // Handle Download
  useEffect(() => {
    if (downloadState.active && traceCanvasRef.current) {
      const sourceCanvas = traceCanvasRef.current;
      const downloadTheme = downloadState.theme || theme;
      const withStats = downloadState.withStats || false;

      const width = sourceCanvas.width;
      const height = sourceCanvas.height;
      const dpr = window.devicePixelRatio || 1;
      const { x, y, k } = transformRef.current;

      const bgColor = downloadTheme === 'dark' ? '#020617' : '#ffffff';

      // BADGE COLORS: Interchange them to match mode
      const badgeBgColor = downloadTheme === 'dark' ? '#000000' : '#ffffff';
      const statsTextColor = downloadTheme === 'dark' ? '#ffffff' : '#000000';
      const footerTextColor = downloadTheme === 'dark' ? '#475569' : '#94a3b8';

      const gearStroke = downloadTheme === 'dark' ? '#475569' : '#cbd5e1';
      const rotorStroke = downloadTheme === 'dark' ? '#566579' : '#b0bdcf';

      // Footer
      const footerText = "Play at https://igormineyev-spirograph.vercel.app/";
      const footerFontSize = Math.max(12, width / 70);
      const footerPaddingBottom = footerFontSize * 0.8;

      const tCtx = sourceCanvas.getContext('2d');
      if (!tCtx) return;
      tCtx.font = `500 ${footerFontSize}px Inter, sans-serif`;
      const fMetrics = tCtx.measureText(footerText);
      const fTextWidth = fMetrics.width;
      const fPadding = footerFontSize * 0.5;
      const fBoxWidth = fTextWidth + (fPadding * 2);
      const fBoxHeight = footerFontSize + (fPadding * 1.5);
      const fBoxX = (width / 2) - (fBoxWidth / 2);
      const fBoxY = height - footerPaddingBottom - footerFontSize - (fPadding * 0.75);

      const targetWidth = 3000;
      const scaleFactor = Math.max(2, targetWidth / width);

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width * scaleFactor;
      tempCanvas.height = height * scaleFactor;
      const ctx = tempCanvas.getContext('2d');

      if (ctx) {
        ctx.scale(scaleFactor, scaleFactor);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        ctx.restore();

        const cx = (sourceCanvas.width / 2) + (x * dpr);
        const cy = (sourceCanvas.height / 2) + (y * dpr);
        const sk = k * dpr;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(sk, sk);

        ctx.strokeStyle = config.penColor;
        ctx.lineWidth = config.lineWidth;
        ctx.globalAlpha = config.opacity;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const points = pointsRef.current;
        if (points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.stroke();
        }

        if (withStats) {
          ctx.globalAlpha = 1.0;
          const { outerRadius: R, innerRadius: r, penOffset: d, statorAspect, rotorAspect } = config;
          const sAspect = statorAspect ?? 1.0;
          const rAspect = rotorAspect ?? 1.0;
          const isCircular = Math.abs(sAspect - 1.0) < 0.005 && Math.abs(rAspect - 1.0) < 0.005;
          const t0 = config.initialAngle ?? 0;

          let state;
          if (isCircular) {
            state = calculateExactStep(t0, R, r, d);
          } else {
            state = getGeometry(t0, 0, R, r, d, sAspect, rAspect);
          }

          const baseLW = 2 / k;

          ctx.strokeStyle = gearStroke;
          ctx.lineWidth = baseLW * 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, R, R * sAspect, 0, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = rotorStroke;
          ctx.lineWidth = baseLW * 2;
          ctx.beginPath();
          ctx.ellipse(state.cx, state.cy, r, r * rAspect, state.phi, 0, Math.PI * 2);
          ctx.stroke();


          const tipRadius = config.lineWidth / 2;
          const holderRadius = tipRadius + (tipRadius * (4.1 / 2.55) - tipRadius) / 2;

          ctx.fillStyle = rotorStroke;
          ctx.beginPath();
          ctx.arc(state.px, state.py, holderRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = config.penColor;
          ctx.beginPath();
          ctx.arc(state.px, state.py, tipRadius, 0, Math.PI * 2);
          ctx.fill();

          const contactRadius = 6 / k;
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(state.contactX, state.contactY, contactRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        if (withStats) {
          let ratioText = "";
          if (config.numerator && config.denominator) {
            ratioText = `${config.numerator}/${config.denominator}`;
          } else {
            const outerC = calculateEllipseCircumference(config.outerRadius, config.statorAspect);
            const innerC = calculateEllipseCircumference(config.innerRadius, config.rotorAspect);
            const val = innerC / outerC;
            let bestN = 0, bestD = 1;
            let minError = Number.MAX_VALUE;
            for (let d = 1; d <= 1000; d++) {
              const n = Math.round(val * d);
              const error = Math.abs(val - n / d);
              if (error < minError) { bestN = n; bestD = d; minError = error; }
            }
            ratioText = `${bestN}/${bestD}`;
          }

          const colorName = COLOR_NAMES[config.penColor] || 'Custom';
          const lines = [
            `Color: ${colorName} (${config.penColor})`,
            `Thickness: ${config.lineWidth.toFixed(2)}`,
            `Opacity: ${config.opacity.toFixed(2)}`,
            `Rotor/stator ratio: ${ratioText}`,
            `Stator radius: ${config.outerRadius}`,
            `Rotor radius: ${config.innerRadius}`,
            `Pen offset: ${config.penOffset}`,
            `Stator eccentricity: ${config.statorAspect.toFixed(2)}`,
            `Rotor eccentricity: ${config.rotorAspect.toFixed(2)}`,
            `Initial angle along stator: ${(config.initialAngle ?? 0).toFixed(4)}`
          ];

          const fontSize = 14;
          const lineHeight = 18;
          const padding = 12;
          ctx.font = `bold ${fontSize}px Inter, monospace`;

          let maxWidth = 0;
          lines.forEach(line => {
            const m = ctx.measureText(line);
            if (m.width > maxWidth) maxWidth = m.width;
          });

          const boxWidth = maxWidth + (padding * 2);
          const boxHeight = (lines.length * lineHeight) + (padding * 2);
          const margin = 20;
          const footerSpace = footerFontSize + footerPaddingBottom + 10;
          const boxX = margin;
          const boxY = height - boxHeight - margin - footerSpace;

          ctx.fillStyle = badgeBgColor;
          drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 8);
          ctx.fillStyle = statsTextColor;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          lines.forEach((line, i) => {
            ctx.fillText(line, boxX + padding, boxY + padding + (i * lineHeight));
          });
        }

        ctx.save();
        ctx.font = `500 ${footerFontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = badgeBgColor;
        drawRoundedRect(ctx, fBoxX, fBoxY, fBoxWidth, fBoxHeight, 8);
        ctx.fillStyle = footerTextColor;
        ctx.fillText(footerText, width / 2, height - footerPaddingBottom);
        ctx.restore();

        const timestamp = Date.now();
        const link = document.createElement('a');
        const filename = withStats
          ? `IgorMineyevSpiroGraph-${timestamp}-with-data.png`
          : `IgorMineyevSpiroGraph-${timestamp}.png`;

        link.download = filename;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
      }

      onDownloaded();
    }
  }, [downloadState, onDownloaded, theme, config]);

  // Handle Capture (for native share on mobile)
  useEffect(() => {
    if (!captureState?.active || !traceCanvasRef.current) return;

    const sourceCanvas = traceCanvasRef.current;
    const withStats    = captureState.withStats;
    const captureTheme = theme;
    const { x, y, k } = transformRef.current;
    const dpr          = window.devicePixelRatio || 1;
    const width        = sourceCanvas.width;
    const height       = sourceCanvas.height;

    const bgColor         = captureTheme === 'dark' ? '#020617' : '#ffffff';
    const badgeBgColor    = captureTheme === 'dark' ? '#000000' : '#ffffff';
    const statsTextColor  = captureTheme === 'dark' ? '#ffffff' : '#000000';
    const footerTextColor = captureTheme === 'dark' ? '#475569' : '#94a3b8';
    const gearStroke      = captureTheme === 'dark' ? '#475569' : '#cbd5e1';
    const rotorStroke     = captureTheme === 'dark' ? '#566579' : '#b0bdcf';

    const footerText          = 'Play at https://igormineyev-spirograph.vercel.app/';
    const footerFontSize      = Math.max(12, width / 70);
    const footerPaddingBottom = footerFontSize * 0.8;

    const tCtx = sourceCanvas.getContext('2d');
    if (!tCtx) return;
    tCtx.font = `500 ${footerFontSize}px Inter, sans-serif`;
    const fTextWidth = tCtx.measureText(footerText).width;
    const fPadding   = footerFontSize * 0.5;
    const fBoxWidth  = fTextWidth + fPadding * 2;
    const fBoxHeight = footerFontSize + fPadding * 1.5;
    const fBoxX      = width / 2 - fBoxWidth / 2;
    const fBoxY      = height - footerPaddingBottom - footerFontSize - fPadding * 0.75;

    const targetWidth = 3000;
    const scaleFactor = Math.max(2, targetWidth / width);
    const tempCanvas  = document.createElement('canvas');
    tempCanvas.width  = width  * scaleFactor;
    tempCanvas.height = height * scaleFactor;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scaleFactor, scaleFactor);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.restore();

    const cx = sourceCanvas.width / 2 + x * dpr;
    const cy = sourceCanvas.height / 2 + y * dpr;
    const sk = k * dpr;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sk, sk);

    ctx.strokeStyle = config.penColor;
    ctx.lineWidth   = config.lineWidth;
    ctx.globalAlpha = config.opacity;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';

    const points = pointsRef.current;
    if (points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    }

    if (withStats) {
      ctx.globalAlpha = 1.0;
      const { outerRadius: R, innerRadius: r, penOffset: d, statorAspect, rotorAspect } = config;
      const sAspect    = statorAspect ?? 1.0;
      const rAspect    = rotorAspect  ?? 1.0;
      const isCircular = Math.abs(sAspect - 1.0) < 0.005 && Math.abs(rAspect - 1.0) < 0.005;
      const state      = isCircular ? calculateExactStep(0, R, r, d) : getGeometry(0, 0, R, r, d, sAspect, rAspect);
      const baseLW     = 2 / k;

      ctx.strokeStyle = gearStroke;
      ctx.lineWidth   = baseLW * 2;
      ctx.beginPath(); ctx.ellipse(0, 0, R, R * sAspect, 0, 0, Math.PI * 2); ctx.stroke();

      ctx.strokeStyle = rotorStroke;
      ctx.lineWidth   = baseLW * 2;
      ctx.beginPath(); ctx.ellipse(state.cx, state.cy, r, r * rAspect, state.phi, 0, Math.PI * 2); ctx.stroke();

      const tipRadius    = config.lineWidth / 2;
      const holderRadius = tipRadius + (tipRadius * (4.1 / 2.55) - tipRadius) / 2;
      ctx.fillStyle = rotorStroke; ctx.beginPath(); ctx.arc(state.px, state.py, holderRadius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = config.penColor; ctx.beginPath(); ctx.arc(state.px, state.py, tipRadius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(state.contactX, state.contactY, 6 / k, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();

    if (withStats) {
      let ratioText = '';
      if (config.numerator && config.denominator) {
        ratioText = `${config.numerator}/${config.denominator}`;
      } else {
        const outerC = calculateEllipseCircumference(config.outerRadius, config.statorAspect);
        const innerC = calculateEllipseCircumference(config.innerRadius, config.rotorAspect);
        const val    = innerC / outerC;
        let bestN = 0, bestD = 1, minError = Number.MAX_VALUE;
        for (let den = 1; den <= 1000; den++) {
          const num = Math.round(val * den);
          const err = Math.abs(val - num / den);
          if (err < minError) { bestN = num; bestD = den; minError = err; }
        }
        ratioText = `${bestN}/${bestD}`;
      }
      const colorName = COLOR_NAMES[config.penColor] || 'Custom';
      const lines = [
        `Color: ${colorName} (${config.penColor})`,
        `Thickness: ${config.lineWidth.toFixed(2)}`,
        `Opacity: ${config.opacity.toFixed(2)}`,
        `Rotor/stator ratio: ${ratioText}`,
        `Stator radius: ${config.outerRadius}`,
        `Rotor radius: ${config.innerRadius}`,
        `Pen offset: ${config.penOffset}`,
        `Stator eccentricity: ${config.statorAspect.toFixed(2)}`,
        `Rotor eccentricity: ${config.rotorAspect.toFixed(2)}`,
        `Initial angle along stator: ${(config.initialAngle ?? 0).toFixed(4)}`,
      ];
      const fontSize = 14, lineHeight = 18, padding = 12;
      ctx.font = `bold ${fontSize}px Inter, monospace`;
      let maxWidth = 0;
      lines.forEach(l => { const m = ctx.measureText(l); if (m.width > maxWidth) maxWidth = m.width; });
      const boxWidth  = maxWidth + padding * 2;
      const boxHeight = lines.length * lineHeight + padding * 2;
      const margin    = 20;
      const footerSpace = footerFontSize + footerPaddingBottom + 10;
      const boxX = margin, boxY = height - boxHeight - margin - footerSpace;
      ctx.fillStyle = badgeBgColor;
      drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 8);
      ctx.fillStyle = statsTextColor; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lines.forEach((line, i) => ctx.fillText(line, boxX + padding, boxY + padding + i * lineHeight));
    }

    ctx.save();
    ctx.font = `500 ${footerFontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = badgeBgColor;
    drawRoundedRect(ctx, fBoxX, fBoxY, fBoxWidth, fBoxHeight, 8);
    ctx.fillStyle = footerTextColor;
    ctx.fillText(footerText, width / 2, height - footerPaddingBottom);
    ctx.restore();

    tempCanvas.toBlob(blob => { if (blob) onImageCaptured(blob); }, 'image/png');
  }, [captureState, onImageCaptured, theme, config]);

  // Main Animation Loop
  const animate = useCallback(() => {
    if (!traceCanvasRef.current || !gearsCanvasRef.current || !containerRef.current) return;

    const traceCtx = traceCanvasRef.current.getContext('2d');
    const gearsCtx = gearsCanvasRef.current.getContext('2d');
    if (!traceCtx || !gearsCtx) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    if (width === 0 || height === 0) {
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    const { outerRadius: R, innerRadius: r, penOffset: d, speed, showGears, statorAspect, rotorAspect, reverse } = config;
    const sAspect = statorAspect ?? 1.0;
    const rAspect = rotorAspect ?? 1.0;
    const isCircular = Math.abs(sAspect - 1.0) < 0.005 && Math.abs(rAspect - 1.0) < 0.005;

    // Apply any pending angle change from the Initial angle slider.
    // Doing this here (inside the rAF callback) is safe — no physics is running yet.
    if (pendingAngleRef.current !== null) {
      angleRef.current      = pendingAngleRef.current;
      rotorParamRef.current = 0;
      pendingAngleRef.current = null;
    }

    // ── Fade-in + speed ramp ──────────────────────────────────────────────────
    // Timeline from when a new curve starts (gearFadeStartRef):
    //   0 – 1 s  : gears fade in (stationary, no physics)
    //   1 – 2 s  : gears fully visible, speed ramps 0 → full using smoothstep
    //   2 s +    : normal full-speed movement
    //
    // smoothstep(x) = x²(3 - 2x)  — matches the Python video renderer exactly.
    const FADE_MS  = 1000;  // duration of fade-in
    const RAMP_MS  = 1000;  // duration of speed ramp after fade completes

    const elapsed    = Date.now() - gearFadeStartRef.current;
    const fadeFactor = Math.min(1, elapsed / FADE_MS);           // 0→1 over fade
    const fadeComplete = elapsed >= FADE_MS;

    // smoothstep speed multiplier: 0 at start of ramp, 1 at end
    const rampRaw = Math.min(1, Math.max(0, (elapsed - FADE_MS) / RAMP_MS));
    const speedMul = rampRaw * rampRaw * (3 - 2 * rampRaw);     // smoothstep

    if (isPlaying && fadeComplete) {
      const sign  = reverse ? -1 : 1;
      const dt    = sign * 0.002 * speedMul;   // scaled by smoothstep ramp
      const steps = Math.ceil(speed * 5);

      if (dt !== 0) {
        for (let i = 0; i < steps; i++) {
          let state;
          if (isCircular) {
            angleRef.current += dt;
            state = calculateExactStep(angleRef.current, R, r, d);
          } else {
            state = calculatePhysicsStep(
              angleRef.current, dt, rotorParamRef.current,
              R, r, d, sAspect, rAspect
            );
            angleRef.current       += dt;
            rotorParamRef.current   = state.newU;
            rotorRotationRef.current = state.phi;
          }
          pointsRef.current.push({ x: state.px, y: state.py });
        }

        if (isCircular) {
          const state = calculateExactStep(angleRef.current, R, r, d);
          rotorRotationRef.current = state.phi;
        }
      }
    }

    const dpr = window.devicePixelRatio || 1;
    const { x, y, k } = transformRef.current;

    const centerX = (width / 2) + x;
    const centerY = (height / 2) + y;

    traceCtx.setTransform(1, 0, 0, 1, 0, 0);
    traceCtx.clearRect(0, 0, traceCanvasRef.current.width, traceCanvasRef.current.height);
    traceCtx.setTransform(k * dpr, 0, 0, k * dpr, centerX * dpr, centerY * dpr);

    traceCtx.strokeStyle = config.penColor;
    traceCtx.lineWidth = config.lineWidth;
    traceCtx.globalAlpha = config.opacity;
    traceCtx.lineJoin = 'round';
    traceCtx.lineCap = 'round';

    const points = pointsRef.current;
    if (points.length > 0) {
      traceCtx.beginPath();
      traceCtx.moveTo(points[0].x, points[0].y);
      const stride = k < 0.2 ? 5 : 1;
      for (let i = 1; i < points.length; i += stride) {
        traceCtx.lineTo(points[i].x, points[i].y);
      }
      if (stride > 1) traceCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      traceCtx.stroke();
    }

    gearsCtx.setTransform(1, 0, 0, 1, 0, 0);
    gearsCtx.clearRect(0, 0, gearsCanvasRef.current.width, gearsCanvasRef.current.height);

    if (showGears) {
      gearsCtx.setTransform(k * dpr, 0, 0, k * dpr, centerX * dpr, centerY * dpr);

      const state = isCircular
        ? calculateExactStep(angleRef.current, R, r, d)
        : getGeometry(angleRef.current, rotorParamRef.current, R, r, d, sAspect, rAspect);

      const baseLW = 2 / k;
      const thinLW = 1 / k;

      const gearStroke  = theme === 'dark' ? '#475569' : '#cbd5e1';
      const rotorStroke = theme === 'dark' ? '#566579' : '#b0bdcf';
      const armStroke   = theme === 'dark' ? '#64748b' : '#94a3b8';

      // All gear elements fade in together over the first second (fadeFactor 0→1).
      // After that they remain at their normal opacity.
      gearsCtx.globalAlpha = 0.35 * fadeFactor;

      gearsCtx.strokeStyle = gearStroke;
      gearsCtx.lineWidth = baseLW * 2;
      gearsCtx.beginPath();
      gearsCtx.ellipse(0, 0, R, R * sAspect, 0, 0, Math.PI * 2);
      gearsCtx.stroke();

      gearsCtx.strokeStyle = rotorStroke;
      gearsCtx.lineWidth = baseLW * 2;
      gearsCtx.beginPath();
      gearsCtx.ellipse(state.cx, state.cy, r, r * rAspect, state.phi, 0, Math.PI * 2);
      gearsCtx.stroke();

      const tipRadius    = config.lineWidth / 2;
      const holderRadius = tipRadius + (tipRadius * (4.1 / 2.55) - tipRadius) / 2;

      gearsCtx.fillStyle = rotorStroke;
      gearsCtx.beginPath();
      gearsCtx.arc(state.px, state.py, holderRadius, 0, Math.PI * 2);
      gearsCtx.fill();

      gearsCtx.fillStyle = config.penColor;
      gearsCtx.beginPath();
      gearsCtx.arc(state.px, state.py, tipRadius, 0, Math.PI * 2);
      gearsCtx.fill();

      // Red dot fades in with the rest (fadeFactor), reaching full opacity after 1s.
      gearsCtx.globalAlpha = fadeFactor;
      const dotRadius = navigator.maxTouchPoints > 0 ? 3 / k : 6 / k;
      gearsCtx.fillStyle = '#ef4444';
      gearsCtx.beginPath();
      gearsCtx.arc(state.contactX, state.contactY, dotRadius, 0, Math.PI * 2);
      gearsCtx.fill();

      gearsCtx.globalAlpha = 1.0;
    }

    requestRef.current = requestAnimationFrame(animate);

  }, [config, isPlaying, theme]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [animate]);


  // --- INTERACTION HANDLERS ---
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const sensitivity = 0.001;
    const delta = -e.deltaY;
    const scaleFactor = Math.exp(delta * sensitivity);

    onTransformChange(prev => {
      const newK = Math.max(0.1, Math.min(20, prev.k * scaleFactor));
      const W = rect.width;
      const H = rect.height;
      const worldX = (mouseX - (W / 2 + prev.x)) / prev.k;
      const worldY = (mouseY - (H / 2 + prev.y)) / prev.k;
      const newX = mouseX - W / 2 - worldX * newK;
      const newY = mouseY - H / 2 - worldY * newK;
      return { x: newX, y: newY, k: newK };
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    prevPinchDistRef.current = null;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    pointersRef.current.delete(e.pointerId);
    prevPinchDistRef.current = null;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pointers = pointersRef.current;
    if (!pointers.has(e.pointerId)) return;

    if (pointers.size === 1) {
      const prev = pointers.get(e.pointerId)!;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      onTransformChange(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    else if (pointers.size === 2) {
      const points = Array.from(pointers.entries());
      const currentId = e.pointerId;
      const otherPoint = points.find(p => p[0] !== currentId);

      if (otherPoint) {
        const p1 = { x: e.clientX, y: e.clientY };
        const p2 = otherPoint[1];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

        if (prevPinchDistRef.current !== null) {
          const scaleFactor = dist / prevPinchDistRef.current;
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;

          if (Math.abs(scaleFactor - 1) > 0.005) {
            onTransformChange(prev => {
              const newK = Math.max(0.1, Math.min(20, prev.k * scaleFactor));
              if (!containerRef.current) return { ...prev, k: newK };

              const rect = containerRef.current.getBoundingClientRect();
              const mouseX = midX - rect.left;
              const mouseY = midY - rect.top;
              const W = rect.width;
              const H = rect.height;

              const worldX = (mouseX - (W / 2 + prev.x)) / prev.k;
              const worldY = (mouseY - (H / 2 + prev.y)) / prev.k;

              const newX = mouseX - W / 2 - worldX * newK;
              const newY = mouseY - H / 2 - worldY * newK;

              return { x: newX, y: newY, k: newK };
            });
          }
        }
        prevPinchDistRef.current = dist;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    }
  };

  return (
    <div
      ref={containerRef}
      style={isCursorHidden ? { cursor: 'none' } : undefined}
      className={`relative w-full h-full overflow-hidden touch-none ${isCursorHidden ? 'cursor-none' : 'cursor-grab active:cursor-grabbing'}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <canvas ref={traceCanvasRef} className="absolute top-0 left-0 w-full h-full z-10" />
      <canvas ref={gearsCanvasRef} className="absolute top-0 left-0 w-full h-full z-20 pointer-events-none" />
    </div>
  );
};