import { isTauri } from '@tauri-apps/api/core';

// Tauri has no Node.js server, so the app runs as a single-page app.
export const ssr = false;

export async function load() {
  // In a plain browser during development, fake the Rust side with sample media.
  if (import.meta.env.DEV && !isTauri()) await (await import('$lib/devHarness')).install();
}
