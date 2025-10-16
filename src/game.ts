import {
  BOARD_SIZE,
  Board,
  CascadeDetail,
  Position,
  SwapFrame,
  SwapResult,
  attemptSwap,
  createBoardFromLayout,
  createInitialBoard,
  ensurePlayableBoard,
  TileLayout
} from "./board";
import type { LevelDefinition } from "./levels";

export type GameStatus = "loading" | "playing" | "won" | "lost";

export interface GameConfig {
  size: number;
  moves: number;
  targetScore: number;
}

export interface SwapFeedback {
  success: boolean;
  reason?: SwapResult["reason"];
  cascades: CascadeDetail[];
  scoreGain: number;
  movesLeft: number;
  status: GameStatus;
  totalScore: number;
  frames: SwapFrame[];
  clearedJelly: number;
  jellyRemaining: number;
  clearedJellyPositions: Position[];
  clearedCrate: number;
  crateRemaining: number;
  clearedCratePositions: Position[];
}

const DEFAULT_CONFIG: GameConfig = {
  size: BOARD_SIZE,
  moves: 32,
  targetScore: 6500
};

export class Game {
  private config: GameConfig;
  private boardState: Board;
  private status: GameStatus = "loading";
  private score = 0;
  private movesLeft = 0;
  private level: LevelDefinition;
  private jellyGrid: number[][] = [];
  private initialJellyCount = 0;
  private crateGrid: number[][] = [];
  private initialCrateCount = 0;
  private highestCombo = 0;

  constructor(level: LevelDefinition, config?: Partial<GameConfig>) {
    this.level = level;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.boardState = createInitialBoard(this.config.size);
    this.applyLevel(level);
  }

  public reset(): void {
    this.applyLevel(this.level);
  }

  public getBoard(): Board {
    return this.boardState;
  }

  public getScore(): number {
    return this.score;
  }

  public getMovesLeft(): number {
    return this.movesLeft;
  }

  public getTargetScore(): number {
    return this.config.targetScore;
  }

  public getHighestCombo(): number {
    return this.highestCombo;
  }

  public getMovesUsed(): number {
    return Math.max(0, this.config.moves - this.movesLeft);
  }

  public getScorePerMove(): number {
    const movesUsed = this.getMovesUsed();
    if (movesUsed === 0) {
      return 0;
    }
    return this.score / movesUsed;
  }

  public getJellyRemaining(): number {
    return this.jellyGrid.reduce(
      (sum, row) => sum + row.reduce((acc, value) => acc + value, 0),
      0
    );
  }

  public hasJellyTarget(): boolean {
    return this.initialJellyCount > 0;
  }

  public getJellyGrid(): number[][] {
    return this.jellyGrid.map((row) => [...row]);
  }

  public getCrateRemaining(): number {
    return this.crateGrid.reduce(
      (sum, row) => sum + row.reduce((acc, value) => acc + value, 0),
      0
    );
  }

  public hasCrateTarget(): boolean {
    return this.initialCrateCount > 0;
  }

  public getCrateGrid(): number[][] {
    return this.crateGrid.map((row) => [...row]);
  }

  public getLevel(): LevelDefinition {
    return this.level;
  }

  public getStarCount(): number {
    if (this.config.targetScore <= 0) {
      return 0;
    }
    const ratio = this.score / this.config.targetScore;
    if (ratio >= 2) {
      return 3;
    }
    if (ratio >= 1.5) {
      return 2;
    }
    if (ratio >= 1) {
      return 1;
    }
    return 0;
  }

  public setLevel(level: LevelDefinition): void {
    this.level = level;
    this.applyLevel(level);
  }

  public getStatus(): GameStatus {
    if (this.status !== "playing") {
      return this.status;
    }

    const scoreRequirementMet =
      this.config.targetScore <= 0 || this.score >= this.config.targetScore;
    const jellyCleared = this.getJellyRemaining() === 0;
    const crateCleared = this.getCrateRemaining() === 0;

    if (scoreRequirementMet && jellyCleared && crateCleared) {
      this.status = "won";
      return this.status;
    }

    if (this.movesLeft === 0) {
      this.status = scoreRequirementMet && jellyCleared && crateCleared ? "won" : "lost";
    }

    return this.status;
  }

  public trySwap(a: Position, b: Position): SwapFeedback {
    if (this.status !== "playing") {
      return {
        success: false,
        reason: "out-of-bounds",
        cascades: [],
        scoreGain: 0,
        movesLeft: this.movesLeft,
        status: this.getStatus(),
        totalScore: this.score,
        frames: [],
        clearedJelly: 0,
        jellyRemaining: this.getJellyRemaining(),
        clearedJellyPositions: [],
        clearedCrate: 0,
        crateRemaining: this.getCrateRemaining(),
        clearedCratePositions: []
      };
    }

    const swapResult: SwapResult = attemptSwap(this.boardState, a, b);

    if (!swapResult.valid) {
      return {
        success: false,
        reason: swapResult.reason,
        cascades: [],
        scoreGain: 0,
        movesLeft: this.movesLeft,
        status: this.getStatus(),
        totalScore: this.score,
        frames: [],
        clearedJelly: 0,
        jellyRemaining: this.getJellyRemaining(),
        clearedJellyPositions: [],
        clearedCrate: 0,
        crateRemaining: this.getCrateRemaining(),
        clearedCratePositions: []
      };
    }

    this.score += swapResult.totalScore;
    this.movesLeft = Math.max(0, this.movesLeft - 1);
    this.highestCombo = Math.max(this.highestCombo, swapResult.cascades.length);

    const jellyStats = this.applyJellyFromCascades(swapResult.cascades);
    const crateStats = this.applyCrateFromCascades(swapResult.cascades);
    const jellyRemaining = this.getJellyRemaining();
    const crateRemaining = this.getCrateRemaining();
    const currentStatus = this.getStatus();

    return {
      success: true,
      cascades: swapResult.cascades,
      scoreGain: swapResult.totalScore,
      movesLeft: this.movesLeft,
      status: currentStatus,
      totalScore: this.score,
      frames: swapResult.frames,
      clearedJelly: jellyStats.cleared,
      jellyRemaining,
      clearedJellyPositions: jellyStats.positions,
      clearedCrate: crateStats.cleared,
      crateRemaining,
      clearedCratePositions: crateStats.positions
    };
  }

