/**
 * Base URL configuration for the application.
 * Used for OAuth client metadata and other features requiring a public URL.
 */

const DEFAULT_BASE_URL = "http://localhost:3000";

/**
 * Server-side base URL (can be used in API routes and server components).
 * Falls back to localhost for development.
 */
export const BASE_URL: string =
  process.env.BASE_URL || DEFAULT_BASE_URL;

/**
 * Client-side base URL (available in browser).
 * Must be prefixed with NEXT_PUBLIC_ to be accessible on the client.
 * Falls back to localhost for development.
 */
export const NEXT_PUBLIC_BASE_URL: string =
  process.env.NEXT_PUBLIC_BASE_URL || DEFAULT_BASE_URL;

/**
 * Type-safe configuration object for base URL settings.
 */
export interface BaseUrlConfig {
  baseUrl: string;
  nextPublicBaseUrl: string;
}

/**
 * Get the complete base URL configuration.
 */
export function getBaseUrlConfig(): BaseUrlConfig {
  return {
    baseUrl: BASE_URL,
    nextPublicBaseUrl: NEXT_PUBLIC_BASE_URL,
  };
}
