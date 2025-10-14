import { Board, Position, Tile, TileKind, SwapFrame } from "./board";
import { Game, GameStatus } from "./game";

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

const game = new Game();
const app = document.getElementById("app");

if (!app) {
  throw new Error("Root container #app tidak ditemukan");
}

const shell = document.createElement("div");
const hud = document.createElement("div");
const boardElement = document.createElement("div");
const infoBanner = document.createElement("div");
const stateBanner = document.createElement("div");
const bottomBar = document.createElement("div");
const restartButton = document.createElement("button");
const tutorialOverlay = document.createElement("div");

declare global {
  interface Window {
    crushRush?: {
      debugBoard(): Board;
      skipTutorial(): void;
    };
  }
}

let selected: Position | null = null;
let infoMessage = "Cocokkan tiga permen atau lebih!";
let playback: PlaybackState | null = null;
let isAnimating = false;
let tutorialActive = true;

shell.className = "game-shell";
hud.className = "hud";
boardElement.className = "board";
infoBanner.className = "status-banner";
stateBanner.className = "status-banner hidden";
bottomBar.className = "hud";
restartButton.className = "primary";
restartButton.textContent = "Mulai Ulang";
tutorialOverlay.className = "tutorial-overlay";
tutorialOverlay.innerHTML = `
  <div>
    <h3>Selamat datang di Crush Rush!</h3>
    <p>Pilih dua permen bertetangga untuk menukarnya. Bentuk garis tiga atau lebih untuk mendapatkan skor.</p>
    <p><strong>Klik di mana saja</strong> untuk memulai level pertama.</p>
  </div>
`;

tutorialOverlay.addEventListener("click", () => {
  tutorialActive = false;
  infoMessage = "Pilih dua permen bertetangga untuk ditukar.";
  render();
});

restartButton.addEventListener("click", () => {
  cancelPlayback();
  game.reset();
  selected = null;
  infoMessage = "Level dimulai ulang.";
  render();
});

bottomBar.append(restartButton);
shell.append(hud, boardElement, infoBanner, stateBanner, bottomBar, tutorialOverlay);
app.append(shell);

window.crushRush = {
  debugBoard() {
    return structuredClone(game.getBoard());
  },
  skipTutorial() {
    tutorialActive = false;
    render();
  }
};

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

  if (status === "won") {
    stateBanner.textContent = "Level selesai! Target skor tercapai.";
    stateBanner.classList.remove("hidden");
  } else if (status === "lost") {
    stateBanner.textContent = "Kesempatan habis. Coba lagi!";
    stateBanner.classList.remove("hidden");
  } else {
    stateBanner.classList.add("hidden");
    stateBanner.textContent = "";
  }

  if (tutorialActive) {
    tutorialOverlay.classList.remove("hidden");
  } else {
    tutorialOverlay.classList.add("hidden");
  }
}

function renderHud(): void {
  hud.innerHTML = "";
  const score = document.createElement("div");
  score.textContent = `Skor: ${game.getScore().toLocaleString("id-ID")}`;

  const moves = document.createElement("div");
  moves.textContent = `Langkah: ${game.getMovesLeft()}`;

  const target = document.createElement("div");
  target.textContent = `Target: ${game.getTargetScore().toLocaleString("id-ID")}`;

  hud.append(score, moves, target);
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
    infoMessage = "Level sudah selesai. Tekan Mulai Ulang.";
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

function positionKey(position: Position): string {
  return `${position.row},${position.col}`;
}

render();
