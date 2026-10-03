import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-errors';
import { IdParamDto } from '../common/dto';
import { CardDto, CreateCardDto, UpdateCardDto } from './cards.dto';
import { CardsService } from './cards.service';

@ApiTags('cards')
@ApiErrors(400, 404, 500)
@Controller('cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a card', description: 'Insert at position 0..N in a list of N cards, or omit position to append. Later cards shift right atomically.' })
  @ApiCreatedResponse({ type: CardDto })
  @ApiErrors(409)
  create(@Body() dto: CreateCardDto): Promise<CardDto> { return this.cards.create(dto); }

  @Get(':id')
  @ApiOperation({ summary: 'Get one card', description: 'Returns card fields and complete tags. Comments have a separate endpoint.' })
  @ApiOkResponse({ type: CardDto })
  findOne(@Param() params: IdParamDto): Promise<CardDto> { return this.cards.findOne(params.id); }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit, reorder or move a card', description: 'Omitted fields stay unchanged. null clears description/assignee; [] clears tags. position is the final zero-based index (0..N-1 in the same list, 0..N in another list). Moving without position appends. Moves must stay within one board. All changes are atomic; completed is independent of the list. Reload the board after mutation to get shifted positions.' })
  @ApiOkResponse({ type: CardDto })
  @ApiErrors(409)
  update(@Param() params: IdParamDto, @Body() dto: UpdateCardDto): Promise<CardDto> { return this.cards.update(params.id, dto); }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a card', description: 'Also deletes comments and tag links; compacts positions in its list atomically.' })
  @ApiNoContentResponse({ description: 'Card deleted; no response body' })
  @ApiErrors(409)
  remove(@Param() params: IdParamDto): Promise<void> { return this.cards.remove(params.id); }
}
