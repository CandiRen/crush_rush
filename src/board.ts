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

export type SpecialType = "line-row" | "line-col" | "bomb" | "block" | "color";

export interface Tile {
  id: number;
  kind: TileKind;
  special?: SpecialType;
}

export type Board = (Tile | null)[][];
export type TileLayout = TileKind[][];

export interface SpecialCreation {
  position: Position;
  special: SpecialType;
  kind: TileKind;
}

export interface CascadeDetail {
  removed: Position[];
  scoreGain: number;
  createdSpecials: SpecialCreation[];
}

export interface ResolveResult {
  cascades: CascadeDetail[];
  totalRemoved: number;
  totalScore: number;
}

export interface SwapResult extends ResolveResult {
  valid: boolean;
  reason?: "not-adjacent" | "no-match" | "out-of-bounds";
  frames: SwapFrame[];
}

export interface ManualActionResult extends ResolveResult {
  frames: SwapFrame[];
}

export type FrameType = "match" | "cascade" | "special" | "final";

export interface SwapFrame {
  board: Board;
  removed: Position[];
  cascadeIndex: number;
  scoreGain: number;
  createdSpecials: SpecialCreation[];
  type: FrameType;
}

export interface HintMove {
  primary: Position;
  secondary: Position;
  matches: Position[];
}

type MatchOrientation = "horizontal" | "vertical" | "mixed" | "square";

interface MatchGroup {
  positions: Position[];
  orientation: MatchOrientation;
}

const BASE_MATCH_SCORE = 60;
const SPECIAL_COMBO_MULTIPLIER = 1.5;
const MAX_GENERATION_ATTEMPTS = 100;

let nextTileId = 1;

const rng = () => Math.random();

function createTile(kind: TileKind, special?: SpecialType): Tile {
  return { id: nextTileId++, kind, special };
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

export function createBoardFromLayout(layout: TileLayout): Board {
  const height = layout.length;
  const width = layout[0]?.length ?? 0;
  if (height === 0 || width === 0) {
    throw new Error("Layout must have at least one row and one column");
  }

  return layout.map((row) => {
    if (row.length !== width) {
      throw new Error("All rows in the layout must have the same length");
    }
    return row.map((kind) => createTile(kind));
  });
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

function findMatches(board: Board): MatchGroup[] {
  const size = board.length;
  const rawMatches: { positions: Position[]; orientation: "horizontal" | "vertical" | "square" }[] = [];

  // Horizontal matches
  for (let row = 0; row < size; row++) {
    let run: Position[] = [];
    for (let col = 0; col < size; col++) {
      const tile = board[row][col];
      if (!tile) {
        if (run.length >= 3) {
          rawMatches.push({ positions: run, orientation: "horizontal" });
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
            rawMatches.push({ positions: run, orientation: "horizontal" });
          }
          run = [{ row, col }];
        }
      }
    }
    if (run.length >= 3) {
      rawMatches.push({ positions: run, orientation: "horizontal" });
    }
  }

  // Vertical matches
  for (let col = 0; col < size; col++) {
    let run: Position[] = [];
    for (let row = 0; row < size; row++) {
      const tile = board[row][col];
      if (!tile) {
        if (run.length >= 3) {
          rawMatches.push({ positions: run, orientation: "vertical" });
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
            rawMatches.push({ positions: run, orientation: "vertical" });
          }
          run = [{ row, col }];
        }
      }
    }
    if (run.length >= 3) {
      rawMatches.push({ positions: run, orientation: "vertical" });
    }
  }

  // Square (2x2) matches
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const topLeft = board[row][col];
      if (!topLeft) {
        continue;
      }
      const topRight = board[row][col + 1];
      const bottomLeft = board[row + 1][col];
      const bottomRight = board[row + 1][col + 1];
      if (
        topRight &&
        bottomLeft &&
        bottomRight &&
        topLeft.kind === topRight.kind &&
        topLeft.kind === bottomLeft.kind &&
        topLeft.kind === bottomRight.kind
      ) {
        rawMatches.push({
          positions: [
            { row, col },
            { row, col: col + 1 },
            { row: row + 1, col },
            { row: row + 1, col: col + 1 }
          ],
          orientation: "square"
        });
      }
    }
  }

  if (rawMatches.length === 0) {
    return [];
  }

  const groups: MatchGroup[] = [];
  const visited = new Set<number>();

  for (let i = 0; i < rawMatches.length; i++) {
    if (visited.has(i)) {
      continue;
    }

    const queue = [i];
    const positionsMap = new Map<string, Position>();
    const orientations = new Set<MatchOrientation>();

    while (queue.length > 0) {
      const index = queue.pop()!;
      if (visited.has(index)) {
        continue;
      }
      visited.add(index);

      const match = rawMatches[index];
      orientations.add(match.orientation);
      for (const pos of match.positions) {
        const key = positionKey(pos);
        if (!positionsMap.has(key)) {
          positionsMap.set(key, pos);
        }
      }

      for (let j = 0; j < rawMatches.length; j++) {
        if (visited.has(j)) {
          continue;
        }
        if (matchesOverlap(rawMatches[index].positions, rawMatches[j].positions)) {
          queue.push(j);
        }
      }
    }

    const positions = Array.from(positionsMap.values());
    let orientation: MatchOrientation = "horizontal";
    if (orientations.size > 1) {
      orientation = "mixed";
    } else {
      const first = orientations.values().next().value;
      if (first) {
        orientation = first as MatchOrientation;
      }
    }
    groups.push({ positions, orientation });
  }

  return groups;
}

