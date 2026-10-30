import { redirect } from "next/navigation";
import { DEFAULT_ASSOCIATION_CODE } from "@/lib/brand";

/**
 * The old registration address. Every join link handed out before the platform
 * moved to the root is a bare /register, which meant RTA; for a while they also
 * read /register?association=CODE. Both still land on the right form.
 */
export default async function LegacyRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ association?: string }>;
}) {
  const { association } = await searchParams;
  const code = /^[a-z]{2,8}$/i.test(association ?? "") ? association! : DEFAULT_ASSOCIATION_CODE;
  redirect(`/${code.toLowerCase()}/register`);
}
