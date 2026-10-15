import { hash } from "@node-rs/argon2";
import type { PrismaClient } from "../lib/generated/prisma/client";

/**
 * Development-only demo data.
 *
 * Creates login-able accounts to develop against: one association admin and a
 * few members, each with an opened savings account.
 *
 * NOTE ON BALANCES: the accounts are created at zero. Balances are not written
 * directly here, ever — a balance that appears without a matching ledger row
 * is precisely the corruption this system is built to prevent, and a seed
 * script is not exempt from that rule. Demo money is posted afterwards through
 * the real ledger service (`npm run db:seed:transactions`), so the demo data
 * exercises the same code path production does.
 *
 * Guarded by SEED_DEMO=true and a non-production NODE_ENV in seed.ts.
 */

const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

const DEMO_PASSWORD = "DemoPass123!";

interface DemoMemberSpec {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  occupation: string;
  gender: "MALE" | "FEMALE";
  mobileMoneyNumber: string;
}

const DEMO_MEMBERS: DemoMemberSpec[] = [
  {
    firstName: "Jean",
    lastName: "Uwimana",
    email: "jean.uwimana@example.rw",
    phone: "+250788100001",
    occupation: "Tailor",
    gender: "MALE",
    mobileMoneyNumber: "0788100001",
  },
  {
    firstName: "Claudine",
    lastName: "Mukamana",
    email: "claudine.mukamana@example.rw",
    phone: "+250788100002",
    occupation: "Fashion Designer",
    gender: "FEMALE",
    mobileMoneyNumber: "0788100002",
  },
  {
    firstName: "Eric",
    lastName: "Habimana",
    email: "eric.habimana@example.rw",
    phone: "+250788100003",
    occupation: "Tailor",
    gender: "MALE",
    mobileMoneyNumber: "0788100003",
  },
  {
    firstName: "Alice",
    lastName: "Ingabire",
    email: "alice.ingabire@example.rw",
    phone: "+250788100004",
    occupation: "Textile Trader",
    gender: "FEMALE",
    mobileMoneyNumber: "0788100004",
  },
];

export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  console.log("→ demo data (development only)");

  const association = await prisma.association.findUnique({
    where: { code: "RTA" },
  });
  if (!association) throw new Error("RTA association must be seeded first");

  const passwordHash = await hash(DEMO_PASSWORD, ARGON2_OPTIONS);

  // Association admin ------------------------------------------------------
  const adminEmail = "admin@rta.org.rw";
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        associationId: association.id,
        email: adminEmail,
        phone: "+250788562837",
        firstName: "Daniel",
        lastName: "Nshimiyimana",
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
      },
    });
    console.log(`  admin: ${adminEmail}`);
  } else {
    console.log(`  admin: ${adminEmail} (exists)`);
  }

  // Members ----------------------------------------------------------------
  let created = 0;

  for (const spec of DEMO_MEMBERS) {
    const existing = await prisma.user.findUnique({ where: { email: spec.email } });
    if (existing) continue;

    // Claim the next member number atomically, the same way the real
    // registration flow does, rather than counting rows.
    const updated = await prisma.association.update({
      where: { id: association.id },
      data: { memberRefSequence: { increment: 1 } },
      select: { memberRefSequence: true },
    });

    const sequence = String(updated.memberRefSequence).padStart(6, "0");
    const memberNumber = `${association.code}-M${sequence}`;
    const paymentReference = `${association.code}-${sequence}`;

    await prisma.user.create({
      data: {
        associationId: association.id,
        email: spec.email,
        phone: spec.phone,
        firstName: spec.firstName,
        lastName: spec.lastName,
        passwordHash,
        role: "MEMBER",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
        member: {
          create: {
            associationId: association.id,
            memberNumber,
            paymentReference,
            status: "ACTIVE",
            kycStatus: "VERIFIED",
            occupation: spec.occupation,
            gender: spec.gender,
            city: "Kigali",
            district: "Kicukiro",
            province: "Kigali City",
            mobileMoneyNumber: spec.mobileMoneyNumber,
            joinedAt: new Date(Date.now() - 180 * 86_400_000),
            approvedAt: new Date(Date.now() - 180 * 86_400_000),
            savingsAccounts: {
              create: {
                associationId: association.id,
                accountNumber: `${association.code}-SA-${sequence}`,
                currency: association.currency,
                // Zero. Money arrives through the ledger, never through a seed.
                balance: "0",
              },
            },
          },
        },
      },
    });

    created++;
  }

  console.log(`  ${created} demo members created (password: ${DEMO_PASSWORD})`);
  console.log("  balances are zero — post demo deposits via the ledger service");
}
