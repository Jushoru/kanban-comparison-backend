import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ example: 'user-alex' })
  id!: string;

  @ApiProperty({ example: 'Алексей' })
  name!: string;
}
