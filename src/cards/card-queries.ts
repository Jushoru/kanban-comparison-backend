import { NotFoundException } from '@nestjs/common';
import { CardSortDto } from '../common/dto';
import { SqlClient } from '../database/database.service';
import { CardDto } from './cards.dto';

// These fragments contain only source-controlled SQL; all values use placeholders.
const cardSelect = `
  SELECT c.id, c.list_id AS "listId", c.title, c.description,
    c.assignee_id AS "assigneeId", c.position, c.completed,
    c.created_at AT TIME ZONE 'UTC' AS "createdAt",
    COALESCE((
      SELECT json_agg(json_build_object(
        'id', t.id, 'name', t.name, 'color', t.color,
        'createdAt', t.created_at AT TIME ZONE 'UTC'
      ) ORDER BY t.name, t.id)
      FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.card_id = c.id
    ), '[]'::json) AS tags
  FROM cards c
`;

const boardCardsQuery = `${cardSelect}
  JOIN lists l ON l.id = c.list_id WHERE l.board_id = $1
  ORDER BY l.position,
    CASE WHEN $2 = 'position' AND $3 = 'asc' THEN c.position END ASC,
    CASE WHEN $2 = 'position' AND $3 = 'desc' THEN c.position END DESC,
    CASE WHEN $2 = 'createdAt' AND $3 = 'asc' THEN c.created_at END ASC,
    CASE WHEN $2 = 'createdAt' AND $3 = 'desc' THEN c.created_at END DESC,
    c.id ASC
`;

export async function findCard(client: SqlClient, id: string): Promise<CardDto> {
  const card = (await client.query<CardDto>(`${cardSelect} WHERE c.id = $1`, [id])).rows[0];
  if (!card) throw new NotFoundException('Card not found');
  return card;
}

export async function findBoardCards(client: SqlClient, boardId: string, sort: CardSortDto): Promise<CardDto[]> {
  return (await client.query<CardDto>(boardCardsQuery, [boardId, sort.sort, sort.direction])).rows;
}
