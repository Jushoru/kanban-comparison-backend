import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-errors';
import { IdParamDto } from '../common/dto';
import { CommentDto, CreateCommentDto } from './comments.dto';
import { CommentsService } from './comments.service';

@ApiTags('comments')
@ApiErrors(400, 404, 500)
@Controller('cards/:id/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOperation({ summary: 'List card comments', description: 'Oldest first, ordered by createdAt then id. Missing card returns 404; a card without comments returns [].' })
  @ApiOkResponse({ type: CommentDto, isArray: true })
  findAll(@Param() params: IdParamDto): Promise<CommentDto[]> { return this.comments.findAll(params.id); }

  @Post()
  @ApiOperation({ summary: 'Add a comment', description: 'Adds a comment with an optional static author; the card must exist.' })
  @ApiCreatedResponse({ type: CommentDto })
  @ApiErrors(409)
  create(@Param() params: IdParamDto, @Body() dto: CreateCommentDto): Promise<CommentDto> { return this.comments.create(params.id, dto); }
}
