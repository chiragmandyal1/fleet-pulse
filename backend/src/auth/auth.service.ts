import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable, Logger, OnApplicationBootstrap, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser, JwtPayload, Role } from './auth.types.js';
import { User } from './user.schema.js';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** Node's built-in scrypt: a memory-hard KDF, so no bcrypt dependency is needed. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scryptAsync(password, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Seeded on an empty database so the dashboard can be logged into straight away. */
const DEMO_USERS: { email: string; role: Role; customerId?: string }[] = [
  { email: 'admin@fleetpulse.dev', role: 'admin' },
  { email: 'viewer@fleetpulse.dev', role: 'viewer' },
  { email: 'northwind@fleetpulse.dev', role: 'customer', customerId: 'cust-northwind' },
];

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly log = new Logger(AuthService.name);
  /** Checked against when the email is unknown, so both failures take as long. */
  private dummyHash?: Promise<string>;

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string; user: AuthUser }> {
    const user = await this.users.findOne({ email: email.trim().toLowerCase() }).lean();
    this.dummyHash ??= hashPassword('not-a-real-password');
    const ok = await verifyPassword(password, user?.passwordHash ?? (await this.dummyHash));
    // One message for both cases: don't reveal which emails have accounts.
    if (!user || !ok) throw new UnauthorizedException('invalid email or password');

    const me: AuthUser = { email: user.email, role: user.role, customerId: user.customerId };
    const payload: JwtPayload = { sub: me.email, role: me.role, customerId: me.customerId };
    return { accessToken: await this.jwt.signAsync(payload), user: me };
  }

  async onApplicationBootstrap(): Promise<void> {
    if (await this.users.estimatedDocumentCount()) return;
    const password = this.config.getOrThrow<string>('demoPassword');
    await this.users.insertMany(
      await Promise.all(
        DEMO_USERS.map(async (u) => ({ ...u, passwordHash: await hashPassword(password) })),
      ),
    );
    this.log.log(`created ${DEMO_USERS.length} demo users`);
  }
}
