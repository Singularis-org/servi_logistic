import { pathToFileURL } from "node:url";

import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import {
  condicionesDeLugar,
  resolverLugar,
  whereDeLugares,
  type LugaresDelFiltro,
} from "@/lib/repositories/_shared/lugares-del-filtro";
import type { CatalogoGeografico } from "@/lib/services/geografia-dominio";

import { crearCaptura } from "./geo-equivalencia/captura-consultas";
import type { FacetasDeHoy } from "./geo-equivalencia/analitica-de-hoy";
import {
  condicionesSateliteDeHoy,
  lugarDeFacetas,
  paginaListadoOrdenes,
  paginaSateliteSql,
  whereDeHoy,
} from "./geo-equivalencia/filtros-de-hoy";
import {
  medirOFallar,
  nombreDeError,
  variacion,
  type EntornoDeMedicion,
  type LadoDeLaRegla,
  type ResultadoDeLectura as ResultadoGenerico,
} from "./geo-equivalencia/medicion";
import { crearClienteDeMedicion, esBaseLocal, leerArgumentos, UMBRAL_DE_REGRESION } from "./geo-explain-consultas";

// SLT-47 (design §9; R29, R30) — `pnpm geo:explain-filtros [--empresa <id>]`.
//
// Mide ANTES y DESPUES el filtro de lugar en el listado de `/ordenes` y en la pagina de la bodega
// satelite, cada uno con la provincia de mas ordenes vivas, el canton y el distrito de mas ordenes:
//   - antes: la consulta congelada (`filtros-de-hoy.ts`) con la columna del nivel;
//   - despues: la misma consulta con la condicion de lugar de `lib/` (`whereDeLugares`,
//     `condicionesDeLugar`) sobre los ids que resuelve el catalogo. La carga del catalogo se hace
//     FUERA de la medicion: es una por instancia y la mide `geo:explain-analitica`.
// En cada medida corre `EXPLAIN ANALYZE` 5 veces por lado (`medirLectura`) y toma la mediana. Hay
// regresion si la mediana sube MAS de un 20 % o aparece un Seq Scan sobre `orden` que antes no estaba.
//
// Solo lectura y solo contra localhost (R30). Imprime cifras e ids, nunca SQL, nombres ni datos de
// destinatarios. Salida: 0 sin regresion, 1 con regresion, 2 si una lectura fallo (o argumentos o base).

const USO = "Uso: pnpm geo:explain-filtros [--empresa <organizacion_id>]";

/** La primera pagina de los dos listados. */
export const TAMANO_DE_PAGINA = 50;

export type CodigoDeSalida = 0 | 1 | 2;

export type Nivel = "provincia" | "canton" | "distrito";
export type NombreDeLectura = `listado-ordenes:${Nivel}` | `pagina-satelite:${Nivel}`;
export type ResultadoDeLectura = ResultadoGenerico<NombreDeLectura>;

/** R29 — mas de un 20 % de la mediana, o un Seq Scan sobre `orden` que antes no estaba. */
export function hayRegresion(m: { antes: LadoDeLaRegla; despues: LadoDeLaRegla }): boolean {
  const porTiempo = m.despues.medianaMs > m.antes.medianaMs * (1 + UMBRAL_DE_REGRESION);
  const porSeqScanNuevo = m.despues.seqScanSobreOrden > 0 && m.antes.seqScanSobreOrden === 0;
  return porTiempo || porSeqScanNuevo;
}

