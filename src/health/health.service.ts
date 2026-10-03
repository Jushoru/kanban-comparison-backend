import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { HealthDto } from './health.dto';

@Injectable()
export class HealthService {
  constructor(private readonly db: DatabaseService) {}

  async check(): Promise<HealthDto> {
    try { await this.db.query('SELECT 1'); }
    catch { throw new ServiceUnavailableException('Database is unavailable'); }
    return { status: 'ok', database: 'up' };
  }
}
