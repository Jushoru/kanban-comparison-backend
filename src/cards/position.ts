import { BadRequestException } from '@nestjs/common';

export interface CardLocation { listId: string; position: number }
export interface PositionShift { listId: string; from: number; to: number; delta: number }
const MAX_POSITION = 2147483647;

export function insertionPosition(requested: number | undefined, maximum: number): number {
  const position = requested ?? maximum;
  if (!Number.isInteger(position) || position < 0 || position > maximum || position > MAX_POSITION) {
    throw new BadRequestException(`position must be between 0 and ${maximum}`);
  }
  return position;
}

// The moving card is excluded from all shifts and written to its destination last.
export function positionShifts(source: CardLocation | null, target: CardLocation | null): PositionShift[] {
  if (source && target && source.listId === target.listId) {
    if (source.position === target.position) return [];
    return [{
      listId: source.listId,
      from: Math.min(source.position, target.position),
      to: Math.max(source.position, target.position),
      delta: target.position < source.position ? 1 : -1,
    }];
  }
  const shifts: PositionShift[] = [];
  if (source) shifts.push({ listId: source.listId, from: source.position + 1, to: MAX_POSITION, delta: -1 });
  if (target) shifts.push({ listId: target.listId, from: target.position, to: MAX_POSITION, delta: 1 });
  return shifts;
}
