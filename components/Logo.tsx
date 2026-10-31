import Link from "@/components/SiteLink";
import Image from "next/image";

interface LogoProps {
  variant?: "light" | "dark";
  className?: string;
}

export default function Logo({ variant = "dark", className }: LogoProps) {
  const isLight = variant === "light";

  return (
    <Link
      href="/rta"
      aria-label="Rwanda Tailors Association — home"
      className={`flex items-center gap-3 ${className ?? ""}`}
    >
      <Image
        src="/images/rtalogo.jpg"
        alt="Rwanda Tailors Association logo"
        width={44}
        height={44}
        className="size-11 shrink-0 rounded-full object-cover"
      />
      <span className="leading-tight">
        <span
          className={`block font-heading text-lg font-bold tracking-tight sm:hidden ${
            isLight ? "text-white" : "text-ink"
          }`}
        >
          RTA
        </span>
        <span
          className={`hidden font-heading text-[15px] font-bold tracking-tight sm:block sm:text-[17px] ${
            isLight ? "text-white" : "text-ink"
          }`}
        >
          RWANDA TAILORS
        </span>
        <span className="hidden font-heading text-[11px] font-semibold tracking-[0.2em] text-primary sm:block sm:text-xs">
          ASSOCIATION
        </span>
      </span>
    </Link>
  );
}
