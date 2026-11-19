import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StrokeEvaluationResult,
  StrokePoint,
  UserStroke,
  WritingBrushStyle,
  WritingMode,
} from '../types/writing';
import { evaluateUserStroke, sampleSvgPath } from '../utils/strokeGeometry';

export interface WritingCanvasProps {
  char: string;
  strokePaths: string[] | null;
  loadingStrokes: boolean;
  mode: WritingMode;
  brushStyle: WritingBrushStyle;
  showGrid: boolean;
  showGuide: boolean;
  showStrokeNumbers: boolean;
  /** Number of strokes already accepted in Learn / Recall mode */
  completedCount: number;
  /** Freehand strokes managed by parent so Undo/Clear/Score work seamlessly */
  freehandStrokes: UserStroke[];
  /** Incrementing trigger to flash a hint animation for the current stroke */
  hintTrigger: number;
  /** Optional stroke index highlighted from the step-by-step diagram strip */
  inspectedStrokeIndex: number | null;
  /** Playback state for full stroke-order animation */
  isAnimating: boolean;
  animationSpeed: number;
  onAnimationEnd: () => void;
  /** Called when user draws a valid stroke in Learn or Recall mode */
  onStrokeAccepted: (result: StrokeEvaluationResult, stroke: UserStroke) => void;
  /** Called when user draws an invalid stroke in Learn or Recall mode */
  onStrokeRejected: (result: StrokeEvaluationResult) => void;
  /** Called when user finishes a stroke in Freehand mode */
  onFreehandStrokeAdd: (stroke: UserStroke) => void;
}

/**
 * Draw a single stroke with smooth quadratic segments and dynamic brush width
 * (calligraphic fude taper or crisp uniform pen).
 */
