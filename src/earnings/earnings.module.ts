import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Earning, EarningSchema } from './schema/earning.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Earning.name, schema: EarningSchema }])],
  exports: [MongooseModule],
})
export class EarningsModule {}
