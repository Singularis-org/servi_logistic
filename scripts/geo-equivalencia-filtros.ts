import { pathToFileURL } from "node:url";

import type { PrismaClient } from "@prisma/client";

import { prepararConteoEntregas, type ConsultaConteoEntregas } from "@/lib/analytics/entregas-conteo";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { ConteoPorStatusRepository } from "@/lib/repositories/ConteoPorStatusRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { nodo, nodosDeProfundidad, type CatalogoGeografico } from "@/lib/services/geografia-dominio";
import { ESTADOS_BODEGA_SATELITE } from "@/lib/utils/estados-bodega-satelite";

import * as hoy from "./geo-equivalencia/analitica-de-hoy";
import type { FacetasDeHoy } from "./geo-equivalencia/analitica-de-hoy";
import type { Cifras } from "./geo-equivalencia/comparacion";
import { LUGAR_INEXISTENTE, lugarDeFacetas, whereDeHoy } from "./geo-equivalencia/filtros-de-hoy";
import { nombreDeError } from "./geo-equivalencia/medicion";
import { crearClienteDeSoloLectura, leerArgumentos as leerArgumentosDeSlt44 } from "./geo-equivalencia-dinero";
import { esBaseLocal } from "./geo-explain-consultas";

// SLT-47 (design §7; R28, R30) — `pnpm geo:equivalencia-filtros [--muestra 20] [--empresa <id>]`.
//
// Compara, empresa por empresa, el filtro de lugar de HOY (las facetas `provincia_id`, `canton_id` y
// `distrito_id`, una columna por nivel en AND: `filtros-de-hoy.ts`) con el NUEVO (`lugar_id`, que el
// servidor resuelve con el catalogo a «esos nodos y los de debajo»), en tres bloques:
//   - `ordenes`: el listado de `/ordenes` (`OrdenRepository.list`), por numero de ordenes y por ids;
//   - `satelite`: el conjunto de la bodega satelite de cada zona no central de la empresa;
//   - `analitica`: el total del desglose por estado (`ConteoPorStatusRepository`).
//
// Filtros: cada provincia, los `--muestra` cantones y distritos con mas ordenes vivas, una
// combinacion de dos niveles de un enlace viejo (el canton con mas ordenes y su provincia) y un id
// inexistente. «Hoy» y «nuevo» se traducen como lo hace la barra (`lugarDeFacetas`).
//
// Las ordenes con la cadena incoherente (su distrito no cuelga de su canton, o su canton de su
// provincia) se cuentan aparte, con sus ids (P1): una diferencia que solo esta hecha de ellas no cuenta.
//
// Solo lectura y solo contra localhost (R30): cliente que abre cada conexion en solo lectura y aborta
// con otra base. Imprime cifras e ids: nunca SQL, parametros, nombres de lugar ni destinatarios.
//
// Salida: 0 todo coincide (o solo difieren incoherentes), 1 algo difiere, 2 una empresa fallo o los
// argumentos o la base no valen.

const USO = "Uso: pnpm geo:equivalencia-filtros [--muestra <n>] [--empresa <organizacion_id>]";

/** Cantones y distritos de la muestra por defecto. */
export const MUESTRA_POR_DEFECTO = 20;

export type CodigoDeSalida = 0 | 1 | 2;

const ACTOR_MAESTRO = { usuarioId: "geo-equivalencia-filtros", rol: "maestro" } as const;

/** Un listado enorme de una pagina: el «conjunto» del listado de `/ordenes`. */
const SIN_PAGINAR = 1_000_000;

export interface FiltroDeLugar {
  /** `provincia=<id>`, `canton=<id>`, `distrito=<id>`, la combinacion o `inexistente`. Solo ids. */
  etiqueta: string;
  facetas: FacetasDeHoy;
}

export interface DiferenciaDeFiltro {
  bloque: "ordenes" | "satelite" | "analitica";
  filtro: string;
  hoy: number;
  nuevo: number;
}

export interface InformeDeFiltros {
  organizacionId: string;
  filtros: number;
  ordenes: Cifras;
  satelite: Cifras;
  analitica: Cifras;
  /** Las ordenes con cadena incoherente de la empresa (P1), por id. */
  cadenaIncoherente: string[];
  /** Diferencias hechas solo de ordenes incoherentes: informativas. */
  soloIncoherentes: number;
  diferencias: DiferenciaDeFiltro[];
}

export interface OpcionesDeComparacion {
  muestra: number;
}

