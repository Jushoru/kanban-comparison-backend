import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { CommentDto, CreateCommentDto } from './comments.dto';

const columns = `id, card_id AS "cardId", user_id AS "userId", text, created_at AT TIME ZONE 'UTC' AS "createdAt"`;

@Injectable()
export class CommentsService {
  constructor(private readonly db: DatabaseService) {}

  findAll(cardId: string): Promise<CommentDto[]> {
    return this.db.transaction(async (client) => {
      if (!(await client.query('SELECT id FROM cards WHERE id = $1', [cardId])).rowCount) {
        throw new NotFoundException('Card not found');
      }
      return (await client.query<CommentDto>(`SELECT ${columns} FROM comments WHERE card_id = $1 ORDER BY created_at, id`, [cardId])).rows;
    }, true);
  }

  create(cardId: string, dto: CreateCommentDto): Promise<CommentDto> {
    return this.db.transaction(async (client) => {
      if (!(await client.query('SELECT id FROM cards WHERE id = $1 FOR KEY SHARE', [cardId])).rowCount) {
        throw new NotFoundException('Card not found');
      }
      if (dto.userId != null && !(await client.query('SELECT id FROM users WHERE id = $1', [dto.userId])).rowCount) {
        throw new NotFoundException('User not found');
      }
      const result = await client.query<CommentDto>(`
        INSERT INTO comments (id, card_id, user_id, text) VALUES ($1, $2, $3, $4) RETURNING ${columns}
      `, [randomUUID(), cardId, dto.userId ?? null, dto.text]);
      return result.rows[0]!;
    });
  }
}
