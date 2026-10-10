import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { prisma } from "../lib/db/prisma";

const EMAIL = "verify-growth@rta.test";
const PASSWORD = "Verify-Growth-2026!";

async function main() {
  const association = await prisma.association.findUnique({
    where: { code: "RTA" },
    select: { id: true },
  });
  if (!association) throw new Error("RTA association not found");

  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.user.create({
    data: {
      associationId: association.id,
      email: EMAIL,
      firstName: "Growth",
      lastName: "Verifier",
      phone: "+250788000001",
      passwordHash: await hash(PASSWORD, {
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
        outputLen: 32,
      }),
      role: "ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
    },
  });
  console.log("created", EMAIL);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
