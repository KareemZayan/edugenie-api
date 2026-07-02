import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RefreshTokenDocument = RefreshToken & Document;

/**
 * A server-side record of one refresh token in a rotation chain.
 *
 * Only the sha256 hash of the raw token is stored (same at-rest policy as
 * AdminInvite / the email-verification codes). Every rotation revokes the
 * current row and inserts a successor sharing the same `family`, so a replay
 * of an already-rotated token can be detected and the whole family revoked.
 */
@Schema()
export class RefreshToken {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  tokenHash: string;

  /** Rotation-chain id — one login session = one family across rotations. */
  @Prop({ required: true, index: true })
  family: string;

  /** Set when rotated (superseded) or revoked; null while the token is live. */
  @Prop({ type: Date, default: null })
  revokedAt: Date | null;

  @Prop({ default: 'Unknown device' })
  device: string;

  @Prop({ default: '' })
  ip: string;

  // TTL index: Mongo removes the document once expiresAt passes.
  @Prop({ required: true, type: Date, expires: 0 })
  expiresAt: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
