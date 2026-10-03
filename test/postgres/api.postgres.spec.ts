import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { validateEnvironment } from '../../src/config/environment';
import { DATABASE_POOL, poolOptions } from '../../src/database/pool';
import { runMigrations, runSeeds } from '../../src/database/tools/runner';
import { setupApp } from '../../src/setup-app';

interface Card { id: string; listId: string; position: number; title: string; completed: boolean; tags: { id: string }[] }
interface Board { id: string; lists: { id: string; title: string; position: number; cards: Card[] }[] }

describe('real remote PostgreSQL integration', () => {
  let app: INestApplication | undefined;
  let pool: Pool | undefined;
  let admin: Pool | undefined;
  // Identifier is generated locally, never taken from user input. Only this schema is removed.
  const schema = `kanban_test_${randomUUID().replace(/-/g, '')}`;
  let schemaCreated = false;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('Set TEST_DATABASE_URL to a separate remote test database before running test:postgres');
    }
    const config = validateEnvironment({
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      DB_SSL_CA: process.env.TEST_DB_SSL_CA,
      NODE_ENV: 'test', DB_POOL_MAX: '2',
    });
    admin = new Pool({ ...poolOptions(config), max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    pool = new Pool({ ...poolOptions(config), options: `-c search_path=${schema} -c timezone=UTC` });
    pool.on('error', () => undefined);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE_POOL).useValue(pool).compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      else await pool?.end();
    } finally {
      try {
        if (schemaCreated && /^kanban_test_[0-9a-f]{32}$/.test(schema)) await admin?.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally { await admin?.end(); }
    }
  });

  const server = () => app!.getHttpServer();
  async function board(): Promise<Board> {
    return (await request(server()).post('/api/boards').send({ title: 'Integration board' }).expect(201)).body as Board;
  }
  async function card(listId: string, title: string, position?: number): Promise<Card> {
    return (await request(server()).post('/api/cards').send({ listId, title, position }).expect(201)).body as Card;
  }
  async function getBoard(id: string): Promise<Board> {
    return (await request(server()).get(`/api/boards/${id}`).expect(200)).body as Board;
  }
  function expectDense(board: Board): void {
    for (const list of board.lists) expect(list.cards.map((item) => item.position)).toEqual(list.cards.map((_, index) => index));
  }

  it('migrates an empty schema, records checksums and seeds reproducibly', async () => {
    expect(await runMigrations(pool!)).toEqual(['001_initial.sql']);
    expect(await runMigrations(pool!)).toEqual([]);
    await runSeeds(pool!);
    const before = (await request(server()).get('/api/tags').expect(200)).body;
    await runSeeds(pool!);
    expect((await request(server()).get('/api/tags').expect(200)).body).toEqual(before);
    expect((await request(server()).get('/api/users').expect(200)).body).toHaveLength(3);
    const tables = await pool!.query<{ tablename: string }>('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', [schema]);
    expect(tables.rows.map((row) => row.tablename)).toEqual(['boards', 'card_tags', 'cards', 'comments', 'lists', 'schema_migrations', 'tags', 'users']);
    await request(server()).get('/api/health').expect(200);
  });

  it('creates exactly four ordered default lists and rolls back a partial board creation', async () => {
    const created = await board();
    expect(created.lists.map((list) => [list.title, list.position, list.cards])).toEqual([
      ['Todo', 0, []], ['In Progress', 1, []], ['QA', 2, []], ['Done', 3, []],
    ]);
    const count = (await pool!.query('SELECT count(*) FROM boards')).rows[0].count;
    await pool!.query(`CREATE FUNCTION reject_qa() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.title = 'QA' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_qa BEFORE INSERT ON lists FOR EACH ROW EXECUTE FUNCTION reject_qa();`);
    try {
      await request(server()).post('/api/boards').send({ title: 'Must roll back' }).expect(500);
      expect((await pool!.query('SELECT count(*) FROM boards')).rows[0].count).toBe(count);
    } finally { await pool!.query('DROP TRIGGER reject_qa ON lists; DROP FUNCTION reject_qa()'); }
  });

  it('creates, reorders, moves, patches and deletes cards with dense positions and cascading relations', async () => {
    const b = await board(), todo = b.lists[0]!.id, qa = b.lists[2]!.id;
    const a = await card(todo, 'A'), c = await card(todo, 'C'), middle = await card(todo, 'B', 1);
    expect((await getBoard(b.id)).lists[0]!.cards.map((item) => item.title)).toEqual(['A', 'B', 'C']);
    await request(server()).patch(`/api/cards/${c.id}`).send({ position: 0 }).expect(200);
    expect((await getBoard(b.id)).lists[0]!.cards.map((item) => item.title)).toEqual(['C', 'A', 'B']);
    const patched = await request(server()).patch(`/api/cards/${a.id}`).send({
      listId: qa, title: 'Moved', description: 'Details', assigneeId: 'user-alex', completed: true, tagIds: ['tag-bug', 'tag-feature'],
    }).expect(200);
    expect(patched.body.position).toBe(0);
    expect(patched.body.tags.map((tag: { id: string }) => tag.id).sort()).toEqual(['tag-bug', 'tag-feature']);
    await request(server()).post(`/api/cards/${a.id}/comments`).send({ text: 'Comment', userId: 'user-maria' }).expect(201);
    expect((await request(server()).get(`/api/cards/${a.id}/comments`).expect(200)).body).toHaveLength(1);
    const cleared = await request(server()).patch(`/api/cards/${a.id}`).send({ description: null, assigneeId: null, completed: false, tagIds: [] }).expect(200);
    expect(cleared.body).toMatchObject({ description: null, assigneeId: null, completed: false, tags: [] });
    await request(server()).patch(`/api/cards/${a.id}`).send({ tagIds: ['tag-bug'] }).expect(200);
    await request(server()).delete(`/api/cards/${a.id}`).expect(204);
    await request(server()).delete(`/api/cards/${middle.id}`).expect(204);
    expectDense(await getBoard(b.id));
    expect((await pool!.query('SELECT id FROM comments WHERE card_id = $1', [a.id])).rowCount).toBe(0);
    expect((await pool!.query('SELECT card_id FROM card_tags WHERE card_id = $1', [a.id])).rowCount).toBe(0);
    await request(server()).get(`/api/cards/${a.id}`).expect(404);
    await request(server()).get(`/api/cards/${a.id}/comments`).expect(404);
  });

  it('rolls back invalid changes and rejects cross-board moves', async () => {
    const b = await board(), another = await board();
    const a = await card(b.lists[0]!.id, 'Keep title');
    await request(server()).patch(`/api/cards/${a.id}`).send({ title: 'Bad', tagIds: ['missing'] }).expect(404);
    await request(server()).patch(`/api/cards/${a.id}`).send({ assigneeId: 'missing' }).expect(404);
    await request(server()).patch(`/api/cards/${a.id}`).send({ position: 1 }).expect(400);
    await request(server()).patch(`/api/cards/${a.id}`).send({ listId: another.lists[0]!.id }).expect(409);
    await request(server()).patch(`/api/cards/${a.id}`).send({}).expect(400);
    await request(server()).post(`/api/cards/${a.id}/comments`).send({ text: 'No author', userId: 'missing' }).expect(404);
    expect((await request(server()).get(`/api/cards/${a.id}`).expect(200)).body.title).toBe('Keep title');
    expectDense(await getBoard(b.id));
  });

  it('sorts by creation date independently of manual positions, with deterministic ties', async () => {
    const b = await board(), listId = b.lists[0]!.id;
    const first = await card(listId, 'Old'), second = await card(listId, 'New', 0);
    await pool!.query('UPDATE cards SET created_at = $2::timestamp WHERE id = $1', [first.id, '2026-01-01']);
    await pool!.query('UPDATE cards SET created_at = $2::timestamp WHERE id = $1', [second.id, '2026-02-01']);
    for (const [direction, expected] of [['asc', ['Old', 'New']], ['desc', ['New', 'Old']]] as const) {
      const response = await request(server()).get(`/api/boards/${b.id}?sort=createdAt&direction=${direction}`).expect(200);
      expect(response.body.lists[0].cards.map((item: Card) => item.title)).toEqual(expected);
    }
    expect((await getBoard(b.id)).lists[0]!.cards.map((item) => item.title)).toEqual(['New', 'Old']);
    await pool!.query('UPDATE cards SET created_at = $2::timestamp WHERE list_id = $1', [listId, '2026-01-01']);
    const tied = await request(server()).get(`/api/boards/${b.id}?sort=createdAt`).expect(200);
    expect(tied.body.lists[0].cards.map((item: Card) => item.id)).toEqual([first.id, second.id].sort());
  });

  it('serializes concurrent inserts, opposite moves and deletes through a pool of two connections', async () => {
    const b = await board(), todo = b.lists[0]!.id, qa = b.lists[2]!.id;
    const created = await Promise.all(Array.from({ length: 12 }, (_, index) => card(todo, `Concurrent ${index}`, 0)));
    let state = await getBoard(b.id);
    expect(state.lists[0]!.cards).toHaveLength(12);
    expectDense(state);
    const other = await card(qa, 'Opposite');
    await Promise.all([
      request(server()).patch(`/api/cards/${created[0]!.id}`).send({ listId: qa, position: 0 }).expect(200),
      request(server()).patch(`/api/cards/${other.id}`).send({ listId: todo, position: 0 }).expect(200),
      request(server()).patch(`/api/cards/${created[1]!.id}`).send({ position: 0 }).expect(200),
      request(server()).delete(`/api/cards/${created[2]!.id}`).expect(204),
    ]);
    state = await getBoard(b.id);
    expectDense(state);
    expect(state.lists.flatMap((list) => list.cards)).toHaveLength(12);
  });

  it('round-trips SQL-shaped text without interpreting it as SQL', async () => {
    const b = await board();
    const title = "'; DROP TABLE boards; --";
    const created = await card(b.lists[0]!.id, title);
    expect(created.title).toBe(title);
    await request(server()).get('/api/boards').expect(200);
  });
});
