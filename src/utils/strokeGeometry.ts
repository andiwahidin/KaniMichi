import type { StrokeEvaluationResult, StrokePoint, UserStroke } from '../types/writing';

export interface Vec2 {
  x: number;
  y: number;
}

const SAMPLE_COUNT = 24;
const sampledPathCache = new Map<string, Vec2[]>();

/**
 * Sample an SVG path `d` string (KanjiVG 0..109 space) into N equidistant points
 * using native browser SVGPathElement geometry.
 */
export function sampleSvgPath(pathD: string, count = SAMPLE_COUNT): Vec2[] {
  const key = `${count}:${pathD}`;
  const cached = sampledPathCache.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    return [];
  }

  const svgNs = 'http://www.w3.org/2000/svg';
  const pathEl = document.createElementNS(svgNs, 'path');
  pathEl.setAttribute('d', pathD);

  let totalLen = 0;
  try {
    totalLen = pathEl.getTotalLength();
  } catch {
    return [];
  }

  if (!Number.isFinite(totalLen) || totalLen <= 0.001) {
    return [];
  }

  const pts: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const dist = (totalLen * i) / (count - 1);
    const pt = pathEl.getPointAtLength(dist);
    pts.push({ x: pt.x, y: pt.y });
  }

  sampledPathCache.set(key, pts);
  return pts;
}

export function polylineLength(pts: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

export function resamplePolyline(pts: Vec2[], count = SAMPLE_COUNT): Vec2[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: count }, () => ({ ...pts[0] }));

  const totalLen = polylineLength(pts);
  if (totalLen <= 0.001) {
    return Array.from({ length: count }, () => ({ ...pts[0] }));
  }

  const out: Vec2[] = [{ ...pts[0] }];
  const step = totalLen / (count - 1);
  let accum = 0;
  let i = 1;
  let prev = pts[0];

  while (out.length < count && i < pts.length) {
    const cur = pts[i];
    const segLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (accum + segLen >= step) {
      const t = segLen > 0 ? (step - accum) / segLen : 0;
      const nx = prev.x + t * (cur.x - prev.x);
      const ny = prev.y + t * (cur.y - prev.y);
      const nextPt = { x: nx, y: ny };
      out.push(nextPt);
      prev = nextPt;
      accum = 0;
    } else {
      accum += segLen;
      prev = cur;
      i += 1;
    }
  }

  while (out.length < count) {
    out.push({ ...pts[pts.length - 1] });
  }

  return out;
}

function meanPairDistance(a: Vec2[], b: Vec2[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 999;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  }
  return sum / n;
}

function directionCosine(a: Vec2[], b: Vec2[]): number {
  const ax = a[a.length - 1].x - a[0].x;
  const ay = a[a.length - 1].y - a[0].y;
  const bx = b[b.length - 1].x - b[0].x;
  const by = b[b.length - 1].y - b[0].y;
  const magA = Math.hypot(ax, ay);
  const magB = Math.hypot(bx, by);
  if (magA < 4 || magB < 4) return 1; // Loop or dot — rely on path proximity
  return (ax * bx + ay * by) / (magA * magB);
}

/**
 * Evaluate a user's stroke against the expected KanjiVG reference stroke path.
 * Coordinate space is KanjiVG 0..109.
 * `lenient` is slightly more forgiving in Memory Recall mode (user has no visual outline).
 */
