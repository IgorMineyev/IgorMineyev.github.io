export type Theme = 'dark' | 'light';

export interface SpiroConfig {
  outerRadius: number; // R
  innerRadius: number; // r
  penOffset: number;   // d
  penColor: string;
  speed: number;
  opacity: number;
  lineWidth: number;
  showGears: boolean;
  reverse: boolean;
  statorAspect: number; // Y scale for outer gear
  rotorAspect: number;  // Y scale for inner gear
  initialAngle?: number; // starting angle of the stator parameter (radians, -π to π)
  numerator?: number;
  denominator?: number;
}