  private applyLevel(level: LevelDefinition): void {
    const size = level.layout ? level.layout.length : level.boardSize ?? this.config.size;
    this.config = {
      size,
      moves: level.moves,
      targetScore: level.targetScore
    };

    this.boardState = level.layout
      ? this.boardFromLayout(level.layout)
      : createInitialBoard(size);
    this.boardState = ensurePlayableBoard(this.boardState);

    this.jellyGrid = this.cloneJellyLayout(size, level.jellyLayout);
    this.initialJellyCount = this.getJellyRemaining();
    this.crateGrid = this.cloneCrateLayout(size, level.crateLayout);
    this.initialCrateCount = this.getCrateRemaining();

    this.status = "playing";
    this.score = 0;
    this.movesLeft = this.config.moves;
    this.highestCombo = 0;
  }

  private boardFromLayout(layout: TileLayout): Board {
    const board = createBoardFromLayout(layout);
    if (board.length !== board[0]?.length) {
      // enforce square board for now
      throw new Error("Layouts harus berbentuk kotak untuk saat ini");
    }
    return board;
  }

  private cloneJellyLayout(size: number, layout?: number[][]): number[][] {
    if (!layout) {
      return this.createEmptyGrid(size);
    }

    if (layout.length !== size) {
      throw new Error("Jelly layout harus memiliki jumlah baris yang sama dengan board");
    }

    return layout.map((row) => {
      if (row.length !== size) {
        throw new Error("Setiap baris jelly layout harus memiliki panjang yang sama dengan board");
      }
      return row.map((value) => {
        const numeric = Number(value ?? 0);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return 0;
        }
        return Math.floor(numeric);
      });
    });
  }

  private createEmptyGrid(size: number): number[][] {
    return Array.from({ length: size }, () => Array(size).fill(0));
  }

  private cloneCrateLayout(size: number, layout?: number[][]): number[][] {
    if (!layout) {
      return this.createEmptyGrid(size);
    }

    if (layout.length !== size) {
      throw new Error("Crate layout harus memiliki jumlah baris yang sama dengan board");
    }

    return layout.map((row) => {
      if (row.length !== size) {
        throw new Error("Setiap baris crate layout harus memiliki panjang yang sama dengan board");
      }
      return row.map((value) => {
        const numeric = Number(value ?? 0);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return 0;
        }
        return Math.floor(numeric);
      });
    });
  }

  private applyJellyFromCascades(cascades: CascadeDetail[]): {
    cleared: number;
    positions: Position[];
  } {
    if (!this.hasJellyTarget() || cascades.length === 0) {
      return { cleared: 0, positions: [] };
    }

    const counts = new Map<
      string,
      {
        position: Position;
        count: number;
      }
    >();

    for (const cascade of cascades) {
      for (const pos of cascade.removed) {
        const key = this.positionKey(pos);
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { position: { ...pos }, count: 1 });
        }
      }
    }

    let cleared = 0;
    const clearedPositions: Position[] = [];

    for (const { position, count } of counts.values()) {
      const { row, col } = position;
      const current = this.jellyGrid[row]?.[col] ?? 0;
      if (current <= 0) {
        continue;
      }

      const toRemove = Math.min(current, count);
      if (toRemove <= 0) {
        continue;
      }

      this.jellyGrid[row][col] = current - toRemove;
      cleared += toRemove;

      if (this.jellyGrid[row][col] === 0) {
        clearedPositions.push({ ...position });
      }
    }

    return {
      cleared,
      positions: clearedPositions
    };
  }

  private applyCrateFromCascades(cascades: CascadeDetail[]): {
    cleared: number;
    positions: Position[];
  } {
    if (!this.hasCrateTarget() || cascades.length === 0) {
      return { cleared: 0, positions: [] };
    }

    const counts = new Map<string, { position: Position; count: number }>();

    for (const cascade of cascades) {
      for (const pos of cascade.removed) {
        const key = this.positionKey(pos);
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, { position: { ...pos }, count: 1 });
        }
      }
    }

    let cleared = 0;
    const clearedPositions: Position[] = [];

    for (const { position, count } of counts.values()) {
      const { row, col } = position;
      const current = this.crateGrid[row]?.[col] ?? 0;
      if (current <= 0) {
        continue;
      }

      const toRemove = Math.min(current, count);
      if (toRemove <= 0) {
        continue;
      }

      this.crateGrid[row][col] = current - toRemove;
      cleared += toRemove;

      if (this.crateGrid[row][col] === 0) {
        clearedPositions.push({ ...position });
      }
    }

    return {
      cleared,
      positions: clearedPositions
    };
  }

  private positionKey(position: Position): string {
    return `${position.row},${position.col}`;
  }
}
