import { pathToFileURL } from "node:url";

import { BovedaIntegraciones, FuenteAleatoriaCripto } from "@/lib/crypto/boveda-integraciones";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { ICobroCredencialService } from "@/lib/interfaces/services/ICobroCredencialService";
import { CobroCredencialRepository } from "@/lib/repositories/CobroCredencialRepository";
import { CobroCredencialService } from "@/lib/services/CobroCredencialService";

// SLT-227 (design §9.1, R12) — `pnpm cobro:credencial --proveedor rebill --pais CR --entorno sandbox`.
//
// Carga las credenciales de un trío mientras no exista la pantalla de SLT-251. Los secretos llegan por la entrada
// estándar, una línea `campo=valor` por campo (p. ej. `apiKey=…` y `secretoWebhook=…`): ni por argumentos, que
// quedan en el historial de la shell, ni por variables, que quedan en el entorno del proceso.
//
// La regla vive en `CobroCredencialService.guardar` (R8, R10), con el superadmin como actor. Aquí solo se lee, se
// cablea, se imprime y se sale. NUNCA se imprime un valor, ni un argumento que no se reconoce.

/** Donde escribe el comando. `console` en producción; un doble en los tests. */
export interface SalidaDelComando {
  log(texto: string): void;
  error(texto: string): void;
}

const BANDERAS = { "--proveedor": "proveedor", "--pais": "paisId", "--entorno": "entorno" } as const;
type Bandera = keyof typeof BANDERAS;
const USO = "Uso: pnpm cobro:credencial --proveedor <proveedor> --pais <XX> --entorno <sandbox|produccion>";

function esBandera(texto: string): texto is Bandera {
  return Object.hasOwn(BANDERAS, texto);
}

/** Los tres datos del trío, o `null` si sobra o falta algo. Acepta `--pais CR` y `--pais=CR`. */
function leerArgumentos(argumentos: readonly string[]): Record<(typeof BANDERAS)[Bandera], string> | null {
  const leidos: Partial<Record<(typeof BANDERAS)[Bandera], string>> = {};
  for (let i = 0; i < argumentos.length; i += 1) {
    const [nombre, ...resto] = argumentos[i].split("=");
    const valor = resto.length > 0 ? resto.join("=") : argumentos[(i += 1)];
    if (!esBandera(nombre) || valor === undefined || leidos[BANDERAS[nombre]] !== undefined) return null;
    leidos[BANDERAS[nombre]] = valor;
  }
  const { proveedor, paisId, entorno } = leidos;
  return proveedor !== undefined && paisId !== undefined && entorno !== undefined ? { proveedor, paisId, entorno } : null;
}

/** `{ campo: valor }` de las líneas `campo=valor`; `null` si una línea no tiene la forma o repite un campo. */
function leerSecretos(entrada: string): Record<string, string> | null {
  const secretos: Record<string, string> = {};
  for (const linea of entrada.split(/\r?\n/)) {
    if (linea.trim() === "") continue;
    const corte = linea.indexOf("=");
    if (corte <= 0) return null;
    const campo = linea.slice(0, corte).trim();
    if (campo === "" || Object.hasOwn(secretos, campo)) return null;
    secretos[campo] = linea.slice(corte + 1);
  }
  return secretos;
}

/** Nombre y código de un error, sin su mensaje: el de la base puede llevar los valores cifrados. */
function rastroDelError(error: unknown): string {
  if (!(error instanceof Error)) return "error desconocido";
  const codigo = (error as { code?: unknown }).code;
  return typeof codigo === "string" && /^[A-Z0-9_]{1,12}$/.test(codigo) ? `${error.name} ${codigo}` : error.name;
}

/** Guarda el trío y devuelve el código de salida: 0 si quedó guardado, 1 en cualquier otro caso. */
export async function ejecutarGuardado(
  servicio: ICobroCredencialService,
  idSuperadmin: string | null,
  argumentos: readonly string[],
  entrada: string,
  salida: SalidaDelComando = console,
): Promise<0 | 1> {
  const trio = leerArgumentos(argumentos);
  if (!trio) {
    // No se repite el argumento: alguien podría pegar ahí una clave por error.
    salida.error(`Argumento no reconocido o incompleto. ${USO}`);
    return 1;
  }
  if (idSuperadmin === null) {
    salida.error("No hay superadmin en la base: corre antes `pnpm arranque:superadmin`.");
    return 1;
  }
  const secretos = leerSecretos(entrada);
  if (!secretos) {
    salida.error("La entrada estándar lleva una línea sin la forma campo=valor o un campo repetido. No se guardó nada.");
    return 1;
  }

  try {
    const r = await servicio.guardar({ usuarioId: idSuperadmin, rol: "superadmin" }, { ...trio, secretos });
    if (r.estado === "ok") {
      salida.log(`Guardadas: ${trio.proveedor} · ${trio.paisId} · ${trio.entorno} (${r.campos.join(", ")})`);
      return 0;
    }
    // `campos` son nombres, nunca valores (ICobroCredencialService).
    const detalle = r.estado === "validation_error" ? ` en ${r.campos.join(", ")}` : "";
    salida.error(`No se guardó: ${r.estado}${detalle}.`);
  } catch (error) {
    salida.error(
      `Falló el guardado (${rastroDelError(error)}). Revisa INTEGRACIONES_CLAVES_CIFRADO, ` +
        "INTEGRACIONES_CLAVE_ACTIVA y DATABASE_URL. El detalle no se imprime: puede llevar valores.",
    );
  }
  return 1;
}

async function leerEntradaEstandar(): Promise<string> {
  const trozos: Buffer[] = [];
  for await (const trozo of process.stdin) trozos.push(Buffer.from(trozo as Uint8Array));
  return Buffer.concat(trozos).toString("utf8");
}

async function main(): Promise<void> {
  // Igual que `recifrar-integraciones.ts`: `tsx` no carga el `.env`, y sin él no hay DATABASE_URL.
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables ya presentes en process.env
  }

  const prisma = getPrismaClient();
  try {
    const repo = new CobroCredencialRepository(prisma);
    const servicio = new CobroCredencialService({
      repo,
      cifrador: new BovedaIntegraciones(),
      fuente: new FuenteAleatoriaCripto(),
      ahora: () => new Date(),
    });
    const argumentos = process.argv.slice(2);
    // Los argumentos se miran antes de esperar la entrada: un error de uso no se queda esperando secretos.
    if (leerArgumentos(argumentos) === null) {
      process.exitCode = await ejecutarGuardado(servicio, null, argumentos, "");
      return;
    }
    const idSuperadmin = await repo.idSuperadmin();
    const entrada = idSuperadmin === null ? "" : await leerEntradaEstandar();
    // `exitCode` y no `exit()`: así stdout y stderr terminan de escribirse antes de salir.
    process.exitCode = await ejecutarGuardado(servicio, idSuperadmin, argumentos, entrada);
  } finally {
    await prisma.$disconnect();
  }
}

// Solo corre cuando este archivo es el entrypoint. Un test que lo importa no abre ninguna conexión.
const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error(`Falló el guardado (${rastroDelError(error)}).`);
    process.exit(1);
  });
}
