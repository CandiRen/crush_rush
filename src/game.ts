import {
  BOARD_SIZE,
  Board,
  CascadeDetail,
  Position,
  SwapResult,
  attemptSwap,
  createInitialBoard
} from "./board";

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

  constructor(config?: Partial<GameConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.boardState = createInitialBoard(this.config.size);
    this.status = "playing";
    this.movesLeft = this.config.moves;
  }

  public reset(): void {
    this.boardState = createInitialBoard(this.config.size);
    this.status = "playing";
    this.score = 0;
    this.movesLeft = this.config.moves;
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
        totalScore: this.score
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
        totalScore: this.score
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
      totalScore: this.score
    };
  }
}
