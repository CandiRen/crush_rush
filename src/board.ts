export const BOARD_SIZE = 9;
export const TILE_KINDS = [
  "berry",
  "candy",
  "citrus",
  "gem",
  "star",
  "heart"
] as const;

export type TileKind = (typeof TILE_KINDS)[number];

export interface Position {
  row: number;
  col: number;
}

export interface Tile {
  id: number;
  kind: TileKind;
}

export type Board = (Tile | null)[][];

export interface CascadeDetail {
  removed: Position[];
  scoreGain: number;
}

export interface ResolveResult {
  cascades: CascadeDetail[];
  totalRemoved: number;
  totalScore: number;
}

export interface SwapResult extends ResolveResult {
  valid: boolean;
  reason?: "not-adjacent" | "no-match" | "out-of-bounds";
}

const BASE_MATCH_SCORE = 60;
const MAX_GENERATION_ATTEMPTS = 100;

let nextTileId = 1;

const rng = () => Math.random();

function createTile(kind: TileKind): Tile {
  return { id: nextTileId++, kind };
}

function randomKind(): TileKind {
  const index = Math.floor(rng() * TILE_KINDS.length);
  return TILE_KINDS[index];
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((tile) => (tile ? { ...tile } : null)));
}

export function createInitialBoard(size = BOARD_SIZE): Board {
  let attempts = 0;
  while (attempts < MAX_GENERATION_ATTEMPTS) {
    const board: Board = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => null)
    );

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        let kind: TileKind = randomKind();
        let guard = 0;
        while (createsMatchAt(board, row, col, kind) && guard < 10) {
          kind = randomKind();
          guard++;
        }
        board[row][col] = createTile(kind);
      }
    }

    if (hasValidMoves(board)) {
      return board;
    }
    attempts++;
  }

  throw new Error("Unable to generate a valid starting board");
}

function createsMatchAt(board: Board, row: number, col: number, kind: TileKind): boolean {
  // Check horizontal
  const left1 = col > 0 ? board[row][col - 1] : null;
  const left2 = col > 1 ? board[row][col - 2] : null;
  if (left1 && left2 && left1.kind === kind && left2.kind === kind) {
    return true;
  }

  // Check vertical
  const up1 = row > 0 ? board[row - 1][col] : null;
  const up2 = row > 1 ? board[row - 2][col] : null;
  if (up1 && up2 && up1.kind === kind && up2.kind === kind) {
    return true;
  }

  return false;
}

function inBounds(board: Board, position: Position): boolean {
  return (
    position.row >= 0 &&
    position.row < board.length &&
    position.col >= 0 &&
    position.col < board[0].length
  );
}

function areAdjacent(a: Position, b: Position): boolean {
  const rowDiff = Math.abs(a.row - b.row);
  const colDiff = Math.abs(a.col - b.col);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

function findMatches(board: Board): Position[][] {
  const matches: Position[][] = [];
  const size = board.length;

  // Horizontal matches
  for (let row = 0; row < size; row++) {
    let run: Position[] = [];
    for (let col = 0; col < size; col++) {
      const tile = board[row][col];
      if (!tile) {
        if (run.length >= 3) {
          matches.push(run);
        }
        run = [];
        continue;
      }

      if (run.length === 0) {
        run = [{ row, col }];
      } else {
        const prev = board[run[run.length - 1].row][run[run.length - 1].col];
        if (prev && prev.kind === tile.kind) {
          run.push({ row, col });
        } else {
          if (run.length >= 3) {
            matches.push(run);
          }
          run = [{ row, col }];
        }
      }
    }
    if (run.length >= 3) {
      matches.push(run);
    }
  }

  // Vertical matches
  for (let col = 0; col < size; col++) {
    let run: Position[] = [];
    for (let row = 0; row < size; row++) {
      const tile = board[row][col];
      if (!tile) {
        if (run.length >= 3) {
          matches.push(run);
        }
        run = [];
        continue;
      }

      if (run.length === 0) {
        run = [{ row, col }];
      } else {
        const prev = board[run[run.length - 1].row][run[run.length - 1].col];
        if (prev && prev.kind === tile.kind) {
          run.push({ row, col });
        } else {
          if (run.length >= 3) {
            matches.push(run);
          }
          run = [{ row, col }];
        }
      }
    }
    if (run.length >= 3) {
      matches.push(run);
    }
  }

  return matches;
}

function clearMatches(board: Board, matches: Position[][]): Position[] {
  const unique = new Map<string, Position>();
  for (const group of matches) {
    for (const pos of group) {
      const key = `${pos.row},${pos.col}`;
      if (!unique.has(key)) {
        unique.set(key, pos);
      }
    }
  }

  for (const { row, col } of unique.values()) {
    board[row][col] = null;
  }

  return Array.from(unique.values());
}

function collapseColumns(board: Board): void {
  const size = board.length;
  for (let col = 0; col < size; col++) {
    let writeRow = size - 1;
    for (let row = size - 1; row >= 0; row--) {
      const tile = board[row][col];
      if (tile) {
        if (row !== writeRow) {
          board[writeRow][col] = tile;
          board[row][col] = null;
        }
        writeRow--;
      }
    }
    for (let row = writeRow; row >= 0; row--) {
      board[row][col] = null;
    }
  }
}

function refillBoard(board: Board): void {
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      if (!board[row][col]) {
        board[row][col] = createTile(randomKind());
      }
    }
  }
}

