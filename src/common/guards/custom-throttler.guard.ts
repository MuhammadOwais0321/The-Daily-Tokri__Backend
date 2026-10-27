import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  user?: { id?: string };
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    const request = req as unknown as RequestLike;

    const rawAuthHeader =
      request.headers?.['authorization'] || request.headers?.['Authorization'];
    const authHeader: string | undefined = Array.isArray(rawAuthHeader)
      ? rawAuthHeader[0]
      : rawAuthHeader;

    if (authHeader && typeof authHeader === 'string') {
      const sub = this.extractSubFromJwt(authHeader);
      if (sub) {
        return sub;
      }
    }

    if (request.user?.id && typeof request.user.id === 'string') {
      return request.user.id;
    }

    const xForwardedFor = request.headers?.['x-forwarded-for'];
    const xForwardedForStr = Array.isArray(xForwardedFor)
      ? xForwardedFor[0]
      : xForwardedFor;

    const ip =
      request.ip ||
      (typeof xForwardedForStr === 'string'
        ? xForwardedForStr.split(',')[0].trim()
        : request.socket?.remoteAddress);

    return super.getTracker({
      ...(req as Record<string, unknown>),
      ip: ip || '127.0.0.1',
    });
  }

  private extractSubFromJwt(authHeader: string): string | null {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      return null;
    }

    const token = parts[1];
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      return null;
    }

    try {
      const payloadJson = Buffer.from(tokenParts[1], 'base64url').toString(
        'utf8',
      );
      const payload = JSON.parse(payloadJson) as { sub?: unknown };
      if (payload && typeof payload.sub === 'string' && payload.sub.trim()) {
        return payload.sub.trim();
      }
    } catch {
      return null;
    }

    return null;
  }
}
