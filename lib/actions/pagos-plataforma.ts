"use server";

import { ZodError } from "zod";

import { buildComprobantes, leerComprobanteOpcional } from "@/lib/actions/_shared/comprobante-lateral";
import { esPlataforma } from "@/lib/auth/plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { walletComprobanteConfig } from "@/lib/config/wallet-comprobante";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IPagoPlataformaConfirmacionService } from "@/lib/interfaces/services/IPagoPlataformaConfirmacionService";
import { PagoPlataformaConfirmacionRepository } from "@/lib/repositories/PagoPlataformaConfirmacionRepository";
import { WalletComprobanteRepository } from "@/lib/repositories/WalletComprobanteRepository";
import { PagoPlataformaConfirmacionService } from "@/lib/services/PagoPlataformaConfirmacionService";
import { construirReglasPaisEmpresa } from "@/lib/services/ReglasPaisEmpresaService";
import { separarComprobante } from "@/lib/types/wallet-laterales";
import { SupabaseSignedUrlProvider } from "@/lib/storage/SupabaseSignedUrlProvider";
import type {
  AnularPagoConfirmadoResult,
  ConfirmarPagoResult,
  RegistrarPagoPorFueraResult,
  VerComprobantePagoResult,
  VerPagosDeEmpresaResult,
} from "@/lib/types/pago-plataforma";

// SLT-60 (design §4.6) — el borde de la confirmación del pago a la plataforma en el detalle de una empresa.
// El actor sale de la sesión y la autorización la decide el servicio (R24), antes de tocar la base. Es de
// plataforma, así que no lleva puerta de módulo: va al núcleo en `lib/modulos/reparto.ts`. Molde:
// `lib/actions/planes.ts`.

/** Inyección para los tests del borde. */
export interface PagosPlataformaDeps {
  readonly service?: IPagoPlataformaConfirmacionService;
  readonly getActor?: () => Promise<Actor | null>;
}

/**
 * El composition root: el servicio con su repositorio real y, para el comprobante (design §4.8), el lateral de
 * la wallet sobre el cliente extendido, el adaptador de Storage con el bucket de la wallet y su misma duración
 * del enlace (R33). No exportado: un "use server" solo exporta actions. Lo vigila
 * `tests/unit/actions/pagos-plataforma.test.ts`, que llama a las actions sin servicio.
 */
function construirPagoPlataformaConfirmacionService(prisma = getPrismaClient()): IPagoPlataformaConfirmacionService {
  return new PagoPlataformaConfirmacionService(
    new PagoPlataformaConfirmacionRepository(prisma),
    new WalletComprobanteRepository(prisma),
    new SupabaseSignedUrlProvider(undefined, walletComprobanteConfig.BUCKET),
    walletComprobanteConfig.SIGNED_URL_TTL_SECONDS,
    undefined, // el reloj por defecto
    // SLT-143 (design §4.4; R7, R8, R9): el comprobante lateral real de la wallet y la zona del país real.
    buildComprobantes(prisma),
    construirReglasPaisEmpresa(prisma),
  );
}

async function conServicio<T>(
  deps: PagosPlataformaDeps,
  fn: (s: IPagoPlataformaConfirmacionService, actor: Actor | null) => Promise<T>,
): Promise<T> {
  // Sin sesión, el actor es `null` y el servicio responde `forbidden` sin leer nada.
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  return fn(deps.service ?? construirPagoPlataformaConfirmacionService(), actor);
}

/**
 * Los pagos por confirmar y las facturas cerradas con saldo de una empresa (R12, R14, R24).
 */
export async function verPagosDeEmpresaAction(
  input: unknown,
  deps: PagosPlataformaDeps = {},
): Promise<VerPagosDeEmpresaResult> {
  return conServicio(deps, (s, actor) => s.verDeEmpresa(actor, input));
}

/**
 * Confirma un pago por confirmar con su reparto entre facturas cerradas (R16, R17, R19, R20, R24).
 */