export function codigoDeSalida(resultados: readonly ResultadoDeLectura[]): CodigoDeSalida {
  if (resultados.some((r) => r.estado === "fallida")) return 2;
  return resultados.some((r) => r.estado === "medida" && hayRegresion(r.medicion)) ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Que se mide
// ---------------------------------------------------------------------------------------------

export interface Objetivos {
  organizacionId: string;
  /** El lugar de cada nivel con mas ordenes vivas (`null` si la empresa no tiene). */
  lugares: Record<Nivel, string | null>;
  /** La zona no central con mas ordenes vivas: la de la bodega satelite. */
  zonaId: string | null;
}

async function conMasOrdenes(cliente: PrismaClient, columna: "provinciaId" | "cantonId" | "distritoId" | "zonaId", where = {}) {
  const filas = await cliente.orden.groupBy({
    by: [columna],
    where: { deletedAt: null, ...(columna === "distritoId" ? { distritoId: { not: null } } : {}), ...where },
    _count: { _all: true },
    orderBy: [{ _count: { [columna]: "desc" } }, { [columna]: "asc" }],
    take: 1,
  } as never);
  const fila = (filas as unknown as Record<string, string | null>[])[0];
  return fila?.[columna] ?? null;
}

/** Los objetivos de la empresa, en su contexto. */
export async function elegirObjetivos(cliente: PrismaClient, organizacionId: string): Promise<Objetivos> {
  return conEmpresa(organizacionId, async () => {
    const noCentrales = (await cliente.zona.findMany({ where: { esCentral: false }, select: { id: true } })).map((z) => z.id);
    return {
      organizacionId,
      lugares: {
        provincia: await conMasOrdenes(cliente, "provinciaId"),
        canton: await conMasOrdenes(cliente, "cantonId"),
        distrito: await conMasOrdenes(cliente, "distritoId"),
      },
      zonaId: noCentrales.length === 0 ? null : await conMasOrdenes(cliente, "zonaId", { zonaId: { in: noCentrales } }),
    };
  });
}

const FACETA: Record<Nivel, keyof FacetasDeHoy> = { provincia: "provincia_id", canton: "canton_id", distrito: "distrito_id" };

function lugaresDe(catalogo: CatalogoGeografico, f: FacetasDeHoy): LugaresDelFiltro {
  const elegido = lugarDeFacetas(catalogo, f);
  return elegido === undefined ? {} : { lugar: resolverLugar(catalogo, elegido) };
}

/** Las seis medidas de la empresa (R29), dentro de su contexto. */
export async function medirLecturas(entorno: EntornoDeMedicion, o: Objetivos): Promise<ResultadoDeLectura[]> {
  const { cliente } = entorno;
  return conEmpresa(o.organizacionId, async () => {
    const { catalogo } = await new CatalogoGeograficoRepository(cliente).deLaEmpresa();
    const resultados: ResultadoDeLectura[] = [];
    for (const nivel of ["provincia", "canton", "distrito"] as const) {
      const id = o.lugares[nivel];
      const listado: NombreDeLectura = `listado-ordenes:${nivel}`;
      const satelite: NombreDeLectura = `pagina-satelite:${nivel}`;
      if (id === null) {
        resultados.push({ estado: "sin-muestra", lectura: listado, motivo: "sin ordenes vivas" });
        resultados.push({ estado: "sin-muestra", lectura: satelite, motivo: "sin ordenes vivas" });
        continue;
      }
      const facetas: FacetasDeHoy = { [FACETA[nivel]]: [id] };
      const lugares = lugaresDe(catalogo, facetas);
      resultados.push(
        await medirOFallar(entorno, {
          lectura: listado,
          antes: () => paginaListadoOrdenes(cliente, whereDeHoy(facetas), TAMANO_DE_PAGINA),
          despues: () => paginaListadoOrdenes(cliente, whereDeLugares(lugares), TAMANO_DE_PAGINA),
          completarAntes: false,
          bloqueaPorPorcentaje: true,
        }),
      );
      const zonaId = o.zonaId;
      if (zonaId === null) {
        resultados.push({ estado: "sin-muestra", lectura: satelite, motivo: "sin zona satelite" });
        continue;
      }
      resultados.push(
        await medirOFallar(entorno, {
          lectura: satelite,
          antes: () => cliente.$queryRaw(paginaSateliteSql(zonaId, condicionesSateliteDeHoy(facetas), TAMANO_DE_PAGINA)),
          despues: () => cliente.$queryRaw(paginaSateliteSql(zonaId, condicionesDeLugar(lugares), TAMANO_DE_PAGINA)),
          completarAntes: false,
          bloqueaPorPorcentaje: true,
        }),
      );
    }
    return resultados;
  });
}

// ---------------------------------------------------------------------------------------------
// El informe
// ---------------------------------------------------------------------------------------------

const ms = (n: number): string => n.toFixed(3);

function porcentaje(m: { antes: LadoDeLaRegla; despues: LadoDeLaRegla }): string {
  const v = variacion(m.antes, m.despues);
  if (!Number.isFinite(v)) return "+inf %";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)} %`;
}

export function lineaDeObjetivos(o: Objetivos): string {
  const l = o.lugares;
  return (
    `empresa ${o.organizacionId}: provincia=${l.provincia ?? "ninguna"} canton=${l.canton ?? "ninguno"} ` +
    `distrito=${l.distrito ?? "ninguno"} zona=${o.zonaId ?? "ninguna"}`
  );
}

export function lineaDeResultado(r: ResultadoDeLectura): string {
  if (r.estado === "sin-muestra") return `lectura ${r.lectura}: sin muestra (${r.motivo})`;
  if (r.estado === "fallida") return `lectura ${r.lectura}: fallo al leer (${r.error})`;
  const m = r.medicion;
  return (
    `lectura ${m.lectura}: consultas antes=${m.antes.consultas} despues=${m.despues.consultas}` +
    ` | mediana de ${m.antes.corridasMs.length} antes=${ms(m.antes.medianaMs)} ms despues=${ms(m.despues.medianaMs)} ms (${porcentaje(m)})` +
    ` | seq-scan orden antes=${m.antes.seqScanSobreOrden} despues=${m.despues.seqScanSobreOrden}` +
    ` | regresion=${hayRegresion(m) ? "SI" : "no"}`
  );
}

// ---------------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------------

/** Sin `--empresa`: la empresa con mas ordenes vivas, contada en su contexto. */
async function empresaConMasOrdenesVivas(cliente: PrismaClient): Promise<string | null> {
  let mejor: { id: string; n: number } | null = null;
  const resumen = await paraCadaEmpresa(
    async (id) => {
      const n = await cliente.orden.count({ where: { deletedAt: null } });
      if (mejor === null || n > mejor.n || (n === mejor.n && id < mejor.id)) mejor = { id, n };
    },
    { cliente: cliente as unknown as ClienteDeOrganizaciones },
  );
  if (resumen.fallidas.length > 0) throw new Error("no se pudieron contar las ordenes de todas las empresas");
  const elegida = mejor as { id: string; n: number } | null;
  return elegida !== null && elegida.n > 0 ? elegida.id : null;
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
  try {
    const organizacionId = argumentos.empresa ?? (await empresaConMasOrdenesVivas(cliente));
    if (organizacionId === null) {
      console.error("no hay ninguna empresa con ordenes vivas");
      process.exitCode = 2;
      return;
    }
    const objetivos = await elegirObjetivos(cliente, organizacionId);
    const resultados = await medirLecturas({ cliente, captura }, objetivos);
    console.log(lineaDeObjetivos(objetivos));
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
    console.error(`geo:explain-filtros: fallo (${nombreDeError(error)})`);
    process.exitCode = 2;
  });
}
