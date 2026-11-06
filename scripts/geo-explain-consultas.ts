import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { conConsultasEnSeriePorTransaccion } from "@/lib/db/consultas-en-serie";
import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import { leerDescriptivosDeOrdenes, SNAPSHOT_SELECT } from "@/lib/repositories/CierreDiaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { planificarReconciliacion } from "@/lib/repositories/ZonaRepository";
import { sinTransaccionAnidada } from "@/lib/repositories/_shared/sin-transaccion-anidada";

import { crearCaptura, type Captura, type ConsultaCapturada } from "./geo-equivalencia/captura-consultas";
import * as hoy from "./geo-equivalencia/consultas-de-hoy";

// SLT-65 (design §10; R24, R25) — `pnpm geo:explain-consultas [--empresa <id>]`.
//
// Mide, para las cinco lecturas que pasan al catalogo, la de hoy (`consultas-de-hoy.ts`, congelada)
// frente a la nueva (los repositorios). Cada lectura se corre una vez por lado y se capturan sus
// consultas (`captura-consultas.ts`). Cada consulta se repite como `EXPLAIN (ANALYZE, BUFFERS,
// FORMAT JSON)` con el contexto de la original (la empresa y el rol de la RLS, o plataforma), cinco
// corridas; por corrida se suman los `Execution Time` de la lectura y se toma la mediana de las cinco.
//
// REGRESION (decision cerrada del 2026-10-31): la mediana de despues supera en mas de 20 % a la de
// antes —solo en listado de `/ordenes`, listado de la API y cierre—, o aparece un Seq Scan sobre
// `orden` en algun plan de despues sin ninguno en los de antes —en las cinco—. El tiempo de pared
// se informa y no bloquea.
//
// LAS CONSULTAS QUE LA COPIA NO TRAE. La copia de los dos listados es solo su lectura geografica: el
// `count`, las tarifas y las señales «no leen geografia y no entran» (design §8). Para que la suma
// de antes sea la de la lectura entera, como la de despues, se completa con las consultas de despues
// que no leen ninguna tabla de la geografia ni del catalogo y que antes no tiene: las mismas
// sentencias, con los mismos parametros. Solo en los dos listados.
//
// SOLO LECTURA (R24): conexiones con `default_transaction_read_only = on`, y solo se explican
// `SELECT`. SIN DATOS PERSONALES (R24): no se imprime SQL ni parametros, solo etiquetas, ids de
// empresa, zona y nodo, y numeros.
//
// SOLO CONTRA localhost: se niega a correr con otra base. Lo corre una PERSONA sobre la copia de
// produccion restaurada en local (T8.3). Ningun agente fuera de la base de tests local.

const USO = "Uso: pnpm geo:explain-consultas [--empresa <organizacion_id>]";

/** Corridas de `EXPLAIN ANALYZE` por lado (R25). */
export const CORRIDAS = 5;
/** «Mas de 20 %» (R25). */
export const UMBRAL_DE_REGRESION = 0.2;
/** La primera pagina de los dos listados (design §10). */
export const TAMANO_DE_PAGINA = 50;
/** El cierre mas grande de los ultimos 30 dias (design §10). */
const DIAS_DEL_CIERRE = 30;

/** Salidas: 0 sin regresion, 1 con regresion, 2 si una lectura fallo (o argumentos o base malos). */
export type CodigoDeSalida = 0 | 1 | 2;

export type NombreDeLectura =
  | "listado-ordenes"
  | "listado-api"
  | "cierre-descriptivos"
  | "conteo-sin-entregar"
  | "reconciliacion";

/** Las lecturas en las que bloquea el 20 % (las calientes de la tarjeta). */
const BLOQUEAN_POR_PORCENTAJE: ReadonlySet<NombreDeLectura> = new Set([
  "listado-ordenes",
  "listado-api",
  "cierre-descriptivos",
]);

// ---------------------------------------------------------------------------------------------
// La regla
// ---------------------------------------------------------------------------------------------