export function ensurePlayableBoard(board: Board): Board {
  let attempts = 0;
  while (!hasValidMoves(board) && attempts < MAX_GENERATION_ATTEMPTS) {
    reshuffle(board);
    attempts++;
  }
  if (!hasValidMoves(board)) {
    return createInitialBoard(board.length);
  }
  return board;
}

function reshuffle(board: Board): void {
  const tiles: Tile[] = [];
  for (const row of board) {
    for (const tile of row) {
      if (tile) {
        tiles.push(tile);
      }
    }
  }

  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = tiles[i];
    tiles[i] = tiles[j];
    tiles[j] = temp;
  }

  let index = 0;
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      board[row][col] = tiles[index++];
    }
  }
}

export function hasValidMoves(board: Board): boolean {
  const size = board.length;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const current: Position = { row, col };
      const right: Position = { row, col: col + 1 };
      const down: Position = { row: row + 1, col };

      if (inBounds(board, right) && wouldFormMatch(board, current, right)) {
        return true;
      }

      if (inBounds(board, down) && wouldFormMatch(board, current, down)) {
        return true;
      }
    }
  }
  return false;
}

function wouldFormMatch(board: Board, a: Position, b: Position): boolean {
  if (!inBounds(board, a) || !inBounds(board, b)) {
    return false;
  }
  swapTiles(board, a, b);
  const matches = findMatches(board);
  swapTiles(board, a, b);
  return matches.length > 0;
}

function swapTiles(board: Board, a: Position, b: Position): void {
  const temp = board[a.row][a.col];
  board[a.row][a.col] = board[b.row][b.col];
  board[b.row][b.col] = temp;
}

export function attemptSwap(board: Board, a: Position, b: Position): SwapResult {
  if (!inBounds(board, a) || !inBounds(board, b)) {
    return {
      valid: false,
      reason: "out-of-bounds",
      cascades: [],
      totalRemoved: 0,
      totalScore: 0
    };
  }

  if (!areAdjacent(a, b)) {
    return {
      valid: false,
      reason: "not-adjacent",
      cascades: [],
      totalRemoved: 0,
      totalScore: 0
    };
  }

  const workingBoard = cloneBoard(board);
  swapTiles(workingBoard, a, b);
  const matches = findMatches(workingBoard);
  if (matches.length === 0) {
    return {
      valid: false,
      reason: "no-match",
      cascades: [],
      totalRemoved: 0,
      totalScore: 0
    };
  }

  const cascades: CascadeDetail[] = [];
  let totalRemoved = 0;
  let totalScore = 0;
  let cascadeIndex = 1;

  let currentBoard = workingBoard;
  let currentMatches = matches;

  while (currentMatches.length > 0) {
    const removedPositions = clearMatches(currentBoard, currentMatches);
    totalRemoved += removedPositions.length;
    const scoreGain = Math.round(removedPositions.length * BASE_MATCH_SCORE * cascadeIndex);
    totalScore += scoreGain;

    cascades.push({ removed: removedPositions, scoreGain });

    collapseColumns(currentBoard);
    refillBoard(currentBoard);

    currentMatches = findMatches(currentBoard);
    cascadeIndex++;
  }

  const ensuredBoard = ensurePlayableBoard(currentBoard);
  if (ensuredBoard !== currentBoard) {
    currentBoard = ensuredBoard;
  }

  // Apply working board back to original
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      board[row][col] = currentBoard[row][col];
    }
  }

  return {
    valid: true,
    cascades,
    totalRemoved,
    totalScore
  };
}
