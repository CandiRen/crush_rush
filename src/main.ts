import {
  Board,
  Position,
  Tile,
  TileKind,
  SwapFrame,
  SpecialType
} from "./board";
import { Game, GameStatus, SwapFeedback } from "./game";
import { LEVELS } from "./levels";
import {
  BASE_MISSIONS,
  MissionDefinition,
  MissionType,
  MissionProgress,
  MissionState,
  createInitialMissionState,
  updateMissionProgress,
  formatMissionProgress,
  resetMissionState,
  claimMissionReward
} from "./missions";
import {
  PlayerProfile,
  addSoftCurrency,
  ensureLevelProgress,
  loadProfile,
  recordLevelCompletion,
  saveProfile
} from "./profile";

interface TileTheme {
  emoji: string;
  name: string;
  background: string;
  text: string;
}

interface PlaybackState {
  frames: SwapFrame[];
  index: number;
  timer: number | null;
  finalMessage: string;
}

interface RenderOptions {
  highlight?: Position[];
  highlightType?: "match" | "cascade" | "special";
  disableInput?: boolean;
  selected?: Position | null;
}

const FRAME_DURATION: Record<SwapFrame["type"], number> = {
  match: 320,
  cascade: 260,
  special: 360,
  final: 160
};

interface DragState {
  start: Position;
  pointerId: number;
  originX: number;
  originY: number;
  element: HTMLDivElement;
}

const DRAG_THRESHOLD_PX = 10;
const MAX_DRAG_OFFSET_PX = 28;
const SWAP_ANIMATION_DURATION = 160;
const SUMMARY_ANIMATION_DURATION = 260;

const TILE_THEME: Record<TileKind, TileTheme> = {
  berry: {
    emoji: "🐻",
    name: "Beruang Berry",
    background: "linear-gradient(135deg, #fbc2eb, #a6c1ee)",
    text: "#0f172a"
  },
  candy: {
    emoji: "🐰",
    name: "Kelinci Candy",
    background: "linear-gradient(135deg, #fda085, #f6d365)",
    text: "#0f172a"
  },
  citrus: {
    emoji: "🐤",
    name: "Anak Ayam Citrus",
    background: "linear-gradient(135deg, #f6d365, #fda085)",
    text: "#0f172a"
  },
  gem: {
    emoji: "🦊",
    name: "Rubah Gem",
    background: "linear-gradient(135deg, #5ee7df, #b490ca)",
    text: "#0f172a"
  },
  star: {
    emoji: "🐱",
    name: "Kucing Star",
    background: "linear-gradient(135deg, #cfd9df, #e2ebf0)",
    text: "#0f172a"
  },
  heart: {
    emoji: "🐶",
    name: "Anjing Heart",
    background: "linear-gradient(135deg, #fcb69f, #ffecd2)",
    text: "#0f172a"
  }
};

const SPECIAL_ICON: Record<SpecialType, string> = {
  "line-row": "➡️",
  "line-col": "⬇️",
  bomb: "💣",
  block: "🧊"
};

const MISSION_STORAGE_KEY = "crush-rush-missions";
const PROFILE_STORAGE_KEY = "crush-rush-profile";

let currentLevelIndex = 0;
const game = new Game(LEVELS[currentLevelIndex]);
const app = document.getElementById("app");

if (!app) {
  throw new Error("Root container #app tidak ditemukan");
}

const shell = document.createElement("div");
const backgroundLayer = document.createElement("div");
const backgroundParticles = document.createElement("div");
const headerBar = document.createElement("header");
const headerTitle = document.createElement("h1");
const headerSubtitle = document.createElement("p");
const hud = document.createElement("div");
const boardElement = document.createElement("div");
const infoBanner = document.createElement("div");
const stateBanner = document.createElement("div");
const stateMessage = document.createElement("div");
const stateStars = document.createElement("div");
const stateDetail = document.createElement("div");
const stateActions = document.createElement("div");
const bottomBar = document.createElement("div");
const restartButton = document.createElement("button");
const tutorialOverlay = document.createElement("div");
const nextButton = document.createElement("button");
const retryButton = document.createElement("button");
const summaryBanner = document.createElement("div");
const summaryTitle = document.createElement("h3");
const summaryBody = document.createElement("p");
const summaryHighlights = document.createElement("ul");
const summaryDismiss = document.createElement("button");
const summaryConfetti = document.createElement("div");
const missionToast = document.createElement("div");
const missionToastList = document.createElement("ul");
const menuButton = document.createElement("button");
const playArea = document.createElement("div");
const missionPanel = document.createElement("div");
const missionHeader = document.createElement("div");
const missionList = document.createElement("div");
const mainMenu = document.createElement("div");
const menuHeader = document.createElement("div");
const menuTitle = document.createElement("h1");
const menuSubtitle = document.createElement("p");
const menuStats = document.createElement("div");
const menuStatLevelValue = document.createElement("span");
const menuStatTargetValue = document.createElement("span");
const menuStatMovesValue = document.createElement("span");
const menuStatCoinsValue = document.createElement("span");
const menuMissionSummary = document.createElement("p");
const menuActions = document.createElement("div");
const menuStartButton = document.createElement("button");
const menuContinueButton = document.createElement("button");
const menuFooterHint = document.createElement("p");
const menuLevelsSection = document.createElement("div");
const menuLevelsTitle = document.createElement("h2");
const menuLevelsList = document.createElement("div");

declare global {
  interface Window {
    crushRush?: {
      debugBoard(): {
        board: Board;
        jelly: number[][];
        crate: number[][];
      };
      skipTutorial(): void;
      loadLevel(index: number): void;
    };
  }
}

let selected: Position | null = null;
let infoMessage = LEVELS[currentLevelIndex].description ?? "Cocokkan tiga permen atau lebih!";
let playback: PlaybackState | null = null;
let isAnimating = false;
let tutorialActive = true;
let tutorialSeen = false;
let missionState: MissionState = initializeMissionState();
let profileState: PlayerProfile = ensureLevelProgress(
  loadProfile(PROFILE_STORAGE_KEY),
  LEVELS.length
);
persistProfileState();
let dragState: DragState | null = null;
let suppressNextClick = false;
let globalDragListenersAttached = false;
let swapInProgress = false;
let currentView: "menu" | "game" = "menu";
let lastKnownStatus: GameStatus = "loading";
let summaryVisible = false;
let summaryHideTimer: number | null = null;
let confettiCleanupTimer: number | null = null;
let missionToastTimer: number | null = null;