export function evaluateUserStroke(
  userPoints: StrokePoint[],
  referencePathD: string,
  lenient = false
): StrokeEvaluationResult {
  const refPts = sampleSvgPath(referencePathD, SAMPLE_COUNT);
  if (refPts.length < 2 || userPoints.length < 2) {
    return {
      accepted: false,
      score: 0,
      code: 'too-short',
      message: 'Goresan terlalu pendek — tarik garis dengan mantap.',
    };
  }

  const refLen = polylineLength(refPts);
  const userLen = polylineLength(userPoints);

  // Reject tiny accidental taps unless the reference stroke itself is a very small dot/tick
  const isDotStroke = refLen < 16;
  if (!isDotStroke && userLen < Math.max(8, refLen * 0.3)) {
    return {
      accepted: false,
      score: 18,
      code: 'too-short',
      message: 'Goresan terlalu pendek — tarik mengikuti panjang garis panduan.',
    };
  }

  const userResampled = resamplePolyline(userPoints, SAMPLE_COUNT);
  const refReversed = [...refPts].reverse();

  const forwardDist = meanPairDistance(userResampled, refPts);
  const reverseDist = meanPairDistance(userResampled, refReversed);
  const startDist = Math.hypot(
    userResampled[0].x - refPts[0].x,
    userResampled[0].y - refPts[0].y
  );
  const endDist = Math.hypot(
    userResampled[userResampled.length - 1].x - refPts[refPts.length - 1].x,
    userResampled[userResampled.length - 1].y - refPts[refPts.length - 1].y
  );

  // Check if user drew the stroke in the exact opposite direction
  const startEndSpan = Math.hypot(
    refPts[refPts.length - 1].x - refPts[0].x,
    refPts[refPts.length - 1].y - refPts[0].y
  );
  const dirCos = directionCosine(userResampled, refPts);

  if (
    !isDotStroke &&
    startEndSpan > 14 &&
    (reverseDist < forwardDist * 0.72 || (dirCos < -0.35 && reverseDist < 28))
  ) {
    return {
      accepted: false,
      score: 25,
      code: 'reversed',
      message: 'Arah goresan terbalik — mulai dari titik awal bernomor ke arah panah.',
    };
  }

  // Tolerance thresholds (KanjiVG canvas is 109 units wide)
  const toleranceBoost = lenient ? 1.24 : 1.0;
  const maxMeanDist = (isDotStroke ? 23 : 20) * toleranceBoost;
  const maxEndpointDist = (isDotStroke ? 28 : 26) * toleranceBoost;

  // Score calculation (0..100)
  const pathScore = Math.max(0, 100 - (forwardDist / maxMeanDist) * 58);
  const startPenalty = Math.max(0, (startDist - 12) * 1.1);
  const endPenalty = Math.max(0, (endDist - 14) * 0.9);
  const lenRatio = userLen / Math.max(1, refLen);
  const lenPenalty =
    lenRatio < 0.55
      ? (0.55 - lenRatio) * 45
      : lenRatio > 1.75
      ? Math.min(25, (lenRatio - 1.75) * 20)
      : 0;

  const rawScore = Math.round(
    Math.max(0, Math.min(100, pathScore - startPenalty - endPenalty - lenPenalty))
  );

  if (forwardDist > maxMeanDist || (startDist > maxEndpointDist && endDist > maxEndpointDist)) {
    return {
      accepted: false,
      score: Math.min(48, rawScore),
      code: startDist > maxEndpointDist ? 'wrong-position' : 'wrong-shape',
      message:
        startDist > maxEndpointDist
          ? 'Posisi awal melenceng — perhatikan urutan & titik mulai goresan.'
          : 'Bentuk lekukan belum tepat — ikuti arah lengkungan garis panduan.',
    };
  }

  if (rawScore >= 82) {
    return {
      accepted: true,
      score: rawScore,
      code: 'perfect',
      message: 'Sangat rapi! Lanjut ke goresan berikutnya.',
    };
  }

  if (rawScore >= 52) {
    return {
      accepted: true,
      score: rawScore,
      code: 'good',
      message: 'Bagus! Urutan dan arah goresan sudah tepat.',
    };
  }

  return {
    accepted: false,
    score: rawScore,
    code: 'wrong-shape',
    message: 'Bentuk goresan kurang presisi — coba tarik ulang lebih rapi.',
  };
}

/**
 * Evaluate freehand drawing against all reference strokes using an offscreen
 * 96x96 raster overlap (Dice/F1 similarity) so users get instant visual scoring
 * even without stroke-locking enabled.
 */
export function evaluateFreehandDrawing(
  userStrokes: UserStroke[],
  referencePaths: string[]
): { score: number; feedback: string } {
  if (typeof document === 'undefined' || userStrokes.length === 0 || referencePaths.length === 0) {
    return { score: 0, feedback: 'Belum ada goresan di kanvas.' };
  }

  const SIZE = 96;
  const scale = SIZE / 109;

  const renderRef = () => {
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8.5; // forgiving tolerance halo
    ctx.scale(scale, scale);
    for (const d of referencePaths) {
      const p = new Path2D(d);
      ctx.stroke(p);
    }
    return ctx.getImageData(0, 0, SIZE, SIZE).data;
  };

  const renderUser = () => {
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8.5;
    ctx.scale(scale, scale);
    for (const st of userStrokes) {
      if (st.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(st.points[0].x, st.points[0].y);
      for (let i = 1; i < st.points.length; i++) {
        ctx.lineTo(st.points[i].x, st.points[i].y);
      }
      ctx.stroke();
    }
    return ctx.getImageData(0, 0, SIZE, SIZE).data;
  };

  const refImg = renderRef();
  const usrImg = renderUser();
  if (!refImg || !usrImg) return { score: 0, feedback: 'Gagal mengevaluasi kanvas.' };

  let refPx = 0;
  let usrPx = 0;
  let overlapPx = 0;
  for (let i = 3; i < refImg.length; i += 4) {
    const rOn = refImg[i] > 40;
    const uOn = usrImg[i] > 40;
    if (rOn) refPx += 1;
    if (uOn) usrPx += 1;
    if (rOn && uOn) overlapPx += 1;
  }

  if (refPx === 0 || usrPx === 0) {
    return { score: 0, feedback: 'Tulis karakter terlebih dahulu sebelum menilai.' };
  }

  const dice = (2 * overlapPx) / (refPx + usrPx);
  // Stroke count proximity bonus/penalty
  const strokeDiff = Math.abs(userStrokes.length - referencePaths.length);
  const strokePenalty = Math.min(20, strokeDiff * 5);
  // Normalize Dice (~0.75 is visually excellent for hand-drawn kanji)
  const normalized = Math.min(100, Math.round((dice / 0.78) * 100) - strokePenalty);
  const finalScore = Math.max(0, Math.min(100, normalized));

  let feedback = 'Terus berlatih! Bandingkan proporsi goresanmu dengan bayangan referensi.';
  if (finalScore >= 85) {
    feedback = 'Luar biasa! Proporsi dan keseimbangan karakter sangat rapi.';
  } else if (finalScore >= 68) {
    feedback = 'Bagus! Bentuk karakter sudah jelas dan proporsional.';
  } else if (strokeDiff > 0) {
    feedback = `Jumlah goresanmu (${userStrokes.length}) berbeda dari standar (${referencePaths.length}). Cek urutan goresan!`;
  }

  return { score: finalScore, feedback };
}
