// Defense in depth: message bodies are also rendered as React text nodes (never dangerouslySetInnerHTML),
// so a stray "<" is harmless on screen. Stripping markup before storage keeps the database clean for any
// future non-React consumer (email digests, exports, admin tooling).

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// Tag-shaped sequences only, so text like "BP < 90 and > 60" survives untouched.
const TAG_LIKE = /<\/?[a-zA-Z!?][^<>]*>/g;

export function sanitizeMessageBody(input: string): string {
  let out = input.normalize("NFC").replace(CONTROL_CHARS, "").replace(/\r\n?/g, "\n");

  // Repeat until stable so nested fragments such as "<scr<script>ipt>" cannot reassemble into a tag.
  let previous: string;
  do {
    previous = out;
    out = out.replace(TAG_LIKE, "");
  } while (out !== previous);

  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
