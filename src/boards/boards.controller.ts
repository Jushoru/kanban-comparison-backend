import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-errors';
import { CardSortDto, IdParamDto } from '../common/dto';
import { BoardDetailsDto, BoardDto, CreateBoardDto } from './boards.dto';
import { BoardsService } from './boards.service';

@ApiTags('boards')
@ApiErrors(500)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  @ApiOperation({ summary: 'List boards', description: 'Board summaries, newest first (createdAt descending, id ascending as tie-breaker).' })
  @ApiOkResponse({ type: BoardDto, isArray: true })
  findAll(): Promise<BoardDto[]> { return this.boards.findAll(); }

  @Post()
  @ApiOperation({ summary: 'Create a board with four lists', description: 'Atomically creates Todo, In Progress, QA, Done at positions 0..3. Returns the complete new board.' })
  @ApiCreatedResponse({ type: BoardDetailsDto })
  @ApiErrors(400, 409)
  create(@Body() dto: CreateBoardDto): Promise<BoardDetailsDto> { return this.boards.create(dto); }

  @Get(':id')
  @ApiOperation({ summary: 'Get a board, lists and cards', description: 'Consistent snapshot. Lists use position ascending. Cards use the requested sort within each list, then id ascending for ties; tags are included.' })
  @ApiOkResponse({ type: BoardDetailsDto })
  @ApiErrors(400, 404)
  findOne(@Param() params: IdParamDto, @Query() query: CardSortDto): Promise<BoardDetailsDto> {
    return this.boards.findOne(params.id, query);
  }
}
