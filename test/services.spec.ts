import { Pool } from 'pg';
import { BoardsService } from '../src/boards/boards.service';
import { CardsService } from '../src/cards/cards.service';
import { DatabaseService } from '../src/database/database.service';

const current = {
  id: 'card', listId: 'todo', title: 'Original', description: 'Original description',
  assigneeId: 'user-alex', completed: true, position: 1, createdAt: new Date(), tags: [],
};

function fixture() {
  const query = jest.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes('FROM cards c JOIN lists')) return { rows: [{ boardId: 'board' }], rowCount: 1 };
    if (sql.includes('FROM boards') && sql.includes('FOR UPDATE')) return { rows: [{ id: 'board' }], rowCount: 1 };
    if (sql.includes('FROM lists WHERE id')) return { rows: [{ boardId: 'board' }], rowCount: 1 };
    if (sql.includes('count(*)')) return { rows: [{ count: 3 }], rowCount: 1 };
    if (sql.includes('WHERE c.id = $1')) return { rows: [{ ...current }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const pool = { connect: async () => ({ query, release: jest.fn() }) } as unknown as Pool;
  const db = new DatabaseService(pool);
  return { query, db, cards: new CardsService(db), boards: new BoardsService(db) };
}

describe('transactional business operations', () => {
  it('rolls back board creation if any default list fails', async () => {
    const f = fixture();
    f.query.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.startsWith('INSERT INTO lists') && values?.[2] === 'QA') throw new Error('write failed');
      return { rows: [], rowCount: 1 };
    });
    await expect(f.boards.create({ title: 'New board' })).rejects.toThrow('write failed');
    const insertedLists = f.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO lists'));
    expect(insertedLists.map(([, values]) => [values?.[2], values?.[3]])).toEqual([['Todo', 0], ['In Progress', 1], ['QA', 2]]);
    expect(f.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
    expect(f.query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('locks the board before reading the current card and keeps nullable/false patch values', async () => {
    const f = fixture();
    await f.cards.update('card', { description: null, assigneeId: null, completed: false, tagIds: [] });
    const calls = f.query.mock.calls;
    const lock = calls.findIndex(([sql]) => sql.includes('FOR UPDATE'));
    const read = calls.findIndex(([sql]) => sql.includes('SELECT c.id, c.list_id'));
    expect(lock).toBeGreaterThan(0);
    expect(read).toBeGreaterThan(lock);
    const write = calls.find(([sql]) => sql.includes('UPDATE cards SET list_id'));
    expect(write?.[1]).toEqual(['card', 'todo', 'Original', null, null, 1, false]);
    expect(f.query).toHaveBeenCalledWith('DELETE FROM card_tags WHERE card_id = $1', ['card']);
    expect(calls.at(-1)).toEqual(['COMMIT']);
  });

  it('rejects an empty patch without opening a transaction', () => {
    const f = fixture();
    expect(() => f.cards.update('card', {})).toThrow('at least one field');
    expect(f.query).not.toHaveBeenCalled();
  });

  it('rejects missing references and out-of-range positions before writing anything', async () => {
    const f = fixture();
    await expect(f.cards.create({ listId: 'todo', title: 'New', tagIds: ['missing'] })).rejects.toThrow('tags not found');
    expect(f.query.mock.calls.some(([sql]) => sql.includes('UPDATE cards') || sql.includes('INSERT INTO cards'))).toBe(false);
    await expect(f.cards.update('card', { position: 3 })).rejects.toThrow('between 0 and 2');
    expect(f.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
  });

  it('binds untrusted text as a parameter, never as part of SQL', async () => {
    const f = fixture();
    const title = "Robert'); DROP TABLE cards; --";
    await f.cards.create({ listId: 'todo', title });
    const insert = f.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO cards ('));
    expect(insert?.[0]).toContain('$3');
    expect(insert?.[1]?.[2]).toBe(title);
    expect(f.query.mock.calls.every(([sql]) => !sql.includes(title))).toBe(true);
  });

  it('deletes before compacting positions and performs both operations in one transaction', async () => {
    const f = fixture();
    await f.cards.remove('card');
    const calls = f.query.mock.calls;
    const deletion = calls.findIndex(([sql]) => sql === 'DELETE FROM cards WHERE id = $1');
    const compaction = calls.findIndex(([sql]) => sql.includes('position = position + $4'));
    expect(compaction).toBeGreaterThan(deletion);
    expect(calls[compaction]?.[1]).toEqual(['todo', 2, 2147483647, -1, 'card']);
    expect(calls.at(-1)).toEqual(['COMMIT']);
  });
});
