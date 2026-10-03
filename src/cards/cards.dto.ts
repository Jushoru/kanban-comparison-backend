import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { TagDto } from '../tags/tags.dto';

export class CreateCardDto {
  @ApiProperty({ example: 'list-id', maxLength: 200 })
  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  listId!: string;

  @ApiProperty({ example: 'Сравнить время запуска', maxLength: 255 })
  @IsString()
  @Length(1, 255)
  @Matches(/\S/)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 20000, example: 'Измерить холодный старт на одном устройстве' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'User ID; null removes the assignee', example: 'user-alex', maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  assigneeId?: string | null;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 2147483647, description: 'Zero-based insertion index. Omit to append on create or when moving to another list.', example: 0 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  position?: number;

  @ApiPropertyOptional({ example: false, description: 'Independent of the list; moving to Done does not toggle this flag' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional({ type: [String], maxItems: 100, uniqueItems: true, example: ['tag-feature'], description: 'Full set of tag IDs; [] clears all tags' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  @Matches(/\S/, { each: true })
  tagIds?: string[];
}

export class UpdateCardDto extends PartialType(CreateCardDto, { skipNullProperties: false }) {}

export class CardDto {
  @ApiProperty({ example: '3c0554ef-5ea5-46e5-bc07-a6abbd0c8273' })
  id!: string;

  @ApiProperty({ example: 'list-id' })
  listId!: string;

  @ApiProperty({ example: 'Сравнить время запуска' })
  title!: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  description!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'user-alex' })
  assigneeId!: string | null;

  @ApiProperty({ minimum: 0, example: 0 })
  position!: number;

  @ApiProperty({ example: false })
  completed!: boolean;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ type: [TagDto] })
  tags!: TagDto[];
}