export interface LadoMedido {
  /** Consultas de la lectura que se explican (en antes, con las completadas). */
  consultas: number;
  /** Por corrida, la suma de los `Execution Time` de todas sus consultas (ms). */
  corridasMs: number[];
  medianaMs: number;
  /** Seq Scan sobre `orden` en los planes de este lado (la corrida con mas). */
  seqScanSobreOrden: number;
  /** Tiempo de pared medio del metodo (ms). Informativo. */
  paredMediaMs: number;
}

export interface MedicionDeLectura {
  lectura: NombreDeLectura;
  bloqueaPorPorcentaje: boolean;
  antes: LadoMedido;
  despues: LadoMedido;
  /** Las consultas de despues con las que se completo antes (solo listados). */
  completadas: number;
}

export type ResultadoDeLectura =
  | { estado: "medida"; medicion: MedicionDeLectura }
  | { estado: "sin-muestra"; lectura: NombreDeLectura; motivo: string }
  | { estado: "fallida"; lectura: NombreDeLectura; error: string };

export function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

type LadoDeLaRegla = Pick<LadoMedido, "medianaMs" | "seqScanSobreOrden">;

/** Cuanto sube la mediana de despues sobre la de antes (0,21 = +21 %). */
export function variacion(antes: LadoDeLaRegla, despues: LadoDeLaRegla): number {
  if (antes.medianaMs === 0) return despues.medianaMs === 0 ? 0 : Number.POSITIVE_INFINITY;
  return (despues.medianaMs - antes.medianaMs) / antes.medianaMs;
}

/**
 * R25 — hay regresion si la mediana de despues supera en MAS de 20 % a la de antes (solo donde
 * bloquea el porcentaje) o si despues tiene un Seq Scan sobre `orden` y antes ninguno.
 */
export function hayRegresion(m: {
  bloqueaPorPorcentaje: boolean;
  antes: LadoDeLaRegla;
  despues: LadoDeLaRegla;
}): boolean {
  const porTiempo = m.bloqueaPorPorcentaje && m.despues.medianaMs > m.antes.medianaMs * (1 + UMBRAL_DE_REGRESION);
  const porSeqScanNuevo = m.despues.seqScanSobreOrden > 0 && m.antes.seqScanSobreOrden === 0;
  return porTiempo || porSeqScanNuevo;
}