shell.className = "game-shell";
backgroundLayer.className = "background-layer";
backgroundParticles.className = "background-particles";
headerBar.className = "game-header";
headerTitle.className = "game-title";
headerTitle.textContent = "Crush Rush";
headerSubtitle.className = "game-subtitle";
headerSubtitle.textContent = "Petualangan Match-3 Seru Bersama Sahabat Hewan";
hud.className = "hud";
boardElement.className = "board";
infoBanner.className = "status-banner";
stateBanner.className = "status-banner hidden";
stateMessage.className = "state-message";
stateStars.className = "state-stars";
stateDetail.className = "state-detail";
stateActions.className = "state-actions";
stateBanner.append(stateMessage, stateStars, stateDetail, stateActions);
bottomBar.className = "hud";
restartButton.className = "primary";
restartButton.textContent = "Mulai Ulang";
menuButton.className = "ghost";
menuButton.textContent = "Ke Menu Utama";
summaryBanner.className = "session-summary hidden";
summaryConfetti.className = "session-confetti";
summaryTitle.textContent = "Hasil Sesi";
summaryBody.className = "session-summary-body";
summaryHighlights.className = "session-summary-list";
summaryDismiss.className = "ghost";
summaryDismiss.textContent = "Tutup";
summaryBanner.append(summaryConfetti, summaryTitle, summaryBody, summaryHighlights, summaryDismiss);
missionToast.className = "mission-toast hidden";
missionToastList.className = "mission-toast-list";
missionToast.append(missionToastList);
tutorialOverlay.className = "tutorial-overlay";
tutorialOverlay.innerHTML = `
  <div>
    <h3>Selamat datang di Crush Rush!</h3>
    <p>Tukarkan dua permen bertetangga untuk membentuk garis tiga atau lebih dan kumpulkan skor.</p>
    <p><strong>Klik di mana saja</strong> untuk memulai level pertama.</p>
  </div>
`;

nextButton.className = "primary";
nextButton.textContent = "Level Berikutnya";
retryButton.className = "ghost";
retryButton.textContent = "Ulangi Level";
playArea.className = "play-area";
missionPanel.className = "mission-panel";
missionHeader.className = "mission-header";
missionHeader.textContent = "🗒️ Misi";
missionList.className = "mission-list";
missionPanel.append(missionHeader, missionList);
playArea.append(boardElement, missionPanel);
headerBar.append(headerTitle, headerSubtitle);

mainMenu.className = "main-menu";
menuHeader.className = "menu-header";
menuTitle.className = "menu-title";
menuTitle.textContent = "Crush Rush";
menuSubtitle.className = "menu-subtitle";
menuSubtitle.textContent = "Rencanakan langkahmu, kumpulkan combo, dan raih skor bintang!";
menuStats.className = "menu-stats";
menuMissionSummary.className = "menu-mission-summary";
menuMissionSummary.textContent = "Misi aktif siap dijalankan. Masuk ke permainan untuk progres lebih lanjut.";
menuActions.className = "menu-actions";
menuStartButton.className = "primary";
menuStartButton.textContent = "Mulai Petualangan";
menuContinueButton.className = "ghost";
menuContinueButton.textContent = "Lanjutkan Permainan";
menuFooterHint.className = "menu-footer-hint";
menuFooterHint.textContent = "Kumpulkan bintang untuk membuka misi dan hadiah baru.";
menuStatLevelValue.textContent = "-";
menuStatTargetValue.textContent = "-";
menuStatMovesValue.textContent = "-";
menuStatCoinsValue.textContent = "-";
const menuLevelStat = createMenuStatBlock("Level Saat Ini", menuStatLevelValue);
const menuTargetStat = createMenuStatBlock("Target Skor", menuStatTargetValue);
const menuMovesStat = createMenuStatBlock("Langkah Tersedia", menuStatMovesValue);
const menuCoinsStat = createMenuStatBlock("Koin", menuStatCoinsValue);
menuStats.append(menuLevelStat, menuTargetStat, menuMovesStat, menuCoinsStat);
menuHeader.append(menuTitle, menuSubtitle);
menuLevelsSection.className = "menu-levels";
menuLevelsTitle.className = "menu-levels-title";
menuLevelsTitle.textContent = "Pilih Level";
menuLevelsList.className = "menu-level-list";
menuLevelsSection.append(menuLevelsTitle, menuLevelsList);
menuActions.append(menuStartButton, menuContinueButton);
mainMenu.append(menuHeader, menuStats, menuLevelsSection, menuMissionSummary, menuActions, menuFooterHint);

tutorialOverlay.addEventListener("click", () => {
  tutorialActive = false;
  tutorialSeen = true;
  infoMessage = "Pilih dua permen bertetangga untuk ditukar.";
  render();
});

restartButton.addEventListener("click", () => {
  cancelPlayback();
  game.reset();
  selected = null;
  isAnimating = false;
  tutorialActive = currentLevelIndex === 0 && !tutorialSeen;
  infoMessage = tutorialActive
    ? "Baca instruksi lalu klik untuk mulai."
    : "Level dimulai ulang.";
  if (!tutorialActive && game.hasJellyTarget()) {
    infoMessage += " Bersihkan semua jelly!";
  }
  if (!tutorialActive && game.hasCrateTarget()) {
    infoMessage += " Pecahkan semua crate!";
  }
  render();
});

nextButton.addEventListener("click", () => {
  if (!hasNextLevel()) {
    return;
  }
  loadLevel(currentLevelIndex + 1, {
    message: "Level baru dimulai. Kejar skor terbaik!",
    showTutorial: false
  });
});

retryButton.addEventListener("click", () => {
  loadLevel(currentLevelIndex, {
    message: "Coba lagi. Pelajari pola cascade!",
    showTutorial: false
  });
});

menuStartButton.addEventListener("click", () => {
  loadLevel(0, {
    message: "Level pertama dimulai. Bentuk combo terbaikmu!",
    showTutorial: !tutorialSeen
  });
  enterGame();
});

menuContinueButton.addEventListener("click", () => {
  enterGame();
});

menuButton.addEventListener("click", () => {
  showMenu();
});

summaryDismiss.addEventListener("click", () => {
  hideSessionSummary();
});

bottomBar.append(restartButton, menuButton);
shell.append(headerBar, hud, playArea, infoBanner, stateBanner, bottomBar, tutorialOverlay);
shell.prepend(backgroundLayer);
backgroundLayer.append(backgroundParticles);
app.append(mainMenu, shell, summaryBanner, missionToast);
shell.classList.add("hidden");

window.crushRush = {
  debugBoard() {
    return {
      board: structuredClone(game.getBoard()),
      jelly: game.getJellyGrid(),
      crate: game.getCrateGrid()
    };
  },
  skipTutorial() {
    tutorialSeen = true;
    tutorialActive = false;
    render();
  },
  loadLevel(index: number) {
    loadLevel(index, { showTutorial: index === 0 && !tutorialSeen });
  }
};

