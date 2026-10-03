import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorDto } from './dto';

const descriptions: Record<number, string> = {
  400: 'Invalid body, route parameter, query or position',
  404: 'The requested or referenced entity does not exist',
  409: 'Conflicting change; reload the board before retrying. Cross-board moves are not supported.',
  500: 'Unexpected server or database error; internal details are not exposed',
  503: 'Database is unavailable',
};

export function ApiErrors(...statuses: number[]) {
  return applyDecorators(...statuses.map((status) => ApiResponse({
    status, type: ErrorDto, description: descriptions[status],
  })));
}
