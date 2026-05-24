import { FileValidator } from '@nestjs/common';

/** Maximum ticket CSV upload size in bytes (10 MiB), aligned with attachment uploads. */
export const MAX_TICKET_CSV_IMPORT_BYTES = 10 * 1024 * 1024;

/**
 * Rejects CSV imports larger than {@link MAX_TICKET_CSV_IMPORT_BYTES}.
 * Files of exactly 10 MiB are accepted (inclusive limit).
 */
export class MaxTicketCsvSizeValidator extends FileValidator<{
  maxBytes: number;
}> {
  constructor(maxBytes: number = MAX_TICKET_CSV_IMPORT_BYTES) {
    super({ maxBytes });
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file || !('size' in file)) {
      return true;
    }
    return file.size <= this.validationOptions.maxBytes;
  }

  buildErrorMessage(_file?: Express.Multer.File): string {
    return `Ticket CSV file exceeds the maximum allowed size of ${this.validationOptions.maxBytes} bytes (10 MB)`;
  }
}

/**
 * Ensures the client supplied an original filename ending in `.csv`
 * (case-insensitive). MIME type alone is not sufficient.
 */
export class CsvOriginalNameValidator extends FileValidator<Record<string, never>> {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    const name = file?.originalname?.trim();
    if (!name) {
      return false;
    }
    return /\.csv$/i.test(name);
  }

  buildErrorMessage(_file?: Express.Multer.File): string {
    return 'Uploaded file must have a .csv extension and a valid filename';
  }
}
