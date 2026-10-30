import { AuthShell } from "@/components/auth/AuthShell";
import { PLATFORM_BRAND } from "@/lib/brand";

/**
 * Authentication layout for the platform's root pages — /login,
 * /forgot-password and the rest — so they carry SSPSG's name. Each
 * association's own sign-in (/rta/login, /abc/login) draws the same AuthShell
 * with its brand; every account can sign in at any of them.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AuthShell brand={PLATFORM_BRAND}>{children}</AuthShell>;
}
