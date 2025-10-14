export type MissionType = "score" | "match" | "jelly" | "crate" | "special";

export interface MissionDefinition {
  id: string;
  title: string;
  description: string;
  type: MissionType;
  target: number;
  reward: number;
  timeframe: "daily" | "weekly";
}

export interface MissionProgress {
  id: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface MissionState {
  missions: MissionDefinition[];
  progress: Record<string, MissionProgress>;
  generatedAt: string;
}

export const BASE_MISSIONS: MissionDefinition[] = [
  {
    id: "daily-score",
    title: "Skor Harian",
    description: "Capai total skor 25.000 poin hari ini.",
    type: "score",
    target: 25000,
    reward: 25,
    timeframe: "daily"
  },
  {
    id: "daily-special",
    title: "Special Hunter",
    description: "Buat 8 special candy dalam satu hari.",
    type: "special",
    target: 8,
    reward: 20,
    timeframe: "daily"
  },
  {
    id: "weekly-jelly",
    title: "Pembersih Jelly",
    description: "Bersihkan 150 lapis jelly dalam seminggu.",
    type: "jelly",
    target: 150,
    reward: 80,
    timeframe: "weekly"
  },
  {
    id: "weekly-crate",
    title: "Pembuka Peti",
    description: "Pecahkan 100 lapis crate minggu ini.",
    type: "crate",
    target: 100,
    reward: 75,
    timeframe: "weekly"
  }
];

export function createInitialMissionState(): MissionState {
  const progress: Record<string, MissionProgress> = {};
  const now = new Date().toISOString();
  for (const mission of BASE_MISSIONS) {
    progress[mission.id] = {
      id: mission.id,
      progress: 0,
      completed: false,
      claimed: false
    };
  }
  return {
    missions: BASE_MISSIONS,
    progress,
    generatedAt: now
  };
}

export function updateMissionProgress(
  state: MissionState,
  delta: Partial<Record<MissionType, number>>
): MissionState {
  const updated: MissionState = {
    missions: state.missions,
    progress: { ...state.progress },
    generatedAt: state.generatedAt
  };

  for (const mission of state.missions) {
    const gain = delta[mission.type];
    if (!gain || gain <= 0) {
      continue;
    }

    const entry = updated.progress[mission.id];
    if (!entry || entry.completed) {
      continue;
    }

    const newAmount = Math.min(mission.target, entry.progress + gain);
    updated.progress[mission.id] = {
      ...entry,
      progress: newAmount,
      completed: newAmount >= mission.target
    };
  }

  return updated;
}

export function claimMissionReward(state: MissionState, missionId: string): MissionState {
  const entry = state.progress[missionId];
  if (!entry || !entry.completed || entry.claimed) {
    return state;
  }

  return {
    missions: state.missions,
    progress: {
      ...state.progress,
      [missionId]: {
        ...entry,
        claimed: true
      }
    },
    generatedAt: state.generatedAt
  };
}

export function formatMissionProgress(progress: MissionProgress, mission: MissionDefinition): string {
  return `${progress.progress}/${mission.target}`;
}

export function needsDailyReset(lastGenerated: string, now = new Date()): boolean {
  const last = new Date(lastGenerated);
  return last.getUTCFullYear() !== now.getUTCFullYear() ||
    last.getUTCMonth() !== now.getUTCMonth() ||
    last.getUTCDate() !== now.getUTCDate();
}

export function needsWeeklyReset(lastGenerated: string, now = new Date()): boolean {
  const last = new Date(lastGenerated);
  const lastWeek = getISOWeek(last);
  const nowWeek = getISOWeek(now);
  return last.getUTCFullYear() !== now.getUTCFullYear() || lastWeek !== nowWeek;
}

function getISOWeek(date: Date): number {
  const target = new Date(date.valueOf());
  const dayNum = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.valueOf() - firstThursday.valueOf();
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}

export function resetMissionState(state: MissionState, now = new Date()): MissionState {
  const dailyReset = needsDailyReset(state.generatedAt, now);
  const weeklyReset = needsWeeklyReset(state.generatedAt, now);

  if (!dailyReset && !weeklyReset) {
    return state;
  }

  const updated: MissionState = {
    missions: state.missions,
    progress: { ...state.progress },
    generatedAt: now.toISOString()
  };

  for (const mission of state.missions) {
    const shouldReset = mission.timeframe === "daily" ? dailyReset : weeklyReset;
    if (!shouldReset) {
      continue;
    }

    updated.progress[mission.id] = {
      id: mission.id,
      progress: 0,
      completed: false,
      claimed: false
    };
  }

  return updated;
}
