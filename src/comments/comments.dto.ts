import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Замеры выполнены на одном устройстве', maxLength: 10000 })
  @IsString()
  @Length(1, 10000)
  @Matches(/\S/)
  text!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'user-alex', description: 'Static author ID. Omit or pass null for an anonymous comment.' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(/\S/)
  userId?: string | null;
}

export class CommentDto {
  @ApiProperty({ example: 'comment-id' })
  id!: string;

  @ApiProperty({ example: 'card-id' })
  cardId!: string;

  @ApiProperty({ type: String, nullable: true, example: 'user-alex' })
  userId!: string | null;

  @ApiProperty({ example: 'Замеры выполнены на одном устройстве' })
  text!: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;
}
