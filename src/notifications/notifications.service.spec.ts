import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SendonService } from '../sendon/sendon.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  const sendonService = {
    sendAlimtalk: jest.fn(),
  };

  beforeEach(async () => {
    sendonService.sendAlimtalk.mockReset();
    sendonService.sendAlimtalk.mockResolvedValue({
      provider: 'sendon',
      status: 'accepted',
      requestId: 'mock-1',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: SendonService,
          useValue: sendonService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('normalizes recipient phone and forwards request to SendonService', async () => {
    await service.sendKakaoAlimtalk({
      recipientPhone: '010-1234-5678',
      templateCode: 'WELCOME',
      message: 'hello',
    });

    expect(sendonService.sendAlimtalk).toHaveBeenCalledWith({
      recipientPhone: '01012345678',
      templateCode: 'WELCOME',
      message: 'hello',
      templateVariables: undefined,
    });
  });

  it('throws when recipient phone is missing', async () => {
    await expect(
      service.sendKakaoAlimtalk({
        recipientPhone: '',
        templateCode: 'WELCOME',
        message: 'hello',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
