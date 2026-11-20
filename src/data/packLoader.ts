import { JlptLevel } from '../types/grammar';

export interface JlptLevelManifestEntry {
  count: number;
  packs: string[];
}

export interface JlptPackManifest {
  version: number;
  totalCount: number;
  levels: Record<string, JlptLevelManifestEntry>;
}

interface JlptPackFile<TItem> {
  level: JlptLevel;
  pack: string;
  items: TItem[];
}

export const ALL_JLPT_LEVELS: JlptLevel[] = [5, 4, 3, 2, 1];

function getNormalizedBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

export interface JlptPackLoader<TItem, TDataset> {
  loadManifest: () => Promise<JlptPackManifest>;
  loadLevel: (level: JlptLevel) => Promise<TItem[]>;
  loadLevels: (levels: JlptLevel[]) => Promise<TDataset>;
  loadAll: () => Promise<TDataset>;
  getLevelCountFromManifest: (manifest: JlptPackManifest, level: JlptLevel) => number;
}

/**
 * Reusable manifest-driven pack loader for JLPT N5–N1 datasets.
 * Enables lazy loading per level (e.g. only download N5 packs when studying N5)
 * and effortless addition of new question packs (e.g. n5-pack2.json) without modifying existing files.
 */
export function createJlptPackLoader<
  TItem extends { id: string; jlpt: JlptLevel; order?: number },
  TDataset,
>(config: {
  dir: string;
  label: string;
  buildDataset: (items: TItem[]) => TDataset;
}): JlptPackLoader<TItem, TDataset> {
  let manifestCache: JlptPackManifest | null = null;
  let manifestPromise: Promise<JlptPackManifest> | null = null;

  const levelCache = new Map<JlptLevel, TItem[]>();
  const levelPromises = new Map<JlptLevel, Promise<TItem[]>>();

  let allCache: TDataset | null = null;
  let allPromise: Promise<TDataset> | null = null;

  const loadManifest = async (): Promise<JlptPackManifest> => {
    if (manifestCache) return manifestCache;
    if (!manifestPromise) {
      const url = `${getNormalizedBaseUrl()}data/${config.dir}/manifest.json`;
      manifestPromise = fetch(url)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Gagal memuat indeks ${config.label} (HTTP ${res.status})`);
          }
          return res.json() as Promise<JlptPackManifest>;
        })
        .then((data) => {
          manifestCache = data;
          return data;
        })
        .catch((err) => {
          manifestPromise = null;
          throw err;
        });
    }
    return manifestPromise;
  };

  const loadLevel = async (level: JlptLevel): Promise<TItem[]> => {
    const existing = levelCache.get(level);
    if (existing) return existing;

    const inflight = levelPromises.get(level);
    if (inflight) return inflight;

    const promise = loadManifest()
      .then(async (manifest) => {
        const entry = manifest.levels[String(level)];
        const packs = entry?.packs ?? [];
        if (packs.length === 0) {
          levelCache.set(level, []);
          return [];
        }

        const base = `${getNormalizedBaseUrl()}data/${config.dir}/`;
        const results = await Promise.all(
          packs.map(async (packFile) => {
            const res = await fetch(`${base}${packFile}`);
            if (!res.ok) {
              throw new Error(
                `Gagal memuat paket ${config.label} N${level} (${packFile}, HTTP ${res.status})`
              );
            }
            const parsed = (await res.json()) as JlptPackFile<TItem>;
            return Array.isArray(parsed.items) ? parsed.items : [];
          })
        );

        // Merge packs, deduplicating by ID and sorting stably by order
        const seen = new Set<string>();
        const merged: TItem[] = [];
        for (const packItems of results) {
          for (const item of packItems) {
            if (!item || seen.has(item.id)) continue;
            seen.add(item.id);
            merged.push(item);
          }
        }
        merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        levelCache.set(level, merged);
        return merged;
      })
      .catch((err) => {
        levelPromises.delete(level);
        throw err;
      });

    levelPromises.set(level, promise);
    return promise;
  };

  const loadLevels = async (levels: JlptLevel[]): Promise<TDataset> => {
    const unique = Array.from(new Set(levels));
    const chunks = await Promise.all(unique.map((lvl) => loadLevel(lvl)));
    return config.buildDataset(chunks.flat());
  };

  const loadAll = async (): Promise<TDataset> => {
    if (allCache) return allCache;
    if (!allPromise) {
      allPromise = loadLevels(ALL_JLPT_LEVELS)
        .then((ds) => {
          allCache = ds;
          return ds;
        })
        .catch((err) => {
          allPromise = null;
          throw err;
        });
    }
    return allPromise;
  };

  const getLevelCountFromManifest = (
    manifest: JlptPackManifest,
    level: JlptLevel
  ): number => manifest.levels[String(level)]?.count ?? 0;

  return {
    loadManifest,
    loadLevel,
    loadLevels,
    loadAll,
    getLevelCountFromManifest,
  };
}
