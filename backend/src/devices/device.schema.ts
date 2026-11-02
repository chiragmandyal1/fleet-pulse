import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DeviceDocument = HydratedDocument<Device>;

/** Fixed dish, moving terminal, or a hybrid link that fails over to cellular. */
export type DeviceKind = 'fixed' | 'mobile' | 'hybrid';

export type Beam = 'North' | 'East' | 'West' | 'South';

/** Cellular backup SIM: hybrid terminals fail over to it, mobile ones carry one. */
export interface Sim {
  iccid: string;
  carrier: string;
  planGb: number;
}

@Schema({ collection: 'devices', timestamps: true })
export class Device {
  /** Stable public id, e.g. FP-00042. This is what telemetry rows reference. */
  @Prop({ required: true, unique: true, index: true })
  deviceId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: String, required: true, enum: ['fixed', 'mobile', 'hybrid'] })
  kind!: DeviceKind;

  /**
   * Owning customer. Every telemetry read is scoped by this, so a customer
   * role can only ever reach its own devices (see milestone 2).
   */
  @Prop({ required: true, index: true })
  customerId!: string;

  @Prop({ required: true })
  site!: string;

  @Prop({ required: true })
  lat!: number;

  @Prop({ required: true })
  lon!: number;

  /** Below this, RF signal counts as degraded on the drilldown chart. */
  @Prop({ required: true, default: 8 })
  rfThreshold!: number;

  @Prop({ required: true })
  satellite!: string;

  @Prop({ type: String, required: true, enum: ['North', 'East', 'West', 'South'] })
  beam!: Beam;

  @Prop({ type: Object })
  sim?: Sim;
}

export const DeviceSchema = SchemaFactory.createForClass(Device);
