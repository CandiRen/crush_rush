export interface PlayerProfile {
  softCurrency: number;
  lastUpdated: string;
}

export const DEFAULT_PROFILE: PlayerProfile = {
  softCurrency: 0,
  lastUpdated: new Date().toISOString()
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
      lastUpdated: parsed.lastUpdated ?? new Date().toISOString()
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
    lastUpdated: new Date().toISOString()
  };
  return updated;
}
