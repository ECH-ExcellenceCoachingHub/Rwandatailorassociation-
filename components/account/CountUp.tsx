"use client";

import { useEffect, useRef } from "react";
import { formatMoney } from "@/lib/money";

/**
 * A money figure that counts up from zero when the page opens.
 *
 * React renders the exact final figure — on the server and on the client — so
 * the amount is right without JavaScript and for anyone who has asked for
 * reduced motion. The count itself writes straight into the span's text, frame
 * by frame, rather than through state: sixty re-renders a second for a piece
 * of decoration is waste. The last frame always restores the exact figure,
 * never a float that happens to be close.
 */
export function CountUp({
  value,
  currency,
  delay = 0,
  duration = 1100,
}: {
  value: string;
  currency: string;
  /// Milliseconds before counting starts — matched to the row's own entrance.
  delay?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const final = formatMoney(value, { currency });

  useEffect(() => {
    const node = ref.current;
    const target = Number(value);
    if (
      !node ||
      !Number.isFinite(target) ||
      target === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let frame = 0;
    let start: number | null = null;
    const whole = currency === "RWF";
    const show = (amount: number) => {
      node.textContent = formatMoney(whole ? Math.round(amount) : amount.toFixed(2), {
        currency,
      });
    };

    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / duration);
      if (progress < 1) {
        // Ease-out: quick at first, settling onto the figure.
        show(target * (1 - Math.pow(1 - progress, 4)));
        frame = requestAnimationFrame(tick);
      } else {
        node.textContent = final;
      }
    };

    show(0);
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      node.textContent = final;
    };
  }, [value, currency, delay, duration, final]);

  return <span ref={ref}>{final}</span>;
}
