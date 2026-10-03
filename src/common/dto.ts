import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, Length, Matches, ValidateIf } from 'class-validator';

export class IdParamDto {
  @ApiProperty({ description: 'Text identifier', example: 'user-alex', maxLength: 200 })
  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  id!: string;
}

export class CardSortDto {
  @ApiPropertyOptional({ enum: ['position', 'createdAt'], default: 'position', description: 'Card order within each list; does not change stored positions' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['position', 'createdAt'])
  sort: 'position' | 'createdAt' = 'position';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['asc', 'desc'])
  direction: 'asc' | 'desc' = 'asc';
}

export class ErrorDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], example: ['title must be a string'] })
  message!: string | string[];

  @ApiProperty({ format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  timestamp!: string;
}
