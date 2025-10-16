export interface LevelProgressEntry {
  bestScore: number;
  bestStars: number;
  bestCombo: number;
  bestEfficiency: number;
  lastScore: number;
  lastCombo: number;
  lastEfficiency: number;
  unlocked: boolean;
}

export interface PlayerProfile {
  softCurrency: number;
  lastUpdated: string;
  levelProgress: Record<number, LevelProgressEntry>;
}

export interface LevelCompletionResult {
  profile: PlayerProfile;
  unlockedLevels: number[];
  improvedStars: boolean;
}

export const DEFAULT_PROFILE: PlayerProfile = {
  softCurrency: 0,
  lastUpdated: new Date().toISOString(),
  levelProgress: {}
};

export function loadProfile(key: string): PlayerProfile {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return { ...DEFAULT_PROFILE };
    }
    const parsed = JSON.parse(raw) as PlayerProfile;
    if (!Number.isFinite(parsed?.softCurrency ?? NaN)) {
      return { ...DEFAULT_PROFILE };
    }
    return {
      softCurrency: Math.max(0, Math.floor(parsed.softCurrency)),
      lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
      levelProgress: normalizeLevelProgress(parsed.levelProgress ?? {})
    };
  } catch (error) {
    console.warn("Gagal memuat profil pemain", error);
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(key: string, profile: PlayerProfile): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(profile));
  } catch (error) {
    console.warn("Gagal menyimpan profil pemain", error);
  }
}

export function addSoftCurrency(profile: PlayerProfile, amount: number): PlayerProfile {
  if (!Number.isFinite(amount) || amount <= 0) {
    return profile;
  }
  const updated: PlayerProfile = {
    softCurrency: profile.softCurrency + Math.floor(amount),
    lastUpdated: new Date().toISOString(),
    levelProgress: normalizeLevelProgress(profile.levelProgress ?? {})
  };
  return updated;
}

export function ensureLevelProgress(profile: PlayerProfile, totalLevels: number): PlayerProfile {
  const progress = { ...normalizeLevelProgress(profile.levelProgress ?? {}) };
  let changed = false;
  for (let levelId = 1; levelId <= totalLevels; levelId++) {
    if (!progress[levelId]) {
      progress[levelId] = {
        bestScore: 0,
        bestStars: 0,
        bestCombo: 0,
        bestEfficiency: 0,
        lastScore: 0,
        lastCombo: 0,
        lastEfficiency: 0,
        unlocked: levelId === 1
      };
      changed = true;
    }
  }

  if (!changed) {
    return { ...profile, levelProgress: progress };
  }

  return {
    softCurrency: profile.softCurrency,
    lastUpdated: new Date().toISOString(),
    levelProgress: progress
  };
}

export function recordLevelCompletion(
  profile: PlayerProfile,
  levelId: number,
  stars: number,
  score: number,
  totalLevels: number,
  comboAchieved: number,
  efficiencyAchieved: number
): LevelCompletionResult {
  const normalized = ensureLevelProgress(profile, totalLevels);
  const progress = { ...normalized.levelProgress };

  const previousEntry = progress[levelId];
  const entry = { ...previousEntry };

  let changed = false;
  let improvedStars = false;

  if (!entry.unlocked) {
    entry.unlocked = true;
    changed = true;
  }

  const clampedStars = Math.max(0, Math.min(3, Math.floor(stars)));
  const clampedScore = Math.max(0, Math.floor(score));
  const clampedCombo = Math.max(0, Math.floor(comboAchieved));
  const clampedEfficiency = efficiencyAchieved > 0 ? Number(efficiencyAchieved) : 0;

  entry.lastScore = clampedScore;
  entry.lastCombo = clampedCombo;
  entry.lastEfficiency = clampedEfficiency;
  changed = true;

  if (clampedStars > entry.bestStars) {
    entry.bestStars = clampedStars;
    improvedStars = true;
    changed = true;
  }

  if (clampedScore > entry.bestScore) {
    entry.bestScore = clampedScore;
    changed = true;
  }

  if (clampedCombo > entry.bestCombo) {
    entry.bestCombo = clampedCombo;
    changed = true;
  }

  if (clampedEfficiency > entry.bestEfficiency) {
    entry.bestEfficiency = clampedEfficiency;
    changed = true;
  }

  if (changed) {
    progress[levelId] = entry;
  }

  const unlockedLevels: number[] = [];

  if (clampedStars > 0) {
    const nextLevelId = levelId + 1;
    if (nextLevelId <= totalLevels) {
      const currentNextEntry = progress[nextLevelId];
      if (!currentNextEntry?.unlocked) {
        progress[nextLevelId] = {
          bestScore: currentNextEntry?.bestScore ?? 0,
          bestStars: currentNextEntry?.bestStars ?? 0,
          bestCombo: currentNextEntry?.bestCombo ?? 0,
          bestEfficiency: currentNextEntry?.bestEfficiency ?? 0,
          lastScore: currentNextEntry?.lastScore ?? 0,
          lastCombo: currentNextEntry?.lastCombo ?? 0,
          lastEfficiency: currentNextEntry?.lastEfficiency ?? 0,
          unlocked: true
        };
        unlockedLevels.push(nextLevelId);
        changed = true;
      }
    }
  }

  if (!changed) {
    return {
      profile: normalized,
      unlockedLevels,
      improvedStars
    };
  }

  return {
    profile: {
      softCurrency: normalized.softCurrency,
      lastUpdated: new Date().toISOString(),
      levelProgress: progress
    },
    unlockedLevels,
    improvedStars
  };
}

function normalizeLevelProgress(progress: Record<number, LevelProgressEntry>): Record<number, LevelProgressEntry> {
  const normalized: Record<number, LevelProgressEntry> = {};
  for (const [key, value] of Object.entries(progress)) {
    const levelId = Number(key);
    if (!Number.isFinite(levelId)) {
      continue;
    }
    normalized[levelId] = {
      bestScore: Math.max(0, Math.floor(value?.bestScore ?? 0)),
      bestStars: Math.max(0, Math.min(3, Math.floor(value?.bestStars ?? 0))),
      bestCombo: Math.max(0, Math.floor(value?.bestCombo ?? 0)),
      bestEfficiency: Math.max(0, Number.isFinite(value?.bestEfficiency) ? Number(value?.bestEfficiency) : 0),
      lastScore: Math.max(0, Math.floor(value?.lastScore ?? 0)),
      lastCombo: Math.max(0, Math.floor(value?.lastCombo ?? 0)),
      lastEfficiency: Math.max(0, Number.isFinite(value?.lastEfficiency) ? Number(value?.lastEfficiency) : 0),
      unlocked: Boolean(value?.unlocked)
    };
  }
  return normalized;
}
