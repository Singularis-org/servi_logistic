import type { EntornoCobro } from "@/lib/types/cobro";

// SLT-227 (design §2) — el entorno y el transporte del cobro automático. Los tiempos son valores propuestos, sin
// medición detrás: con 10 s por intento y dos esperas, una consulta acaba en menos de 32 s, dentro de un job de
// SLT-228.

/**
 * `VERCEL_ENV` y no `NODE_ENV`: el E2E de CI corre `next start`, que es `NODE_ENV=production`, y con `NODE_ENV`
 * saldría a producción (el mismo motivo de `lib/config/email.ts`). Ningún país ni credencial lo cambia (R3).
 */
export function entornoDeCobro(env: Readonly<Record<string, string | undefined>> = process.env): EntornoCobro {
  return env.VERCEL_ENV === "production" ? "produccion" : "sandbox";
}

/** El tiempo máximo de UNA petición al proveedor (R20). */
export const TIEMPO_MAXIMO_COBRO_MS = 10_000;

/** Dos esperas, así que la consulta hace hasta 3 intentos (R21). Solo la usa la consulta, que es idempotente. */
export const ESPERAS_REINTENTO_CONSULTA_MS: readonly number[] = [250, 1_000];

/**
 * Una sola URL para los dos entornos: lo que separa sandbox de producción es la API key (P5, R4). Sin variable de
 * entorno a propósito, para que nadie pueda apuntar producción a otro host; los tests pasan la del doble por
 * constructor.
 */
export const URL_BASE_REBILL = "https://api.rebill.com";