// ---------------------------------------------------------------------------------------------
// Los filtros
// ---------------------------------------------------------------------------------------------

async function conMasOrdenes(cliente: PrismaClient, columna: "cantonId" | "distritoId", muestra: number): Promise<string[]> {
  const filas =
    columna === "cantonId"
      ? await cliente.orden.groupBy({
          by: ["cantonId"],
          where: { deletedAt: null },
          _count: { _all: true },
          orderBy: [{ _count: { cantonId: "desc" } }, { cantonId: "asc" }],
          take: muestra,
        })
      : await cliente.orden.groupBy({
          by: ["distritoId"],
          where: { deletedAt: null, distritoId: { not: null } },
          _count: { _all: true },
          orderBy: [{ _count: { distritoId: "desc" } }, { distritoId: "asc" }],
          take: muestra,
        });
  return filas.flatMap((f) => {
    const id = "cantonId" in f ? f.cantonId : f.distritoId;
    return id === null ? [] : [id];
  });
}

/** Los filtros de la empresa (R28). */
export async function filtrosDeLugar(cliente: PrismaClient, catalogo: CatalogoGeografico, muestra: number): Promise<FiltroDeLugar[]> {
  const cantones = await conMasOrdenes(cliente, "cantonId", muestra);
  const distritos = await conMasOrdenes(cliente, "distritoId", muestra);
  const filtros: FiltroDeLugar[] = [
    ...nodosDeProfundidad(catalogo, 1).map((p) => ({ etiqueta: `provincia=${p.id}`, facetas: { provincia_id: [p.id] } })),
    ...cantones.map((id) => ({ etiqueta: `canton=${id}`, facetas: { canton_id: [id] } })),
    ...distritos.map((id) => ({ etiqueta: `distrito=${id}`, facetas: { distrito_id: [id] } })),
  ];
  const primerCanton = cantones[0];
  const suProvincia = primerCanton === undefined ? null : (nodo(catalogo, primerCanton)?.padreId ?? null);
  if (primerCanton !== undefined && suProvincia !== null) {
    filtros.push({
      etiqueta: `provincia=${suProvincia}+canton=${primerCanton}`,
      facetas: { provincia_id: [suProvincia], canton_id: [primerCanton] },
    });
  }
  filtros.push({ etiqueta: "inexistente", facetas: { distrito_id: [LUGAR_INEXISTENTE] } });
  return filtros;
}

// ---------------------------------------------------------------------------------------------
// La cadena incoherente
// ---------------------------------------------------------------------------------------------

/** Las ordenes vivas de la empresa cuyo distrito no cuelga de su canton o su canton de su provincia. */
export async function ordenesIncoherentes(cliente: PrismaClient): Promise<string[]> {
  const vivas = await cliente.orden.findMany({
    where: { deletedAt: null },
    orderBy: { id: "asc" },
    select: {
      id: true,
      provinciaId: true,
      cantonId: true,
      canton: { select: { provinciaId: true } },
      distrito: { select: { cantonId: true } },
    },
  });
  return vivas
    .filter((o) => o.canton.provinciaId !== o.provinciaId || (o.distrito !== null && o.distrito.cantonId !== o.cantonId))
    .map((o) => o.id);
}

