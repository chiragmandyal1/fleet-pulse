import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ROLES, type Role } from './auth.types.js';

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  /** scrypt, `salt:hash` in hex. */
  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ type: String, required: true, enum: ROLES })
  role!: Role;

  /** Set only for the customer role: the one customer this user can see. */
  @Prop()
  customerId?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
