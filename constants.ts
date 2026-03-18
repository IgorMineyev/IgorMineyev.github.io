import { SpiroConfig } from './types';

// A higher contrast 40x40 pixel technical grid (graph paper) for better visibility
export const BACKGROUND_TEXTURE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='rgba(128,128,128,0.5)' stroke-width='1'/%3E%3C/svg%3E";

export const DEFAULT_CONFIG: SpiroConfig = {
  outerRadius: 150,
  innerRadius: 52,
  penOffset: 70,
  penColor: '#22c55e', // green-500
  speed: 1,
  opacity: 1,
  lineWidth: 1.5,
  showGears: true,
  reverse: true,
  statorAspect: 1.0,
  rotorAspect: 1.0,
  initialAngle: 0,
  numerator: 2,
  denominator: 3,
};

// ── Level configuration ────────────────────────────────────────────────────
// Each entry defines which features are active for that level.
// To add a new level, add one entry here — no other file needs changing
// except to wire up any brand-new feature flags you introduce.
export interface LevelConfig {
  showStatorAngle: boolean;   // whether the stator angle slider is shown
  randomisesAngle: boolean;   // whether the random button picks a random stator angle
}

export const LEVEL_CONFIG: Record<number, LevelConfig> = {
  1: { showStatorAngle: false, randomisesAngle: false },
  2: { showStatorAngle: true,  randomisesAngle: true  },
};

export const DEFAULT_LEVEL = 1;

export const PRESET_COLORS = [
  // Row 1: Warm & Earthy & Greens
  '#dc2626', // Red
  '#ea580c', // Orange
  '#eab308', // Yellow
  '#84cc16', // Lime
  '#65a30d', // Olive
  '#16a34a', // Green
  '#2e7d32', // Dark Green

  // Row 2: Cool Greens, Blues & Purples
  '#10b981', // Emerald
  '#0d9488', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#a855f7', // Purple
  '#8b5cf6', // Violet

  // Row 3: Pinks, Neutrals
  '#d946ef', // Fuchsia
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#78350f', // Brown
  '#000000', // Black
  '#6b7280', // Gray
  '#ffffff', // White
];

export const COLOR_NAMES: Record<string, string> = {
  '#dc2626': 'Red',
  '#ea580c': 'Orange',
  '#eab308': 'Yellow',
  '#84cc16': 'Lime',
  '#65a30d': 'Olive',
  '#16a34a': 'Green',
  '#2e7d32': 'Dark Green',
  '#10b981': 'Emerald',
  '#0d9488': 'Teal',
  '#06b6d4': 'Cyan',
  '#3b82f6': 'Blue',
  '#6366f1': 'Indigo',
  '#a855f7': 'Purple',
  '#8b5cf6': 'Violet',
  '#d946ef': 'Fuchsia',
  '#ec4899': 'Pink',
  '#f43f5e': 'Rose',
  '#78350f': 'Brown',
  '#000000': 'Black',
  '#6b7280': 'Gray',
  '#ffffff': 'White',
};