function drawInkStroke(
  ctx: CanvasRenderingContext2D,
  points: StrokePoint[],
  canvasCssSize: number,
  brushStyle: WritingBrushStyle,
  color: string
) {
  if (points.length === 0) return;
  const scale = canvasCssSize / 109;
  const baseWidth =
    brushStyle === 'fude'
      ? Math.max(8, canvasCssSize * 0.042)
      : Math.max(4.5, canvasCssSize * 0.024);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (points.length === 1) {
    const p = points[0];
    ctx.beginPath();
    ctx.arc(p.x * scale, p.y * scale, baseWidth * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (brushStyle === 'pen') {
    ctx.lineWidth = baseWidth;
    ctx.beginPath();
    ctx.moveTo(points[0].x * scale, points[0].y * scale);
    for (let i = 1; i < points.length - 1; i++) {
      const mx = ((points[i].x + points[i + 1].x) / 2) * scale;
      const my = ((points[i].y + points[i + 1].y) / 2) * scale;
      ctx.quadraticCurveTo(points[i].x * scale, points[i].y * scale, mx, my);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x * scale, last.y * scale);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Calligraphic Fude Brush: variable width driven by pressure, velocity & stroke taper
  let prevWidth = baseWidth * 0.92;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const dist = Math.hypot((p1.x - p0.x) * scale, (p1.y - p0.y) * scale);
    const dt = Math.max(1, p1.t - p0.t);
    const velocity = dist / dt; // px per ms

    // Velocity narrows brush smoothly; real stylus pressure modulates thickness
    const velFactor = Math.max(0.46, Math.min(1.18, 1.12 - velocity * 0.24));
    const pressFactor = 0.65 + Math.max(0.15, Math.min(1, p1.pressure)) * 0.55;
    // Slight taper on entry and exit
    const progress = i / Math.max(1, points.length - 1);
    const taper =
      progress < 0.08
        ? 0.8 + progress * 2.5
        : progress > 0.86
        ? Math.max(0.35, 1 - (progress - 0.86) * 4.5)
        : 1;

    const targetWidth = baseWidth * velFactor * pressFactor * taper;
    const smoothWidth = prevWidth * 0.62 + targetWidth * 0.38;
    prevWidth = smoothWidth;

    ctx.lineWidth = Math.max(2.2, smoothWidth);
    ctx.beginPath();
    ctx.moveTo(p0.x * scale, p0.y * scale);
    ctx.lineTo(p1.x * scale, p1.y * scale);
    ctx.stroke();
  }

  ctx.restore();
}

export const WritingCanvas: React.FC<WritingCanvasProps> = ({
  char,
  strokePaths,
  loadingStrokes,
  mode,
  brushStyle,
  showGrid,
  showGuide,
  showStrokeNumbers,
  completedCount,
  freehandStrokes,
  hintTrigger,
  inspectedStrokeIndex,
  isAnimating,
  animationSpeed,
  onAnimationEnd,
  onStrokeAccepted,
  onStrokeRejected,
  onFreehandStrokeAdd,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<number>(360);

  // Live drawing refs (avoid React re-renders on every pointermove for 60fps ink)
  const isDrawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const currentPointsRef = useRef<StrokePoint[]>([]);

  // Transient visual states
  const [rejectedFlashStroke, setRejectedFlashStroke] = useState<StrokePoint[] | null>(
    null
  );
  const [acceptedFlashIdx, setAcceptedFlashIdx] = useState<number | null>(null);
  const [hintProgress, setHintProgress] = useState<number | null>(null);
  const [animState, setAnimState] = useState<{ strokeIdx: number; progress: number } | null>(
    null
  );

  // Measure container responsively
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const s = Math.max(220, Math.round(rect.width));
      setCanvasSize(s);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Precompute start points & directions for stroke badges/arrows
  const strokeMetadata = useMemo(() => {
    if (!strokePaths) return [];
    return strokePaths.map((d) => {
      const pts = sampleSvgPath(d, 24);
      const start = pts[0] ?? { x: 54, y: 54 };
      const ahead = pts[Math.min(4, pts.length - 1)] ?? start;
      const angleDeg =
        (Math.atan2(ahead.y - start.y, ahead.x - start.x) * 180) / Math.PI;
      return { start, angleDeg, pts };
    });
  }, [strokePaths]);

  // Detect dark mode for canvas ink color
  const getInkColor = useCallback(() => {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
      return '#F1F5F9';
    }
    return '#111827';
  }, []);

  // Redraw HTML5 canvas (freehand strokes + live stroke + optional coral error flash)
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const targetW = Math.round(canvasSize * dpr);
    const targetH = Math.round(canvasSize * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasSize, canvasSize);

    const inkColor = getInkColor();

    if (mode === 'freehand') {
      for (const st of freehandStrokes) {
        drawInkStroke(ctx, st.points, canvasSize, brushStyle, inkColor);
      }
    }

    if (rejectedFlashStroke && rejectedFlashStroke.length > 0) {
      drawInkStroke(ctx, rejectedFlashStroke, canvasSize, brushStyle, '#DC2626');
    }

    if (currentPointsRef.current.length > 0) {
      drawInkStroke(ctx, currentPointsRef.current, canvasSize, brushStyle, inkColor);
    }
  }, [canvasSize, mode, freehandStrokes, brushStyle, rejectedFlashStroke, getInkColor]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Observe dark mode class changes on <html> so freehand canvas ink re-colors immediately
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(() => redrawCanvas());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [redrawCanvas]);

  // Hint sweep animation along current stroke
  useEffect(() => {
    if (hintTrigger <= 0 || !strokePaths || completedCount >= strokePaths.length) {
      return;
    }
    let rafId = 0;
    const startTs = performance.now();
    const duration = 720;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / duration);
      setHintProgress(t);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        window.setTimeout(() => setHintProgress(null), 260);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [hintTrigger, strokePaths, completedCount]);

  // Full stroke-order sequential playback animation
  useEffect(() => {
    if (!isAnimating || !strokePaths || strokePaths.length === 0) {
      setAnimState(null);
      return;
    }

    let rafId = 0;
    let idx = 0;
    let strokeStart = performance.now();
    const baseMsPerStroke = 680 / Math.max(0.4, animationSpeed);
    const pauseBetweenMs = 170 / Math.max(0.4, animationSpeed);

    const tick = (now: number) => {
      const elapsed = now - strokeStart;
      if (elapsed <= baseMsPerStroke) {
        setAnimState({ strokeIdx: idx, progress: Math.min(1, elapsed / baseMsPerStroke) });
      } else if (elapsed <= baseMsPerStroke + pauseBetweenMs) {
        setAnimState({ strokeIdx: idx, progress: 1 });
      } else {
        idx += 1;
        if (idx >= strokePaths.length) {
          setAnimState(null);
          onAnimationEnd();
          return;
        }
        strokeStart = now;
        setAnimState({ strokeIdx: idx, progress: 0 });
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isAnimating, strokePaths, animationSpeed, onAnimationEnd]);

  const toNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 109;
    const ny = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 109;
    const pressure =
      e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.65;
    return {
      x: Math.max(0, Math.min(109, nx)),
      y: Math.max(0, Math.min(109, ny)),
      pressure,
      t: performance.now(),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isAnimating) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    activePointerIdRef.current = e.pointerId;
    setRejectedFlashStroke(null);
    currentPointsRef.current = [toNormalizedPoint(e)];
    redrawCanvas();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    const pt = toNormalizedPoint(e);
    const pts = currentPointsRef.current;
    const last = pts[pts.length - 1];
    // Filter micro-jitter (< 0.6 units in 109 space)
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 0.6) {
      pts.push(pt);
      redrawCanvas();
    }
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if already released
    }

    const drawn = [...currentPointsRef.current];
    currentPointsRef.current = [];
    redrawCanvas();

    if (drawn.length < 2) return;

    // Freehand mode OR characters without KanjiVG vector paths
    if (mode === 'freehand' || !strokePaths || strokePaths.length === 0) {
      onFreehandStrokeAdd({ points: drawn });
      return;
    }

    // Guided modes (Learn & Recall)
    if (completedCount >= strokePaths.length) return;

    const targetPath = strokePaths[completedCount];
    const evalRes = evaluateUserStroke(drawn, targetPath, mode === 'recall');

    if (evalRes.accepted) {
      setAcceptedFlashIdx(completedCount);
      window.setTimeout(() => setAcceptedFlashIdx(null), 380);
      onStrokeAccepted(evalRes, { points: drawn, score: evalRes.score });
    } else {
      setRejectedFlashStroke(drawn);
      window.setTimeout(() => setRejectedFlashStroke(null), 380);
      onStrokeRejected(evalRes);
    }
  };

  const currentGuideIdx =
    inspectedStrokeIndex !== null
      ? inspectedStrokeIndex
      : mode === 'learn' && strokePaths && completedCount < strokePaths.length
      ? completedCount
      : null;

  const isGuidedComplete =
    mode !== 'freehand' &&
    Boolean(strokePaths && strokePaths.length > 0 && completedCount >= strokePaths.length);

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-w-[420px] aspect-square mx-auto rounded-2xl border-2 overflow-hidden select-none transition-colors ${
        isGuidedComplete
          ? 'border-emerald-500 dark:border-emerald-400 bg-[#FCFBF7] dark:bg-[#141820]'
          : 'border-slate-300 dark:border-slate-700 bg-[#FCFBF7] dark:bg-[#141820]'
      }`}
    >
      {/* Layer 1: Genkōyōshi / Masume Paper Grid & Vector Guides */}
      <svg
        viewBox="0 0 109 109"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        {/* Japanese Genkōyōshi Square Practice Grid */}
        {showGrid && (
          <g className="text-slate-300/85 dark:text-slate-700/80">
            {/* Inner proportion box */}
            <rect
              x="9"
              y="9"
              width="91"
              height="91"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.45"
              strokeDasharray="2 2"
            />
            {/* Vertical center axis */}
            <line
              x1="54.5"
              y1="0"
              x2="54.5"
              y2="109"
              stroke="currentColor"
              strokeWidth="0.6"
              strokeDasharray="2.5 2.5"
            />
            {/* Horizontal center axis */}
            <line
              x1="0"
              y1="54.5"
              x2="109"
              y2="54.5"
              stroke="currentColor"
              strokeWidth="0.6"
              strokeDasharray="2.5 2.5"
            />
            {/* Subtle diagonal balance lines */}
            <line
              x1="9"
              y1="9"
              x2="100"
              y2="100"
              stroke="currentColor"
              strokeWidth="0.3"
              opacity="0.45"
            />
            <line
              x1="100"
              y1="9"
              x2="9"
              y2="100"
              stroke="currentColor"
              strokeWidth="0.3"
              opacity="0.45"
            />
          </g>
        )}

        {/* Fallback font watermark if KanjiVG paths unavailable */}
        {!strokePaths && !loadingStrokes && showGuide && (
          <text
            x="54.5"
            y="84"
            textAnchor="middle"
            className="font-jp fill-slate-300/60 dark:fill-slate-700/60"
            fontSize="82"
          >
            {char}
          </text>
        )}

        {/* Watermark reference character strokes (Learn mode or Freehand w/ guide ON, or Recall peek) */}
        {strokePaths && showGuide && !isAnimating && (
          <g
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-slate-300/75 dark:stroke-slate-700/80"
          >
            {strokePaths.map((d, i) => (
              <path key={`ghost-${i}`} d={d} strokeWidth="4.2" />
            ))}
          </g>
        )}

        {/* Completed strokes in Guided modes (Learn & Recall) */}
        {strokePaths && mode !== 'freehand' && !isAnimating && (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {strokePaths.slice(0, completedCount).map((d, i) => {
              const justAccepted = acceptedFlashIdx === i;
              return (
                <path
                  key={`done-${i}`}
                  d={d}
                  strokeWidth="5.4"
                  className={
                    justAccepted
                      ? 'stroke-emerald-600 dark:stroke-emerald-400 transition-colors duration-300'
                      : 'stroke-slate-900 dark:stroke-slate-100 transition-colors duration-300'
                  }
                />
              );
            })}
          </g>
        )}

        {/* Highlighted / Next Stroke Guide (in Learn mode or when clicking a step in the strip) */}
        {strokePaths &&
          currentGuideIdx !== null &&
          strokePaths[currentGuideIdx] &&
          !isAnimating && (
            <g>
              <path
                d={strokePaths[currentGuideIdx]}
                fill="none"
                stroke="#0284C7"
                strokeOpacity={inspectedStrokeIndex !== null ? 0.85 : 0.42}
                strokeWidth={inspectedStrokeIndex !== null ? 5.6 : 4.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={inspectedStrokeIndex !== null ? undefined : '4 3'}
              />
              {/* Start marker & directional arrow indicator */}
              {strokeMetadata[currentGuideIdx] && (
                <g
                  transform={`translate(${strokeMetadata[currentGuideIdx].start.x}, ${strokeMetadata[currentGuideIdx].start.y})`}
                >
                  <g transform={`rotate(${strokeMetadata[currentGuideIdx].angleDeg})`}>
                    <polygon points="5.6,-2.3 10.2,0 5.6,2.3" fill="#0284C7" />
                  </g>
                  <circle r="4.6" fill="#0284C7" />
                  <text
                    x="0"
                    y="1.7"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="4.6"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    {currentGuideIdx + 1}
                  </text>
                </g>
              )}
            </g>
          )}

        {/* Optional all-stroke start numbers overlay in Learn/Freehand mode */}
        {strokePaths &&
          showStrokeNumbers &&
          showGuide &&
          !isAnimating &&
          strokeMetadata.map((meta, i) => {
            if (i === currentGuideIdx) return null;
            if (mode !== 'freehand' && i < completedCount) return null;
            return (
              <g
                key={`num-${i}`}
                transform={`translate(${meta.start.x}, ${meta.start.y})`}
                opacity="0.72"
              >
                <circle
                  r="3.4"
                  className="fill-slate-500 dark:fill-slate-500"
                />
                <text
                  x="0"
                  y="1.25"
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="3.6"
                  fontWeight="700"
                  fontFamily="monospace"
                >
                  {i + 1}
                </text>
              </g>
            );
          })}

        {/* Hint sweep animation (after mistake or pressing Hint button) */}
        {strokePaths &&
          hintProgress !== null &&
          completedCount < strokePaths.length &&
          !isAnimating && (
            <path
              d={strokePaths[completedCount]}
              fill="none"
              stroke="#0284C7"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={100}
              strokeDasharray="100"
              strokeDashoffset={100 - hintProgress * 100}
            />
          )}

        {/* Full Stroke-Order Sequential Playback Animation */}
        {strokePaths && isAnimating && animState && (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Ghost outline underneath */}
            {strokePaths.map((d, i) => (
              <path
                key={`anim-bg-${i}`}
                d={d}
                strokeWidth="4"
                className="stroke-slate-200 dark:stroke-slate-800"
              />
            ))}
            {/* Completed strokes in playback */}
            {strokePaths.slice(0, animState.strokeIdx).map((d, i) => (
              <path
                key={`anim-done-${i}`}
                d={d}
                strokeWidth="5.4"
                className="stroke-slate-900 dark:stroke-slate-100"
              />
            ))}
            {/* Active animated stroke */}
            {strokePaths[animState.strokeIdx] && (
              <>
                <path
                  d={strokePaths[animState.strokeIdx]}
                  stroke="#0284C7"
                  strokeWidth="6"
                  pathLength={100}
                  strokeDasharray="100"
                  strokeDashoffset={100 - animState.progress * 100}
                />
                {strokeMetadata[animState.strokeIdx] && (
                  <g
                    transform={`translate(${strokeMetadata[animState.strokeIdx].start.x}, ${strokeMetadata[animState.strokeIdx].start.y})`}
                  >
                    <circle r="4.6" fill="#0284C7" />
                    <text
                      x="0"
                      y="1.7"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="4.6"
                      fontWeight="700"
                      fontFamily="monospace"
                    >
                      {animState.strokeIdx + 1}
                    </text>
                  </g>
                )}
              </>
            )}
          </g>
        )}
      </svg>

      {/* Layer 2: Interactive Pointer Brush Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
        aria-label={`Kanvas latihan menulis karakter ${char}`}
      />

      {/* Loading Indicator Overlay for on-demand N3–N1 KanjiVG SVG fetch */}
      {loadingStrokes && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#FCFBF7]/80 dark:bg-[#141820]/80 backdrop-blur-[1px] pointer-events-none">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 font-mono-num">
            Memuat data urutan goresan {char}...
          </div>
        </div>
      )}

      {/* Subtle corner playback indicator */}
      {isAnimating && animState && strokePaths && (
        <div className="absolute bottom-2.5 right-3 text-xs font-mono-num font-semibold text-[#0284C7] pointer-events-none">
          Goresan {animState.strokeIdx + 1} / {strokePaths.length}
        </div>
      )}
    </div>
  );
};
