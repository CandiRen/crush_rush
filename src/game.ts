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
    if (this.status === "playing" && this.score >= this.config.targetScore) {
      this.status = "won";
    } else if (this.status === "playing" && this.movesLeft === 0) {
      this.status = this.score >= this.config.targetScore ? "won" : "lost";
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
        frames: []
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
        frames: []
      };
    }

    this.score += swapResult.totalScore;
    this.movesLeft = Math.max(0, this.movesLeft - 1);

    const currentStatus = this.getStatus();

    return {
      success: true,
      cascades: swapResult.cascades,
      scoreGain: swapResult.totalScore,
      movesLeft: this.movesLeft,
      status: currentStatus,
      totalScore: this.score,
      frames: swapResult.frames
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

    this.status = "playing";
    this.score = 0;
    this.movesLeft = this.config.moves;
  }

  private boardFromLayout(layout: TileLayout): Board {
    const board = createBoardFromLayout(layout);
    if (board.length !== board[0]?.length) {
      // enforce square board for now
      throw new Error("Layouts harus berbentuk kotak untuk saat ini");
    }
    return board;
  }
}