function matchesOverlap(a: Position[], b: Position[]): boolean {
  const set = new Set(a.map(positionKey));
  return b.some((pos) => set.has(positionKey(pos)));
}

function positionKey(position: Position): string {
  return `${position.row},${position.col}`;
}

function collectEntireBoard(board: Board, accumulator: Map<string, Position>): void {
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      if (board[row][col]) {
        const pos = { row, col };
        accumulator.set(positionKey(pos), pos);
      }
    }
  }
}

function applyColorBombEffect(
  board: Board,
  origin: Position,
  targetKind: TileKind | null,
  accumulator: Map<string, Position>
): void {
  const originKey = positionKey(origin);
  accumulator.set(originKey, origin);

  if (!targetKind) {
    collectEntireBoard(board, accumulator);
    return;
  }

  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      const tile = board[row][col];
      if (tile && tile.kind === targetKind) {
        const pos = { row, col };
        accumulator.set(positionKey(pos), pos);
      }
    }
  }
}

function clearMatches(
  board: Board,
  matches: MatchGroup[],
  swapContext?: { primary: Position; secondary: Position }
): { removed: Position[]; createdSpecials: SpecialCreation[] } {
  const uniqueRemoval = new Map<string, Position>();
  const createdSpecials: SpecialCreation[] = [];

  const swapPriority = new Set<string>(
    swapContext ? [positionKey(swapContext.primary), positionKey(swapContext.secondary)] : []
  );

  const matchSpecialPlans: { position: Position; special: SpecialType; kind: TileKind }[] = [];

  for (const group of matches) {
    if (group.positions.length === 0) {
      continue;
    }

    for (const pos of group.positions) {
      uniqueRemoval.set(positionKey(pos), pos);
      const tile = board[pos.row][pos.col];
      if (tile?.special) {
        applySpecialEffect(board, pos, tile.special, uniqueRemoval);
      }
    }

    const specialPlan = determineSpecialCreation(board, group, swapPriority);
    if (specialPlan) {
      matchSpecialPlans.push(specialPlan);
    }
  }

  expandSpecialChain(board, uniqueRemoval);

  for (const plan of matchSpecialPlans) {
    uniqueRemoval.delete(positionKey(plan.position));
  }

  for (const pos of uniqueRemoval.values()) {
    board[pos.row][pos.col] = null;
  }

  for (const plan of matchSpecialPlans) {
    board[plan.position.row][plan.position.col] = createTile(plan.kind, plan.special);
    createdSpecials.push({ ...plan });
  }

  return {
    removed: Array.from(uniqueRemoval.values()),
    createdSpecials
  };
}

