import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { conConsultasEnSeriePorTransaccion } from "@/lib/db/consultas-en-serie";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import { leerNodosConMarcaDeLaEmpresa } from "@/lib/repositories/_shared/zona-especial";

import { destinoDeUrl } from "./geo-backfill-nodo";

// SLT-45 (design §7.1; R6–R8) — los payloads REALES del contrato congelado de v1:
//
//   pnpm geo:payloads-contrato --copia <host> [--muestra 200] [--salida <archivo>]
//
// Lee una muestra de ordenes vivas de las empresas del pais del contrato y, por cada una, escribe un
// payload de `tests/fixtures/contrato-v1/` (el formato que lee `contrato-v1.route.test.ts`): una fila
// de cotizacion y la misma de carga, con la provincia, el canton y el distrito tal como estan en la
// base, y un escenario con la zona y la marca especial de ese distrito.
//
// Lo corre UNA PERSONA sobre la copia de produccion del ensayo, nunca sobre produccion (T9). Ningun
// agente. `--copia` tiene que ser el destino de `DATABASE_URL` (el mismo criterio que `--destino` de
// `geo:backfill`: el host, o el project-ref en Supabase, donde el host del pooler es el mismo para
// todos los proyectos de la region); si falta o no coincide, se niega ANTES de leer ninguna orden.
//
// SOLO LECTURA: las conexiones nacen con `default_transaction_read_only = on` (el patron de
// `geo-equivalencia-dinero.ts`), y cada lectura de una empresa comprueba dentro de su transaccion que
// esta lo es antes de leer. Solo escribe el archivo de salida.
//
// SIN DATOS PERSONALES NI IDS (R7): lo que sale de la base pasa por `armarPayloads`, que sustituye
// cada valor personal por uno sintetico y las zonas por `zona_{j}`. Por consola, solo cifras.

const USO = "Uso: pnpm geo:payloads-contrato --copia <host> [--muestra <n>] [--salida <archivo>]";

export const MUESTRA_POR_DEFECTO = 200;
/** El telefono sintetico es `8000` + `k` en 4 cifras: por encima de esto dejaria de tener 8. */
export const MUESTRA_MAXIMA = 9999;
export const SALIDA_POR_DEFECTO = "tests/fixtures/contrato-v1/payloads-reales.json";

/**
 * El contrato congelado de v1 es el de las empresas de 3 niveles de hoy, y su suite siembra ese pais
 * (`PAIS` en `contrato-v1.route.test.ts`): una orden de otro pais no se podria reproducir alli.
 */
export const PAIS_DEL_CONTRATO = "CR";

/** Cada conexion del script nace de solo lectura: cualquier escritura falla con `25006`. */
export const OPCION_SOLO_LECTURA = "-c default_transaction_read_only=on";

// ---------------------------------------------------------------------------------------------
// Lo que se lee y lo que se escribe
// ---------------------------------------------------------------------------------------------

/** Una orden tal como sale de la base: con sus datos personales y sus ids. Nunca sale del script. */
export interface OrdenLeida {
  ordenId: string;
  organizacionId: string;
  tiendaId: string;
  numRemision: string;
  destinatario: string;
  telefono: string;
  direccion: string | null;
  notas: string | null;
  producto: string;
  /** El decimal de la base en texto (`Decimal.toString()`), o `null`. */
  peso: string | null;
  montoCobrar: string | null;
  provincia: string;
  canton: string;
  distrito: string;
  /** La zona que cubre el distrito en la empresa de la orden; `null` si ninguna. */
  zona: { id: string; nombre: string; esCentral: boolean } | null;
  /** El distrito lleva la marca de zona especial de la empresa. */
  distritoEspecial: boolean;
}

/** Lo que el script necesita de la base. El real va por `crearLectorDeBase`; un test pasa un doble. */
export interface LectorDeOrdenes {
  /** Las empresas del pais del contrato. */
  empresas(): Promise<string[]>;
  /** Hasta `maximo` ordenes vivas y con distrito de la empresa, las mas recientes primero. */
  ordenes(organizacionId: string, maximo: number): Promise<OrdenLeida[]>;
}

type RutaNombres = [string, string, string];

