import { Board, Position, Tile, TileKind } from "./board";
import { Game, GameStatus } from "./game";

interface TileTheme {
  label: string;
  background: string;
  text: string;
}

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

declare global {
  interface Window {
    crushRush?: {
      debugBoard(): Board;
    };
  }
}

let selected: Position | null = null;
let infoMessage = "Cocokkan tiga permen atau lebih!";

shell.className = "game-shell";
hud.className = "hud";
boardElement.className = "board";
infoBanner.className = "status-banner";
stateBanner.className = "status-banner hidden";
bottomBar.className = "hud";
restartButton.className = "primary";
restartButton.textContent = "Mulai Ulang";

restartButton.addEventListener("click", () => {
  game.reset();
  selected = null;
  infoMessage = "Level dimulai ulang.";
  render();
});

bottomBar.append(restartButton);
shell.append(hud, boardElement, infoBanner, stateBanner, bottomBar);
app.append(shell);

window.crushRush = {
  debugBoard() {
    return structuredClone(game.getBoard());
  }
};

function render(): void {
  renderHud();
  renderBoard(game.getBoard(), game.getStatus());
  infoBanner.textContent = infoMessage;
  const status = game.getStatus();
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

function renderBoard(board: Board, status: GameStatus): void {
  boardElement.innerHTML = "";
  boardElement.style.gridTemplateColumns = `repeat(${board.length}, 1fr)`;
  boardElement.style.gridTemplateRows = `repeat(${board.length}, 1fr)`;

  board.forEach((row, rowIndex) => {
    row.forEach((tile, colIndex) => {
      const tileElement = document.createElement("div");
      tileElement.className = "tile";

      if (!tile) {
        tileElement.classList.add("hidden");
      } else {
        decorateTile(tileElement, tile);
      }

      if (selected && selected.row === rowIndex && selected.col === colIndex) {
        tileElement.classList.add("selected");
      }

      if (status !== "playing") {
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

  selected = null;

  if (result.cascades.length > 1) {
    infoMessage = `Kombo ${result.cascades.length} cascade! +${result.scoreGain} skor.`;
  } else {
    const removed = result.cascades[0]?.removed.length ?? 0;
    infoMessage = `Match ${removed} permen. +${result.scoreGain} skor.`;
  }

  render();
}

render();
