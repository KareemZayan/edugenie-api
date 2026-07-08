import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RefreshTokenDocument = RefreshToken & Document;

/**
 * Why a refresh token stopped being live.
 * - ROTATION: superseded by its own rotation. A replay within the short grace
 *   window is a benign multi-tab race and is forgiven.
 * - THEFT: force-revoked because reuse/leak (or a dead account) was detected.
 * - LOGOUT: force-revoked by an explicit logout / logout-all.
 * THEFT and LOGOUT are terminal — a token revoked for either reason must never
 * be revived, even inside the rotation grace window.
 */
export enum RefreshTokenRevokeReason {
  ROTATION = 'rotation',
  THEFT = 'theft',
  LOGOUT = 'logout',
}

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

  /**
   * Why the token was revoked (see RefreshTokenRevokeReason). Null while live.
   * Only ROTATION is eligible for the benign grace window; THEFT/LOGOUT (and any
   * legacy/unknown value) are terminal and can never mint a successor.
   */
  @Prop({ type: String, enum: RefreshTokenRevokeReason, default: null })
  revokeReason: RefreshTokenRevokeReason | null;

  @Prop({ default: 'Unknown device' })
  device: string;

  @Prop({ default: '' })
  ip: string;

  // TTL index: Mongo removes the document once expiresAt passes.
  @Prop({ required: true, type: Date, expires: 0 })
  expiresAt: Date;
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