/** El formato de un payload de `tests/fixtures/contrato-v1/` (cabecera de `contrato-v1.route.test.ts`). */
export interface PayloadDeContrato {
  id: string;
  descripcion: string;
  escenario: {
    zonas: { nombre: string; esCentral: boolean; distritos: RutaNombres[] }[];
    especiales: RutaNombres[];
  };
  pasos: { ruta: "cotizacion" | "carga"; cuerpo: { ordenes: Record<string, string>[] } }[];
}

export interface Cifras {
  ordenesLeidas: number;
  payloadsEscritos: number;
  distritosDistintos: number;
  zonasDistintas: number;
}

// ---------------------------------------------------------------------------------------------
// Anonimizacion (R7): pura
// ---------------------------------------------------------------------------------------------

/** La fila v1 de la orden `k` (1-based): la geografia, el peso y el monto tal cual; lo demas, sintetico. */
export function filaAnonima(o: OrdenLeida, k: number): Record<string, string> {
  const fila: Record<string, string> = {
    num_remision: `R-${k}`,
    destinatario: `Destinatario ${k}`,
    telefono: `8000${String(k).padStart(4, "0")}`,
    provincia: o.provincia,
    canton: o.canton,
    distrito: o.distrito,
    direccion: `Direccion ${k}`,
    producto: `Producto ${k}`,
  };
  if (o.peso !== null) fila.peso = o.peso;
  if (o.montoCobrar !== null) fila.monto_cobrar = o.montoCobrar;
  if (o.notas !== null && o.notas.trim() !== "") fila.notas = `Nota ${k}`;
  return fila;
}

/**
 * Los payloads de las ordenes, en su orden. Cada zona distinta (por empresa: dos empresas no
 * comparten zonas) recibe `zona_{j}` por orden de aparicion; solo se conserva su `esCentral`.
 */
export function armarPayloads(ordenes: readonly OrdenLeida[]): { payloads: PayloadDeContrato[]; cifras: Cifras } {
  const zonas = new Map<string, string>();
  const distritos = new Set<string>();
  const payloads = ordenes.map((o, i): PayloadDeContrato => {
    const k = i + 1;
    const ruta: RutaNombres = [o.provincia, o.canton, o.distrito];
    distritos.add(JSON.stringify(ruta));
    let zona: PayloadDeContrato["escenario"]["zonas"] = [];
    if (o.zona !== null) {
      const clave = `${o.organizacionId}\u0000${o.zona.id}`;
      if (!zonas.has(clave)) zonas.set(clave, `zona_${zonas.size + 1}`);
      zona = [{ nombre: zonas.get(clave) as string, esCentral: o.zona.esCentral, distritos: [ruta] }];
    }
    const fila = filaAnonima(o, k);
    return {
      id: `real-${k}`,
      descripcion: `Orden real anonimizada ${k}: cotiza y crea.`,
      escenario: { zonas: zona, especiales: o.distritoEspecial ? [ruta] : [] },
      pasos: [
        { ruta: "cotizacion", cuerpo: { ordenes: [{ ...fila }] } },
        { ruta: "carga", cuerpo: { ordenes: [{ ...fila }] } },
      ],
    };
  });
  return {
    payloads,
    cifras: {
      ordenesLeidas: ordenes.length,
      payloadsEscritos: payloads.length,
      distritosDistintos: distritos.size,
      zonasDistintas: zonas.size,
    },
  };
}

/** El contenido del archivo de salida, con el mismo formato que `payloads-sinteticos.json` lee la suite. */
export function serializarPayloads(payloads: readonly PayloadDeContrato[]): string {
  return `${JSON.stringify(payloads, null, 2)}\n`;
}

// ---------------------------------------------------------------------------------------------
// Argumentos y la comprobacion de la copia (R8)
// ---------------------------------------------------------------------------------------------

export interface Argumentos {
  /** `undefined` si no se paso: `ejecutar` se niega (R8), no el lector de argumentos. */
  copia: string | undefined;
  muestra: number;
  salida: string;
}

export function leerArgumentos(argv: readonly string[]): Argumentos | null {
  const r: Argumentos = { copia: undefined, muestra: MUESTRA_POR_DEFECTO, salida: SALIDA_POR_DEFECTO };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const valor = argv[i + 1];
    if (valor === undefined || valor.trim() === "" || valor.startsWith("--")) return null;
    if (arg === "--copia") r.copia = valor;
    else if (arg === "--salida") r.salida = valor;
    else if (arg === "--muestra") {
      if (!/^\d+$/.test(valor) || Number(valor) < 1 || Number(valor) > MUESTRA_MAXIMA) return null;
      r.muestra = Number(valor);
    } else return null;
    i++;
  }
  return r;
}

