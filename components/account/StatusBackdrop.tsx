import type { CSSProperties } from "react";

/**
 * The moving 3D scene behind the account status page. Pure CSS — no canvas,
 * no WebGL, no client JavaScript — so it costs nothing to hydrate and stops
 * entirely for anyone who has asked their system for reduced motion (the
 * page's `motion-safe-status` wrapper switches every animation off).
 *
 * Three layers, back to front:
 *   1. Soft coloured lights drifting slowly — the gradient's glow.
 *   2. A grid floor laid back in perspective, sliding toward the viewer.
 *   3. A gyroscope of three rings turning in space, and glass orbs bobbing
 *      in and out of depth.
 *
 * Everything is faint on purpose: the lists in front carry money, and the
 * scene must never compete with a figure for the reader's eye. The rings and
 * orbs only appear on screens wide enough to leave empty margins beside the
 * lists, and they are placed in those margins — never behind a line of text.
 * On a phone the scene is just the lights and the floor.
 */
export function StatusBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [perspective:1100px]"
    >
      {/* 1. Drifting lights */}
      <div className="absolute -right-24 -top-24 size-80 animate-status-drift rounded-full bg-primary-light/25 blur-3xl" />
      <div className="absolute -bottom-32 -left-20 size-96 animate-status-drift rounded-full bg-white/[0.06] blur-3xl [animation-delay:-9s] [animation-direction:alternate-reverse]" />
      <div className="absolute left-1/3 top-1/2 size-72 animate-status-drift rounded-full bg-sky-400/10 blur-3xl [animation-duration:24s]" />

      {/* 2. Perspective grid floor */}
      <div
        className="absolute -inset-x-1/2 bottom-[-15%] h-[65%] origin-bottom [transform:rotateX(74deg)] [mask-image:linear-gradient(to_top,black_10%,transparent_85%)]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(141,180,227,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(141,180,227,0.14) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          animation: "status-grid 3.5s linear infinite",
        }}
      />

      {/* 3a. Gyroscope of rings, in the right-hand margin */}
      <div className="absolute -right-44 top-16 hidden size-[400px] opacity-80 xl:block 2xl:-right-24">
        <div
          className="relative size-full [transform-style:preserve-3d]"
          style={{ animation: "status-gyro 40s linear infinite" }}
        >
          <Ring className="border-primary-light/35" tilt="0deg" duration="22s" />
          <Ring className="inset-8 border-white/20" tilt="60deg" duration="28s" reverse />
          <Ring className="inset-16 border-sky-300/30" tilt="120deg" duration="18s" />
          {/* The glowing core the rings turn around. */}
          <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-light/30 blur-xl" />
        </div>
      </div>

      {/* 3b. Glass orbs, in the margins either side */}
      <Orb className="left-[5%] top-[22%] size-20" duration="9s" />
      <Orb className="right-[6%] top-[68%] size-14" duration="11s" delay="-4s" />
      <Orb className="bottom-[10%] left-[9%] size-10" duration="7s" delay="-2s" />
    </div>
  );
}

function Ring({
  className,
  tilt,
  duration,
  reverse,
}: {
  className: string;
  tilt: string;
  duration: string;
  reverse?: boolean;
}) {
  return (
    <div
      className={`absolute rounded-full border-2 shadow-[0_0_30px_rgba(141,180,227,0.25)] ${className} ${className.includes("inset-") ? "" : "inset-0"}`}
      style={
        {
          "--ring-tilt": tilt,
          animation: `status-ring ${duration} linear infinite${reverse ? " reverse" : ""}`,
        } as CSSProperties
      }
    />
  );
}

function Orb({
  className,
  duration,
  delay = "0s",
}: {
  className: string;
  duration: string;
  delay?: string;
}) {
  return (
    <div
      className={`absolute hidden rounded-full xl:block shadow-[inset_-6px_-10px_20px_rgba(11,27,51,0.45),0_10px_30px_rgba(11,27,51,0.35)] ${className}`}
      style={{
        background:
          "radial-gradient(circle at 30% 28%, rgba(255,255,255,0.7), rgba(141,180,227,0.35) 32%, rgba(31,74,136,0.25) 62%, rgba(11,27,51,0.15) 100%)",
        animation: `status-orb ${duration} ease-in-out ${delay} infinite`,
      }}
    />
  );
}
