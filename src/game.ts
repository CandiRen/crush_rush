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
  TileLayout,
  forceSwap,
  hammerTile
} from "./board";
import type { LevelDefinition } from "./levels";

export type GameStatus = "loading" | "playing" | "won" | "lost";

export type BoosterType = "hammer" | "free-switch";
export type BoosterInventory = Record<BoosterType, number>;

const DEFAULT_BOOSTERS: BoosterInventory = {
  hammer: 3,
  "free-switch": 3
};

function normalizeBoosterCount(value: number | undefined, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

function normalizeBoosterInventory(
  source?: Partial<Record<BoosterType, number>>
): BoosterInventory {
  return {
    hammer: normalizeBoosterCount(source?.hammer, DEFAULT_BOOSTERS.hammer),
    "free-switch": normalizeBoosterCount(
      source?.["free-switch"],
      DEFAULT_BOOSTERS["free-switch"]
    )
  };
}

export interface GameConfig {
  size: number;
  moves: number;
  targetScore: number;
  boosters?: Partial<Record<BoosterType, number>>;
}

export type SwapFailureReason =
  | SwapResult["reason"]
  | "no-charge"
  | "invalid-target"
  | "not-playing";

export interface SwapFeedback {
  success: boolean;
  reason?: SwapFailureReason;
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
  private boosters: BoosterInventory = { ...DEFAULT_BOOSTERS };

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

  public getBoosters(): BoosterInventory {
    return {
      hammer: this.boosters.hammer,
      "free-switch": this.boosters["free-switch"]
    };
  }

  public canUseBooster(type: BoosterType): boolean {
    return this.status === "playing" && this.hasBoosterCharges(type);
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
      return this.buildFailureFeedback("not-playing");
    }

    const swapResult: SwapResult = attemptSwap(this.boardState, a, b);

    if (!swapResult.valid) {
      return this.buildFailureFeedback(swapResult.reason ?? "no-match");
    }

    this.score += swapResult.totalScore;
    this.movesLeft = Math.max(0, this.movesLeft - 1);
    this.highestCombo = Math.max(this.highestCombo, swapResult.cascades.length);

    return this.buildSuccessFeedback(
      swapResult.cascades,
      swapResult.frames,
      swapResult.totalScore
    );
  }

  public useHammer(position: Position): SwapFeedback {
    if (this.status !== "playing") {
      return this.buildFailureFeedback("not-playing");
    }

    if (!this.hasBoosterCharges("hammer")) {
      return this.buildFailureFeedback("no-charge");
    }

    if (!this.isPositionInBounds(position)) {
      return this.buildFailureFeedback("out-of-bounds");
    }

    const hammerResult = hammerTile(this.boardState, position);
    if (!hammerResult) {
      return this.buildFailureFeedback("invalid-target");
    }

    this.spendBooster("hammer");
    this.score += hammerResult.totalScore;
    this.highestCombo = Math.max(this.highestCombo, hammerResult.cascades.length);

    return this.buildSuccessFeedback(
      hammerResult.cascades,
      hammerResult.frames,
      hammerResult.totalScore
    );
  }

  public useFreeSwitch(a: Position, b: Position): SwapFeedback {
    if (this.status !== "playing") {
      return this.buildFailureFeedback("not-playing");
    }

    if (!this.hasBoosterCharges("free-switch")) {
      return this.buildFailureFeedback("no-charge");
    }

    if (!this.isPositionInBounds(a) || !this.isPositionInBounds(b)) {
      return this.buildFailureFeedback("out-of-bounds");
    }

    if (!this.positionsAreAdjacent(a, b)) {
      return this.buildFailureFeedback("not-adjacent");
    }

    const swapResult = forceSwap(this.boardState, a, b);
    this.spendBooster("free-switch");
    this.score += swapResult.totalScore;
    this.highestCombo = Math.max(this.highestCombo, swapResult.cascades.length);

    return this.buildSuccessFeedback(
      swapResult.cascades,
      swapResult.frames,
      swapResult.totalScore,
      swapResult.reason
    );
  }

  private applyLevel(level: LevelDefinition): void {
    const size = level.layout ? level.layout.length : level.boardSize ?? this.config.size;
    this.config = {
      size,
      moves: level.moves,
      targetScore: level.targetScore,
      boosters: this.config.boosters
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
    this.boosters = normalizeBoosterInventory(this.config.boosters);
  }

  private buildFailureFeedback(reason: SwapFailureReason): SwapFeedback {
    return {
      success: false,
      reason,
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

  private buildSuccessFeedback(
    cascades: CascadeDetail[],
    frames: SwapFrame[],
    scoreGain: number,
    reason?: SwapFailureReason
  ): SwapFeedback {
    const jellyStats = this.applyJellyFromCascades(cascades);
    const crateStats = this.applyCrateFromCascades(cascades);
    const jellyRemaining = this.getJellyRemaining();
    const crateRemaining = this.getCrateRemaining();
    const status = this.getStatus();

    return {
      success: true,
      reason,
      cascades,
      scoreGain,
      movesLeft: this.movesLeft,
      status,
      totalScore: this.score,
      frames,
      clearedJelly: jellyStats.cleared,
      jellyRemaining,
      clearedJellyPositions: jellyStats.positions,
      clearedCrate: crateStats.cleared,
      crateRemaining,
      clearedCratePositions: crateStats.positions
    };
  }

  private hasBoosterCharges(type: BoosterType): boolean {
    return (this.boosters[type] ?? 0) > 0;
  }

  private spendBooster(type: BoosterType): void {
    if (this.boosters[type] > 0) {
      this.boosters[type] -= 1;
    }
  }

  private isPositionInBounds(position: Position): boolean {
    const size = this.boardState.length;
    return (
      position.row >= 0 &&
      position.col >= 0 &&
      position.row < size &&
      position.col < size
    );
  }

  private positionsAreAdjacent(a: Position, b: Position): boolean {
    const rowDiff = Math.abs(a.row - b.row);
    const colDiff = Math.abs(a.col - b.col);
    return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
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
