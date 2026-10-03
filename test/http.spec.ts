import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BoardsService } from '../src/boards/boards.service';
import { CardsService } from '../src/cards/cards.service';
import { CommentsService } from '../src/comments/comments.service';
import { DATABASE_POOL } from '../src/database/pool';
import { setupApp } from '../src/setup-app';
import { TagsService } from '../src/tags/tags.service';
import { UsersService } from '../src/users/users.service';

describe('HTTP contract, validation and Swagger (no PostgreSQL required)', () => {
  let app: INestApplication;
  const pool = { query: jest.fn().mockResolvedValue({ rows: [{ ok: 1 }] }), end: jest.fn() };
  const boards = { findAll: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'board' }), findOne: jest.fn().mockResolvedValue({ id: 'board', lists: [] }) };
  const cards = { create: jest.fn().mockResolvedValue({ id: 'card' }), update: jest.fn().mockResolvedValue({ id: 'card' }), findOne: jest.fn().mockResolvedValue({ id: 'card' }), remove: jest.fn().mockResolvedValue(undefined) };
  const comments = { findAll: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'comment' }) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE_POOL).useValue(pool)
      .overrideProvider(BoardsService).useValue(boards)
      .overrideProvider(CardsService).useValue(cards)
      .overrideProvider(CommentsService).useValue(comments)
      .overrideProvider(UsersService).useValue({ findAll: async () => [{ id: 'user-alex', name: 'Алексей' }] })
      .overrideProvider(TagsService).useValue({ findAll: async () => [] })
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApp(app);
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it('serves every required endpoint below /api with the expected success status', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/health').expect(200, { status: 'ok', database: 'up' });
    for (const path of ['/boards', '/boards/board', '/users', '/tags', '/cards/card', '/cards/card/comments']) {
      await request(server).get(`/api${path}`).expect(200);
    }
    await request(server).post('/api/boards').send({ title: 'Board' }).expect(201);
    await request(server).post('/api/cards').send({ title: 'Card', listId: 'list' }).expect(201);
    await request(server).patch('/api/cards/card').send({ completed: true }).expect(200);
    await request(server).post('/api/cards/card/comments').send({ text: 'Comment' }).expect(201);
    const deleted = await request(server).delete('/api/cards/card').expect(204);
    expect(deleted.text).toBe('');
    await request(server).get('/boards').expect(404);
    await request(server).get('/health').expect(404);
  });

  it.each([
    { title: 'Card', listId: 'list', unexpected: true },
    { title: '', listId: 'list' }, { title: '  ', listId: 'list' },
    { title: 'x'.repeat(256), listId: 'list' }, { title: 'Card' },
    { title: 'Card', listId: 'list', position: -1 },
    { title: 'Card', listId: 'list', position: '1' },
    { title: 'Card', listId: 'list', completed: 'false' },
    { title: 'Card', listId: 'list', tagIds: ['tag', 'tag'] },
    { title: 'Card', listId: 'list', tagIds: [123] },
  ])('rejects invalid card input before reaching the service: %j', async (body) => {
    await request(app.getHttpServer()).post('/api/cards').send(body).expect(400);
    expect(cards.create).not.toHaveBeenCalled();
  });

  it.each(['title', 'listId', 'position', 'completed', 'tagIds'])('rejects null for non-nullable PATCH %s', async (field) => {
    await request(app.getHttpServer()).patch('/api/cards/card').send({ [field]: null }).expect(400);
    expect(cards.update).not.toHaveBeenCalled();
  });

  it('preserves explicit null, false and empty arrays for clearing card fields', async () => {
    const body = { description: null, assigneeId: null, completed: false, tagIds: [] };
    await request(app.getHttpServer()).patch('/api/cards/card').send(body).expect(200);
    expect(cards.update).toHaveBeenCalledWith('card', expect.objectContaining(body));
  });

  it('validates route and sort DTOs without exposing arbitrary query fields', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/boards/b?sort=createdAt&direction=desc').expect(200);
    expect(boards.findOne).toHaveBeenCalledWith('b', expect.objectContaining({ sort: 'createdAt', direction: 'desc' }));
    await request(server).get('/api/boards/b?sort=sql').expect(400);
    await request(server).get('/api/boards/b?direction=DESC').expect(400);
    await request(server).get('/api/boards/b?extra=value').expect(400);
    await request(server).get(`/api/cards/${'x'.repeat(201)}`).expect(400);
    await request(server).post('/api/boards').send({ title: null }).expect(400);
    await request(server).post('/api/cards/c/comments').send({ text: '  ' }).expect(400);
  });

  it('returns 404 for missing entities, 409 for database conflicts and sanitizes unexpected errors', async () => {
    cards.findOne.mockRejectedValueOnce(new NotFoundException('Card not found'));
    await request(app.getHttpServer()).get('/api/cards/missing').expect(404);
    cards.update.mockRejectedValueOnce({ code: '23505', detail: 'secret row' });
    const conflict = await request(app.getHttpServer()).patch('/api/cards/c').send({ title: 'Title' }).expect(409);
    expect(conflict.text).not.toContain('secret');
    cards.findOne.mockRejectedValueOnce(new Error('postgres://secret:password@internal-host/db'));
    const failure = await request(app.getHttpServer()).get('/api/cards/c').expect(500);
    expect(failure.body.message).toBe('Internal server error');
    expect(failure.text).not.toMatch(/password|postgres|internal-host|stack/);
  });

  it('reports 503 on database failure without leaking credentials', async () => {
    pool.query.mockRejectedValueOnce(new Error('secret credentials'));
    const response = await request(app.getHttpServer()).get('/api/health').expect(503);
    expect(response.body.message).toBe('Database is unavailable');
    expect(response.text).not.toContain('secret');
  });

  it('sends browser CORS headers for configured/localhost origins and handles preflight', async () => {
    await request(app.getHttpServer()).get('/api/users').set('Origin', 'http://localhost:5173')
      .expect('Access-Control-Allow-Origin', 'http://localhost:5173');
    const denied = await request(app.getHttpServer()).get('/api/users').set('Origin', 'https://untrusted.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    await request(app.getHttpServer()).options('/api/cards/c')
      .set('Origin', 'https://client.example').set('Access-Control-Request-Method', 'PATCH')
      .expect(204).expect('Access-Control-Allow-Origin', 'https://client.example');
  });

  it('serves Swagger UI and a complete documented OpenAPI contract outside /api', async () => {
    await request(app.getHttpServer()).get('/docs/').expect(200).expect('Content-Type', /html/);
    const spec = (await request(app.getHttpServer()).get('/docs-json').expect(200)).body;
    const expected: Record<string, string[]> = {
      '/api/health': ['get'], '/api/boards': ['get', 'post'], '/api/boards/{id}': ['get'],
      '/api/users': ['get'], '/api/tags': ['get'], '/api/cards': ['post'],
      '/api/cards/{id}': ['get', 'patch', 'delete'], '/api/cards/{id}/comments': ['get', 'post'],
    };
    expect(Object.keys(spec.paths).sort()).toEqual(Object.keys(expected).sort());
    for (const [path, methods] of Object.entries(expected)) {
      for (const method of methods) {
        const operation = spec.paths[path][method];
        expect(operation.tags.length).toBeGreaterThan(0);
        expect(operation.summary).toBeTruthy();
        expect(operation.description).toBeTruthy();
        expect(operation.responses['500']).toBeDefined();
        if (path.includes('{id}')) expect(operation.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'id', in: 'path', required: true })]));
        if (['post', 'patch'].includes(method)) expect(operation.requestBody.content['application/json'].schema).toBeDefined();
        const status = method === 'post' ? '201' : method === 'delete' ? '204' : '200';
        expect(operation.responses[status]).toBeDefined();
        if (status !== '204') expect(operation.responses[status].content['application/json'].schema).toBeDefined();
      }
    }
    expect(spec.components.schemas.UpdateCardDto.required ?? []).toEqual([]);
    expect(spec.paths['/api/boards/{id}'].get.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'sort', in: 'query' }),
      expect.objectContaining({ name: 'direction', in: 'query' }),
    ]));
  });
});