function loadLevel(index: number, options?: { showTutorial?: boolean; message?: string }): void {
  if (index < 0 || index >= LEVELS.length) {
    console.warn("Level index di luar jangkauan", index);
    return;
  }

  if (!isLevelUnlocked(index)) {
    const lockedLevel = LEVELS[index];
    const requirement = LEVELS[index - 1];
    infoMessage = requirement
      ? `Level ${lockedLevel.id} terkunci. Selesaikan Level ${requirement.id} terlebih dahulu.`
      : "Level ini belum tersedia.";
    updateMenuView();
    return;
  }

  cancelPlayback();
  currentLevelIndex = index;
  const level = LEVELS[currentLevelIndex];
  game.setLevel(level);
  selected = null;
  isAnimating = false;
  lastKnownStatus = game.getStatus();

  const shouldShowTutorial = options?.showTutorial ?? (index === 0 && !tutorialSeen);
  tutorialActive = shouldShowTutorial;
  if (tutorialActive) {
    infoMessage = "Ikuti instruksi pada overlay untuk memulai.";
  } else {
    infoMessage = options?.message ?? level.description ?? "Selamat bermain.";
    if (game.hasJellyTarget()) {
      infoMessage += " Bersihkan semua jelly!";
    }
    if (game.hasCrateTarget()) {
      infoMessage += " Pecahkan semua crate!";
    }
  }

  render();
  renderMissionPanel();
}

function enterGame(): void {
  if (currentView === "game") {
    render();
    renderMissionPanel();
    return;
  }

  currentView = "game";
  mainMenu.classList.add("hidden");
  shell.classList.remove("hidden");
  render();
  renderMissionPanel();
}

function showMenu(): void {
  cancelPlayback();
  cleanupDragState();
  resetBoardAnimations();
  suppressNextClick = false;
  swapInProgress = false;
  currentView = "menu";
  shell.classList.add("hidden");
  mainMenu.classList.remove("hidden");
  hideSessionSummary();
  updateMenuView();
}

function updateMenuView(): void {
  const level = LEVELS[currentLevelIndex];
  menuStatLevelValue.textContent = `Level ${level.id} – ${level.name}`;
  menuStatTargetValue.textContent = game
    .getTargetScore()
    .toLocaleString("id-ID");
  menuStatMovesValue.textContent = `${game.getMovesLeft()} / ${level.moves}`;
  menuStatCoinsValue.textContent = profileState.softCurrency.toLocaleString("id-ID");

  renderMenuLevels();

  const totalMissions = missionState.missions.length;
  const completedMissions = missionState.missions.filter((mission) => {
    const progress = missionState.progress[mission.id];
    return progress?.completed ?? false;
  }).length;
  const claimableMissions = missionState.missions.filter((mission) => {
    const progress = missionState.progress[mission.id];
    return !!progress?.completed && !progress?.claimed;
  }).length;

  if (totalMissions === 0) {
    menuMissionSummary.textContent =
      "Belum ada misi aktif. Selesaikan level untuk membuka misi baru.";
  } else if (claimableMissions > 0) {
    menuMissionSummary.textContent = `${claimableMissions} misi siap diklaim! Masuk ke permainan untuk mengambil hadiah.`;
  } else {
    menuMissionSummary.textContent = `Misi aktif: ${completedMissions}/${totalMissions} selesai.`;
  }

  menuContinueButton.disabled = currentView === "game";
}

function renderMenuLevels(): void {
  menuLevelsList.innerHTML = "";

  const totalLevels = LEVELS.length;
  for (let index = 0; index < totalLevels; index++) {
    const level = LEVELS[index];
    const button = document.createElement("button");
    button.className = "menu-level-button";
    const progress = profileState.levelProgress[level.id];
    const unlocked = progress?.unlocked ?? false;
    if (index === currentLevelIndex) {
      button.classList.add("current");
    }
    if (!unlocked) {
      button.classList.add("locked");
      button.disabled = true;
    }

    const title = document.createElement("strong");
    title.textContent = `Level ${level.id}`;
    const subtitle = document.createElement("span");
    subtitle.className = "menu-level-subtitle";
    const contents: HTMLElement[] = [title, subtitle];
    if (unlocked) {
      subtitle.textContent = level.name;
      const bestScore = progress?.bestScore ?? 0;
      button.title = bestScore > 0
        ? `Skor terbaik: ${bestScore.toLocaleString("id-ID")}`
        : "Belum ada skor terbaik.";
      const bestStars = progress?.bestStars ?? 0;
      if (bestStars > 0) {
        const stars = document.createElement("span");
        stars.className = "menu-level-stars";
        stars.textContent = renderStars(bestStars);
        contents.push(stars);
      }

      const bestCombo = progress?.bestCombo ?? 0;
      const bestEfficiency = progress?.bestEfficiency ?? 0;
      if (bestCombo > 0 || bestEfficiency > 0) {
        const metrics = document.createElement("span");
        metrics.className = "menu-level-metric";
        const comboLabel = bestCombo > 0 ? bestCombo.toString() : "-";
        const efficiencyLabel = bestEfficiency > 0 ? bestEfficiency.toFixed(2) : "-";
        metrics.textContent = `⚡ Combo: ${comboLabel} • 🎯 Skor/Langkah: ${efficiencyLabel}`;
        contents.push(metrics);
      }

      const lastCombo = progress?.lastCombo ?? 0;
      const lastEfficiency = progress?.lastEfficiency ?? 0;
      if (lastCombo > 0 || lastEfficiency > 0) {
        const recent = document.createElement("span");
        recent.className = "menu-level-metric secondary";
        const lastComboLabel = lastCombo > 0 ? lastCombo.toString() : "-";
        const lastEfficiencyLabel = lastEfficiency > 0 ? lastEfficiency.toFixed(2) : "-";
        recent.textContent = `⌛ Terakhir: Combo ${lastComboLabel} • Skor/Langkah ${lastEfficiencyLabel}`;
        contents.push(recent);
      }
    } else {
      button.title = "Selesaikan level sebelumnya untuk membuka.";
      const requiredLevel = LEVELS[index - 1];
      subtitle.textContent = requiredLevel
        ? `Terkunci • Selesaikan Level ${requiredLevel.id}`
        : "Terkunci";
      subtitle.classList.add("menu-level-locked");
    }

    if (unlocked) {
      button.addEventListener("click", () => {
        loadLevel(index, {
          showTutorial: index === 0 && !tutorialSeen,
          message: level.description ?? "Selamat bermain."
        });
        enterGame();
      });
    }

    button.append(...contents);
    menuLevelsList.append(button);
  }
}

function handleStatusChange(status: GameStatus): void {
  if (status === lastKnownStatus) {
    return;
  }

  if (status === "won") {
    handleLevelCompletion();
  }

  lastKnownStatus = status;
}

