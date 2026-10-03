import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-errors';
import { HealthDto } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check API and database connectivity', description: 'Runs SELECT 1 through the shared pool. Returns 503 when PostgreSQL cannot be reached. Does not verify migrations.' })
  @ApiOkResponse({ type: HealthDto })
  @ApiErrors(503, 500)
  check(): Promise<HealthDto> { return this.health.check(); }
}