function determineSpecialCreation(
  board: Board,
  group: MatchGroup,
  swapPriority: Set<string>
): SpecialCreation | null {
  const length = group.positions.length;
  if (length < 4) {
    return null;
  }

  let special: SpecialType;
  if (group.orientation === "square") {
    special = "block";
  } else if (group.orientation === "mixed") {
    special = "bomb";
  } else if (length >= 5) {
    special = "color";
  } else if (group.orientation === "horizontal") {
    special = "line-row";
  } else {
    special = "line-col";
  }

  const placement = chooseSpecialPlacement(group.positions, swapPriority);
  if (!placement) {
    return null;
  }

  const tile = board[placement.row][placement.col];
  const fallback = board[group.positions[0].row]?.[group.positions[0].col] ?? null;
  const kind = tile?.kind ?? fallback?.kind ?? TILE_KINDS[0];

  return {
    position: placement,
    special,
    kind
  };
}

function chooseSpecialPlacement(positions: Position[], swapPriority: Set<string>): Position | null {
  if (positions.length === 0) {
    return null;
  }

  for (const pos of positions) {
    if (swapPriority.has(positionKey(pos))) {
      return pos;
    }
  }

  return positions[Math.floor(positions.length / 2)];
}

function applySpecialEffect(
  board: Board,
  origin: Position,
  special: SpecialType,
  accumulator: Map<string, Position>
): void {
  const height = board.length;
  const width = board[0]?.length ?? 0;

  if (special === "line-row") {
    for (let col = 0; col < width; col++) {
      const pos = { row: origin.row, col };
      accumulator.set(positionKey(pos), pos);
    }
    return;
  }

  if (special === "line-col") {
    for (let row = 0; row < height; row++) {
      const pos = { row, col: origin.col };
      accumulator.set(positionKey(pos), pos);
    }
    return;
  }

  if (special === "block") {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const row = origin.row + dr;
        const col = origin.col + dc;
        if (row < 0 || row >= height || col < 0 || col >= width) {
          continue;
        }
        const pos = { row, col };
        accumulator.set(positionKey(pos), pos);
      }
    }
    return;
  }

  if (special === "color") {
    const tile = board[origin.row]?.[origin.col] ?? null;
    const targetKind = tile?.kind ?? null;
    applyColorBombEffect(board, origin, targetKind, accumulator);
    return;
  }

  // bomb clears surrounding 3x3 area including self
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const row = origin.row + dr;
      const col = origin.col + dc;
      if (row < 0 || row >= height || col < 0 || col >= width) {
        continue;
      }
      const pos = { row, col };
      accumulator.set(positionKey(pos), pos);
    }
  }
}

function expandSpecialChain(board: Board, accumulator: Map<string, Position>): void {
  const processed = new Set<string>();
  const queue: Position[] = Array.from(accumulator.values());

  while (queue.length > 0) {
    const pos = queue.pop()!;
    const key = positionKey(pos);
    if (processed.has(key)) {
      continue;
    }
    processed.add(key);

    const tile = board[pos.row]?.[pos.col];
    if (!tile?.special) {
      continue;
    }

    const beforeSize = accumulator.size;
    applySpecialEffect(board, pos, tile.special, accumulator);
    if (accumulator.size > beforeSize) {
      for (const newPos of accumulator.values()) {
        const newKey = positionKey(newPos);
        if (!processed.has(newKey)) {
          queue.push(newPos);
        }
      }
    }
  }
}

interface SpecialComboResult {
  removed: Position[];
  before: Board;
  after: Board;
}

