"use server";

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { isAppErrorShape, UnauthenticatedError, withErrorHandler } from "@/lib/errors";
import type { AppErrorShape } from "@/lib/errors";
import type { IIncentivoMensajeroService, IncentivoTx } from "@/lib/interfaces/services/IIncentivoMensajeroService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { CajaIncentivoMensajeroFeedService } from "@/lib/services/CajaIncentivoMensajeroFeedService";
import { IncentivoMensajeroService } from "@/lib/services/IncentivoMensajeroService";
import {
  anularIncentivoMensajeroSchema,
  registrarIncentivoMensajeroSchema,
  type AnularIncentivoMensajeroActionResult,
  type ErrorDeBordeIncentivo,
  type RegistrarIncentivoMensajeroActionResult,
} from "@/lib/types/incentivo-mensajero";

// SLT-68 (design §6) — el BORDE del incentivo manual a un mensajero. Molde de las demas actions de
// Wallet: sesion primero (R2: `unauthenticated` antes de mirar la entrada), zod `.strict()` despues
// (R3), y el resto lo decide el dominio (R1, R4, R5, R10, R15). Wallet es nucleo
// (`20261028120000_modulo_wallet_nucleo`): no hay modulo apagable que comprobar.

/**
 * COMPOSITION ROOT. Cada dependencia del servicio se construye y se PASA aqui:
 *  - el repositorio de los cierres y su candado (lectura y `FOR UPDATE`);
 *  - el del libro del mensajero, su unico escritor;
 *  - el puerto estrecho de la caja, que encapsula el repositorio de la caja;
 *  - el runner de transaccion, lo unico que sabe de Prisma.
 */
function buildService(): IIncentivoMensajeroService {
  const prisma = getPrismaClient();
  return new IncentivoMensajeroService(
    new LiquidacionPagoRepository(prisma),
    new PagoMensajeroMovimientoRepository(prisma),
    new CajaIncentivoMensajeroFeedService(new WalletMovimientoRepository(prisma)),
    // R11: UNA transaccion para las dos escrituras; si cualquiera falla, no queda ninguna.
    (fn) => prisma.$transaction((tx) => fn(tx as unknown as IncentivoTx)),
  );
}

export interface IncentivoMensajeroDeps {
  service?: IIncentivoMensajeroService;
  getActor?: () => Promise<Actor | null>;
}

function toActionError(shape: AppErrorShape): ErrorDeBordeIncentivo {
  switch (shape.code) {
    case "VALIDATION_ERROR":
      return {
        status: "validation_error",
        fieldErrors: (shape.details?.fieldErrors as Record<string, string[]> | undefined) ?? {},
      };
    case "UNAUTHORIZED":
      return { status: "unauthenticated" };
    default:
      throw new Error(`incentivo-mensajero: AppErrorCode inesperado ${shape.code}`);
  }
}

/** Todas las claves del `FormData`, sin coercion: `.strict()` ve tambien las no previstas. */
function crudoDelFormData(formData: FormData): Record<string, unknown> {
  const crudo: Record<string, unknown> = {};
  for (const [clave, valor] of formData.entries()) {
    // Un campo opcional que el dialogo manda vacio (la fecha) es «sin valor», no un valor invalido.
    if (typeof valor === "string" && valor === "" && clave === "fecha") continue;
    crudo[clave] = valor;
  }
  return crudo;
}

/** R1–R11 — registra un incentivo. `FormData`: mensajeroId, monto, motivo, fecha?, claveIdempotencia. */
export async function registrarIncentivoMensajeroAction(
  formData: FormData,
  deps: IncentivoMensajeroDeps = {},
): Promise<RegistrarIncentivoMensajeroActionResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError(); // R2: antes del schema
    const data = registrarIncentivoMensajeroSchema.parse(crudoDelFormData(formData)); // R3
    const service = deps.service ?? buildService();
    return service.registrar(data, actor);
  });
  return isAppErrorShape(r) ? toActionError(r) : r;
}

/** R13–R15 — anula un incentivo con un motivo. Sin monto: lo lee el servidor del incentivo. */
export async function anularIncentivoMensajeroAction(
  input: unknown,
  deps: IncentivoMensajeroDeps = {},
): Promise<AnularIncentivoMensajeroActionResult> {
  const r = await withErrorHandler(async () => {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    if (!actor) throw new UnauthenticatedError(); // R2
    const data = anularIncentivoMensajeroSchema.parse(input);
    const service = deps.service ?? buildService();
    return service.anular(data, actor);
  });
  return isAppErrorShape(r) ? toActionError(r) : r;
}
