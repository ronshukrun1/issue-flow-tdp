import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AttachmentController } from './attachment.controller';
import { AttachmentService } from './attachment.service';
import { Attachment } from './attachment.entity';

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

describe('AttachmentController', () => {
  let controller: AttachmentController;
  let service: jest.Mocked<AttachmentService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentController],
      providers: [
        {
          provide: AttachmentService,
          useValue: {
            upload: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AttachmentController>(AttachmentController);
    service = module.get(AttachmentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------- upload ----------

  describe('upload', () => {
    it('should delegate to service and return attachment metadata', async () => {
      service.upload.mockResolvedValue(mockAttachment);
      const file = { originalname: 'screenshot.png' } as Express.Multer.File;

      const result = await controller.upload(1, file);
      expect(result).toEqual(mockAttachment);
      expect(service.upload).toHaveBeenCalledWith(1, file);
    });

    it('should propagate NotFoundException for missing ticket', async () => {
      service.upload.mockRejectedValue(
        new NotFoundException('Ticket with ID 999 not found'),
      );
      const file = {} as Express.Multer.File;

      await expect(controller.upload(999, file)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------- remove ----------

  describe('remove', () => {
    it('should delegate to service', async () => {
      service.remove.mockResolvedValue(undefined);
      await expect(controller.remove(1, 1)).resolves.toBeUndefined();
    });

    it('should propagate NotFoundException', async () => {
      service.remove.mockRejectedValue(
        new NotFoundException('Attachment with ID 999 not found'),
      );
      await expect(controller.remove(1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