function triggerSpecialCombo(board: Board, a: Position, b: Position): SpecialComboResult | null {
  const tileA = board[a.row]?.[a.col];
  const tileB = board[b.row]?.[b.col];

  const specials: { position: Position; special: SpecialType }[] = [];
  if (tileA?.special) {
    specials.push({ position: a, special: tileA.special });
  }
  if (tileB?.special) {
    specials.push({ position: b, special: tileB.special });
  }

  if (specials.length === 0) {
    return null;
  }

  const before = cloneBoard(board);
  const accumulator = new Map<string, Position>();

  if (specials.length === 2) {
    const [first, second] = specials;
    const firstSpecial = board[first.position.row]?.[first.position.col]?.special;
    const secondSpecial = board[second.position.row]?.[second.position.col]?.special;
    const involvesColor = firstSpecial === "color" || secondSpecial === "color";

    if (involvesColor) {
      if (firstSpecial === "color" && secondSpecial === "color") {
        collectEntireBoard(board, accumulator);
      } else {
        const colorEntry = firstSpecial === "color" ? first : second;
        const otherEntry = colorEntry === first ? second : first;
        const otherTile = board[otherEntry.position.row]?.[otherEntry.position.col] ?? null;
        const targetKind = otherTile?.kind ?? null;

        applyColorBombEffect(board, colorEntry.position, targetKind, accumulator);

        if (otherTile?.special) {
          accumulator.set(positionKey(otherEntry.position), otherEntry.position);
          if (targetKind) {
            for (let row = 0; row < board.length; row++) {
              for (let col = 0; col < board[row].length; col++) {
                const tile = board[row][col];
                if (tile && tile.kind === targetKind) {
                  applySpecialEffect(board, { row, col }, otherTile.special, accumulator);
                }
              }
            }
          } else {
            applySpecialEffect(board, otherEntry.position, otherTile.special, accumulator);
          }
        }
      }
    } else if (
      (firstSpecial === "bomb" && secondSpecial === "bomb") ||
      (firstSpecial === "block" && secondSpecial === "block")
    ) {
      collectEntireBoard(board, accumulator);
    } else {
      for (const entry of specials) {
        const posKey = positionKey(entry.position);
        accumulator.set(posKey, entry.position);
        applySpecialEffect(board, entry.position, entry.special, accumulator);
      }

      const enhance: SpecialType[] = [];
      if (firstSpecial === "bomb" || secondSpecial === "bomb") {
        enhance.push("bomb");
      }
      if (firstSpecial === "block" || secondSpecial === "block") {
        enhance.push("block");
      }

      for (const entry of specials) {
        for (const type of enhance) {
          if (board[entry.position.row]?.[entry.position.col]) {
            applySpecialEffect(board, entry.position, type, accumulator);
          }
        }
      }
    }
  } else {
    const only = specials[0];
    if (only.special === "color") {
      const sameAsA = only.position.row === a.row && only.position.col === a.col;
      const otherPos = sameAsA ? b : a;
      const otherTile = board[otherPos.row]?.[otherPos.col] ?? null;
      const targetKind = otherTile?.kind ?? null;
      applyColorBombEffect(board, only.position, targetKind, accumulator);
    } else {
      const key = positionKey(only.position);
      accumulator.set(key, only.position);
      applySpecialEffect(board, only.position, only.special, accumulator);
    }
  }

  expandSpecialChain(board, accumulator);

  const removed = Array.from(accumulator.values()).filter((pos) => before[pos.row]?.[pos.col]);
  if (removed.length === 0) {
    return null;
  }

  for (const { row, col } of removed) {
    board[row][col] = null;
  }

  collapseColumns(board);
  refillBoard(board);

  const after = cloneBoard(board);

  return {
    removed,
    before,
    after
  };
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

export function findHintMove(board: Board): HintMove | null {
  const size = board.length;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const current: Position = { row, col };
      const right: Position = { row, col: col + 1 };
      const down: Position = { row: row + 1, col };

      if (inBounds(board, right)) {
        const hint = evaluateHintMove(board, current, right);
        if (hint) {
          return hint;
        }
      }

      if (inBounds(board, down)) {
        const hint = evaluateHintMove(board, current, down);
        if (hint) {
          return hint;
        }
      }
    }
  }
  return null;
}

