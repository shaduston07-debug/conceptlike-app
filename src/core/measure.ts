import type { Measure, Unit } from './types';

export const UNITS: { id: Unit; label: string }[] = [
  { id: 'px', label: 'Pixels' },
  { id: 'pt', label: 'Points' },
  { id: 'mm', label: 'Millimeters' },
  { id: 'cm', label: 'Centimeters' },
  { id: 'm', label: 'Meters' },
  { id: 'in', label: 'Inches' },
  { id: 'ft', label: 'Feet' },
];

/** Physical size of one world unit at 100% zoom (CSS px @ 96dpi), per unit. */
export const PER_PX: Record<Unit, number> = {
  px: 1,
  pt: 0.75,
  mm: 0.2645833,
  cm: 0.02645833,
  m: 0.0002645833,
  in: 1 / 96,
  ft: 1 / 1152,
};

export function formatLength(worldLen: number, m: Measure): string {
  const v = worldLen * m.perWorld;
  if (m.unit === 'ft') {
    const ft = Math.floor(v + 1e-9);
    const inch = (v - ft) * 12;
    return `${ft}′ ${inch.toFixed(m.precision)}″`;
  }
  return `${v.toFixed(m.precision)} ${m.unit}`;
}
