import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { CardDto } from '../cards/cards.dto';

export class CreateBoardDto {
  @ApiProperty({ example: 'Сравнение технологий', maxLength: 255 })
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 20000, example: 'Эксперимент ВКР' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string | null;
}

export class BoardDto {
  @ApiProperty({ example: 'board-id' })
  id!: string;

  @ApiProperty({ example: 'Сравнение технологий' })
  title!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Эксперимент ВКР' })
  description!: string | null;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;
}

export class ListDto {
  @ApiProperty({ example: 'list-id' })
  id!: string;

  @ApiProperty({ example: 'board-id' })
  boardId!: string;

  @ApiProperty({ example: 'Todo' })
  title!: string;

  @ApiProperty({ example: 0, minimum: 0 })
  position!: number;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ type: [CardDto] })
  cards!: CardDto[];
}

export class BoardDetailsDto extends BoardDto {
  @ApiProperty({ type: [ListDto] })
  lists!: ListDto[];
}