/** Si los dos conjuntos difieren solo en ordenes incoherentes. */
export function soloDifierenEnIncoherentes(a: ReadonlySet<string>, b: ReadonlySet<string>, incoherentes: ReadonlySet<string>): boolean {
  for (const id of a) if (!b.has(id) && !incoherentes.has(id)) return false;
  for (const id of b) if (!a.has(id) && !incoherentes.has(id)) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Las lecturas
// ---------------------------------------------------------------------------------------------

async function ordenesDeHoy(cliente: PrismaClient, f: FacetasDeHoy): Promise<Set<string>> {
  const filas = await cliente.orden.findMany({ where: { deletedAt: null, ...whereDeHoy(f) }, select: { id: true } });
  return new Set(filas.map((o) => o.id));
}

async function ordenesNuevas(cliente: PrismaClient, lugar: string[] | undefined): Promise<Set<string>> {
  const r = await new OrdenRepository(cliente).list({
    where: lugar === undefined ? {} : { lugarIds: lugar },
    sortBy: "created_at",
    sortDir: "desc",
    skip: 0,
    take: SIN_PAGINAR,
  });
  return new Set(r.items.map((o) => o.id));
}

async function sateliteDeHoy(cliente: PrismaClient, zonaId: string, f: FacetasDeHoy): Promise<Set<string>> {
  // Hoy: el criterio de la bodega (zona, estado, «paso por mi bodega») AND las columnas. Es la
  // interseccion del conjunto sin lugar con las ordenes de esas columnas.
  const deLaBodega = await new OrdenRepository(cliente).findRecepcionSateliteCompleta({
    zonaId,
    estatusValues: [...ESTADOS_BODEGA_SATELITE],
  });
  const porColumna = await ordenesDeHoy(cliente, f);
  return new Set(deLaBodega.map((o) => o.id).filter((id) => porColumna.has(id)));
}

async function sateliteNuevo(cliente: PrismaClient, zonaId: string, lugar: string[] | undefined): Promise<Set<string>> {
  const filas = await new OrdenRepository(cliente).findRecepcionSateliteCompleta({
    zonaId,
    estatusValues: [...ESTADOS_BODEGA_SATELITE],
    ...(lugar === undefined ? {} : { lugarIds: lugar }),
  });
  return new Set(filas.map((o) => o.id));
}

function consultaEntregas(raw: object): ConsultaConteoEntregas {
  const p = prepararConteoEntregas(raw, ACTOR_MAESTRO);
  // Solo el estado: el detalle de la preparacion podria repetir la entrada.
  if (p.status !== "ok") throw new Error(`geo:equivalencia-filtros: consulta no concedida (${p.status})`);
  return p.consulta;
}

const total = (filas: readonly { conteo: number }[]) => filas.reduce((s, f) => s + f.conteo, 0);

// ---------------------------------------------------------------------------------------------
// La comparacion
// ---------------------------------------------------------------------------------------------

/** Compara hoy y nuevo en una empresa (R28). Abre el contexto de esa empresa. */
export async function compararEmpresaFiltros(
  cliente: PrismaClient,
  organizacionId: string,
  opciones: OpcionesDeComparacion,
): Promise<InformeDeFiltros> {
  return conEmpresa(organizacionId, async () => {
    const { catalogo } = await new CatalogoGeograficoRepository(cliente).deLaEmpresa();
    const filtros = await filtrosDeLugar(cliente, catalogo, opciones.muestra);
    const cadenaIncoherente = await ordenesIncoherentes(cliente);
    const incoherentes = new Set(cadenaIncoherente);
    const zonas = (await cliente.zona.findMany({ where: { esCentral: false }, orderBy: { id: "asc" }, select: { id: true } })).map(
      (z) => z.id,
    );

    const informe: InformeDeFiltros = {
      organizacionId,
      filtros: filtros.length,
      ordenes: { comparados: 0, distintos: 0 },
      satelite: { comparados: 0, distintos: 0 },
      analitica: { comparados: 0, distintos: 0 },
      cadenaIncoherente,
      soloIncoherentes: 0,
      diferencias: [],
    };
    const anotar = (bloque: DiferenciaDeFiltro["bloque"], filtro: string, a: Set<string>, b: Set<string>) => {
      informe[bloque].comparados++;
      if (a.size === b.size && [...a].every((id) => b.has(id))) return;
      if (soloDifierenEnIncoherentes(a, b, incoherentes)) {
        informe.soloIncoherentes++;
        return;
      }
      informe[bloque].distintos++;
      informe.diferencias.push({ bloque, filtro, hoy: a.size, nuevo: b.size });
    };

    for (const f of filtros) {
      const lugar = lugarDeFacetas(catalogo, f.facetas);
      // En serie: dentro de la transaccion de un test las lecturas comparten conexion.
      const ordenesHoy = await ordenesDeHoy(cliente, f.facetas);
      const ordenesNuevo = await ordenesNuevas(cliente, lugar);
      anotar("ordenes", f.etiqueta, ordenesHoy, ordenesNuevo);
      for (const zonaId of zonas) {
        anotar(
          "satelite",
          `${f.etiqueta} zona=${zonaId}`,
          await sateliteDeHoy(cliente, zonaId, f.facetas),
          await sateliteNuevo(cliente, zonaId, lugar),
        );
      }
      const hoyN = total(await hoy.contarPorStatusDeHoy(cliente, hoy.conFacetasDeHoy(consultaEntregas({}), f.facetas)));
      const nuevoN = total(
        await new ConteoPorStatusRepository(cliente).contarPorStatus(consultaEntregas(lugar === undefined ? {} : { lugar_id: lugar })),
      );
      informe.analitica.comparados++;
      if (hoyN !== nuevoN) {
        // El desglose no da ids. Se disculpa solo si la diferencia es EXACTAMENTE la de las
        // incoherentes que entran por un solo lado en el listado (mismo universo: ordenes vivas).
        const soloHoy = [...ordenesHoy].filter((id) => incoherentes.has(id) && !ordenesNuevo.has(id)).length;
        const soloNuevo = [...ordenesNuevo].filter((id) => incoherentes.has(id) && !ordenesHoy.has(id)).length;
        if (soloHoy + soloNuevo > 0 && hoyN - nuevoN === soloHoy - soloNuevo) {
          informe.soloIncoherentes++;
          continue;
        }
        informe.analitica.distintos++;
        informe.diferencias.push({ bloque: "analitica", filtro: f.etiqueta, hoy: hoyN, nuevo: nuevoN });
      }
    }
    return informe;
  });
}

// ---------------------------------------------------------------------------------------------
// El informe
// ---------------------------------------------------------------------------------------------

const cifras = (e: string, nombre: string, c: Cifras) => `${e} ${nombre}: comparados=${c.comparados} distintos=${c.distintos}`;

/** Las lineas de una empresa: cifras por bloque, la cadena incoherente con sus ids y cada diferencia. */
export function lineasDeInforme(i: InformeDeFiltros): string[] {
  const e = `empresa ${i.organizacionId}`;
  return [
    `${e} filtros=${i.filtros} solo-incoherentes=${i.soloIncoherentes}`,
    cifras(e, "ordenes", i.ordenes),
    cifras(e, "satelite", i.satelite),
    cifras(e, "analitica", i.analitica),
    `${e} cadena-incoherente: ordenes=${i.cadenaIncoherente.length}`,
    ...i.cadenaIncoherente.map((id) => `  ${e} [cadena-incoherente] ${id}`),
    ...i.diferencias.map((d) => `  ${e} [${d.bloque}] ${d.filtro}: hoy=${d.hoy} nuevo=${d.nuevo}`),
  ];
}

export function hayDiferencias(i: InformeDeFiltros): boolean {
  return [i.ordenes, i.satelite, i.analitica].some((c) => c.distintos > 0);
}

export function codigoDeSalida(informes: readonly InformeDeFiltros[], fallidas: number): CodigoDeSalida {
  if (fallidas > 0) return 2;
  return informes.some(hayDiferencias) ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Argumentos y entrada
// ---------------------------------------------------------------------------------------------

export interface Argumentos {
  muestra: number;
  empresa: string | null;
}

export function leerArgumentos(argv: readonly string[]): Argumentos | null {
  const r = leerArgumentosDeSlt44(argv);
  if (r === null) return null;
  return { empresa: r.empresa, muestra: argv.includes("--muestra") ? r.muestra : MUESTRA_POR_DEFECTO };
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
  const cliente = crearClienteDeSoloLectura(url);
  const opciones: OpcionesDeComparacion = { muestra: argumentos.muestra };
  const informes: InformeDeFiltros[] = [];
  let fallidas = 0;
  try {
    if (argumentos.empresa !== null) {
      try {
        informes.push(await compararEmpresaFiltros(cliente, argumentos.empresa, opciones));
      } catch (error) {
        fallidas++;
        console.error(`empresa ${argumentos.empresa}: fallo al leer (${nombreDeError(error)})`);
      }
    } else {
      const resumen = await paraCadaEmpresa(
        async (id) => {
          informes.push(await compararEmpresaFiltros(cliente, id, opciones));
        },
        { cliente: cliente as unknown as ClienteDeOrganizaciones },
      );
      fallidas = resumen.fallidas.length;
      for (const f of resumen.fallidas) console.error(`empresa ${f.organizacionId}: fallo al leer`);
    }
    for (const informe of informes) for (const linea of lineasDeInforme(informe)) console.log(linea);
    const codigo = codigoDeSalida(informes, fallidas);
    const incoherentes = informes.reduce((n, i) => n + i.cadenaIncoherente.length, 0);
    console.log(
      `total: empresas=${informes.length + fallidas} con-diferencias=${informes.filter(hayDiferencias).length} ` +
        `cadena-incoherente=${incoherentes} fallidas=${fallidas} salida=${codigo}`,
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
    console.error(`geo:equivalencia-filtros: fallo (${nombreDeError(error)})`);
    process.exitCode = 2;
  });
}