function handleLevelCompletion(): void {
  const level = LEVELS[currentLevelIndex];
  const stars = game.getStarCount();
  const score = game.getScore();
  const combo = game.getHighestCombo();
  const efficiency = Number(game.getScorePerMove().toFixed(2));

  const previousProfile = profileState;
  const previousMissionState = missionState;
  const { profile: updatedProfile, unlockedLevels } = recordLevelCompletion(
    profileState,
    level.id,
    stars,
    score,
    LEVELS.length,
    combo,
    efficiency
  );

  if (updatedProfile !== previousProfile) {
    profileState = ensureLevelProgress(updatedProfile, LEVELS.length);
    persistProfileState();
  }

  const previousLevelProgress = previousProfile.levelProgress[level.id];
  const previousBest = previousLevelProgress
    ? {
        stars: previousLevelProgress.bestStars,
        combo: previousLevelProgress.bestCombo,
        efficiency: previousLevelProgress.bestEfficiency
      }
    : { stars: 0, combo: 0, efficiency: 0 };

  if (unlockedLevels.length > 0) {
    const unlockedLabels = unlockedLevels
      .map((id) => {
        const unlockedLevel = LEVELS.find((item) => item.id === id);
        return unlockedLevel ? `Level ${unlockedLevel.id} – ${unlockedLevel.name}` : `Level ${id}`;
      })
      .join(", ");
    if (!infoMessage.includes(unlockedLabels)) {
      const prefix = infoMessage ? `${infoMessage} | ` : "";
      infoMessage = `${prefix}${unlockedLabels} terbuka!`;
    }
  }

  const newlyCompletedMissions = extractNewlyCompletedMissions(previousMissionState, missionState);

  updateMenuView();
  showSessionSummary({
    stars,
    score,
    combo,
    efficiency,
    previousBest,
    level,
    unlockedLevels
  });
  if (newlyCompletedMissions.length > 0) {
    showMissionToast(newlyCompletedMissions);
  } else {
    hideMissionToast();
  }
}

function showSessionSummary({
  stars,
  score,
  combo,
  efficiency,
  previousBest,
  level,
  unlockedLevels
}: {
  stars: number;
  score: number;
  combo: number;
  efficiency: number;
  previousBest: { stars: number; combo: number; efficiency: number };
  level: (typeof LEVELS)[number];
  unlockedLevels: number[];
}): void {
  const bestStars = Math.max(stars, previousBest.stars);
  const bestCombo = Math.max(combo, previousBest.combo);
  const bestEfficiency = Math.max(efficiency, previousBest.efficiency);

  const newRecords: string[] = [];
  if (stars > previousBest.stars) {
    newRecords.push("bintang");
  }
  if (combo > previousBest.combo) {
    newRecords.push("combo");
  }
  if (efficiency > previousBest.efficiency) {
    newRecords.push("skor/langkah");
  }

  if (newRecords.length > 0) {
    const formatted = newRecords.length === 1
      ? newRecords[0]
      : `${newRecords.slice(0, -1).join(", ")} & ${newRecords[newRecords.length - 1]}`;
    summaryTitle.textContent = `Rekor Baru! (${formatted})`;
  } else {
    summaryTitle.textContent = `Level ${level.id} selesai!`;
  }
  summaryBody.textContent = `Skor ${score.toLocaleString("id-ID")}.`;
  summaryHighlights.innerHTML = "";

  const starItem = document.createElement("li");
  starItem.textContent = `⭐ Bintang: ${stars} (rekor: ${bestStars})`;
  summaryHighlights.append(starItem);

  const comboItem = document.createElement("li");
  comboItem.textContent = `⚡ Combo terbaik: ${combo} (rekor: ${bestCombo})`;
  summaryHighlights.append(comboItem);

  const efficiencyItem = document.createElement("li");
  efficiencyItem.textContent = `🎯 Skor per langkah: ${efficiency.toFixed(2)} (rekor: ${bestEfficiency.toFixed(2)})`;
  summaryHighlights.append(efficiencyItem);

  if (unlockedLevels.length > 0) {
    const unlockItem = document.createElement("li");
    unlockItem.textContent = `🔓 Level baru: ${unlockedLevels.join(", ")}`;
    summaryHighlights.append(unlockItem);
  }

  if (summaryHideTimer !== null) {
    window.clearTimeout(summaryHideTimer);
    summaryHideTimer = null;
  }

  summaryBanner.classList.remove("hidden");
  summaryBanner.classList.remove("show");
  void summaryBanner.offsetWidth;
  summaryBanner.classList.add("show");
  summaryVisible = true;
  triggerSummaryConfetti();
}

function hideSessionSummary(): void {
  if (summaryHideTimer !== null) {
    window.clearTimeout(summaryHideTimer);
    summaryHideTimer = null;
  }

  if (!summaryVisible && summaryBanner.classList.contains("hidden")) {
    return;
  }
  summaryBanner.classList.remove("show");
  summaryVisible = false;
  summaryHideTimer = window.setTimeout(() => {
    if (!summaryVisible) {
      summaryBanner.classList.add("hidden");
    }
    summaryHideTimer = null;
  }, SUMMARY_ANIMATION_DURATION);
  resetSummaryConfetti();
}

function triggerSummaryConfetti(): void {
  if (confettiCleanupTimer !== null) {
    window.clearTimeout(confettiCleanupTimer);
    confettiCleanupTimer = null;
  }
  summaryConfetti.innerHTML = "";

  const pieceCount = 14;
  for (let index = 0; index < pieceCount; index++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    const offset = (Math.random() - 0.5) * 140;
    const delay = Math.random() * 0.2;
    const rotation = (Math.random() - 0.5) * 120;
    const hue = Math.floor(Math.random() * 30) + 340;
    const palette = getConfettiPalette();
    piece.style.setProperty("--confetti-offset-x", `${offset}px`);
    piece.style.setProperty("--confetti-delay", `${delay}s`);
    piece.style.setProperty("--confetti-rotation", `${rotation}deg`);
    piece.style.setProperty("--confetti-color", palette[index % palette.length]);
    piece.style.setProperty("--confetti-hue", `${hue}`);
    summaryConfetti.append(piece);
  }

  summaryConfetti.classList.remove("active");
  void summaryConfetti.offsetWidth;
  summaryConfetti.classList.add("active");

  confettiCleanupTimer = window.setTimeout(() => {
    summaryConfetti.classList.remove("active");
    summaryConfetti.innerHTML = "";
    confettiCleanupTimer = null;
  }, 900);
}

function resetSummaryConfetti(): void {
  summaryConfetti.classList.remove("active");
  summaryConfetti.innerHTML = "";
  if (confettiCleanupTimer !== null) {
    window.clearTimeout(confettiCleanupTimer);
    confettiCleanupTimer = null;
  }
}

function getConfettiPalette(): string[] {
  const level = LEVELS[currentLevelIndex];
  const progress = profileState.levelProgress[level.id];
  const stars = progress?.bestStars ?? 0;
  if (stars >= 3) {
    return ["#facc15", "#fde047", "#f97316", "#fb7185"];
  }
  if (stars === 2) {
    return ["#38bdf8", "#fb923c", "#a855f7", "#facc15"];
  }
  if (stars === 1) {
    return ["#60a5fa", "#34d399", "#fbbf24"];
  }
  return ["#64748b", "#38bdf8", "#f97316"];
}