export async function confirmarPagoPlataformaAction(
  input: unknown,
  deps: PagosPlataformaDeps = {},
): Promise<ConfirmarPagoResult> {
  return conServicio(deps, (s, actor) => s.confirmar(actor, input));
}

/**
 * El enlace temporal al comprobante de un pago (R33, R34). La página la liga con la empresa del detalle en el
 * servidor (`.bind(null, organizacionId)`): el cliente solo manda el pago.
 */
export async function verComprobantePagoPlataformaAction(
  organizacionId: unknown,
  pagoId: unknown,
  deps: PagosPlataformaDeps = {},
): Promise<VerComprobantePagoResult> {
  return conServicio(deps, (s, actor) => s.verComprobante(actor, { organizacionId, pagoId }));
}

/** El texto de un campo del `FormData`, o `undefined` si no vino (un `File` no es texto). */
function texto(formData: FormData, clave: string): string | undefined {
  const v = formData.get(clave);
  return typeof v === "string" ? v : undefined;
}

/** El reparto llega como JSON en el campo `aplicaciones`; si no es JSON, va tal cual y zod lo rechaza. */
function repartoDelFormulario(crudo: string | undefined): unknown {
  if (crudo === undefined) return undefined;
  try {
    return JSON.parse(crudo) as unknown;
  } catch {
    return crudo;
  }
}

/**
 * SLT-143 (design §4.4; R1–R12, R31) — registra un pago hecho por fuera. La página la liga con la empresa del
 * detalle (`.bind(null, organizacionId)`). El `FormData` trae:
 * - `claveIdempotencia` (uuid por apertura del diálogo), `monto`, `fecha` (`YYYY-MM-DD`, opcional; vacía = hoy)
 *   y `referencia`;
 * - `aplicaciones`: el reparto como JSON, `[{ "facturaId": "…", "monto": "…" }]`;
 * - `comprobante`: el archivo, opcional (R8).
 */
export async function registrarPagoPorFueraAction(
  organizacionId: unknown,
  formData: FormData,
  deps: PagosPlataformaDeps = {},
): Promise<RegistrarPagoPorFueraResult> {
  return conServicio(deps, async (s, actor) => {
    const fecha = texto(formData, "fecha");
    const input = {
      organizacionId,
      claveIdempotencia: texto(formData, "claveIdempotencia"),
      monto: texto(formData, "monto"),
      fecha: fecha === undefined || fecha.trim() === "" ? undefined : fecha,
      referencia: texto(formData, "referencia"),
      aplicaciones: repartoDelFormulario(texto(formData, "aplicaciones")),
    };
    let comprobante;
    try {
      // Un campo de archivo vacío (el `File` de 0 bytes del navegador) es «sin comprobante» (molde 457).
      comprobante = await leerComprobanteOpcional(separarComprobante(formData).comprobante);
    } catch (e) {
      if (!(e instanceof ZodError)) throw e;
      // R31: a quien no es el superadmin no se le dice nada del archivo.
      if (actor === null || !esPlataforma(actor.rol)) return { estado: "forbidden" };
      return { estado: "validation_error", errores: { comprobante: e.issues[0]?.message ?? "Comprobante no válido." } };
    }
    return s.registrarPorFuera(actor, input, comprobante);
  });
}

/**
 * SLT-143 (design §4.4; R21–R27, R31) — anula un pago confirmado con motivo. La página la liga con la empresa
 * del detalle; el cliente manda `{ pagoId, motivo }`.
 */
export async function anularPagoConfirmadoAction(
  organizacionId: unknown,
  input: unknown,
  deps: PagosPlataformaDeps = {},
): Promise<AnularPagoConfirmadoResult> {
  const { pagoId, motivo } = (input !== null && typeof input === "object" ? input : {}) as { pagoId?: unknown; motivo?: unknown };
  return conServicio(deps, (s, actor) => s.anularConfirmado(actor, { organizacionId, pagoId, motivo }));
}
