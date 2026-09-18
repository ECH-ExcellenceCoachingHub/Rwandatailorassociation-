import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { acceptPhotoDataUrl } from "@/lib/images/photo";
import { loginSchema, registerSchema } from "@/lib/validation/auth";

/**
 * The photographs and the questions that were added to the application form.
 *
 * TWO CLAIMS ARE PINNED HERE, because both fail quietly rather than loudly.
 *
 * The first is that a photograph is what it says it is. The browser sends a
 * `data:` URL whose media type is a string the sender chose, so "image/png" in
 * front of a JavaScript file is a claim with nothing behind it. If the magic
 * bytes are not checked, that file is stored, served back with an image
 * content type, and nothing goes wrong until it does.
 *
 * The second is that a successor is recorded whole or not at all. The
 * warehouse counter matches a face to a name and settles ties on the ID
 * number; a row carrying only a name looks answered and answers nothing, and
 * nobody finds out until somebody is standing at the counter.
 */

/**
 * A real PNG of a given size, built rather than fixtured.
 *
 * Small enough to inline, and genuinely decodable — the point of these tests
 * is that the header parser is reading a true PNG header, which a handful of
 * bytes pretending to be one would not prove.
 */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA, which is what a circular crop needs
  // compression, filter and interlace all take their only defined value.

  // One filter byte per row, then four channels per pixel, all zero.
  const raw = Buffer.alloc(height * (1 + width * 4));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const dataUrl = (bytes: Buffer) => `data:image/png;base64,${bytes.toString("base64")}`;

/** A complete, valid application, for tests that remove one thing from it. */
function application(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "Jean",
    lastName: "Uwimana",
    email: "jean@example.com",
    phone: "0788123456",
    sharesSubscribed: "3",
    hasCompany: "NO",
    hasProfessionalCertificate: "YES",
    photo: dataUrl(png(512, 512)),
    password: "a-long-enough-passphrase",
    confirmPassword: "a-long-enough-passphrase",
    acceptedTerms: true,
    ...overrides,
  };
}

/** The field paths a failed parse complained about. */
function issuePaths(input: Record<string, unknown>): string[] {
  const parsed = registerSchema.safeParse(input);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => issue.path.join("."));
}

describe("accepting a photograph", () => {
  it("takes a real PNG and reports its own dimensions", () => {
    const result = acceptPhotoDataUrl(dataUrl(png(512, 512)));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.photo.mimeType).toBe("image/png");
    expect(result.photo.width).toBe(512);
    expect(result.photo.height).toBe(512);
    expect(result.photo.sizeBytes).toBe(result.photo.data.length);
  });

  it("refuses a file that merely claims to be an image", () => {
    // The oldest trick there is: the right prefix in front of the wrong bytes.
    const payload = Buffer.from("<script>alert(1)</script>").toString("base64");
    const result = acceptPhotoDataUrl(`data:image/png;base64,${payload}`);

    expect(result.ok).toBe(false);
  });

  it("refuses an image too small to print on a card", () => {
    expect(acceptPhotoDataUrl(dataUrl(png(64, 64))).ok).toBe(false);
  });

  it("refuses anything that is not a data URL at all", () => {
    expect(acceptPhotoDataUrl("https://example.com/face.png").ok).toBe(false);
    expect(acceptPhotoDataUrl("").ok).toBe(false);
  });
});

describe("signing in", () => {
  it("takes either identifier, so an applicant who gave no email still gets in", () => {
    const byPhone = loginSchema.safeParse({
      identifier: "0788123456",
      password: "x",
    });
    const byEmail = loginSchema.safeParse({
      identifier: "Jean@Example.com",
      password: "x",
    });

    expect(byPhone.success).toBe(true);
    expect(byEmail.success).toBe(true);
    if (!byPhone.success || !byEmail.success) return;

    // Normalised on the way in, both of them: the phone to E.164 and the
    // address to lower case, because that is how they are stored.
    expect(byPhone.data.identifier).toEqual({ type: "phone", value: "+250788123456" });
    expect(byEmail.data.identifier).toEqual({ type: "email", value: "jean@example.com" });
  });

  it("refuses something that is neither", () => {
    expect(loginSchema.safeParse({ identifier: "hello", password: "x" }).success).toBe(
      false
    );
  });
});

describe("the application form", () => {
  it("accepts a complete application", () => {
    expect(registerSchema.safeParse(application()).success).toBe(true);
  });

  it("does not insist on an email address", () => {
    // The phone number is the identifier this form requires. A tailor applying
    // from a phone frequently has no email, and a required-looking field with
    // no way out is a field people invent an address for — which then becomes
    // the address the association writes to.
    const parsed = registerSchema.safeParse(application({ email: undefined }));

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.email).toBeUndefined();
  });

  it("reads a blank email as no email rather than as an empty one", () => {
    const parsed = registerSchema.safeParse(application({ email: "" }));

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.email).toBeUndefined();
  });

  it("still refuses an email that is not one", () => {
    expect(issuePaths(application({ email: "not-an-address" }))).toContain("email");
  });

  it("insists on a phone number", () => {
    expect(issuePaths(application({ phone: "" }))).toContain("phone");
    expect(issuePaths(application({ phone: "12345" }))).toContain("phone");
  });

  it("insists on a photograph", () => {
    expect(issuePaths(application({ photo: "" }))).toContain("photo");
  });

  it("insists on an answer about the professional certificate", () => {
    // A no is a useful answer and a blank is not, so the question cannot be
    // skipped the way an optional field can.
    expect(issuePaths(application({ hasProfessionalCertificate: "" }))).toContain(
      "hasProfessionalCertificate"
    );
  });

  it("records a no about the certificate as a no, not as unanswered", () => {
    const parsed = registerSchema.safeParse(
      application({ hasProfessionalCertificate: "NO" })
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.hasProfessionalCertificate).toBe(false);
  });

  it("leaves the successor optional", () => {
    expect(registerSchema.safeParse(application()).success).toBe(true);
  });

  it("demands the ID and the photograph once a successor is named", () => {
    const paths = issuePaths(application({ successorName: "Alice Mukamana" }));

    expect(paths).toContain("successorNationalId");
    expect(paths).toContain("successorPhoto");
  });

  it("accepts a successor recorded in full", () => {
    const parsed = registerSchema.safeParse(
      application({
        successorName: "Alice Mukamana",
        successorPhone: "0788123457",
        successorNationalId: "1199012345678901",
        successorPhoto: dataUrl(png(512, 512)),
      })
    );

    expect(parsed.success).toBe(true);
  });

  it("holds a successor's ID to the same 16 digits as the member's", () => {
    const paths = issuePaths(
      application({
        successorName: "Alice Mukamana",
        successorNationalId: "1234",
        successorPhoto: dataUrl(png(512, 512)),
      })
    );

    expect(paths).toContain("successorNationalId");
  });
});
