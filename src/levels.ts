import { TileKind } from "./board";

export interface LevelDefinition {
  id: number;
  name: string;
  description?: string;
  targetScore: number;
  moves: number;
  boardSize?: number;
  layout?: TileKind[][];
}

export const LEVELS: LevelDefinition[] = [
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
    description: "Cascade lebih panjang mulai muncul.",
    targetScore: 8200,
    moves: 30,
    boardSize: 8
  },
  {
    id: 3,
    name: "Ronde Pemanasan",
    description: "Perlu rencana untuk mencapai skor tinggi.",
    targetScore: 12000,
    moves: 28
  }
];
