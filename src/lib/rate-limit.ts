// In-memory fixed-window limiter. For multi-instance deployments swap the Map for Redis
// (INCR + PEXPIRE per key); the RateLimiter interface stays the same.

export type RateLimitStatus = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export interface RateLimiter {
  /** Non-consuming: is this key currently allowed to attempt? */
  check(key: string): RateLimitStatus;
  /** Records one event against the key. `allowed` says whether this event was within budget. */
  hit(key: string): RateLimitStatus;
  reset(key: string): void;
}

type Bucket = { count: number; resetAt: number };

const PRUNE_THRESHOLD = 5_000;

export function createRateLimiter(options: {
  max: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const { max, windowMs } = options;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  function live(key: string): Bucket | undefined {
    const bucket = buckets.get(key);
    if (bucket && bucket.resetAt <= now()) {
      buckets.delete(key);
      return undefined;
    }
    return bucket;
  }

  function describe(bucket: Bucket | undefined, allowed: boolean): RateLimitStatus {
    const count = bucket?.count ?? 0;
    return {
      allowed,
      remaining: Math.max(0, max - count),
      retryAfterSeconds: allowed || !bucket ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now()) / 1000)),
    };
  }

  function prune(): void {
    if (buckets.size < PRUNE_THRESHOLD) return;
    const current = now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(key);
    }
  }

  return {
    // "May this key attempt now?" - true until `max` events have been recorded.
    check(key) {
      const bucket = live(key);
      return describe(bucket, (bucket?.count ?? 0) < max);
    },
    // Records one event. The Nth event within the window is still allowed; the (N+1)th is the first refused.
    hit(key) {
      prune();
      const bucket = live(key) ?? { count: 0, resetAt: now() + windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);
      return describe(bucket, bucket.count <= max);
    },
    reset: (key) => {
      buckets.delete(key);
    },
  };
}

// --- Login throttling -------------------------------------------------------
// Two buckets: per (ip, account) stops password guessing on one account; per ip stops spraying many accounts.

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

type LoginLimiters = { byAccount: RateLimiter; byIp: RateLimiter };

// globalThis: route handlers and server actions can be bundled as separate module instances.
const globalForLimiters = globalThis as unknown as { __mediconnectLoginLimiters?: LoginLimiters };

export const loginLimiters: LoginLimiters = (globalForLimiters.__mediconnectLoginLimiters ??= {
  byAccount: createRateLimiter({ max: 5, windowMs: LOGIN_WINDOW_MS }),
  byIp: createRateLimiter({ max: 30, windowMs: LOGIN_WINDOW_MS }),
});

const accountKey = (ip: string, email: string) => `${ip}|${email.toLowerCase()}`;

export function loginRateStatus(ip: string, email: string): RateLimitStatus {
  const account = loginLimiters.byAccount.check(accountKey(ip, email));
  const byIp = loginLimiters.byIp.check(ip);
  return {
    allowed: account.allowed && byIp.allowed,
    remaining: Math.min(account.remaining, byIp.remaining),
    retryAfterSeconds: Math.max(account.retryAfterSeconds, byIp.retryAfterSeconds),
  };
}

export function recordLoginFailure(ip: string, email: string): void {
  loginLimiters.byAccount.hit(accountKey(ip, email));
  loginLimiters.byIp.hit(ip);
}

export function clearLoginFailures(ip: string, email: string): void {
  loginLimiters.byAccount.reset(accountKey(ip, email));
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

// --- Registration throttling ------------------------------------------------
const globalForRegister = globalThis as unknown as { __mediconnectRegisterLimiter?: RateLimiter };

/** Caps sign-ups per IP so the public register form cannot be used to mass-create accounts. */
export const registerLimiter: RateLimiter = (globalForRegister.__mediconnectRegisterLimiter ??=
  createRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 }));

// --- Messaging throttling ---------------------------------------------------
const globalForMessages = globalThis as unknown as { __mediconnectMessageLimiter?: RateLimiter };

/** 30 messages per user per minute: enough for a real conversation, too little for spam or scripted floods. */
export const messageLimiter: RateLimiter = (globalForMessages.__mediconnectMessageLimiter ??=
  createRateLimiter({ max: 30, windowMs: 60 * 1000 }));
