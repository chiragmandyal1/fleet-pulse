import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Written by the simulator's seed step; the API only reads it. */
@Schema({ collection: 'customers' })
export class Customer {
  @Prop({ required: true, unique: true })
  customerId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  sector!: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
