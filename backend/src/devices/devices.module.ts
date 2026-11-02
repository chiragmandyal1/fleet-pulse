import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from './customer.schema.js';
import { Device, DeviceSchema } from './device.schema.js';
import { DevicesController, FleetController } from './devices.controller.js';
import { DevicesService } from './devices.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Device.name, schema: DeviceSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [DevicesController, FleetController],
  providers: [DevicesService],
})
export class DevicesModule {}
