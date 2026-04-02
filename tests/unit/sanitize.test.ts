import { describe, expect, it } from "vitest";
import { sanitizeMessageBody } from "@/lib/sanitize";

describe("sanitizeMessageBody", () => {
  it("strips script and other tags but keeps their text", () => {
    expect(sanitizeMessageBody("<script>alert(1)</script>hello")).toBe("alert(1)hello");
    expect(sanitizeMessageBody("<b>bold</b> and <i>italic</i>")).toBe("bold and italic");
  });

  it("strips tags that carry event-handler attributes", () => {
    expect(sanitizeMessageBody('<img src=x onerror="alert(1)">Hi')).toBe("Hi");
  });

  it("cannot be defeated by nested fragments that reassemble into a tag", () => {
    expect(sanitizeMessageBody("<scr<script>ipt>alert(1)</scr</script>ipt>")).not.toMatch(/<\/?script/i);
    expect(sanitizeMessageBody("<<b>script>x")).not.toMatch(/<script/i);
  });

  it("leaves ordinary clinical text with comparison operators intact", () => {
    expect(sanitizeMessageBody("BP was < 90 and HR > 100")).toBe("BP was < 90 and HR > 100");
  });

  it("removes control characters but preserves newlines", () => {
    expect(sanitizeMessageBody("a\u0000b\u0007c\nd")).toBe("abc\nd");
  });

  it("normalises line endings, trailing spaces and blank-line runs", () => {
    expect(sanitizeMessageBody("one  \r\n\r\n\r\n\r\ntwo")).toBe("one\n\ntwo");
  });

  it("trims and returns an empty string for markup-only input", () => {
    expect(sanitizeMessageBody("  <div></div>  ")).toBe("");
  });

  it("does not HTML-escape (React escapes on render; double-escaping would show &amp;)", () => {
    expect(sanitizeMessageBody("Tom & Jerry")).toBe("Tom & Jerry");
  });
});
