import { pathToFileURL } from "node:url";

import { leerAnilloDeClaves } from "@/lib/config/integraciones";
import { BovedaIntegraciones } from "@/lib/crypto/boveda-integraciones";
import { paraCadaEmpresa } from "@/lib/db/para-cada-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type {
  IRecifradoIntegracionesService,
  ResumenRecifrado,
} from "@/lib/interfaces/services/IRecifradoIntegracionesService";
import { IntegracionRecifradoRepository } from "@/lib/repositories/IntegracionRecifradoRepository";
import { RecifradoIntegracionesService } from "@/lib/services/RecifradoIntegracionesService";

// SL-36 (design §12; D10, R39, R40) — `pnpm integraciones:recifrar [--solo-contar]`.
//
// Lo corre el superadmin, o quien opera la plataforma con acceso a la base, igual que
// `pnpm arranque:superadmin`. La regla vive en `RecifradoIntegracionesService`: aqui solo se cablea,
// se imprime y se sale.
//
// COMO SE ROTA LA CLAVE MAESTRA (paso manual, en este orden):
//   1. Anadir la version nueva a INTEGRACIONES_CLAVES_CIFRADO (`v1:<…>,v2:<…>`) y apuntar
//      INTEGRACIONES_CLAVE_ACTIVA a ella, en cada entorno. Desde ese momento todo valor nuevo sale en
//      la nueva y los viejos se siguen leyendo (R38).
//   2. `pnpm integraciones:recifrar --solo-contar` para ver cuantos quedan en cada version.
//   3. `pnpm integraciones:recifrar`, con las mismas variables del entorno a rotar.
//   4. Cuando la version vieja cuenta 0 (y el comando salio con 0), quitarla del anillo. Un valor
//      ilegible no cambia de version al recifrar: hay que volver a pegar esa credencial.
//
// Solo imprime conteos: nunca un valor, un id de integracion ni una empresa (R39).

/** Donde escribe el comando. `console` en produccion; un doble en los tests. */
export interface SalidaDelComando {
  log(texto: string): void;
  error(texto: string): void;
}

const BANDERA_SOLO_CONTAR = "--solo-contar";

/** Nombre y codigo de un error, sin su mensaje: el de la base puede llevar los valores cifrados. */
function rastroDelError(error: unknown): string {
  if (!(error instanceof Error)) return "error desconocido";
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === "string" && /^[A-Z0-9_]{1,12}$/.test(codigo) ? `${error.name} ${codigo}` : error.name;
}

/** Las lineas del resumen: solo versiones y numeros. */
export function lineasDelResumen(resumen: ResumenRecifrado): string[] {
  const lineas = [
    resumen.soloContar
      ? "Solo contar: no se escribio nada."
      : `Recifrados a ${resumen.versionActiva}: ${resumen.recifrados}.`,
    `Version activa: ${resumen.versionActiva}.`,
    "Valores por version:",
  ];
  const versiones = Object.entries(resumen.porVersion);
  if (versiones.length === 0) lineas.push("  (ninguno)");
  for (const [version, n] of versiones) lineas.push(`  ${version} -> ${n}`);
  lineas.push(`ilegibles: ${resumen.ilegibles}`);
  if (resumen.conflictos > 0) {
    lineas.push(`Filas cambiadas mientras corria (no recifradas, vuelve a correrlo): ${resumen.conflictos}`);
  }
  return lineas;
}

/** Corre el recifrado y devuelve el codigo de salida: 0, o 1 si hubo errores de base o de configuracion. */
export async function ejecutarRecifrado(
  servicio: IRecifradoIntegracionesService,
  argumentos: readonly string[],
  salida: SalidaDelComando = console,
): Promise<0 | 1> {
  const desconocidos = argumentos.filter((a) => a !== BANDERA_SOLO_CONTAR);
  if (desconocidos.length > 0) {
    // No se repite el argumento: alguien podria pegar ahi una clave por error.
    salida.error(`Argumento no reconocido. Uso: pnpm integraciones:recifrar [${BANDERA_SOLO_CONTAR}]`);
    return 1;
  }

  let resumen: ResumenRecifrado;
  try {
    resumen = await servicio.ejecutar({ soloContar: argumentos.includes(BANDERA_SOLO_CONTAR) });
  } catch (error) {
    salida.error(
      `Fallo el recifrado (${rastroDelError(error)}). Revisa INTEGRACIONES_CLAVES_CIFRADO, ` +
        "INTEGRACIONES_CLAVE_ACTIVA y DATABASE_URL. El detalle no se imprime: puede llevar valores.",
    );
    return 1;
  }

  for (const linea of lineasDelResumen(resumen)) salida.log(linea);
  if (resumen.empresasConError > 0) {
    salida.error(
      `Fallo la base en ${resumen.empresasConError} empresa(s): el conteo esta incompleto y no sirve ` +
        "para retirar ninguna version. Vuelve a correrlo.",
    );
    return 1;
  }
  return 0;
}

async function main(): Promise<void> {
  // Igual que `arranque-superadmin.ts`: `tsx` no carga el `.env`, y sin el no hay DATABASE_URL.
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables ya presentes en process.env
  }

  const prisma = getPrismaClient();
  try {
    const servicio = new RecifradoIntegracionesService({
      cifrador: new BovedaIntegraciones(),
      versionActiva: () => leerAnilloDeClaves().activa,
      repositorio: new IntegracionRecifradoRepository(prisma),
      recorrerEmpresas: (fn) => paraCadaEmpresa(fn),
    });
    // `exitCode` y no `exit()`: asi stdout y stderr terminan de escribirse antes de salir.
    process.exitCode = await ejecutarRecifrado(servicio, process.argv.slice(2));
  } finally {
    await prisma.$disconnect();
  }
}

// Solo corre cuando este archivo es el entrypoint. Un test que lo importa no abre ninguna conexion.
const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error(`Fallo el recifrado (${rastroDelError(error)}).`);
    process.exit(1);
  });
}
