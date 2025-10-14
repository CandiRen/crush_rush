import {
  Board,
  Position,
  Tile,
  TileKind,
  SwapFrame,
  SpecialType
} from "./board";
import { Game, GameStatus } from "./game";
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
  loadProfile,
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

const SPECIAL_SUFFIX: Record<SpecialType, string> = {
  "line-row": "-",
  "line-col": "|",
  bomb: "B"
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
const missionPanel = document.createElement("div");
const missionHeader = document.createElement("div");
const missionList = document.createElement("div");

declare global {
  interface Window {
    crushRush?: {
      debugBoard(): Board;
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
let profileState: PlayerProfile = loadProfile(PROFILE_STORAGE_KEY);

shell.className = "game-shell";
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
missionPanel.className = "mission-panel";
missionHeader.className = "mission-header";
missionHeader.textContent = "Misi";
missionList.className = "mission-list";
missionPanel.append(missionHeader, missionList);

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

bottomBar.append(restartButton);
shell.append(hud, boardElement, infoBanner, stateBanner, bottomBar, tutorialOverlay, missionPanel);
app.append(shell);

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

  cancelPlayback();
  currentLevelIndex = index;
  const level = LEVELS[currentLevelIndex];
  game.setLevel(level);
  selected = null;
  isAnimating = false;

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

function render(): void {
  const status = game.getStatus();
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

      tileElement.addEventListener("click", () => {
        onTileClick({ row: rowIndex, col: colIndex });
      });

      boardElement.append(tileElement);
    });
  });
}

function decorateTile(container: HTMLDivElement, tile: Tile): void {
  const theme = TILE_THEME[tile.kind];
  const suffix = tile.special ? SPECIAL_SUFFIX[tile.special] : "";
  container.textContent = `${theme.emoji}${suffix}`;
  container.style.background = theme.background;
  container.style.color = theme.text;
  container.dataset.kind = tile.kind;

  if (tile.special) {
    container.classList.add("special");
    container.dataset.special = tile.special;
    container.title = `${describeSpecial(tile.special)} (${theme.name})`;
  } else {
    container.classList.remove("special");
    container.removeAttribute("data-special");
    container.title = theme.name;
  }
}

function onTileClick(position: Position): void {
  if (tutorialActive) {
    infoMessage = "Tutup layar tutorial untuk mulai bermain.";
    render();
    return;
  }

  if (isAnimating) {
    infoMessage = "Tunggu animasi selesai.";
    render();
    return;
  }

  if (game.getStatus() !== "playing") {
    infoMessage = "Level sudah selesai. Gunakan tombol tindakan.";
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

  const result = game.trySwap(selected, position);

  if (!result.success) {
    if (result.reason === "not-adjacent") {
      selected = position;
      infoMessage = "Permen tidak bertetangga. Seleksi digeser.";
    } else if (result.reason === "no-match") {
      selected = null;
      infoMessage = "Swap tidak menghasilkan match.";
    } else {
      selected = null;
      infoMessage = "Langkah tidak valid.";
    }
    if (game.hasJellyTarget()) {
      infoMessage += ` | Jelly tersisa: ${game.getJellyRemaining()}`;
    }
    if (game.hasCrateTarget()) {
      infoMessage += ` | Crate tersisa: ${game.getCrateRemaining()}`;
    }
    render();
    return;
  }

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

  item.append(header, desc, footer);

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
