import { Injectable, Logger } from '@nestjs/common';
import Pusher from 'pusher';

@Injectable()
export class PusherService {
  private readonly logger = new Logger(PusherService.name);
  private pusher: Pusher;

  constructor() {
    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.PUSHER_CLUSTER;

    this.logger.log(
      `Pusher init → appId=${appId ? '✅' : '❌MISSING'} key=${key ? '✅' : '❌MISSING'} secret=${secret ? '✅' : '❌MISSING'} cluster=${cluster ?? '❌MISSING'}`,
    );

    this.pusher = new Pusher({
      appId: appId!,
      key: key!,
      secret: secret!,
      cluster: cluster!,
      useTLS: true,
    });
  }

  async trigger(channel: string, event: string, data: any) {
    this.logger.log(`Triggering Pusher → channel=${channel} event=${event}`);
    try {
      const result = await this.pusher.trigger(channel, event, data);
      this.logger.log(`Pusher trigger SUCCESS for channel=${channel}`);
      return result;
    } catch (err) {
      this.logger.error(`Pusher trigger FAILED for channel=${channel}`, err);
      throw err;
    }
  }
}
