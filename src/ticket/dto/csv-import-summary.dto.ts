import { ApiProperty } from '@nestjs/swagger';

/** OpenAPI schema for a single CSV import row error. */
export class CsvImportRowErrorDto {
  @ApiProperty({
    example: 4,
    description: '1-based CSV row number (header is row 1)',
  })
  row!: number;

  @ApiProperty({ example: 'Fix login bug' })
  title!: string;

  @ApiProperty({
    example: 'status',
    description: 'Field name, or `row` for persistence failures',
  })
  field!: string;

  @ApiProperty({
    example:
      'Invalid status: BLOCKED. Allowed values are TODO, IN_PROGRESS, IN_REVIEW, DONE.',
  })
  message!: string;
}

/** OpenAPI schema for `POST /tickets/import` response body. */
export class CsvImportSummaryDto {
  @ApiProperty({ example: 42 })
  created!: number;

  @ApiProperty({ example: 3 })
  failed!: number;

  @ApiProperty({ type: [CsvImportRowErrorDto] })
  errors!: CsvImportRowErrorDto[];
}
