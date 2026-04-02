import { describe, expect, it } from "vitest";
import { clientIpFromHeaders, createRateLimiter } from "@/lib/rate-limit";

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("createRateLimiter", () => {
  it("allows up to max events and then blocks", () => {
    const time = clock();
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: time.now });
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.check("k").allowed).toBe(true);
      limiter.hit("k");
    }
    expect(limiter.check("k").allowed).toBe(false);
  });

  it("hit() allows exactly `max` events in a window and refuses the next one", () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 60_000, now: clock().now });
    expect([1, 2, 3, 4, 5].map(() => limiter.hit("k").allowed)).toEqual([true, true, true, false, false]);
    expect(limiter.hit("other").remaining).toBe(2);
  });

  it("check() does not consume an attempt", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock().now });
    for (let i = 0; i < 10; i += 1) limiter.check("k");
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("reports how long until the window resets", () => {
    const time = clock();
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: time.now });
    limiter.hit("k");
    time.advance(20_000);
    const status = limiter.check("k");
    expect(status.allowed).toBe(false);
    expect(status.retryAfterSeconds).toBe(40);
  });

  it("recovers after the window elapses", () => {
    const time = clock();
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: time.now });
    limiter.hit("k");
    expect(limiter.check("k").allowed).toBe(false);
    time.advance(60_001);
    expect(limiter.check("k").allowed).toBe(true);
  });

  it("isolates keys from each other and supports reset", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000, now: clock().now });
    limiter.hit("a");
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("does not extend the window on every hit (fixed window)", () => {
    const time = clock();
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000, now: time.now });
    limiter.hit("k");
    time.advance(50_000);
    limiter.hit("k");
    time.advance(11_000);
    expect(limiter.check("k").allowed).toBe(true);
  });
});

describe("clientIpFromHeaders", () => {
  it("uses the first x-forwarded-for entry", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip and then to unknown", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});