/** R8: `--copia` es el destino de la conexion (host, o project-ref en Supabase). */
export function copiaCoincide(copia: string | undefined, urlDeConexion: string | undefined): boolean {
  const destino = destinoDeUrl(urlDeConexion);
  return destino !== null && copia !== undefined && copia.trim().toLowerCase() === destino;
}

// ---------------------------------------------------------------------------------------------
// La ejecucion, con la base y el disco inyectados
// ---------------------------------------------------------------------------------------------

export interface Ejecucion {
  codigoDeSalida: number;
  lineas: string[];
}

export interface Dependencias {
  /** La URL con la que se abrio la conexion del lector. */
  urlDeConexion: string | undefined;
  lector: LectorDeOrdenes;
  escribir: (ruta: string, contenido: string) => void;
}

/** La muestra repartida entre las empresas, para que no salga toda de la primera. */
async function leerMuestra(lector: LectorDeOrdenes, muestra: number): Promise<{ ordenes: OrdenLeida[]; empresas: number }> {
  const empresas = await lector.empresas();
  if (empresas.length === 0) return { ordenes: [], empresas: 0 };
  const porEmpresa = Math.ceil(muestra / empresas.length);
  const ordenes: OrdenLeida[] = [];
  for (const id of empresas) {
    const faltan = muestra - ordenes.length;
    if (faltan <= 0) break;
    ordenes.push(...(await lector.ordenes(id, Math.min(porEmpresa, faltan))));
  }
  return { ordenes, empresas: empresas.length };
}