export function codigoDeSalida(resultados: readonly ResultadoDeLectura[]): CodigoDeSalida {
  if (resultados.some((r) => r.estado === "fallida")) return 2;
  return resultados.some((r) => r.estado === "medida" && hayRegresion(r.medicion)) ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Las consultas de despues con las que se completa antes
// ---------------------------------------------------------------------------------------------

// Las tablas de la geografia vieja, de las asignaciones y del catalogo: con la `organizacion` de la
// que el catalogo lee el pais y la `zona` que trae con cada fila de `zona_distrito` (medido: Prisma
// la pide en una consulta aparte). Una consulta que nombra alguna es parte de la lectura que cambia.
// Si una consulta comun leyera `zona`, antes se quedaria sin ella: el error va hacia marcar
// regresion, nunca hacia esconderla.
const TABLAS_DE_LA_GEOGRAFIA =
  /"(provincia|canton|distrito|zona|zona_distrito|distrito_zona_especial|nodo_geografico|tipo_nivel_geografico|organizacion)"/;

export function leeGeografia(sql: string): boolean {
  return TABLAS_DE_LA_GEOGRAFIA.test(sql);
}

/**
 * Las consultas de `despues` que `antes` no tiene (por sentencia, contando repeticiones) y que no
 * leen geografia: lo que la lectura hace igual hoy y la copia no trae.
 */
export function consultasQueCompletanAntes(
  antes: readonly ConsultaCapturada[],
  despues: readonly ConsultaCapturada[],
): ConsultaCapturada[] {
  const pendientes = new Map<string, number>();
  for (const c of antes) pendientes.set(c.consulta.sql, (pendientes.get(c.consulta.sql) ?? 0) + 1);
  const completan: ConsultaCapturada[] = [];
  for (const c of despues) {
    const quedan = pendientes.get(c.consulta.sql) ?? 0;
    if (quedan > 0) {
      pendientes.set(c.consulta.sql, quedan - 1);
      continue;
    }
    if (!leeGeografia(c.consulta.sql)) completan.push(c);
  }
  return completan;
}

// ---------------------------------------------------------------------------------------------
// La medicion
// ---------------------------------------------------------------------------------------------

export interface EntornoDeMedicion {
  cliente: PrismaClient;
  captura: Captura;
  /** Por defecto `CORRIDAS`. */
  corridas?: number;
}

interface DefinicionDeLectura {
  lectura: NombreDeLectura;
  antes: () => Promise<unknown>;
  despues: () => Promise<unknown>;
  completarAntes: boolean;
}

/** Corre el metodo `corridas` veces: las consultas de la primera y el tiempo de pared medio. */
async function capturar(
  captura: Captura,
  leer: () => Promise<unknown>,
  corridas: number,
): Promise<{ consultas: ConsultaCapturada[]; paredMediaMs: number }> {
  let consultas: ConsultaCapturada[] = [];
  let pared = 0;
  for (let i = 0; i < corridas; i++) {
    const t0 = performance.now();
    const r = await captura.grabar(leer);
    pared += performance.now() - t0;
    if (i === 0) consultas = r.consultas;
  }
  return { consultas, paredMediaMs: pared / corridas };
}

async function medirLectura(entorno: EntornoDeMedicion, def: DefinicionDeLectura): Promise<MedicionDeLectura> {
  const corridas = entorno.corridas ?? CORRIDAS;
  const antes = await capturar(entorno.captura, def.antes, corridas);
  const despues = await capturar(entorno.captura, def.despues, corridas);
  const completadas = def.completarAntes ? consultasQueCompletanAntes(antes.consultas, despues.consultas) : [];
  const consultasAntes = [...antes.consultas, ...completadas];

  const sumas = { antes: [] as number[], despues: [] as number[] };
  const seq = { antes: 0, despues: 0 };
  // Alternadas por corrida: ningun lado se lleva toda la cache caliente.
  for (let i = 0; i < corridas; i++) {
    for (const [lado, consultas] of [
      ["antes", consultasAntes],
      ["despues", despues.consultas],
    ] as const) {
      let suma = 0;
      let seqDeLaCorrida = 0;
      for (const c of consultas) {
        const plan = await entorno.captura.explicar(c);
        suma += plan.tiempoMs;
        seqDeLaCorrida += plan.seqScanSobreOrden;
      }
      sumas[lado].push(suma);
      seq[lado] = Math.max(seq[lado], seqDeLaCorrida);
    }
  }

  const lado = (n: number, corridasMs: number[], s: number, paredMediaMs: number): LadoMedido => ({
    consultas: n,
    corridasMs,
    medianaMs: mediana(corridasMs),
    seqScanSobreOrden: s,
    paredMediaMs,
  });
  return {
    lectura: def.lectura,
    bloqueaPorPorcentaje: BLOQUEAN_POR_PORCENTAJE.has(def.lectura),
    antes: lado(consultasAntes.length, sumas.antes, seq.antes, antes.paredMediaMs),
    despues: lado(despues.consultas.length, sumas.despues, seq.despues, despues.paredMediaMs),
    completadas: completadas.length,
  };
}

/** Solo el nombre del error: el mensaje de Prisma puede llevar SQL, parametros o la URL. */
function nombreDeError(error: unknown): string {
  return error instanceof Error ? error.name : "error";
}

async function medirOFallar(entorno: EntornoDeMedicion, def: DefinicionDeLectura): Promise<ResultadoDeLectura> {
  try {
    return { estado: "medida", medicion: await medirLectura(entorno, def) };
  } catch (error) {
    return { estado: "fallida", lectura: def.lectura, error: nombreDeError(error) };
  }
}

// ---------------------------------------------------------------------------------------------
// Que se mide: los objetivos de la empresa
// ---------------------------------------------------------------------------------------------

type FilasDelCierre = Awaited<ReturnType<typeof leerFilasDelCierre>>;

export interface Objetivos {
  organizacionId: string;
  /** La tienda con mas ordenes vivas. No se imprime: es un usuario. */
  tiendaId: string | null;
  /** La provincia con mas ordenes vivas de la empresa (el mismo id que su nodo). */
  provinciaId: string | null;
  /** La zona con mas distritos y sus distritos actuales. */
  zona: { id: string; distritoIds: string[] } | null;
  /** Las filas de snapshot del cierre mas grande de los ultimos 30 dias. */
  filasDelCierre: FilasDelCierre | null;
}

async function leerFilasDelCierre(cliente: PrismaClient, cierreId: string) {
  return cliente.gestionOrden.findMany({ where: { cierreId }, select: SNAPSHOT_SELECT, orderBy: { id: "asc" } });
}

/** Elige, dentro de la empresa, sobre que se mide cada lectura. */
export async function elegirObjetivos(cliente: PrismaClient, organizacionId: string): Promise<Objetivos> {
  return conEmpresa(organizacionId, async () => {
    const tienda = await cliente.orden.groupBy({
      by: ["tiendaId"],
      where: { deletedAt: null },
      _count: { _all: true },
      orderBy: [{ _count: { tiendaId: "desc" } }, { tiendaId: "asc" }],
      take: 1,
    });
    const provincia = await cliente.orden.groupBy({
      by: ["provinciaId"],
      where: { deletedAt: null },
      _count: { _all: true },
      orderBy: [{ _count: { provinciaId: "desc" } }, { provinciaId: "asc" }],
      take: 1,
    });
    const zona = await cliente.zonaDistrito.groupBy({
      by: ["zonaId"],
      _count: { _all: true },
      orderBy: [{ _count: { zonaId: "desc" } }, { zonaId: "asc" }],
      take: 1,
    });
    const desde = new Date(Date.now() - DIAS_DEL_CIERRE * 24 * 60 * 60 * 1000);
    const cierre = await cliente.gestionOrden.groupBy({
      by: ["cierreId"],
      where: { cierreId: { not: null }, cierre: { createdAt: { gte: desde } } },
      _count: { _all: true },
      orderBy: [{ _count: { cierreId: "desc" } }, { cierreId: "asc" }],
      take: 1,
    });

    const zonaId = zona[0]?.zonaId ?? null;
    const distritos =
      zonaId === null
        ? []
        : await cliente.zonaDistrito.findMany({ where: { zonaId }, select: { distritoId: true }, orderBy: { distritoId: "asc" } });
    const cierreId = cierre[0]?.cierreId ?? null;
    return {
      organizacionId,
      tiendaId: tienda[0]?.tiendaId ?? null,
      provinciaId: provincia[0]?.provinciaId ?? null,
      zona: zonaId === null ? null : { id: zonaId, distritoIds: distritos.map((d) => d.distritoId) },
      filasDelCierre: cierreId === null ? null : await leerFilasDelCierre(cliente, cierreId),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Las cinco lecturas (design §10)
// ---------------------------------------------------------------------------------------------

/** Las cuatro lecturas de empresa, dentro de su contexto. Sin objetivo, «sin-muestra». */
export async function medirLecturasDeEmpresa(entorno: EntornoDeMedicion, o: Objetivos): Promise<ResultadoDeLectura[]> {
  const { cliente } = entorno;
  return conEmpresa(o.organizacionId, async () => {
    const resultados: ResultadoDeLectura[] = [];

    resultados.push(
      await medirOFallar(entorno, {
        lectura: "listado-ordenes",
        completarAntes: true,
        antes: () =>
          hoy.paginaListadoDeHoy(cliente, { sortBy: "created_at", sortDir: "desc", skip: 0, take: TAMANO_DE_PAGINA }),
        despues: () =>
          new OrdenRepository(cliente).list({
            where: {},
            sortBy: "created_at",
            sortDir: "desc",
            skip: 0,
            take: TAMANO_DE_PAGINA,
          }),
      }),
    );

    const tiendaId = o.tiendaId;
    resultados.push(
      tiendaId === null
        ? { estado: "sin-muestra", lectura: "listado-api", motivo: "sin ordenes vivas" }
        : await medirOFallar(entorno, {
            lectura: "listado-api",
            completarAntes: true,
            antes: () => hoy.paginaApiDeHoy(cliente, { ownerId: tiendaId, skip: 0, take: TAMANO_DE_PAGINA }),
            despues: () => new OrdenRepository(cliente).listByOwner({ ownerId: tiendaId, skip: 0, take: TAMANO_DE_PAGINA }),
          }),
    );

    const filas = o.filasDelCierre;
    resultados.push(
      filas === null || filas.length === 0
        ? { estado: "sin-muestra", lectura: "cierre-descriptivos", motivo: `sin cierres en ${DIAS_DEL_CIERRE} dias` }
        : await medirOFallar(entorno, {
            lectura: "cierre-descriptivos",
            completarAntes: false,
            // Como en `crearCierre`: dentro de la transaccion del cierre.
            antes: () => cliente.$transaction((tx) => hoy.leerDescriptivosDeOrdenes(filas, tx)),
            despues: () => cliente.$transaction((tx) => leerDescriptivosDeOrdenes(filas, tx)),
          }),
    );

    const zona = o.zona;
    resultados.push(
      zona === null || zona.distritoIds.length === 0
        ? { estado: "sin-muestra", lectura: "reconciliacion", motivo: "sin zonas con distritos" }
        : await medirOFallar(entorno, {
            lectura: "reconciliacion",
            completarAntes: false,
            // Un guardado sin cambios: los nodos afectados son los distritos actuales de la zona.
            // Despues, como lo llama `ZonaRepository.update`: con el `tx` sin `$transaction`.
            antes: () => cliente.$transaction((tx) => hoy.planDeHoy(tx, zona.distritoIds)),
            despues: () =>
              cliente.$transaction((tx) => planificarReconciliacion(sinTransaccionAnidada(tx), zona.distritoIds)),
          }),
    );
    return resultados;
  });
}

/** El conteo de ordenes sin entregar de la provincia, en plataforma, como corre en produccion. */
export async function medirConteoEnPlataforma(
  entorno: EntornoDeMedicion,
  provinciaId: string | null,
): Promise<ResultadoDeLectura> {
  if (provinciaId === null) return { estado: "sin-muestra", lectura: "conteo-sin-entregar", motivo: "sin ordenes vivas" };
  const { cliente } = entorno;
  return comoPlataforma("SLT-65", "geo:explain-consultas mide el conteo sin entregar del superadmin", () =>
    medirOFallar(entorno, {
      lectura: "conteo-sin-entregar",
      completarAntes: false,
      antes: () => hoy.contarSinEntregarDeHoy(cliente, "provincia", provinciaId),
      despues: () => new OrdenRepository(cliente).contarSinEntregarPorNodoGeografico("provincia", provinciaId),
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// El informe: etiquetas y numeros (R24)
// ---------------------------------------------------------------------------------------------

const ms = (n: number): string => n.toFixed(3);

function porcentajeTexto(m: MedicionDeLectura): string {
  const v = variacion(m.antes, m.despues);
  if (!Number.isFinite(v)) return "+inf %";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)} %`;
}

export function lineasDeObjetivos(o: Objetivos): string[] {
  return [
    `empresa ${o.organizacionId}: tienda=${o.tiendaId === null ? "ninguna" : "la de mas ordenes"} ` +
      `provincia=${o.provinciaId ?? "ninguna"} zona=${o.zona === null ? "ninguna" : `${o.zona.id} (${o.zona.distritoIds.length} distritos)`} ` +
      `cierre=${o.filasDelCierre === null ? "ninguno" : `${o.filasDelCierre.length} filas`}`,
  ];
}

export function lineaDeResultado(r: ResultadoDeLectura): string {
  if (r.estado === "sin-muestra") return `lectura ${r.lectura}: sin muestra (${r.motivo})`;
  if (r.estado === "fallida") return `lectura ${r.lectura}: fallo al leer (${r.error})`;
  const m = r.medicion;
  return (
    `lectura ${m.lectura}: consultas antes=${m.antes.consultas}` +
    (m.completadas > 0 ? ` (${m.completadas} comunes)` : "") +
    ` despues=${m.despues.consultas}` +
    ` | mediana de ${m.antes.corridasMs.length} antes=${ms(m.antes.medianaMs)} ms despues=${ms(m.despues.medianaMs)} ms (${porcentajeTexto(m)})` +
    ` | seq-scan orden antes=${m.antes.seqScanSobreOrden} despues=${m.despues.seqScanSobreOrden}` +
    ` | pared media antes=${ms(m.antes.paredMediaMs)} ms despues=${ms(m.despues.paredMediaMs)} ms` +
    ` | bloquea-20%=${m.bloqueaPorPorcentaje ? "si" : "no"} regresion=${hayRegresion(m) ? "SI" : "no"}`
  );
}

// ---------------------------------------------------------------------------------------------
// Cliente, argumentos y entrada
// ---------------------------------------------------------------------------------------------

/** El cliente del script: el de solo lectura de `geo-equivalencia-dinero.ts`, con la captura. */
export function crearClienteDeMedicion(url: string | undefined, captura: Captura): PrismaClient {
  const adapter = conConsultasEnSeriePorTransaccion(
    captura.envolver(
      new PrismaPg({
        connectionString: url,
        max: 2,
        options: "-c default_transaction_read_only=on",
      }),
    ),
  );
  const base = new PrismaClient({ adapter, omit: PRISMA_OMIT }) as unknown as PrismaClient;
  return conAislamientoPorEmpresa(base, async () => null);
}

/** Solo localhost: el script no corre contra ninguna otra base. */
export function esBaseLocal(url: string | undefined): boolean {
  if (url === undefined || url.trim() === "") return false;
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

export interface Argumentos {
  empresa: string | null;
}

export function leerArgumentos(argv: readonly string[]): Argumentos | null {
  const r: Argumentos = { empresa: null };
  for (let i = 0; i < argv.length; i++) {
    const valor = argv[i + 1];
    if (argv[i] !== "--empresa" || valor === undefined || valor.trim() === "" || valor.startsWith("--")) return null;
    r.empresa = valor;
    i++;
  }
  return r;
}

/** Sin `--empresa`: la empresa con mas ordenes vivas (se cuenta en plataforma, sin filtro). */
async function empresaConMasOrdenesVivas(cliente: PrismaClient): Promise<string | null> {
  const filas = await comoPlataforma("SLT-65", "geo:explain-consultas elige la empresa con mas ordenes vivas", () =>
    cliente.orden.groupBy({
      by: ["organizacionId"],
      where: { deletedAt: null },
      _count: { _all: true },
      orderBy: [{ _count: { organizacionId: "desc" } }, { organizacionId: "asc" }],
      take: 1,
    }),
  );
  return filas[0]?.organizacionId ?? null;
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
    process.exitCode = 2;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!esBaseLocal(url)) {
    // Sin la URL: lleva la contraseña.
    console.error("ABORTA: DATABASE_URL no apunta a localhost. Este script solo corre contra una base local.");
    process.exitCode = 2;
    return;
  }

  const captura = crearCaptura("transaccion-nueva");
  const cliente = crearClienteDeMedicion(url, captura);
  const entorno: EntornoDeMedicion = { cliente, captura };
  try {
    const organizacionId = argumentos.empresa ?? (await empresaConMasOrdenesVivas(cliente));
    if (organizacionId === null) {
      console.error("no hay ninguna empresa con ordenes vivas");
      process.exitCode = 2;
      return;
    }
    const objetivos = await elegirObjetivos(cliente, organizacionId);
    const resultados = [
      ...(await medirLecturasDeEmpresa(entorno, objetivos)),
      await medirConteoEnPlataforma(entorno, objetivos.provinciaId),
    ];
    for (const linea of lineasDeObjetivos(objetivos)) console.log(linea);
    for (const r of resultados) console.log(lineaDeResultado(r));
    const codigo = codigoDeSalida(resultados);
    const conRegresion = resultados.filter((r) => r.estado === "medida" && hayRegresion(r.medicion)).length;
    console.log(
      `total: lecturas=${resultados.length} con-regresion=${conRegresion} ` +
        `fallidas=${resultados.filter((r) => r.estado === "fallida").length} ` +
        `sin-muestra=${resultados.filter((r) => r.estado === "sin-muestra").length} salida=${codigo}`,
    );
    process.exitCode = codigo;
  } finally {
    await cliente.$disconnect();
  }
}

// Solo auto-ejecuta cuando este archivo es el entrypoint (no cuando un test lo importa).
const esEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntrypoint) {
  main().catch((error: unknown) => {
    console.error(`Fallo geo:explain-consultas (${nombreDeError(error)}).`);
    process.exit(2);
  });
}
