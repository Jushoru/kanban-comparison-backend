import { CardLocation, insertionPosition, positionShifts } from '../src/cards/position';

type Item = CardLocation & { id: string };
const list = (count: number, listId = 'a'): Item[] => Array.from({ length: count }, (_, position) => ({ id: `${listId}${position}`, listId, position }));

function apply(items: Item[], id: string, source: CardLocation | null, target: CardLocation | null): Item[] {
  let result = items.filter((card) => card.id !== id).map((card) => ({ ...card }));
  for (const shift of positionShifts(source, target)) {
    result = result.map((card) => card.listId === shift.listId && card.position >= shift.from && card.position <= shift.to
      ? { ...card, position: card.position + shift.delta } : card);
  }
  if (target) result.push({ id, ...target });
  return result;
}

function ids(items: Item[], listId = 'a'): string[] {
  const cards = items.filter((card) => card.listId === listId).sort((a, b) => a.position - b.position);
  expect(cards.map((card) => card.position)).toEqual(cards.map((_, index) => index));
  return cards.map((card) => card.id);
}

describe('card ordering invariants', () => {
  it('preserves all other relative positions for every move in lists of 1..20 cards', () => {
    for (let count = 1; count <= 20; count++) {
      for (let from = 0; from < count; from++) {
        for (let to = 0; to < count; to++) {
          const initial = list(count);
          const moving = initial[from]!;
          const expected = initial.map((card) => card.id);
          expected.splice(from, 1);
          expected.splice(to, 0, moving.id);
          expect(ids(apply(initial, moving.id, moving, { listId: 'a', position: to }))).toEqual(expected);
        }
      }
    }
  });

  it('inserts/deletes at every boundary, including an empty list', () => {
    for (let count = 0; count <= 20; count++) {
      for (let index = 0; index <= count; index++) {
        const initial = list(count);
        const target = { listId: 'a', position: index };
        const inserted = apply(initial, 'new', null, target);
        const expected = initial.map((card) => card.id);
        expected.splice(index, 0, 'new');
        expect(ids(inserted)).toEqual(expected);
        expect(ids(apply(inserted, 'new', target, null))).toEqual(initial.map((card) => card.id));
      }
    }
  });

  it('moves between lists while compacting the source and opening a destination slot', () => {
    for (let count = 1; count <= 10; count++) {
      for (let from = 0; from < count; from++) {
        for (let to = 0; to <= count; to++) {
          const a = list(count), b = list(count, 'b'), moving = a[from]!;
          const actual = apply([...a, ...b], moving.id, moving, { listId: 'b', position: to });
          const expectedB = b.map((card) => card.id);
          expectedB.splice(to, 0, moving.id);
          expect(ids(actual)).toEqual(a.filter((card) => card.id !== moving.id).map((card) => card.id));
          expect(ids(actual, 'b')).toEqual(expectedB);
        }
      }
    }
  });

  it('appends by default and rejects positions outside the final list bounds', () => {
    expect(insertionPosition(undefined, 5)).toBe(5);
    expect(insertionPosition(0, 0)).toBe(0);
    for (const invalid of [-1, 6, 0.5, NaN, Infinity]) expect(() => insertionPosition(invalid, 5)).toThrow();
  });
});
