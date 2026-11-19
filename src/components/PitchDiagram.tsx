import React from 'react';
import {
  classifyPitchPattern,
  getPitchLevels,
  PITCH_PATTERN_META,
  splitIntoMoras,
} from '../utils/pitchAudio';

interface PitchDiagramProps {
  kana: string;
  accentNucleus: number;
  particle?: string;
  activeStep?: number | null;
  compact?: boolean;
  className?: string;
}

export const PitchDiagram: React.FC<PitchDiagramProps> = ({
  kana,
  accentNucleus,
  particle = 'が',
  activeStep = null,
  compact = false,
  className = '',
}) => {
  const moras = splitIntoMoras(kana);
  const { wordLevels, particleLevel } = getPitchLevels(moras.length, accentNucleus);
  const pattern = classifyPitchPattern(moras.length, accentNucleus);
  const meta = PITCH_PATTERN_META[pattern];

  const allNodes: { label: string; level: 'L' | 'H'; isParticle: boolean; isDropPoint: boolean }[] = [
    ...moras.map((m, idx) => ({
      label: m,
      level: wordLevels[idx],
      isParticle: false,
      isDropPoint: accentNucleus > 0 && idx + 1 === accentNucleus,
    })),
    ...(particle
      ? [
          {
            label: particle,
            level: particleLevel,
            isParticle: true,
            isDropPoint: false,
          },
        ]
      : []),
  ];

  const stepW = compact ? 44 : 58;
  const leftPad = compact ? 28 : 42;
  const rightPad = compact ? 22 : 28;
  const width = leftPad + Math.max(1, allNodes.length - 1) * stepW + rightPad;
  const height = compact ? 92 : 114;
  const highY = compact ? 24 : 30;
  const lowY = compact ? 54 : 66;
  const textY = compact ? 80 : 98;

  const points = allNodes.map((n, idx) => ({
    ...n,
    x: leftPad + idx * stepW,
    y: n.level === 'H' ? highY : lowY,
  }));

  return (
    <div className={`w-full overflow-x-auto no-scrollbar ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto max-w-full block select-none"
        style={{ minWidth: `${Math.min(width, compact ? 180 : 240)}px`, maxHeight: compact ? '96px' : '122px' }}
        role="img"
        aria-label={`Diagram nada pitch ${kana}: ${meta.name}`}
      >
        {/* Subtle High / Low Reference Guide Lines */}
        <line
          x1={compact ? 18 : 30}
          y1={highY}
          x2={width - 10}
          y2={highY}
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeDasharray="3 4"
        />
        <line
          x1={compact ? 18 : 30}
          y1={lowY}
          x2={width - 10}
          y2={lowY}
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeDasharray="3 4"
        />

        {/* High (H) / Low (L) Axis Labels */}
        <text
          x={compact ? 10 : 14}
          y={highY + 3.5}
          textAnchor="middle"
          fontSize={compact ? 9 : 10}
          fontWeight={700}
          className="fill-slate-400 dark:fill-slate-500"
        >
          T
        </text>
        <text
          x={compact ? 10 : 14}
          y={lowY + 3.5}
          textAnchor="middle"
          fontSize={compact ? 9 : 10}
          fontWeight={700}
          className="fill-slate-400 dark:fill-slate-500"
        >
          R
        </text>

        {/* Connecting Contour Segments */}
        {points.slice(0, -1).map((pt, idx) => {
          const next = points[idx + 1];
          const isDropEdge = pt.level === 'H' && next.level === 'L';
          const isParticleEdge = next.isParticle;
          return (
            <line
              key={`seg-${idx}`}
              x1={pt.x}
              y1={pt.y}
              x2={next.x}
              y2={next.y}
              stroke={isDropEdge ? '#E11D48' : meta.color}
              strokeWidth={compact ? 2.4 : 3}
              strokeDasharray={isParticleEdge ? '4 3' : undefined}
              strokeLinecap="round"
            />
          );
        })}

        {/* Mora Nodes + Kana Labels */}
        {points.map((pt, idx) => {
          const isActive = activeStep === idx;
          const r = compact ? (isActive ? 7.5 : 5.5) : isActive ? 9.5 : 7;

          return (
            <g key={`node-${idx}`}>
              {/* Active Beat Pulse Ring */}
              {isActive && (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={r + 5}
                  fill={meta.color}
                  fillOpacity={0.2}
                />
              )}

              {/* Downstep Accent Nucleus Marker */}
              {pt.isDropPoint && (
                <path
                  d={`M ${pt.x + 8} ${pt.y - 10} L ${pt.x + 14} ${pt.y - 4} M ${pt.x + 14} ${pt.y - 10} L ${pt.x + 14} ${pt.y - 4} L ${pt.x + 8} ${pt.y - 4}`}
                  fill="none"
                  stroke="#E11D48"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {pt.isParticle ? (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={r}
                  className="fill-white dark:fill-[#161A22]"
                  stroke={pt.level === 'L' && points[idx - 1]?.level === 'H' ? '#E11D48' : meta.color}
                  strokeWidth={2.2}
                  strokeDasharray="3 2"
                />
              ) : (
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={r}
                  fill={pt.isDropPoint ? '#E11D48' : meta.color}
                  stroke="#FFFFFF"
                  strokeWidth={1.8}
                />
              )}

              <text
                x={pt.x}
                y={textY}
                textAnchor="middle"
                fontSize={compact ? 14 : 17}
                fontWeight={pt.isParticle ? 500 : 700}
                className={`font-jp transition-colors ${
                  isActive
                    ? 'fill-[#0284C7] dark:fill-sky-400'
                    : pt.isParticle
                    ? 'fill-slate-400 dark:fill-slate-500'
                    : 'fill-slate-900 dark:fill-white'
                }`}
              >
                {pt.isParticle ? `(${pt.label})` : pt.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
