"use client";

/**
 * Last-resort boundary under the root layout. It exists mainly for the
 * dashboard layout, which loads the session before anything renders — an error
 * boundary never catches its own segment's layout, so without this one a
 * dropped database connection there showed the framework's error screen.
 */
export { RouteError as default } from "@/components/dashboard/RouteError";
