import { BOARD_SIZE, attemptSwap, createBoardFromLayout, createInitialBoard, ensurePlayableBoard, forceSwap, hammerTile } from "./board";
const DEFAULT_BOOSTERS = {
    hammer: 3,
    "free-switch": 3
};
function normalizeBoosterCount(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return fallback;
    }
    return Math.floor(numeric);
}
function normalizeBoosterInventory(source) {
    return {
        hammer: normalizeBoosterCount(source?.hammer, DEFAULT_BOOSTERS.hammer),
        "free-switch": normalizeBoosterCount(source?.["free-switch"], DEFAULT_BOOSTERS["free-switch"])
    };
}
const DEFAULT_CONFIG = {
    size: BOARD_SIZE,
    moves: 32,
    targetScore: 6500
};
export class Game {
    constructor(level, config) {
        this.status = "loading";
        this.score = 0;
        this.movesLeft = 0;
        this.jellyGrid = [];
        this.initialJellyCount = 0;
        this.crateGrid = [];
        this.initialCrateCount = 0;
        this.highestCombo = 0;
        this.boosters = { ...DEFAULT_BOOSTERS };
        this.level = level;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.boardState = createInitialBoard(this.config.size);
        this.applyLevel(level);
    }
    reset() {
        this.applyLevel(this.level);
    }
    getBoard() {
        return this.boardState;
    }
    getScore() {
        return this.score;
    }
    getMovesLeft() {
        return this.movesLeft;
    }
    getTargetScore() {
        return this.config.targetScore;
    }
    getHighestCombo() {
        return this.highestCombo;
    }
    getMovesUsed() {
        return Math.max(0, this.config.moves - this.movesLeft);
    }
    getScorePerMove() {
        const movesUsed = this.getMovesUsed();
        if (movesUsed === 0) {
            return 0;
        }
        return this.score / movesUsed;
    }
    getJellyRemaining() {
        return this.jellyGrid.reduce((sum, row) => sum + row.reduce((acc, value) => acc + value, 0), 0);
    }
    hasJellyTarget() {
        return this.initialJellyCount > 0;
    }
    getJellyGrid() {
        return this.jellyGrid.map((row) => [...row]);
    }
    getCrateRemaining() {
        return this.crateGrid.reduce((sum, row) => sum + row.reduce((acc, value) => acc + value, 0), 0);
    }
    hasCrateTarget() {
        return this.initialCrateCount > 0;
    }
    getCrateGrid() {
        return this.crateGrid.map((row) => [...row]);
    }
    getBoosters() {
        return {
            hammer: this.boosters.hammer,
            "free-switch": this.boosters["free-switch"]
        };
    }
    canUseBooster(type) {
        return this.status === "playing" && this.hasBoosterCharges(type);
    }
    getLevel() {
        return this.level;
    }
    getStarCount() {
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
    setLevel(level) {
        this.level = level;
        this.applyLevel(level);
    }
    getStatus() {
        if (this.status !== "playing") {
            return this.status;
        }
        const scoreRequirementMet = this.config.targetScore <= 0 || this.score >= this.config.targetScore;
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
    trySwap(a, b) {
        if (this.status !== "playing") {
            return this.buildFailureFeedback("not-playing");
        }
        const swapResult = attemptSwap(this.boardState, a, b);
        if (!swapResult.valid) {
            return this.buildFailureFeedback(swapResult.reason ?? "no-match");
        }
        this.score += swapResult.totalScore;
        this.movesLeft = Math.max(0, this.movesLeft - 1);
        this.highestCombo = Math.max(this.highestCombo, swapResult.cascades.length);
        return this.buildSuccessFeedback(swapResult.cascades, swapResult.frames, swapResult.totalScore);
    }
    useHammer(position) {
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
        return this.buildSuccessFeedback(hammerResult.cascades, hammerResult.frames, hammerResult.totalScore);
    }
    useFreeSwitch(a, b) {
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
        return this.buildSuccessFeedback(swapResult.cascades, swapResult.frames, swapResult.totalScore, swapResult.reason);
    }
    applyLevel(level) {
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
    buildFailureFeedback(reason) {
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
    buildSuccessFeedback(cascades, frames, scoreGain, reason) {
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
    hasBoosterCharges(type) {
        return (this.boosters[type] ?? 0) > 0;
    }
    spendBooster(type) {
        if (this.boosters[type] > 0) {
            this.boosters[type] -= 1;
        }
    }
    isPositionInBounds(position) {
        const size = this.boardState.length;
        return (position.row >= 0 &&
            position.col >= 0 &&
            position.row < size &&
            position.col < size);
    }
    positionsAreAdjacent(a, b) {
        const rowDiff = Math.abs(a.row - b.row);
        const colDiff = Math.abs(a.col - b.col);
        return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
    }
    boardFromLayout(layout) {
        const board = createBoardFromLayout(layout);
        if (board.length !== board[0]?.length) {
            // enforce square board for now
            throw new Error("Layouts harus berbentuk kotak untuk saat ini");
        }
        return board;
    }
    cloneJellyLayout(size, layout) {
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
    createEmptyGrid(size) {
        return Array.from({ length: size }, () => Array(size).fill(0));
    }
    cloneCrateLayout(size, layout) {
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
    applyJellyFromCascades(cascades) {
        if (!this.hasJellyTarget() || cascades.length === 0) {
            return { cleared: 0, positions: [] };
        }
        const counts = new Map();
        for (const cascade of cascades) {
            for (const pos of cascade.removed) {
                const key = this.positionKey(pos);
                const existing = counts.get(key);
                if (existing) {
                    existing.count += 1;
                }
                else {
                    counts.set(key, { position: { ...pos }, count: 1 });
                }
            }
        }
        let cleared = 0;
        const clearedPositions = [];
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
    applyCrateFromCascades(cascades) {
        if (!this.hasCrateTarget() || cascades.length === 0) {
            return { cleared: 0, positions: [] };
        }
        const counts = new Map();
        for (const cascade of cascades) {
            for (const pos of cascade.removed) {
                const key = this.positionKey(pos);
                const existing = counts.get(key);
                if (existing) {
                    existing.count += 1;
                }
                else {
                    counts.set(key, { position: { ...pos }, count: 1 });
                }
            }
        }
        let cleared = 0;
        const clearedPositions = [];
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
    positionKey(position) {
        return `${position.row},${position.col}`;
    }
}
