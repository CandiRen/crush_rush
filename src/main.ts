import { Board, Position, Tile, TileKind, SwapFrame } from "./board";
import { Game, GameStatus } from "./game";
import { LEVELS, LevelDefinition } from "./levels";

interface TileTheme {
  label: string;
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
  highlightType?: "match" | "cascade";
  disableInput?: boolean;
  selected?: Position | null;
}

const FRAME_DURATION: Record<SwapFrame["type"], number> = {
  match: 320,
  cascade: 260,
  final: 160
};

const TILE_THEME: Record<TileKind, TileTheme> = {
  berry: {
    label: "BR",
    background: "linear-gradient(135deg, #fbc2eb, #a6c1ee)",
    text: "#0f172a"
  },
  candy: {
    label: "CD",
    background: "linear-gradient(135deg, #fda085, #f6d365)",
    text: "#0f172a"
  },
  citrus: {
    label: "CT",
    background: "linear-gradient(135deg, #f6d365, #fda085)",
    text: "#0f172a"
  },
  gem: {
    label: "GM",
    background: "linear-gradient(135deg, #5ee7df, #b490ca)",
    text: "#0f172a"
  },
  star: {
    label: "ST",
    background: "linear-gradient(135deg, #cfd9df, #e2ebf0)",
    text: "#0f172a"
  },
  heart: {
    label: "HT",
    background: "linear-gradient(135deg, #fcb69f, #ffecd2)",
    text: "#0f172a"
  }
};

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
shell.append(hud, boardElement, infoBanner, stateBanner, bottomBar, tutorialOverlay);
app.append(shell);

window.crushRush = {
  debugBoard() {
    return structuredClone(game.getBoard());
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
  }

  render();
}

function render(): void {
  const status = game.getStatus();
  const activeFrame = playback ? playback.frames[playback.index] : null;
  const boardSnapshot = activeFrame ? activeFrame.board : game.getBoard();
  const highlight = activeFrame?.removed ?? [];
  const highlightType = activeFrame?.type === "match" ? "match" : activeFrame?.type === "cascade" ? "cascade" : undefined;
  const disableInput = isAnimating || tutorialActive;

  renderHud();
  renderBoard(boardSnapshot, status, {
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

  hud.append(
    createHudItem(`Level ${level.id}`, level.name),
    createHudItem("Skor", game.getScore().toLocaleString("id-ID")),
    createHudItem("Langkah", `${game.getMovesLeft()} / ${level.moves}`),
    createHudItem("Target", game.getTargetScore().toLocaleString("id-ID"))
  );
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

function renderBoard(board: Board, status: GameStatus, options: RenderOptions = {}): void {
  boardElement.innerHTML = "";
  boardElement.style.gridTemplateColumns = `repeat(${board.length}, 1fr)`;
  boardElement.style.gridTemplateRows = `repeat(${board.length}, 1fr)`;

  const highlightKeys = new Set(options.highlight?.map(positionKey));
  const disableInput = options.disableInput || status !== "playing";

  board.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      const tileElement = document.createElement("div");
      tileElement.className = "tile";

      if (!tile) {
        tileElement.classList.add("hidden");
      } else {
        decorateTile(tileElement, tile);
        if (options.highlightType === "cascade") {
          tileElement.classList.add("cascade");
        }
      }

      const key = positionKey({ row: rowIndex, col: colIndex });
      if (highlightKeys.has(key)) {
        tileElement.classList.add("matched");
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
  container.textContent = theme.label;
  container.style.background = theme.background;
  container.style.color = theme.text;
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
    render();
    return;
  }

  const removed = result.cascades[0]?.removed.length ?? 0;
  const finalMessage = result.cascades.length > 1
    ? `Kombo ${result.cascades.length} cascade! +${result.scoreGain} skor.`
    : `Match ${removed} permen. +${result.scoreGain} skor.`;

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
  infoMessage = "Permen meledak...";
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
    stateDetail.textContent = level.description ?? "Hebat! Lanjutkan progresmu.";
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
    stateDetail.textContent = "Gunakan langkah secara efisien untuk mencapai target.";
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

render();
