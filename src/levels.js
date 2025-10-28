const BASE_LEVELS = [
    {
        id: 1,
        name: "Pelatihan Manis",
        description: "Cocokkan permen dan raih target pertama Anda.",
        targetScore: 6500,
        moves: 32
    },
    {
        id: 2,
        name: "Pola Bergantian",
        description: "Cascade lebih panjang mulai muncul. Bersihkan jelly!",
        targetScore: 8200,
        moves: 30,
        boardSize: 8,
        jellyLayout: [
            [1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1]
        ]
    },
    {
        id: 3,
        name: "Ronde Pemanasan",
        description: "Perlu rencana untuk mencapai skor tinggi sambil memecah peti.",
        targetScore: 12000,
        moves: 28,
        crateLayout: [
            [0, 0, 0, 1, 1, 0, 0, 0, 0],
            [0, 0, 1, 1, 1, 1, 0, 0, 0],
            [0, 1, 1, 1, 1, 1, 1, 0, 0],
            [1, 1, 1, 2, 2, 1, 1, 1, 0],
            [1, 1, 1, 2, 3, 2, 1, 1, 1],
            [1, 1, 1, 2, 2, 1, 1, 1, 0],
            [0, 1, 1, 1, 1, 1, 1, 0, 0],
            [0, 0, 1, 1, 1, 1, 0, 0, 0],
            [0, 0, 0, 1, 1, 0, 0, 0, 0]
        ]
    }
];
const TOTAL_LEVEL_COUNT = 100;
const DEFAULT_BOARD_SIZE = 9;
const LEVEL_NAME_THEMES = [
    "Festival Permen",
    "Gelombang Lollipop",
    "Safari Jelly",
    "Resonansi Karamel",
    "Badai Gula",
    "Lintasan Marshmallow",
    "Koridor Nougat",
    "Labirin Praline",
    "Oasis Gummy",
    "Spiral Sirup",
    "Galaksi Licorice",
    "Ekspedisi Toffee"
];
const DIFFICULTY_NOTES = [
    "Ritme pemanasan—cocok untuk membangun rasa percaya.",
    "Papan mulai menuntut fokus ekstra.",
    "Strategi menengah: kelola ruang dan langkah secara seimbang.",
    "Kesempatan spesial makin berharga, jangan sia-siakan.",
    "Tekanan tinggi: utamakan gerakan dengan imbalan terbaik.",
    "Tantangan ahli: kombinasikan booster dan spesial.",
    "Tempo cepat wajib dijaga, jangan biarkan papan buntu.",
    "Satu kesalahan bisa mahal. Baca pola sebelum bergerak.",
    "Mode veteran: gunakan setiap tile spesial seefektif mungkin.",
    "Badai terakhir! Hanya eksekusi sempurna yang akan menang."
];
const PATTERN_BUILDERS = [
    (context) => ({
        description: buildDescription("score", context)
    }),
    (context) => {
        const size = context.baseSize;
        const thickness = context.id >= 60 ? 2 : 1;
        return {
            description: buildDescription("jelly-ring", context),
            jellyLayout: createRingLayout(size, thickness, jellyStrength(context))
        };
    },
    (context) => {
        const size = context.baseSize;
        const halfWidth = context.id >= 50 ? 1 : 0;
        return {
            description: buildDescription("jelly-cross", context),
            jellyLayout: createCrossLayout(size, halfWidth, jellyStrength(context))
        };
    },
    (context) => {
        const shouldExpand = context.difficultyTier >= 6;
        const size = shouldExpand ? context.baseSize + 1 : context.baseSize;
        const radius = Math.min(4, 2 + context.intensity + Math.floor(context.difficultyTier / 3));
        return {
            boardSize: shouldExpand ? size : undefined,
            description: buildDescription("jelly-diamond", context),
            jellyLayout: createDiamondLayout(size, radius, jellyStrength(context))
        };
    },
    (context) => {
        const size = context.baseSize;
        const thickness = context.id >= 70 ? 2 : 1;
        return {
            description: buildDescription("crate-ring", context),
            crateLayout: createRingLayout(size, thickness, crateStrength(context))
        };
    },
    (context) => {
        const size = context.baseSize;
        const halfWidth = context.id >= 55 ? 1 : 0;
        return {
            description: buildDescription("crate-cross", context),
            crateLayout: createCrossLayout(size, halfWidth, crateStrength(context))
        };
    },
    (context) => {
        const shouldReduce = context.id >= 34;
        const size = shouldReduce ? context.baseSize - 1 : context.baseSize;
        const radius = Math.min(4, 3 + context.intensity);
        const thickness = context.id >= 80 ? 2 : 1;
        return {
            boardSize: shouldReduce ? size : undefined,
            description: buildDescription("mixed-jelly-crate", context),
            jellyLayout: createRingLayout(size, thickness, jellyStrength(context)),
            crateLayout: createDiamondLayout(size, radius, crateStrength(context))
        };
    },
    (context) => {
        const size = context.baseSize;
        const halfWidth = size <= 8 ? 1 : 0;
        const corners = createCornerLayout(size, 1 + context.intensity, Math.max(0, crateStrength(context) - 1));
        const outer = createRingLayout(size, 1, crateStrength(context));
        return {
            description: buildDescription("mixed-crate-jelly", context),
            jellyLayout: createCrossLayout(size, halfWidth, jellyStrength(context)),
            crateLayout: mergeLayouts(size, outer, corners)
        };
    }
];
export const LEVELS = [
    ...BASE_LEVELS,
    ...createGeneratedLevels()
];
if (LEVELS.length !== TOTAL_LEVEL_COUNT) {
    throw new Error(`Konfigurasi level tidak lengkap: ${LEVELS.length} dari ${TOTAL_LEVEL_COUNT}`);
}
function createGeneratedLevels() {
    const levels = [];
    for (let id = BASE_LEVELS.length + 1; id <= TOTAL_LEVEL_COUNT; id++) {
        const difficultyTier = Math.floor((id - 1) / 10);
        const intensity = Math.floor((id - 1) / 25);
        const patternIndex = (id - BASE_LEVELS.length - 1) % PATTERN_BUILDERS.length;
        const pattern = PATTERN_BUILDERS[patternIndex];
        const context = {
            id,
            baseSize: DEFAULT_BOARD_SIZE,
            difficultyTier,
            intensity
        };
        const patternResult = pattern(context);
        const level = {
            id,
            name: buildLevelName(id),
            description: patternResult.description,
            targetScore: computeTargetScore(id, difficultyTier, intensity),
            moves: computeMoves(id, intensity)
        };
        if (patternResult.boardSize && patternResult.boardSize !== DEFAULT_BOARD_SIZE) {
            level.boardSize = patternResult.boardSize;
        }
        if (patternResult.jellyLayout) {
            level.jellyLayout = patternResult.jellyLayout;
        }
        if (patternResult.crateLayout) {
            level.crateLayout = patternResult.crateLayout;
        }
        levels.push(level);
    }
    return levels;
}
function buildLevelName(id) {
    const themeIndex = (id - BASE_LEVELS.length - 1) % LEVEL_NAME_THEMES.length;
    const suffix = id.toString().padStart(2, "0");
    return `${LEVEL_NAME_THEMES[themeIndex]} ${suffix}`;
}
function buildDescription(focus, context) {
    const note = DIFFICULTY_NOTES[Math.min(DIFFICULTY_NOTES.length - 1, context.difficultyTier)];
    switch (focus) {
        case "score":
            return `Kejar skor murni dengan memanfaatkan combo panjang. ${note}`;
        case "jelly-ring":
            return `Bersihkan jelly yang mengunci tepi papan sebelum langkah habis. ${note}`;
        case "jelly-cross":
            return `Jelly membentuk salib di tengah—buat spesial garis untuk membersihkannya cepat. ${note}`;
        case "jelly-diamond":
            return `Jelly bertumpuk di pusat papan. Fokuskan ledakan area di sana. ${note}`;
        case "crate-ring":
            return `Peti mengelilingi papan. Hancurkan lapisan luar lalu kejar skor. ${note}`;
        case "crate-cross":
            return `Peti tebal menahan jalur utama. Pecahkan dengan spesial dan combo. ${note}`;
        case "mixed-jelly-crate":
            return `Gabungan jelly dan peti menunggu di pusat. Seimbangkan skor dan pembersihan. ${note}`;
        case "mixed-crate-jelly":
            return `Jelly licin menempel di jalur silang sementara peti menjaga sudut. Rencanakan gerakan area. ${note}`;
    }
}
function computeTargetScore(id, difficultyTier, intensity) {
    const baseScore = 6500;
    const slope = 1400 + intensity * 150;
    const tierBonus = difficultyTier * 2200 + intensity * 900;
    return baseScore + (id - 1) * slope + tierBonus;
}
function computeMoves(id, intensity) {
    const reduction = Math.floor((id - 1) / 6) + intensity;
    return Math.max(18, 32 - reduction);
}
function jellyStrength(context) {
    return Math.min(3, 1 + Math.floor(context.difficultyTier / 3));
}
function crateStrength(context) {
    return Math.min(3, 1 + Math.floor(context.difficultyTier / 2));
}
function createEmptyLayout(size) {
    return Array.from({ length: size }, () => Array(size).fill(0));
}
function createRingLayout(size, thickness, value) {
    const limitedThickness = Math.max(1, Math.min(thickness, Math.floor(size / 2)));
    const grid = createEmptyLayout(size);
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const onEdge = row < limitedThickness ||
                col < limitedThickness ||
                row >= size - limitedThickness ||
                col >= size - limitedThickness;
            if (onEdge) {
                grid[row][col] = value;
            }
        }
    }
    return grid;
}
function createCrossLayout(size, halfWidth, value) {
    const limitedHalfWidth = Math.max(0, Math.min(halfWidth, Math.floor(size / 2)));
    const grid = createEmptyLayout(size);
    const midLower = Math.floor((size - 1) / 2);
    const midUpper = size % 2 === 0 ? midLower + 1 : midLower;
    for (let row = 0; row < size; row++) {
        for (let col = midLower - limitedHalfWidth; col <= midUpper + limitedHalfWidth; col++) {
            if (col >= 0 && col < size) {
                grid[row][col] = Math.max(grid[row][col], value);
            }
        }
    }
    for (let col = 0; col < size; col++) {
        for (let row = midLower - limitedHalfWidth; row <= midUpper + limitedHalfWidth; row++) {
            if (row >= 0 && row < size) {
                grid[row][col] = Math.max(grid[row][col], value);
            }
        }
    }
    return grid;
}
function createDiamondLayout(size, radius, value) {
    const grid = createEmptyLayout(size);
    const limit = Math.max(0, Math.min(radius, size));
    const center = (size - 1) / 2;
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const distance = Math.abs(row - center) + Math.abs(col - center);
            if (distance <= limit) {
                grid[row][col] = value;
            }
        }
    }
    return grid;
}
function createCornerLayout(size, span, value) {
    const grid = createEmptyLayout(size);
    const limitedSpan = Math.max(1, Math.min(span, Math.floor(size / 2)));
    for (let row = 0; row < limitedSpan; row++) {
        for (let col = 0; col < limitedSpan; col++) {
            grid[row][col] = value;
            grid[row][size - 1 - col] = value;
            grid[size - 1 - row][col] = value;
            grid[size - 1 - row][size - 1 - col] = value;
        }
    }
    return grid;
}
function mergeLayouts(size, ...layouts) {
    const base = createEmptyLayout(size);
    for (const layout of layouts) {
        if (!layout) {
            continue;
        }
        if (layout.length !== size) {
            throw new Error("Layout harus memiliki tinggi yang sama dengan ukuran papan");
        }
        for (let row = 0; row < size; row++) {
            const rowData = layout[row];
            if (!rowData || rowData.length !== size) {
                throw new Error("Layout harus berbentuk persegi sesuai ukuran papan");
            }
            for (let col = 0; col < size; col++) {
                const value = Number(rowData[col] ?? 0);
                if (value > 0) {
                    base[row][col] = Math.max(base[row][col], Math.floor(value));
                }
            }
        }
    }
    return base;
}
