import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { AttachmentService } from './attachment.service';
import { Attachment } from './attachment.entity';
import { TicketService } from '../ticket/ticket.service';

const now = new Date();

const mockAttachment: Attachment = {
  id: 1,
  ticketId: 1,
  ticket: undefined as never,
  filename: 'screenshot.png',
  contentType: 'image/png',
  size: 1024,
  createdAt: now,
};

const makeFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File =>
  ({
    originalname: 'screenshot.png',
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.alloc(1024),
    ...overrides,
  }) as Express.Multer.File;

describe('AttachmentService', () => {
  let service: AttachmentService;
  let repo: jest.Mocked<Repository<Attachment>>;
  let ticketService: jest.Mocked<TicketService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentService,
        {
          provide: getRepositoryToken(Attachment),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOneBy: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: TicketService,
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AttachmentService>(AttachmentService);
    repo = module.get(getRepositoryToken(Attachment));
    ticketService = module.get(TicketService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------- upload ----------

  describe('upload', () => {
    it('should validate the ticket and save attachment metadata', async () => {
      ticketService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockAttachment);
      repo.save.mockResolvedValue(mockAttachment);

      const result = await service.upload(1, makeFile());
      expect(result).toEqual(mockAttachment);
      expect(ticketService.findOne).toHaveBeenCalledWith(1);
    });

    it('should strip path traversal sequences from filename', async () => {
      ticketService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockAttachment);
      repo.save.mockResolvedValue(mockAttachment);

      await service.upload(
        1,
        makeFile({ originalname: '../../../etc/passwd' }),
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'passwd' }),
      );
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      ticketService.findOne.mockRejectedValue(
        new NotFoundException('Ticket with ID 999 not found'),
      );

      await expect(service.upload(999, makeFile())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------- remove ----------

  describe('remove', () => {
    it('should delete the attachment', async () => {
      repo.findOneBy.mockResolvedValue(mockAttachment);
      repo.remove.mockResolvedValue(mockAttachment);

      await expect(service.remove(1, 1)).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(mockAttachment);
    });

    it('should throw NotFoundException when attachment does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.remove(1, 999)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when attachment belongs to a different ticket', async () => {
      repo.findOneBy.mockResolvedValue({ ...mockAttachment, ticketId: 99 });
      await expect(service.remove(1, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
