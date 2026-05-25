import { BadRequestException, ParseFilePipe } from '@nestjs/common';
import {
  AllowedAttachmentMimeTypeValidator,
  InclusiveMaxAttachmentSizeValidator,
  MAX_ATTACHMENT_BYTES,
  isAllowedAttachmentMimeBase,
  normaliseAttachmentMimeBase,
} from './attachment.controller';

describe('attachment upload validators (ParseFilePipe + MIME/size)', () => {
  const file = (
    over: Partial<Express.Multer.File> &
      Pick<Express.Multer.File, 'mimetype' | 'size'>,
  ): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'f',
      encoding: '7bit',
      buffer: Buffer.from('x'),
      stream: undefined as never,
      destination: '',
      filename: '',
      path: '',
      ...over,
    }) as Express.Multer.File;

  describe('normaliseAttachmentMimeBase / isAllowedAttachmentMimeBase', () => {
    it.each([
      ['image/png'],
      ['image/jpeg'],
      ['application/pdf'],
      ['text/plain'],
      ['TEXT/PLAIN'],
      ['text/plain; charset=utf-8'],
      ['TEXT/PLAIN;charset=UTF-8'],
    ])('accepts %s', (mt) => {
      expect(isAllowedAttachmentMimeBase(mt)).toBe(true);
    });

    it.each([
      ['image/jpg'],
      ['application/octet-stream'],
      ['text/html'],
      [''],
      [undefined],
    ])('rejects %s', (mt) => {
      expect(isAllowedAttachmentMimeBase(mt as never)).toBe(false);
    });

    it('normalises parameters consistently', () => {
      expect(normaliseAttachmentMimeBase('text/plain; charset=utf-8')).toBe(
        'text/plain',
      );
    });
  });

  describe('AllowedAttachmentMimeTypeValidator', () => {
    const v = new AllowedAttachmentMimeTypeValidator();

    it.each([
      'image/png',
      'image/jpeg',
      'application/pdf',
      'text/plain',
      'text/plain; charset=utf-8',
    ])('accepts %s', (mimetype) => {
      expect(v.isValid(file({ mimetype, size: 10 }))).toBe(true);
    });

    it('rejects image/jpg', () => {
      expect(v.isValid(file({ mimetype: 'image/jpg', size: 10 }))).toBe(false);
    });

    it('rejects unsupported types', () => {
      expect(v.isValid(file({ mimetype: 'application/zip', size: 10 }))).toBe(
        false,
      );
    });

    it('buildErrorMessage mentions allowed types', () => {
      expect(
        v.buildErrorMessage(file({ mimetype: 'image/jpg', size: 1 })),
      ).toContain('image/png');
    });
  });

  describe('InclusiveMaxAttachmentSizeValidator', () => {
    const v = new InclusiveMaxAttachmentSizeValidator();

    it('allows exactly 10 MiB', () => {
      expect(
        v.isValid(file({ mimetype: 'image/png', size: MAX_ATTACHMENT_BYTES })),
      ).toBe(true);
    });

    it('rejects over 10 MiB', () => {
      expect(
        v.isValid(
          file({ mimetype: 'image/png', size: MAX_ATTACHMENT_BYTES + 1 }),
        ),
      ).toBe(false);
    });

    it('reject missing size', () => {
      expect(
        v.isValid({ originalname: 'x', mimetype: 'image/png' } as never),
      ).toBe(false);
    });
  });

  describe('ParseFilePipe (attachment stack)', () => {
    let pipe: ParseFilePipe;

    beforeEach(() => {
      pipe = new ParseFilePipe({
        validators: [
          new InclusiveMaxAttachmentSizeValidator(),
          new AllowedAttachmentMimeTypeValidator(),
        ],
      });
    });

    it('resolves valid text/plain uploads', async () => {
      const f = file({
        mimetype: 'text/plain',
        size: 100,
        originalname: 'notes.txt',
      });
      await expect(pipe.transform(f)).resolves.toBe(f);
    });

    it('rejects missing file with clear message', async () => {
      await expect(pipe.transform(undefined)).rejects.toMatchObject({
        response: expect.objectContaining({
          message: 'File is required',
          statusCode: 400,
        }),
      });
    });

    it('rejects MIME outside allowlist via BadRequest', async () => {
      await expect(
        pipe.transform(
          file({
            mimetype: 'video/mp4',
            size: 10,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects oversize via BadRequest', async () => {
      await expect(
        pipe.transform(
          file({
            mimetype: 'image/png',
            size: MAX_ATTACHMENT_BYTES + 1,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