function evaluateHintMove(board: Board, a: Position, b: Position): HintMove | null {
  const testBoard = cloneBoard(board);
  swapTiles(testBoard, a, b);
  const matches = findMatches(testBoard);
  if (matches.length === 0) {
    return null;
  }

  const involvesSwap = (positions: Position[]): boolean =>
    positions.some((pos) => (pos.row === a.row && pos.col === a.col) || (pos.row === b.row && pos.col === b.col));

  const relevantMatches = matches.filter((group) => involvesSwap(group.positions));
  const targetMatches = relevantMatches.length > 0 ? relevantMatches : matches;
  const uniquePositions = new Map<string, Position>();

  for (const group of targetMatches) {
    for (const pos of group.positions) {
      uniquePositions.set(positionKey(pos), pos);
    }
  }

  return {
    primary: a,
    secondary: b,
    matches: Array.from(uniquePositions.values())
  };
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

interface SwapExecutionOptions {
  requireMatch: boolean;
}

function executeSwap(board: Board, a: Position, b: Position, options: SwapExecutionOptions): SwapResult {
  if (!inBounds(board, a) || !inBounds(board, b)) {
    return {
      valid: false,
      reason: "out-of-bounds",
      cascades: [],
      totalRemoved: 0,
      totalScore: 0,
      frames: []
    };
  }

  if (!areAdjacent(a, b)) {
    return {
      valid: false,
      reason: "not-adjacent",
      cascades: [],
      totalRemoved: 0,
      totalScore: 0,
      frames: []
    };
  }

  const workingBoard = cloneBoard(board);
  swapTiles(workingBoard, a, b);

  const comboResult = triggerSpecialCombo(workingBoard, a, b);
  let matches = findMatches(workingBoard);

  if (!comboResult && matches.length === 0 && options.requireMatch) {
    return {
      valid: false,
      reason: "no-match",
      cascades: [],
      totalRemoved: 0,
      totalScore: 0,
      frames: []
    };
  }

  const cascades: CascadeDetail[] = [];
  const frames: SwapFrame[] = [];
  let totalRemoved = 0;
  let totalScore = 0;
  let cascadeIndex = 1;

  if (comboResult) {
    const comboRemovalCount = comboResult.removed.length;
    const comboScore = Math.round(
      comboRemovalCount * BASE_MATCH_SCORE * cascadeIndex * SPECIAL_COMBO_MULTIPLIER
    );
    totalRemoved += comboRemovalCount;
    totalScore += comboScore;

    cascades.push({
      removed: comboResult.removed,
      scoreGain: comboScore,
      createdSpecials: []
    });

    frames.push({
      board: comboResult.before,
      removed: comboResult.removed,
      cascadeIndex,
      scoreGain: comboScore,
      createdSpecials: [],
      type: "special"
    });

    frames.push({
      board: comboResult.after,
      removed: [],
      cascadeIndex,
      scoreGain: comboScore,
      createdSpecials: [],
      type: "cascade"
    });

    cascadeIndex++;
    matches = findMatches(workingBoard);
  }

  let currentBoard = workingBoard;
  let currentMatches = matches;

  while (currentMatches.length > 0) {
    const preClearBoard = cloneBoard(currentBoard);
    const cleared = clearMatches(currentBoard, currentMatches, { primary: a, secondary: b });
    const removalCount = cleared.removed.length + cleared.createdSpecials.length;
    totalRemoved += removalCount;
    const scoreGain = Math.round(removalCount * BASE_MATCH_SCORE * cascadeIndex);
    totalScore += scoreGain;

    cascades.push({
      removed: cleared.removed,
      scoreGain,
      createdSpecials: cleared.createdSpecials
    });

    frames.push({
      board: preClearBoard,
      removed: cleared.removed,
      cascadeIndex,
      scoreGain,
      createdSpecials: cleared.createdSpecials,
      type: "match"
    });

    collapseColumns(currentBoard);
    refillBoard(currentBoard);

    frames.push({
      board: cloneBoard(currentBoard),
      removed: [],
      cascadeIndex,
      scoreGain,
      createdSpecials: [],
      type: "cascade"
    });

    currentMatches = findMatches(currentBoard);
    cascadeIndex++;
  }

  if (totalRemoved > 0) {
    const ensuredBoard = ensurePlayableBoard(currentBoard);
    if (ensuredBoard !== currentBoard) {
      currentBoard = ensuredBoard;
    }
  }

  // Apply working board back to original
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      board[row][col] = currentBoard[row][col];
    }
  }

  frames.push({
    board: cloneBoard(board),
    removed: [],
    cascadeIndex: Math.max(1, cascadeIndex - 1),
    scoreGain: 0,
    createdSpecials: [],
    type: "final"
  });

  const producedClear = totalRemoved > 0;
  return {
    valid: options.requireMatch ? producedClear : true,
    reason: producedClear ? undefined : "no-match",
    cascades,
    totalRemoved,
    totalScore,
    frames
  };
}

