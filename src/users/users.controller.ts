import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-errors';
import { UserDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiErrors(500)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List static users', description: 'Reference users for assignees and comment authors, ordered by name and id. No authentication is performed.' })
  @ApiOkResponse({ type: UserDto, isArray: true })
  findAll(): Promise<UserDto[]> { return this.users.findAll(); }
}
