import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TagDto } from './tags.dto';

@Injectable()
export class TagsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(): Promise<TagDto[]> {
    return (await this.db.query<TagDto>(`
      SELECT id, name, color, created_at AT TIME ZONE 'UTC' AS "createdAt"
      FROM tags ORDER BY name, id
    `)).rows;
  }
}
