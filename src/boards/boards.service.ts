import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { findBoardCards } from '../cards/card-queries';
import { CardSortDto } from '../common/dto';
import { DatabaseService, SqlClient } from '../database/database.service';
import { BoardDetailsDto, BoardDto, CreateBoardDto, ListDto } from './boards.dto';

const boardColumns = `id, title, description, created_at AT TIME ZONE 'UTC' AS "createdAt"`;

@Injectable()
export class BoardsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(): Promise<BoardDto[]> {
    return (await this.db.query<BoardDto>(`SELECT ${boardColumns} FROM boards ORDER BY created_at DESC, id`)).rows;
  }

  findOne(id: string, sort: CardSortDto): Promise<BoardDetailsDto> {
    // The board, lists and cards must come from one consistent snapshot.
    return this.db.transaction((client) => this.details(client, id, sort), true);
  }

  create(dto: CreateBoardDto): Promise<BoardDetailsDto> {
    return this.db.transaction(async (client) => {
      const id = randomUUID();
      await client.query('INSERT INTO boards (id, title, description) VALUES ($1, $2, $3)',
        [id, dto.title, dto.description ?? null]);
      const titles = ['Todo', 'In Progress', 'QA', 'Done'];
      for (const [position, title] of titles.entries()) {
        await client.query('INSERT INTO lists (id, board_id, title, position) VALUES ($1, $2, $3, $4)',
          [randomUUID(), id, title, position]);
      }
      return this.details(client, id, new CardSortDto());
    });
  }

  private async details(client: SqlClient, id: string, sort: CardSortDto): Promise<BoardDetailsDto> {
    const board = (await client.query<BoardDto>(`SELECT ${boardColumns} FROM boards WHERE id = $1`, [id])).rows[0];
    if (!board) throw new NotFoundException('Board not found');
    const lists = (await client.query<Omit<ListDto, 'cards'>>(`
      SELECT id, board_id AS "boardId", title, position, created_at AT TIME ZONE 'UTC' AS "createdAt"
      FROM lists WHERE board_id = $1 ORDER BY position, id
    `, [id])).rows;
    const cards = await findBoardCards(client, id, sort);
    const byList = new Map<string, typeof cards>();
    for (const card of cards) {
      const group = byList.get(card.listId) ?? [];
      group.push(card);
      byList.set(card.listId, group);
    }
    return { ...board, lists: lists.map((list) => ({ ...list, cards: byList.get(list.id) ?? [] })) };
  }
}
