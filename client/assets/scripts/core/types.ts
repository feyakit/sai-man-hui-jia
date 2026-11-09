export type Cell = readonly [number, number];
export type ShapeId = 'I2' | 'I3' | 'L3' | 'I4' | 'O4' | 'L4' | 'J4' | 'T4' | 'S4' | 'Z4' | 'P5' | 'L5' | 'T5' | 'U5' | 'V5' | 'Z5' | 'N5' | 'Y5' | 'R6';
export type Rotation = 0 | 1 | 2 | 3;
export interface PieceDef { id: number; shape: ShapeId; item: string; initialRotation: Rotation }
export interface Placement { pieceId: number; rotation: Rotation; x: number; y: number }
export interface Level { date: string; stage: 1 | 2; vehicle: string; width: number; height: number; blocked: Cell[]; timeLimitSec: number; pieces: PieceDef[] }
export interface LevelSolution { date: string; stage: 1 | 2; placements: Placement[] }
export interface DifficultyStats { solutionCount: number; solutionCountCapped: boolean; nodesToFirst: number; totalNodes: number }
export interface VehicleTemplate {
  id: string;
  name: string;
  width: number;
  height: number;
  blocked: Cell[];
  preferredInventories?: readonly (readonly ShapeId[])[];
}