export async function ejecutar(a: Argumentos, deps: Dependencias): Promise<Ejecucion> {
  if (!copiaCoincide(a.copia, deps.urlDeConexion)) {
    // No se imprime el destino real: quien lo lanza tiene que saber contra que base esta.
    return {
      codigoDeSalida: 1,
      lineas: ["Rechazado: --copia falta o no coincide con el host de la conexion. No se leyo ninguna orden."],
    };
  }
  const { ordenes, empresas } = await leerMuestra(deps.lector, a.muestra);
  const { payloads, cifras } = armarPayloads(ordenes);
  deps.escribir(a.salida, serializarPayloads(payloads));
  return {
    codigoDeSalida: 0,
    lineas: [
      `empresas=${empresas}`,
      `ordenes leidas=${cifras.ordenesLeidas}`,
      `payloads escritos=${cifras.payloadsEscritos}`,
      `distritos distintos=${cifras.distritosDistintos}`,
      `zonas distintas=${cifras.zonasDistintas}`,
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// El lector real
// ---------------------------------------------------------------------------------------------

/** La configuracion del pool del script: una conexion, de solo lectura. */
export function configuracionDelPool(url: string | undefined): { connectionString: string | undefined; max: number; options: string } {
  return { connectionString: url, max: 1, options: OPCION_SOLO_LECTURA };
}

/** El mismo aislamiento por empresa que la app, sobre conexiones de solo lectura. */
export function crearClienteDeSoloLectura(url: string | undefined): PrismaClient {
  const adapter = conConsultasEnSeriePorTransaccion(new PrismaPg(configuracionDelPool(url)));
  const base = new PrismaClient({ adapter, omit: PRISMA_OMIT }) as unknown as PrismaClient;
  return conAislamientoPorEmpresa(base, async () => null);
}

export class TransaccionNoEsDeSoloLectura extends Error {
  constructor() {
    super("la transaccion de lectura no es de solo lectura: no se lee ninguna orden");
    this.name = "TransaccionNoEsDeSoloLectura";
  }
}

/** Lo minimo de una transaccion para comprobar que es de solo lectura. */
export interface ConsultaSql {
  $queryRawUnsafe<T = unknown>(sql: string, ...valores: unknown[]): PromiseLike<T>;
}

/** Defensa de mas sobre `OPCION_SOLO_LECTURA`: si la transaccion admitiera escrituras, no se lee. */
export async function exigirSoloLectura(tx: ConsultaSql): Promise<void> {
  const [fila] = await tx.$queryRawUnsafe<{ solo_lectura: string }[]>(
    "SELECT current_setting('transaction_read_only') AS solo_lectura",
  );
  if (fila?.solo_lectura !== "on") throw new TransaccionNoEsDeSoloLectura();
}

/** El lector sobre el cliente de solo lectura. Cada empresa, en su contexto y su transaccion. */
export function crearLectorDeBase(cliente: PrismaClient): LectorDeOrdenes {
  return {
    async empresas() {
      const ids: string[] = [];
      const resumen = await paraCadaEmpresa(
        async (id) => {
          const pais = await cliente.$transaction(async (tx) => {
            await exigirSoloLectura(tx);
            return tx.organizacion.findUnique({ where: { id }, select: { paisId: true } });
          });
          if (pais?.paisId === PAIS_DEL_CONTRATO) ids.push(id);
        },
        { cliente: cliente as unknown as ClienteDeOrganizaciones },
      );
      if (resumen.fallidas.length > 0) throw new Error(`no se pudo leer el pais de ${resumen.fallidas.length} empresas`);
      return ids;
    },

    ordenes(organizacionId, maximo) {
      return conEmpresa(organizacionId, () =>
        cliente.$transaction(async (tx) => {
          await exigirSoloLectura(tx);
          const especiales = new Set(await leerNodosConMarcaDeLaEmpresa(tx));
          const filas = await tx.orden.findMany({
            where: { organizacionId, deletedAt: null, distritoId: { not: null } },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            take: maximo,
            select: {
              id: true,
              tiendaId: true,
              numRemision: true,
              destinatario: true,
              telefonoDest: true,
              direccion: true,
              notas: true,
              producto: true,
              peso: true,
              montoCobrar: true,
              distrito: {
                select: {
                  id: true,
                  nombre: true,
                  canton: { select: { nombre: true, provincia: { select: { nombre: true } } } },
                  zonas: {
                    where: { organizacionId },
                    select: { zona: { select: { id: true, nombre: true, esCentral: true } } },
                  },
                },
              },
            },
          });
          return filas.flatMap((o): OrdenLeida[] => {
            if (o.distrito === null) return [];
            return [
              {
                ordenId: o.id,
                organizacionId,
                tiendaId: o.tiendaId,
                numRemision: o.numRemision,
                destinatario: o.destinatario,
                telefono: o.telefonoDest,
                direccion: o.direccion,
                notas: o.notas,
                producto: o.producto,
                peso: o.peso === null ? null : o.peso.toString(),
                montoCobrar: o.montoCobrar === null ? null : o.montoCobrar.toString(),
                provincia: o.distrito.canton.provincia.nombre,
                canton: o.distrito.canton.nombre,
                distrito: o.distrito.nombre,
                // SLT-75 R7: un distrito esta, a lo sumo, en una zona por empresa.
                zona: o.distrito.zonas[0]?.zona ?? null,
                distritoEspecial: especiales.has(o.distrito.id),
              },
            ];
          });
        }),
      );
    },
  };
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables ya presentes en process.env
  }
  const argumentos = leerArgumentos(process.argv.slice(2));
  if (argumentos === null) {
    // No se repite el argumento: se escribe a mano y podria llevar algo que no debe salir.
    console.error(USO);
    process.exitCode = 1;
    return;
  }
  // La misma variable con la que se abre el cliente. El pool no conecta hasta la primera consulta, y
  // `ejecutar` rechaza una copia que no coincide antes de hacer ninguna.
  const url = process.env.DATABASE_URL;
  const cliente = crearClienteDeSoloLectura(url);
  try {
    const r = await ejecutar(argumentos, {
      urlDeConexion: url,
      lector: crearLectorDeBase(cliente),
      escribir: (ruta, contenido) => writeFileSync(ruta, contenido, "utf8"),
    });
    for (const linea of r.lineas) (r.codigoDeSalida === 0 ? console.log : console.error)(linea);
    process.exitCode = r.codigoDeSalida;
  } finally {
    await cliente.$disconnect();
  }
}

// Solo auto-ejecuta cuando este archivo es el entrypoint (no cuando un test lo importa).
const esEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntrypoint) {
  main().catch((error: unknown) => {
    // Solo el nombre: el mensaje de Prisma puede llevar la URL de la base.
    console.error(`Fallo geo:payloads-contrato (${error instanceof Error ? error.name : "error desconocido"}).`);
    process.exit(1);
  });
}
