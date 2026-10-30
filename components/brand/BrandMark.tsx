import Image from "next/image";
import type { Brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * A brand's round mark: its logo where it has one, otherwise its initials on
 * the brand blue. A newly onboarded association has no artwork yet, and a
 * blank circle — or RTA's logo standing in — would say the wrong thing.
 */
export function BrandMark({
  brand,
  size,
  className,
  priority,
}: {
  brand: Brand;
  /// Rendered pixel size, for the image request; `className` sets the box.
  size: number;
  className?: string;
  priority?: boolean;
}) {
  if (brand.logo) {
    return (
      <Image
        src={brand.logo}
        alt=""
        width={size}
        height={size}
        priority={priority}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ fontSize: Math.round(size * 0.34) }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-light font-heading font-bold tracking-wide text-white",
        className
      )}
    >
      {brand.mark.slice(0, 2)}
    </span>
  );
}
