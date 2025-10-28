export const BASE_MISSIONS = [
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
export function createInitialMissionState() {
    const progress = {};
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
export function updateMissionProgress(state, delta) {
    const updated = {
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
export function claimMissionReward(state, missionId) {
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
export function formatMissionProgress(progress, mission) {
    return `${progress.progress}/${mission.target}`;
}
export function needsDailyReset(lastGenerated, now = new Date()) {
    const last = new Date(lastGenerated);
    return last.getUTCFullYear() !== now.getUTCFullYear() ||
        last.getUTCMonth() !== now.getUTCMonth() ||
        last.getUTCDate() !== now.getUTCDate();
}
export function needsWeeklyReset(lastGenerated, now = new Date()) {
    const last = new Date(lastGenerated);
    const lastWeek = getISOWeek(last);
    const nowWeek = getISOWeek(now);
    return last.getUTCFullYear() !== now.getUTCFullYear() || lastWeek !== nowWeek;
}
function getISOWeek(date) {
    const target = new Date(date.valueOf());
    const dayNum = (date.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    const diff = target.valueOf() - firstThursday.valueOf();
    return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}
export function resetMissionState(state, now = new Date()) {
    const dailyReset = needsDailyReset(state.generatedAt, now);
    const weeklyReset = needsWeeklyReset(state.generatedAt, now);
    if (!dailyReset && !weeklyReset) {
        return state;
    }
    const updated = {
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
