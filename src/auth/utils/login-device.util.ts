import * as crypto from 'crypto';
import { UAParser } from 'ua-parser-js';

export function getFingerprint(userAgent: string): string {
  return crypto
    .createHash('sha256')
    .update(userAgent || 'unknown')
    .digest('hex');
}

export function parseDevice(userAgent: string): string {
  if (!userAgent) return 'Unknown device';
  const result = new UAParser(userAgent).getResult();
  const browser = result.browser.name || 'Unknown browser';
  const os = result.os.name || 'Unknown OS';
  return `${browser} on ${os}`;
}

const PRIVATE_IP_REGEX =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|::1|localhost)/;

export async function getLocationFromIp(ip: string): Promise<string> {
  if (!ip || PRIVATE_IP_REGEX.test(ip)) {
    return 'Unknown location (local/dev)';
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,city,country`,
    );
    const data = await res.json();
    if (data.status === 'success') {
      return (
        [data.city, data.country].filter(Boolean).join(', ') ||
        'Unknown location'
      );
    }
    return 'Unknown location';
  } catch {
    return 'Unknown location';
  }
}

export function extractClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}
