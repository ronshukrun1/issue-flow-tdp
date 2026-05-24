import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';

/**
 * Documents endpoints that return **200 OK** with an empty body (README contract).
 */
export function ApiEmptyOk(
  description = '200 OK — success with empty response body',
): MethodDecorator {
  return applyDecorators(
    ApiOkResponse({
      status: HttpStatus.OK,
      description,
    }),
  );
}
