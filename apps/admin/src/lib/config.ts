/** The Management API origin, fixed at build time per mode (see `vite.config.ts`). */
export const API_URL: string = import.meta.env['VITE_BLIXIS_API_URL'] ?? 'http://localhost:8787'