function extractNewlyCompletedMissions(
  previous: MissionState,
  current: MissionState
): MissionDefinition[] {
  const newlyCompleted: MissionDefinition[] = [];
  for (const mission of current.missions) {
    const prevProgress = previous.progress[mission.id];
    const currProgress = current.progress[mission.id];
    if (!currProgress?.completed) {
      continue;
    }
    if (!prevProgress?.completed) {
      newlyCompleted.push(mission);
    }
  }
  return newlyCompleted;
}

function showMissionToast(missions: MissionDefinition[]): void {
  if (missionToastTimer !== null) {
    window.clearTimeout(missionToastTimer);
    missionToastTimer = null;
  }
  missionToastList.innerHTML = "";
  missions.forEach((mission) => {
    const item = document.createElement("li");
    item.textContent = `🎯 ${mission.title} selesai! Klaim +${mission.reward}.`;
    missionToastList.append(item);
  });
  missionToast.classList.remove("hidden");
  missionToast.classList.remove("show");
  void missionToast.offsetWidth;
  missionToast.classList.add("show");
  missionToastTimer = window.setTimeout(() => {
    hideMissionToast();
  }, 4000);
}

function hideMissionToast(): void {
  if (missionToastTimer !== null) {
    window.clearTimeout(missionToastTimer);
    missionToastTimer = null;
  }
  if (!missionToast.classList.contains("show")) {
    missionToast.classList.add("hidden");
    return;
  }
  missionToast.classList.remove("show");
  missionToastTimer = window.setTimeout(() => {
    missionToast.classList.add("hidden");
    missionToastTimer = null;
  }, SUMMARY_ANIMATION_DURATION);
}

function render(): void {
  const status = game.getStatus();
  handleStatusChange(status);
  const activeFrame = playback ? playback.frames[playback.index] : null;
  const boardSnapshot = activeFrame ? activeFrame.board : game.getBoard();
  const highlight = activeFrame?.removed ?? [];
  let highlightType: RenderOptions["highlightType"] | undefined;
  if (activeFrame?.type === "match") {
    highlightType = "match";
  } else if (activeFrame?.type === "cascade") {
    highlightType = "cascade";
  } else if (activeFrame?.type === "special") {
    highlightType = "special";
  }
  const disableInput = isAnimating || tutorialActive;
  const jellyGrid = game.getJellyGrid();
  const crateGrid = game.getCrateGrid();

  renderHud();
  renderBoard(boardSnapshot, status, jellyGrid, crateGrid, {
    highlight,
    highlightType,
    disableInput,
    selected
  });

  infoBanner.textContent = infoMessage;
  renderStateBanner(status);

  if (tutorialActive) {
    tutorialOverlay.classList.remove("hidden");
  } else {
    tutorialOverlay.classList.add("hidden");
  }

  updateMenuView();
}

function renderHud(): void {
  hud.innerHTML = "";
  const level = LEVELS[currentLevelIndex];

  const items = [
    createHudItem("Koin", profileState.softCurrency.toLocaleString("id-ID")),
    createHudItem(`Level ${level.id}`, level.name),
    createHudItem("Skor", game.getScore().toLocaleString("id-ID")),
    createHudItem("Langkah", `${game.getMovesLeft()} / ${level.moves}`),
    createHudItem("Target", game.getTargetScore().toLocaleString("id-ID"))
  ];

  const currentCombo = game.getHighestCombo();
  if (currentCombo > 0) {
    items.push(createHudItem("Combo Terbaik", currentCombo.toString()));
  }

  const scorePerMove = game.getScorePerMove();
  if (scorePerMove > 0) {
    items.push(
      createHudItem(
        "Skor/Langkah",
        scorePerMove.toLocaleString("id-ID", {
          maximumFractionDigits: 1,
          minimumFractionDigits: 1
        })
      )
    );
  }

  if (game.hasJellyTarget()) {
    items.push(
      createHudItem(
        "Jelly",
        game.getJellyRemaining().toLocaleString("id-ID")
      )
    );
  }

  if (game.hasCrateTarget()) {
    items.push(
      createHudItem(
        "Crate",
        game.getCrateRemaining().toLocaleString("id-ID")
      )
    );
  }

  hud.append(...items);
}

function createHudItem(label: string, value: string): HTMLDivElement {
  const container = document.createElement("div");
  container.className = "hud-item";
  const title = document.createElement("span");
  title.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  container.append(title, strong);
  return container;
}

function createMenuStatBlock(label: string, valueElement: HTMLSpanElement): HTMLDivElement {
  const container = document.createElement("div");
  container.className = "menu-stat";
  const title = document.createElement("span");
  title.className = "menu-stat-label";
  title.textContent = label;
  valueElement.className = "menu-stat-value";
  container.append(title, valueElement);
  return container;
}

function renderBoard(
  board: Board,
  status: GameStatus,
  jellyGrid: number[][],
  crateGrid: number[][],
  options: RenderOptions = {}
): void {
  boardElement.innerHTML = "";
  boardElement.style.gridTemplateColumns = `repeat(${board.length}, 1fr)`;
  boardElement.style.gridTemplateRows = `repeat(${board.length}, 1fr)`;

  const highlightKeys = new Set(options.highlight?.map(positionKey));
  const disableInput = options.disableInput || status !== "playing";

  board.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      const tileElement = document.createElement("div");
      tileElement.className = "tile";
      tileElement.dataset.row = rowIndex.toString();
      tileElement.dataset.col = colIndex.toString();
      const jellyValue = jellyGrid[rowIndex]?.[colIndex] ?? 0;
      const crateValue = crateGrid[rowIndex]?.[colIndex] ?? 0;

      if (!tile) {
        tileElement.classList.add("hidden");
      } else {
        decorateTile(tileElement, tile);
        if (options.highlightType === "cascade") {
          tileElement.classList.add("cascade");
        }
      }

      if (jellyValue > 0) {
        tileElement.classList.add("jelly");
        tileElement.dataset.jelly = jellyValue.toString();
        if (!tileElement.title) {
          tileElement.title = `Jelly ${jellyValue} lapis`;
        } else {
          tileElement.title = `${tileElement.title} • Jelly ${jellyValue} lapis`;
        }
      }

      if (crateValue > 0) {
        tileElement.classList.add("crate");
        tileElement.dataset.crate = crateValue.toString();
        if (!tileElement.title) {
          tileElement.title = `Crate ${crateValue} lapis`;
        } else {
          tileElement.title = `${tileElement.title} • Crate ${crateValue} lapis`;
        }
      }

      const key = positionKey({ row: rowIndex, col: colIndex });
      if (highlightKeys.has(key)) {
        tileElement.classList.add("matched");
        if (options.highlightType === "special") {
          tileElement.classList.add("combo");
        }
      }

      if (options.selected && options.selected.row === rowIndex && options.selected.col === colIndex) {
        tileElement.classList.add("selected");
      }

      if (disableInput) {
        tileElement.classList.add("disabled");
      }

      tileElement.addEventListener("pointerdown", (event) => {
        onTilePointerDown({ row: rowIndex, col: colIndex }, event);
      });

      tileElement.addEventListener("click", (event) => {
        onTileClick({ row: rowIndex, col: colIndex }, event);
      });

      boardElement.append(tileElement);
    });
  });
}

