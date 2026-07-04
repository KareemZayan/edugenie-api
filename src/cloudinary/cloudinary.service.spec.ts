import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from './cloudinary.service';

/**
 * Focused unit tests for the network-free signing logic. We instantiate the
 * service directly (rather than via a Nest TestingModule) so no Mongoose models
 * or Cloudinary network calls are exercised.
 */
describe('CloudinaryService.generateSignature', () => {
  const API_SECRET = 'test_secret_key';
  const WEBHOOK = 'https://api.example.com/api/cloudinary/webhook';

  const makeService = () => {
    const config = {
      get: (key: string) => {
        switch (key) {
          case 'CLOUDINARY_API_SECRET':
            return API_SECRET;
          case 'CLOUDINARY_CLOUD_NAME':
            return 'test_cloud';
          case 'CLOUDINARY_API_KEY':
            return 'test_key';
          case 'CLOUDINARY_WEBHOOK_URL':
            return WEBHOOK;
          default:
            return undefined;
        }
      },
    } as unknown as ConfigService;

    return new CloudinaryService(
      config,
      {} as any, // courseModel — unused by generateSignature
      {} as any, // pendingTranscriptModel — unused by generateSignature
      {} as any, // coursesService
      {} as any, // indexing
    );
  };

  it('omits raw_convert / notification_url when transcribe is not set', () => {
    const res = makeService().generateSignature('edugenie/x', 'courseId=1');
    expect(res.raw_convert).toBe('');
    expect(res.notification_url).toBe('');

    const expected = cloudinary.utils.api_sign_request(
      { timestamp: res.timestamp, folder: 'edugenie/x', context: 'courseId=1' },
      API_SECRET,
    );
    expect(res.signature).toBe(expected);
  });

  it('signs raw_convert + notification_url when transcribe is true', () => {
    const res = makeService().generateSignature(
      'edugenie/x',
      'courseId=1',
      true,
    );
    expect(res.raw_convert).toBe('google_speech');
    expect(res.notification_url).toBe(WEBHOOK);

    // The signature MUST cover the exact params (including raw_convert +
    // notification_url) the frontend will re-send, or Cloudinary rejects it.
    const expected = cloudinary.utils.api_sign_request(
      {
        timestamp: res.timestamp,
        folder: 'edugenie/x',
        context: 'courseId=1',
        raw_convert: 'google_speech',
        notification_url: WEBHOOK,
      },
      API_SECRET,
    );
    expect(res.signature).toBe(expected);
  });
});
