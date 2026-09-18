"use client";

/**
 * Catches a failing dashboard page and keeps the sidebar around it, so the
 * reader can retry or go somewhere else. A failure in the dashboard layout
 * itself is caught one level up, by app/error.tsx.
 */
export { RouteError as default } from "@/components/dashboard/RouteError";
