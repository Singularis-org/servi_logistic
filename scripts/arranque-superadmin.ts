import { pathToFileURL } from "node:url";

import { getPrismaClient } from "@/lib/db/prisma-client";
import type {
  EntornoArranque,
  IArranqueSuperadminService,
} from "@/lib/interfaces/services/IArranqueSuperadminService";
import { ArranqueSuperadminRepository } from "@/lib/repositories/ArranqueSuperadminRepository";
import { ArranqueSuperadminService } from "@/lib/services/ArranqueSuperadminService";
import {
  codigoSalidaArranqueSuperadmin,
  mensajeArranqueSuperadmin,
} from "@/lib/types/arranque-superadmin";

// SL-32 (R12-R17) — `pnpm arranque:superadmin`: crea el unico superadmin de la base. Se corre a
// mano, una vez por entorno, despues de `migrate deploy` y `pnpm db:seed`; nunca en el build ni en
// CI (R20). La regla vive en `ArranqueSuperadminService`: aqui solo se cablea, se imprime y se sale.

/** Donde escribe el comando. `console` en produccion; un doble en los tests. */
export interface SalidaDelComando {
  log(texto: string): void;
  error(texto: string): void;
}

/** Codigo de un error sin su mensaje: el mensaje de un error de la base puede llevar datos (R16). */
function rastroDelError(error: unknown): string {
  if (!(error instanceof Error)) return "error desconocido";
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === "string" && /^[A-Z0-9_]{1,12}$/.test(codigo) ? `${error.name} ${codigo}` : error.name;
}

/**
 * Corre el arranque y devuelve el codigo de salida. Los desenlaces de exito van a stdout y el resto
 * a stderr, siempre con el mensaje fijo de `mensajeArranqueSuperadmin`, que no lleva valores (R16).
 */
export async function ejecutarArranque(
  servicio: IArranqueSuperadminService,
  entorno: EntornoArranque,
  salida: SalidaDelComando = console,
): Promise<0 | 1> {
  let resultado;
  try {
    resultado = await servicio.arrancar(entorno);
  } catch (error) {
    salida.error(
      `Fallo el arranque del superadmin (${rastroDelError(error)}). Revisa DATABASE_URL y que las ` +
        "migraciones esten aplicadas. El detalle no se imprime: puede llevar datos del superadmin.",
    );
    return 1;
  }
  const codigo = codigoSalidaArranqueSuperadmin(resultado);
  const mensaje = mensajeArranqueSuperadmin(resultado);
  if (codigo === 0) salida.log(mensaje);
  else salida.error(mensaje);
  return codigo;
}

async function main(): Promise<void> {
  // Igual que `seed-catalogos.ts`: `tsx` no carga el `.env`, y sin el no hay DATABASE_URL.
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables ya presentes en process.env
  }

  const prisma = getPrismaClient();
  try {
    const servicio = new ArranqueSuperadminService(new ArranqueSuperadminRepository(prisma));
    // `exitCode` y no `exit()`: asi stdout y stderr terminan de escribirse antes de salir.
    process.exitCode = await ejecutarArranque(servicio, process.env);
  } finally {
    await prisma.$disconnect();
  }
}

// Solo corre cuando este archivo es el entrypoint (`pnpm arranque:superadmin`). Un test que lo
// importa para probar `ejecutarArranque` no abre ninguna conexion.
const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error(`Fallo el arranque del superadmin (${rastroDelError(error)}).`);
    process.exit(1);
  });
}
