import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-errors';
import { TagDto } from './tags.dto';
import { TagsService } from './tags.service';

@ApiTags('tags')
@ApiErrors(500)
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'List available tags', description: 'Reference tags ordered by name and id. Use their IDs in card tagIds.' })
  @ApiOkResponse({ type: TagDto, isArray: true })
  findAll(): Promise<TagDto[]> { return this.tags.findAll(); }
}
