import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, SqlClient } from '../database/database.service';
import { findCard } from './card-queries';
import { CardDto, CreateCardDto, UpdateCardDto } from './cards.dto';
import { CardLocation, insertionPosition, positionShifts } from './position';

@Injectable()
export class CardsService {
  constructor(private readonly db: DatabaseService) {}

  findOne(id: string): Promise<CardDto> { return findCard(this.db, id); }

  create(dto: CreateCardDto): Promise<CardDto> {
    return this.db.transaction(async (client) => {
      const boardId = await this.listBoardId(client, dto.listId);
      await this.lockBoard(client, boardId);
      await this.validateReferences(client, dto.assigneeId, dto.tagIds);
      const position = insertionPosition(dto.position, await this.cardCount(client, dto.listId));
      const id = randomUUID();
      await this.shift(client, id, null, { listId: dto.listId, position });
      await client.query(`
        INSERT INTO cards (id, list_id, title, description, assignee_id, position, completed)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [id, dto.listId, dto.title, dto.description ?? null, dto.assigneeId ?? null, position, dto.completed ?? false]);
      await this.replaceTags(client, id, dto.tagIds ?? []);
      return findCard(client, id);
    });
  }

  update(id: string, dto: UpdateCardDto): Promise<CardDto> {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Provide at least one field to update');
    return this.db.transaction(async (client) => {
      const boardId = await this.lockCardBoard(client, id);
      // Re-read after acquiring the board lock: another request may have moved/deleted the card.
      const current = await findCard(client, id);
      const listId = dto.listId ?? current.listId;
      if (await this.listBoardId(client, listId) !== boardId) {
        throw new ConflictException('Cards can only move between lists on the same board');
      }
      await this.validateReferences(client, dto.assigneeId, dto.tagIds);
      const sameList = listId === current.listId;
      const maximum = await this.cardCount(client, listId) - (sameList ? 1 : 0);
      const position = insertionPosition(dto.position ?? (sameList ? current.position : undefined), maximum);
      await this.shift(client, id, current, { listId, position });
      await client.query(`
        UPDATE cards SET list_id = $2, title = $3, description = $4,
          assignee_id = $5, position = $6, completed = $7 WHERE id = $1
      `, [id, listId, dto.title ?? current.title,
        dto.description !== undefined ? dto.description : current.description,
        dto.assigneeId !== undefined ? dto.assigneeId : current.assigneeId,
        position, dto.completed ?? current.completed]);
      if (dto.tagIds !== undefined) await this.replaceTags(client, id, dto.tagIds);
      return findCard(client, id);
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.transaction(async (client) => {
      await this.lockCardBoard(client, id);
      const current = await findCard(client, id);
      await client.query('DELETE FROM cards WHERE id = $1', [id]);
      await this.shift(client, id, current, null);
    });
  }

  private async lockBoard(client: SqlClient, boardId: string): Promise<void> {
    const result = await client.query('SELECT id FROM boards WHERE id = $1 FOR UPDATE', [boardId]);
    if (!result.rowCount) throw new NotFoundException('Board not found');
  }

  private async lockCardBoard(client: SqlClient, id: string): Promise<string> {
    const row = (await client.query<{ boardId: string }>(`
      SELECT l.board_id AS "boardId" FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = $1
    `, [id])).rows[0];
    if (!row) throw new NotFoundException('Card not found');
    await this.lockBoard(client, row.boardId);
    return row.boardId;
  }

  private async listBoardId(client: SqlClient, listId: string): Promise<string> {
    const row = (await client.query<{ boardId: string }>('SELECT board_id AS "boardId" FROM lists WHERE id = $1', [listId])).rows[0];
    if (!row) throw new NotFoundException('List not found');
    return row.boardId;
  }

  private async cardCount(client: SqlClient, listId: string): Promise<number> {
    const row = (await client.query<{ count: number }>('SELECT count(*)::integer AS count FROM cards WHERE list_id = $1', [listId])).rows[0];
    return row!.count;
  }

  private async shift(client: SqlClient, id: string, source: CardLocation | null, target: CardLocation | null): Promise<void> {
    for (const shift of positionShifts(source, target)) {
      await client.query(`
        UPDATE cards SET position = position + $4
        WHERE list_id = $1 AND position BETWEEN $2 AND $3 AND id <> $5
      `, [shift.listId, shift.from, shift.to, shift.delta, id]);
    }
  }

  private async validateReferences(client: SqlClient, assigneeId?: string | null, tagIds?: string[]): Promise<void> {
    if (assigneeId != null) {
      const user = await client.query('SELECT id FROM users WHERE id = $1', [assigneeId]);
      if (!user.rowCount) throw new NotFoundException('Assignee not found');
    }
    if (tagIds?.length) {
      const tags = await client.query('SELECT id FROM tags WHERE id = ANY($1::text[])', [tagIds]);
      if (tags.rowCount !== tagIds.length) throw new NotFoundException('One or more tags not found');
    }
  }

  private async replaceTags(client: SqlClient, id: string, tagIds: string[]): Promise<void> {
    await client.query('DELETE FROM card_tags WHERE card_id = $1', [id]);
    if (tagIds.length) {
      await client.query('INSERT INTO card_tags (card_id, tag_id) SELECT $1, unnest($2::text[])', [id, tagIds]);
    }
  }
}