export function attemptSwap(board: Board, a: Position, b: Position): SwapResult {
  return executeSwap(board, a, b, { requireMatch: true });
}

export function forceSwap(board: Board, a: Position, b: Position): SwapResult {
  return executeSwap(board, a, b, { requireMatch: false });
}

export function hammerTile(board: Board, position: Position): ManualActionResult | null {
  if (!inBounds(board, position)) {
    return null;
  }

  const existing = board[position.row]?.[position.col];
  if (!existing) {
    return null;
  }

  let workingBoard = cloneBoard(board);
  const targetTile = workingBoard[position.row]?.[position.col];
  if (!targetTile) {
    return null;
  }

  const accumulator = new Map<string, Position>();
  const origin = { row: position.row, col: position.col };
  accumulator.set(positionKey(origin), origin);

  if (targetTile.special) {
    applySpecialEffect(workingBoard, origin, targetTile.special, accumulator);
    expandSpecialChain(workingBoard, accumulator);
  }

  const removalTargets = Array.from(accumulator.values()).filter((pos) => {
    const tile = workingBoard[pos.row]?.[pos.col];
    return !!tile;
  });

  if (removalTargets.length === 0) {
    return null;
  }

  const beforeBoard = cloneBoard(workingBoard);

  for (const { row, col } of removalTargets) {
    workingBoard[row][col] = null;
  }

  const cascades: CascadeDetail[] = [];
  const frames: SwapFrame[] = [];
  let totalRemoved = removalTargets.length;
  let totalScore = 0;
  let cascadeIndex = 1;

  const initialScore = Math.round(removalTargets.length * BASE_MATCH_SCORE * cascadeIndex);
  totalScore += initialScore;

  cascades.push({
    removed: removalTargets,
    scoreGain: initialScore,
    createdSpecials: []
  });

  frames.push({
    board: beforeBoard,
    removed: removalTargets,
    cascadeIndex,
    scoreGain: initialScore,
    createdSpecials: [],
    type: "special"
  });

  collapseColumns(workingBoard);
  refillBoard(workingBoard);

  frames.push({
    board: cloneBoard(workingBoard),
    removed: [],
    cascadeIndex,
    scoreGain: initialScore,
    createdSpecials: [],
    type: "cascade"
  });

  let currentBoard = workingBoard;
  let currentMatches = findMatches(currentBoard);
  cascadeIndex++;

  while (currentMatches.length > 0) {
    const preClearBoard = cloneBoard(currentBoard);
    const cleared = clearMatches(currentBoard, currentMatches);
    const removalCount = cleared.removed.length + cleared.createdSpecials.length;
    totalRemoved += removalCount;
    const scoreGain = Math.round(removalCount * BASE_MATCH_SCORE * cascadeIndex);
    totalScore += scoreGain;

    cascades.push({
      removed: cleared.removed,
      scoreGain,
      createdSpecials: cleared.createdSpecials
    });

    frames.push({
      board: preClearBoard,
      removed: cleared.removed,
      cascadeIndex,
      scoreGain,
      createdSpecials: cleared.createdSpecials,
      type: "match"
    });

    collapseColumns(currentBoard);
    refillBoard(currentBoard);

    frames.push({
      board: cloneBoard(currentBoard),
      removed: [],
      cascadeIndex,
      scoreGain,
      createdSpecials: [],
      type: "cascade"
    });

    currentMatches = findMatches(currentBoard);
    cascadeIndex++;
  }

  if (totalRemoved > 0) {
    const ensuredBoard = ensurePlayableBoard(currentBoard);
    if (ensuredBoard !== currentBoard) {
      currentBoard = ensuredBoard;
    }
  }

  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      board[row][col] = currentBoard[row][col];
    }
  }

  frames.push({
    board: cloneBoard(board),
    removed: [],
    cascadeIndex: Math.max(1, cascadeIndex - 1),
    scoreGain: 0,
    createdSpecials: [],
    type: "final"
  });

  return {
    cascades,
    totalRemoved,
    totalScore,
    frames
  };
}