function decorateTile(container: HTMLDivElement, tile: Tile): void {
  const theme = TILE_THEME[tile.kind];
  container.innerHTML = "";

  const icon = document.createElement("span");
  icon.className = "tile-icon";
  icon.textContent = theme.emoji;
  container.append(icon);

  container.style.background = theme.background;
  container.style.color = theme.text;
  container.dataset.kind = tile.kind;

  if (tile.special) {
    container.classList.add("special");
    container.dataset.special = tile.special;
    const badge = document.createElement("span");
    badge.className = `tile-special-badge special-${tile.special}`;
    badge.textContent = SPECIAL_ICON[tile.special];
    container.append(badge);
    container.title = `${describeSpecial(tile.special)} (${theme.name})`;
  } else {
    container.classList.remove("special");
    container.removeAttribute("data-special");
    container.title = theme.name;
  }
}

function getInteractionBlockMessage(): string | null {
  if (tutorialActive) {
    return "Tutup layar tutorial untuk mulai bermain.";
  }

  if (isAnimating) {
    return "Tunggu animasi selesai.";
  }

  if (game.getStatus() !== "playing") {
    return "Level sudah selesai. Gunakan tombol tindakan.";
  }

  return null;
}

function attachGlobalDragListeners(): void {
  if (globalDragListenersAttached) {
    return;
  }

  window.addEventListener("pointermove", handleBoardPointerMove, { passive: false });
  window.addEventListener("pointerup", handleBoardPointerUp);
  window.addEventListener("pointercancel", handleBoardPointerCancel);
  globalDragListenersAttached = true;
}

function detachGlobalDragListeners(): void {
  if (!globalDragListenersAttached) {
    return;
  }

  window.removeEventListener("pointermove", handleBoardPointerMove);
  window.removeEventListener("pointerup", handleBoardPointerUp);
  window.removeEventListener("pointercancel", handleBoardPointerCancel);
  globalDragListenersAttached = false;
}

function cleanupDragState(releaseCapture = true): DragState | null {
  const state = dragState;

  if (state && releaseCapture) {
    try {
      state.element.releasePointerCapture(state.pointerId);
    } catch (error) {
      // Ignore release failures
    }
  }

  if (state) {
    clearTileAnimation(state.element);
  }

  dragState = null;
  detachGlobalDragListeners();
  return state ?? null;
}

function clearTileAnimation(element: HTMLDivElement): void {
  element.classList.remove("dragging", "swap-preview", "swap-revert");
  element.style.removeProperty("--tile-translate-x");
  element.style.removeProperty("--tile-translate-y");
  element.style.removeProperty("--tile-scale");
}

function resetBoardAnimations(): void {
  boardElement.classList.remove("swap-animating");
  const tiles = boardElement.querySelectorAll<HTMLDivElement>(".tile");
  tiles.forEach((tile) => {
    clearTileAnimation(tile);
  });
}

function onTilePointerDown(position: Position, event: PointerEvent): void {
  if (!event.isPrimary) {
    return;
  }

  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  if (swapInProgress) {
    return;
  }

  if (dragState) {
    return;
  }

  const blockMessage = getInteractionBlockMessage();
  if (blockMessage) {
    infoMessage = blockMessage;
    render();
    return;
  }

  dragState = {
    start: position,
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    element: event.currentTarget as HTMLDivElement
  };

  const element = dragState.element;
  element.classList.add("dragging");
  element.style.setProperty("--tile-translate-x", "0px");
  element.style.setProperty("--tile-translate-y", "0px");
  element.style.setProperty("--tile-scale", "1.1");

  try {
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  } catch (error) {
    // Ignore pointer capture errors (e.g., when unsupported)
  }

  if (event.pointerType === "touch") {
    event.preventDefault();
  }

  attachGlobalDragListeners();
}

function handleBoardPointerMove(event: PointerEvent): void {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  const deltaX = event.clientX - dragState.originX;
  const deltaY = event.clientY - dragState.originY;
  const maxDelta = Math.max(Math.abs(deltaX), Math.abs(deltaY));

  if (maxDelta < DRAG_THRESHOLD_PX) {
    updateDragVisual(deltaX, deltaY);
    if (event.pointerType !== "mouse") {
      event.preventDefault();
    }
    return;
  }

  const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
  const direction: Position = horizontal
    ? { row: 0, col: deltaX > 0 ? 1 : -1 }
    : { row: deltaY > 0 ? 1 : -1, col: 0 };

  const origin = cleanupDragState();
  if (!origin) {
    return;
  }

  const target: Position = {
    row: origin.start.row + direction.row,
    col: origin.start.col + direction.col
  };

  suppressNextClick = true;

  if (!isPositionInBounds(target)) {
    suppressNextClick = false;
    return;
  }

  event.preventDefault();
  attemptDirectSwap(origin.start, target);
}

function handleBoardPointerUp(event: PointerEvent): void {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }
  cleanupDragState();
}

function handleBoardPointerCancel(event: PointerEvent): void {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }
  cleanupDragState();
}

