import {
  MaxTicketCsvSizeValidator,
  CsvOriginalNameValidator,
} from './csv-import-file.validators';

describe('Ticket CSV upload file validators', () => {
  const baseFile = (): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'tickets.csv',
      encoding: '7bit',
      mimetype: 'text/csv',
      buffer: Buffer.from('title\nx'),
      size: 256,
      stream: undefined as never,
      destination: '',
      filename: '',
      path: '',
    }) as Express.Multer.File;

  describe('MaxTicketCsvSizeValidator', () => {
    it('accepts a file at exactly 10 MB', () => {
      const v = new MaxTicketCsvSizeValidator();
      const file = { ...baseFile(), size: 10 * 1024 * 1024 };
      expect(v.isValid(file)).toBe(true);
    });

    it('rejects when file is larger than 10 MB', () => {
      const v = new MaxTicketCsvSizeValidator();
      const file = { ...baseFile(), size: 10 * 1024 * 1024 + 1 };
      expect(v.isValid(file)).toBe(false);
      expect(v.buildErrorMessage(file)).toContain('10 MB');
    });
  });

  describe('CsvOriginalNameValidator', () => {
    it('accepts .csv lowercase and uppercase extension', () => {
      const v = new CsvOriginalNameValidator();
      expect(v.isValid({ ...baseFile(), originalname: 'export.csv' })).toBe(
        true,
      );
      expect(v.isValid({ ...baseFile(), originalname: 'Export.CSV' })).toBe(
        true,
      );
    });

    it('rejects missing or blank originalname', () => {
      const v = new CsvOriginalNameValidator();
      expect(v.isValid({ ...baseFile(), originalname: '' })).toBe(false);
      expect(v.isValid({ ...baseFile(), originalname: '   ' })).toBe(false);
      expect(
        v.isValid({
          ...baseFile(),
          originalname: undefined as unknown as string,
        }),
      ).toBe(false);
    });

    it('rejects non-.csv extensions', () => {
      const v = new CsvOriginalNameValidator();
      expect(v.isValid({ ...baseFile(), originalname: 'data.txt' })).toBe(
        false,
      );
      expect(
        v.isValid({ ...baseFile(), originalname: 'malicious.csv.exe' }),
      ).toBe(false);
    });
  });
});
