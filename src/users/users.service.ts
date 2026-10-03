import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { UserDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(): Promise<UserDto[]> {
    return (await this.db.query<UserDto>('SELECT id, name FROM users ORDER BY name, id')).rows;
  }
}