function updateDragVisual(deltaX: number, deltaY: number): void {
  if (!dragState) {
    return;
  }
  const element = dragState.element;
  const horizontal = Math.abs(deltaX) >= Math.abs(deltaY);
  const translateX = horizontal ? clamp(deltaX, -MAX_DRAG_OFFSET_PX, MAX_DRAG_OFFSET_PX) : 0;
  const translateY = horizontal ? 0 : clamp(deltaY, -MAX_DRAG_OFFSET_PX, MAX_DRAG_OFFSET_PX);
  element.style.setProperty("--tile-translate-x", `${translateX}px`);
  element.style.setProperty("--tile-translate-y", `${translateY}px`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function attemptDirectSwap(start: Position, target: Position): void {
  void processSwap(start, target);
}

function isPositionInBounds(position: Position): boolean {
  const size = game.getBoard().length;
  return (
    position.row >= 0 &&
    position.col >= 0 &&
    position.row < size &&
    position.col < size
  );
}

function positionsAreAdjacent(a: Position, b: Position): boolean {
  const rowDiff = Math.abs(a.row - b.row);
  const colDiff = Math.abs(a.col - b.col);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

function onTileClick(position: Position, event?: MouseEvent): void {
  if (suppressNextClick) {
    suppressNextClick = false;
    event?.preventDefault();
    return;
  }

  if (swapInProgress) {
    event?.preventDefault();
    return;
  }

  const blockMessage = getInteractionBlockMessage();
  if (blockMessage) {
    infoMessage = blockMessage;
    render();
    return;
  }

  if (!selected) {
    selected = position;
    infoMessage = "Pilih permen tetangga untuk ditukar.";
    render();
    return;
  }

  if (selected.row === position.row && selected.col === position.col) {
    selected = null;
    infoMessage = "Seleksi dibatalkan.";
    render();
    return;
  }

  if (!positionsAreAdjacent(selected, position)) {
    selected = position;
    infoMessage = "Permen tidak bertetangga. Seleksi digeser.";
    render();
    return;
  }

  void processSwap(selected, position);
}

async function processSwap(start: Position, target: Position): Promise<void> {
  if (swapInProgress) {
    return;
  }

  const blockMessage = getInteractionBlockMessage();
  if (blockMessage) {
    infoMessage = blockMessage;
    render();
    return;
  }

  swapInProgress = true;
  selected = null;

  try {
    const result = game.trySwap(start, target);
    let previewPromise: Promise<void> | null = null;

    if (result.success || result.reason === "no-match") {
      previewPromise = playSwapPreview(start, target, { revert: !result.success });
    }

    if (previewPromise) {
      await previewPromise;
    }

    if (!result.success) {
      let message: string;
      if (result.reason === "no-match") {
        message = "Swap tidak menghasilkan match.";
      } else if (result.reason === "not-adjacent") {
        message = "Permen tidak bertetangga.";
      } else if (result.reason === "out-of-bounds") {
        message = "Langkah di luar papan.";
      } else {
        message = "Langkah tidak valid.";
      }

      if (game.hasJellyTarget()) {
        message += ` | Jelly tersisa: ${game.getJellyRemaining()}`;
      }
      if (game.hasCrateTarget()) {
        message += ` | Crate tersisa: ${game.getCrateRemaining()}`;
      }

      infoMessage = message;
      render();
      return;
    }

    handleSuccessfulSwap(result);
  } finally {
    swapInProgress = false;
  }
}

function getTileElement(position: Position): HTMLDivElement | null {
  return boardElement.querySelector<HTMLDivElement>(
    `.tile[data-row="${position.row}"][data-col="${position.col}"]`
  );
}

function playSwapPreview(
  start: Position,
  target: Position,
  options: { revert: boolean }
): Promise<void> {
  const sourceElement = getTileElement(start);
  const targetElement = getTileElement(target);

  if (!sourceElement || !targetElement) {
    return Promise.resolve();
  }

  const sourceRect = sourceElement.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  const deltaX = targetRect.left - sourceRect.left;
  const deltaY = targetRect.top - sourceRect.top;

  sourceElement.classList.add("swap-preview");
  targetElement.classList.add("swap-preview");
  sourceElement.style.setProperty("--tile-translate-x", `${deltaX}px`);
  sourceElement.style.setProperty("--tile-translate-y", `${deltaY}px`);
  targetElement.style.setProperty("--tile-translate-x", `${-deltaX}px`);
  targetElement.style.setProperty("--tile-translate-y", `${-deltaY}px`);

  boardElement.classList.add("swap-animating");

  return new Promise((resolve) => {
    window.setTimeout(() => {
      if (options.revert) {
        sourceElement.classList.add("swap-revert");
        targetElement.classList.add("swap-revert");
        sourceElement.style.setProperty("--tile-translate-x", "0px");
        sourceElement.style.setProperty("--tile-translate-y", "0px");
        targetElement.style.setProperty("--tile-translate-x", "0px");
        targetElement.style.setProperty("--tile-translate-y", "0px");

        window.setTimeout(() => {
          clearTileAnimation(sourceElement);
          clearTileAnimation(targetElement);
          boardElement.classList.remove("swap-animating");
          resolve();
        }, SWAP_ANIMATION_DURATION);
      } else {
        boardElement.classList.remove("swap-animating");
        resolve();
      }
    }, SWAP_ANIMATION_DURATION);
  });
}

function handleSuccessfulSwap(result: SwapFeedback): void {
  const firstCascade = result.cascades[0];
  const removalCount = firstCascade
    ? firstCascade.removed.length + firstCascade.createdSpecials.length
    : 0;

  let finalMessage = result.cascades.length > 1
    ? `Kombo ${result.cascades.length} cascade! +${result.scoreGain} skor.`
    : `Match ${removalCount} permen. +${result.scoreGain} skor.`;

  const specialCreated = result.cascades.flatMap((cascade) => cascade.createdSpecials);
  if (specialCreated.length > 0) {
    const labels = Array.from(new Set(specialCreated.map((item) => describeSpecial(item.special))));
    finalMessage += ` | Special baru: ${formatSpecialList(labels)}`;
  }

  if (game.hasJellyTarget()) {
    if (result.clearedJelly > 0) {
      finalMessage += ` | Jelly bersih: ${result.clearedJelly}`;
    }
    finalMessage += ` | Jelly tersisa: ${result.jellyRemaining}`;
  }

  if (game.hasCrateTarget()) {
    if (result.clearedCrate > 0) {
      finalMessage += ` | Crate pecah: ${result.clearedCrate}`;
    }
    finalMessage += ` | Crate tersisa: ${result.crateRemaining}`;
  }

  const totalRemoved = result.cascades.reduce((sum, cascade) => sum + cascade.removed.length, 0);
  const specialCount = specialCreated.length;
  applyMissionDelta({
    score: result.scoreGain,
    match: totalRemoved,
    special: specialCount,
    jelly: result.clearedJelly,
    crate: result.clearedCrate
  });

  selected = null;
  startPlayback(result.frames, finalMessage);
}

function startPlayback(frames: SwapFrame[], finalMessage: string): void {
  if (frames.length === 0) {
    infoMessage = finalMessage;
    render();
    return;
  }

  cancelPlayback();

  playback = {
    frames,
    index: 0,
    timer: null,
    finalMessage
  };

  isAnimating = true;
  infoMessage = frames[0]?.type === "special" ? "Special combo aktif!" : "Permen meledak...";
  stepPlayback();
}

function stepPlayback(): void {
  if (!playback) {
    return;
  }

  render();
  const currentFrame = playback.frames[playback.index];
  const duration = FRAME_DURATION[currentFrame.type] ?? 240;

  if (playback.index >= playback.frames.length - 1) {
    const message = playback.finalMessage;
    isAnimating = false;
    playback = null;
    infoMessage = message;
    render();
    return;
  }

  playback.timer = window.setTimeout(() => {
    if (!playback) {
      return;
    }
    playback.index += 1;
    stepPlayback();
  }, duration);
}

function cancelPlayback(): void {
  if (playback?.timer != null) {
    window.clearTimeout(playback.timer);
  }
  playback = null;
  isAnimating = false;
}

function renderStateBanner(status: GameStatus): void {
  if (status === "won") {
    const level = LEVELS[currentLevelIndex];
    const stars = game.getStarCount();
    stateMessage.textContent = `Level ${level.id} selesai! Target tercapai.`;
    stateStars.textContent = renderStars(stars);
    const detailParts: string[] = [];
    if (game.hasJellyTarget()) {
      detailParts.push("Semua jelly bersih!");
    }
    if (game.hasCrateTarget()) {
      detailParts.push("Semua crate pecah!");
    }
    if (level.description) {
      detailParts.push(level.description);
    }
    if (detailParts.length === 0) {
      detailParts.push("Hebat! Lanjutkan progresmu.");
    }
    const detailMessage = detailParts.join(" ");
    stateDetail.textContent = detailMessage;
    stateActions.replaceChildren();
    if (hasNextLevel()) {
      stateActions.append(nextButton);
    }
    stateBanner.classList.remove("hidden");
    return;
  }

  if (status === "lost") {
    stateMessage.textContent = "Kesempatan habis. Coba lagi!";
    stateStars.textContent = renderStars(game.getStarCount());
    const reminder: string[] = [
      "Gunakan langkah secara efisien untuk mencapai target."
    ];
    if (game.hasJellyTarget()) {
      reminder.push(`Jelly tersisa: ${game.getJellyRemaining().toLocaleString("id-ID")}.`);
    }
    if (game.hasCrateTarget()) {
      reminder.push(`Crate tersisa: ${game.getCrateRemaining().toLocaleString("id-ID")}.`);
    }
    const detailLostMessage = reminder.join(" ");
    stateDetail.textContent = detailLostMessage;
    stateActions.replaceChildren(retryButton);
    stateBanner.classList.remove("hidden");
    return;
  }

  stateBanner.classList.add("hidden");
  stateMessage.textContent = "";
  stateStars.textContent = "";
  stateDetail.textContent = "";
  stateActions.replaceChildren();
}

function renderStars(filled: number, total = 3): string {
  let output = "";
  for (let i = 0; i < total; i++) {
    output += i < filled ? "★" : "☆";
    if (i < total - 1) {
      output += " ";
    }
  }
  return output;
}

function hasNextLevel(): boolean {
  return currentLevelIndex < LEVELS.length - 1;
}

function isLevelUnlocked(index: number): boolean {
  const level = LEVELS[index];
  if (!level) {
    return false;
  }
  const progress = profileState.levelProgress[level.id];
  return progress?.unlocked ?? false;
}

function positionKey(position: Position): string {
  return `${position.row},${position.col}`;
}

function describeSpecial(type: SpecialType): string {
  switch (type) {
    case "line-row":
      return "Garis Horizontal";
    case "line-col":
      return "Garis Vertikal";
    case "bomb":
      return "Bom 3x3";
    case "block":
      return "Ledakan 5x5";
    default:
      return "Special";
  }
}

function initializeMissionState(): MissionState {
  const stored = loadMissionStateFromStorage();
  const now = new Date();
  let state = stored ?? createInitialMissionState();

  // Sinkronkan daftar misi dengan definisi terbaru
  state = {
    missions: BASE_MISSIONS,
    progress: { ...state.progress },
    generatedAt: state.generatedAt
  };

  for (const mission of BASE_MISSIONS) {
    if (!state.progress[mission.id]) {
      state.progress[mission.id] = {
        id: mission.id,
        progress: 0,
        completed: false,
        claimed: false
      };
    }
  }

  state = resetMissionState(state, now);
  persistMissionState(state);
  return state;
}

function loadMissionStateFromStorage(): MissionState | null {
  try {
    const raw = window.localStorage.getItem(MISSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as MissionState;
    if (!parsed?.missions || !parsed?.progress) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Gagal memuat mission state", error);
    return null;
  }
}

function persistMissionState(state: MissionState): void {
  try {
    window.localStorage.setItem(MISSION_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Gagal menyimpan mission state", error);
  }
}

function persistProfileState(): void {
  profileState = ensureLevelProgress(profileState, LEVELS.length);
  saveProfile(PROFILE_STORAGE_KEY, profileState);
}

function renderMissionPanel(): void {
  missionList.innerHTML = "";
  const now = new Date();
  missionState = resetMissionState(missionState, now);
  persistMissionState(missionState);

  for (const mission of missionState.missions) {
    const progress = missionState.progress[mission.id];
    if (!progress) {
      continue;
    }
    missionList.append(buildMissionItem(mission, progress));
  }

  updateMenuView();
}

function buildMissionItem(mission: MissionDefinition, progress: MissionProgress): HTMLDivElement {
  const item = document.createElement("div");
  item.className = `mission mission-${mission.timeframe}`;

  const header = document.createElement("div");
  header.className = "mission-title";
  header.textContent = mission.title;

  const desc = document.createElement("div");
  desc.className = "mission-desc";
  desc.textContent = mission.description;

  const progressTrack = document.createElement("div");
  progressTrack.className = "mission-progress";
  const progressFill = document.createElement("div");
  progressFill.className = "mission-progress-fill";
  const percent = mission.target === 0 ? 1 : Math.min(1, progress.progress / mission.target);
  progressFill.style.width = `${percent * 100}%`;
  progressTrack.append(progressFill);

  const footer = document.createElement("div");
  footer.className = "mission-footer";
  const progressLabel = document.createElement("span");
  progressLabel.textContent = formatMissionProgress(progress, mission);
  const rewardLabel = document.createElement("span");
  rewardLabel.textContent = `Hadiah: ${mission.reward}`;

  footer.append(progressLabel, rewardLabel);

  if (progress.completed) {
    item.classList.add("completed");
  }

  if (progress.claimed) {
    item.classList.add("claimed");
    rewardLabel.textContent = `Hadiah: ${mission.reward} ✅`;
  }

  item.append(header, desc, progressTrack, footer);

  if (progress.completed && !progress.claimed) {
    const claimButton = document.createElement("button");
    claimButton.className = "mission-claim";
    claimButton.textContent = `Klaim +${mission.reward}`;
    claimButton.addEventListener("click", () => handleMissionClaim(mission));
    item.append(claimButton);
  }

  return item;
}

function applyMissionDelta(delta: Partial<Record<MissionType, number>>): void {
  const hasGain = Object.values(delta).some((value) => value !== undefined && value > 0);
  if (!hasGain) {
    return;
  }
  const updated = updateMissionProgress(missionState, delta);
  missionState = updated;
  persistMissionState(missionState);
  renderMissionPanel();
}

function handleMissionClaim(mission: MissionDefinition): void {
  const progress = missionState.progress[mission.id];
  if (!progress?.completed || progress.claimed) {
    return;
  }

  const updatedState = claimMissionReward(missionState, mission.id);
  if (updatedState === missionState) {
    return;
  }

  missionState = updatedState;
  persistMissionState(missionState);

  profileState = addSoftCurrency(profileState, mission.reward);
  persistProfileState();

  renderHud();
  renderMissionPanel();

  infoMessage = `Hadiah misi \"${mission.title}\" diterima!`;
  infoBanner.textContent = infoMessage;
}

function formatSpecialList(labels: string[]): string {
  if (labels.length === 0) {
    return "";
  }
  if (labels.length === 1) {
    return labels[0];
  }
  const last = labels.pop();
  return `${labels.join(", ")} dan ${last}`;
}

render();
renderMissionPanel();
showMenu();
