import { ApiProperty } from '@nestjs/swagger';

export class TagDto {
  @ApiProperty({ example: 'tag-feature' })
  id!: string;

  @ApiProperty({ example: 'Feature' })
  name!: string;

  @ApiProperty({ example: '#2563EB' })
  color!: string;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;
}
