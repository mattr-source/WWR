/**
 * Whether the Field Sandbox link is shown. On unless the build sets
 * VITE_WWR_SANDBOX=off. The sandbox writes only to this browser, so leaving it
 * on changes no account; the switch exists so a release can hide it.
 */
export const SANDBOX_ENABLED = import.meta.env.VITE_WWR_SANDBOX !== 'off';
export const SANDBOX_PATH = '/sandbox';
