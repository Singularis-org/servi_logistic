import { pathToFileURL } from "node:url";

import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { construirQueryDireccion, hashDireccion } from "@/lib/geo/direccion-query";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { rutaDelLugar } from "@/lib/repositories/_shared/ruta-del-lugar";

import { consultaDeHoy } from "./geo-equivalencia/geocode-de-hoy";
import { nombreDeError } from "./geo-equivalencia/medicion";
import { destinoDeUrl } from "./geo-backfill-nodo";
import { crearClienteDeSoloLectura } from "./geo-equivalencia-dinero";
import { esBaseLocal } from "./geo-explain-consultas";

// SLT-125 (design §8; R34, R35) — `pnpm geo:equivalencia-presentacion [--empresa <id>] [--lote 1000]
// [--destino <proyecto-o-host>]`.
//
// Empresa por empresa, recorre sus ordenes vivas por lotes y cuenta:
//   - `nombres`: las ordenes cuya ruta del catalogo (`rutaDelLugar`, lo que leen desde SLT-125 el listado,
//     las descargas, la etiqueta…) no da los mismos nombres que las tablas viejas `provincia`, `canton` y
//     `distrito` (lo que se leia hasta hoy). Distinto numero de pasos tambien cuenta.
//   - `geocodificacion`: las ordenes con direccion cuya consulta nueva (ruta + `pais.nombre`) no es la de
//     hoy (`geocode-de-hoy.ts`), y de ellas cuantas cambian de huella, es decir, cuantas dejarian de
//     encontrar su entrada de `GeocodeCache`.
//
// En Costa Rica se espera 0 en todo (R17, R33). Lo corre una persona sobre la copia de produccion antes
// del merge (R35); ningun agente lo apunta a produccion.
//
// Solo lectura (R34): el cliente abre cada conexion con `default_transaction_read_only=on`, asi que un
// `INSERT` falla con 25006. Por defecto solo contra localhost; contra otra base (la copia) exige
// `--destino` igual al proyecto o host de la URL, como `geo:backfill`. Imprime cifras e ids de orden:
// nunca SQL, URL, nombres de lugar, direcciones ni datos de destinatarios.
//
// Salida: 0 todo coincide, 1 algo difiere, 2 una empresa fallo o los argumentos o la base no valen.

const USO =
  "Uso: pnpm geo:equivalencia-presentacion [--empresa <organizacion_id>] [--lote <n>] [--destino <proyecto-o-host>]";

export type CodigoDeSalida = 0 | 1 | 2;

export const LOTE_POR_DEFECTO = 1000;

/** Cuantos ids se listan por bloque: la cifra va entera, la lista no inunda la consola. */
export const IDS_MAXIMOS = 100;

/** El cliente del script, en solo lectura. Se exporta para que el test pruebe la barrera (R34). */
export const crearClienteDelScript = crearClienteDeSoloLectura;

export interface InformeDePresentacion {
  organizacionId: string;
  ordenes: number;
  /** Ordenes cuya ruta del catalogo no nombra igual que las tablas viejas. */
  nombresDistintos: string[];
  /** Ordenes con direccion, es decir, con consulta de geocodificacion. */
  conConsulta: number;
  /** Ordenes cuya consulta nueva no es, letra a letra, la de hoy. */
  consultasDistintas: string[];
  /** De esas, las que ademas cambian de huella (pierden su entrada de `GeocodeCache`). */
  huellasDistintas: string[];
}

export interface OpcionesDePresentacion {
  lote: number;
}

interface FilaDeOrden {
  id: string;
  direccion: string | null;
  cantonId: string;
  distritoId: string | null;
  provincia: { nombre: string };
  canton: { nombre: string };
  distrito: { nombre: string } | null;
}

function mismosNombres(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Compara hoy y nuevo en una empresa. Abre el contexto de esa empresa. */
export async function compararEmpresaPresentacion(
  cliente: PrismaClient,
  organizacionId: string,
  opciones: OpcionesDePresentacion,
): Promise<InformeDePresentacion> {
  return conEmpresa(organizacionId, async () => {
    const { catalogo } = await new CatalogoGeograficoRepository(cliente).deLaEmpresa();
    const org = await cliente.organizacion.findFirst({
      where: { id: organizacionId },
      select: { pais: { select: { nombre: true } } },
    });
    if (org === null) throw new Error("geo:equivalencia-presentacion: empresa no visible");
    const paisNombre = org.pais.nombre;

    const informe: InformeDePresentacion = {
      organizacionId,
      ordenes: 0,
      nombresDistintos: [],
      conConsulta: 0,
      consultasDistintas: [],
      huellasDistintas: [],
    };

    let ultimo: string | null = null;
    for (;;) {
      // Por id, en lotes: una copia de produccion no cabe en una sola lectura. Las relaciones viejas se
      // leen aqui a proposito: son «hoy», lo que se compara.
      const lote: FilaDeOrden[] = await cliente.orden.findMany({
        where: { deletedAt: null, ...(ultimo === null ? {} : { id: { gt: ultimo } }) },
        orderBy: { id: "asc" },
        take: opciones.lote,
        select: {
          id: true,
          direccion: true,
          cantonId: true,
          distritoId: true,
          provincia: { select: { nombre: true } },
          canton: { select: { nombre: true } },
          distrito: { select: { nombre: true } },
        },
      });
      if (lote.length === 0) break;
      for (const o of lote) {
        informe.ordenes++;
        const ruta = rutaDelLugar(catalogo, o).map((p) => p.nombre);
        const deHoy = [o.provincia.nombre, o.canton.nombre, ...(o.distrito === null ? [] : [o.distrito.nombre])];
        if (!mismosNombres(ruta, deHoy)) informe.nombresDistintos.push(o.id);

        const qHoy = consultaDeHoy({
          direccion: o.direccion,
          distritoNombre: o.distrito?.nombre ?? null,
          cantonNombre: o.canton.nombre,
          provinciaNombre: o.provincia.nombre,
        });
        const qNueva = construirQueryDireccion({ direccion: o.direccion, ruta, paisNombre });
        if (qHoy === null && qNueva === null) continue;
        informe.conConsulta++;
        if (qHoy === qNueva) continue;
        informe.consultasDistintas.push(o.id);
        if (qHoy === null || qNueva === null || hashDireccion(qHoy) !== hashDireccion(qNueva)) {
          informe.huellasDistintas.push(o.id);
        }
      }
      ultimo = lote[lote.length - 1].id;
      if (lote.length < opciones.lote) break;
    }
    return informe;
  });
}

// ---------------------------------------------------------------------------------------------
// El informe
// ---------------------------------------------------------------------------------------------

function listaDeIds(e: string, bloque: string, ids: readonly string[]): string[] {
  const lineas = ids.slice(0, IDS_MAXIMOS).map((id) => `  ${e} [${bloque}] ${id}`);
  if (ids.length > IDS_MAXIMOS) lineas.push(`  ${e} [${bloque}] … y ${ids.length - IDS_MAXIMOS} mas`);
  return lineas;
}

/** Las lineas de una empresa: solo cifras e ids de orden. */
export function lineasDeInforme(i: InformeDePresentacion): string[] {
  const e = `empresa ${i.organizacionId}`;
  return [
    `${e} ordenes=${i.ordenes} nombres-distintos=${i.nombresDistintos.length}`,
    `${e} con-consulta=${i.conConsulta} consultas-distintas=${i.consultasDistintas.length} huellas-distintas=${i.huellasDistintas.length}`,
    ...listaDeIds(e, "nombres", i.nombresDistintos),
    ...listaDeIds(e, "geocodificacion", i.consultasDistintas),
  ];
}

export function hayDiferencias(i: InformeDePresentacion): boolean {
  return i.nombresDistintos.length > 0 || i.consultasDistintas.length > 0;
}

export function codigoDeSalida(informes: readonly InformeDePresentacion[], fallidas: number): CodigoDeSalida {
  if (fallidas > 0) return 2;
  return informes.some(hayDiferencias) ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Argumentos y entrada
// ---------------------------------------------------------------------------------------------

export interface Argumentos {
  empresa: string | null;
  lote: number;
  destino: string | null;
}

export function leerArgumentos(argv: readonly string[]): Argumentos | null {
  const r: Argumentos = { empresa: null, lote: LOTE_POR_DEFECTO, destino: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const valor = argv[i + 1];
    const sinValor = valor === undefined || valor.trim() === "" || valor.startsWith("--");
    if (arg === "--empresa") {
      if (sinValor) return null;
      r.empresa = valor;
    } else if (arg === "--lote") {
      if (sinValor || !/^\d+$/.test(valor) || Number(valor) < 1) return null;
      r.lote = Number(valor);
    } else if (arg === "--destino") {
      if (sinValor) return null;
      r.destino = valor;
    } else {
      return null;
    }
    i++;
  }
  return r;
}

/**
 * Si el script puede conectarse a `url` (R34): una base local siempre; otra, solo si `--destino` nombra
 * su proyecto o su host, para que nadie lo apunte a una base sin decir a cual.
 */
export function baseAdmitida(url: string | undefined, destino: string | null): boolean {
  if (esBaseLocal(url)) return true;
  const real = destinoDeUrl(url);
  return real !== null && destino !== null && destino.toLowerCase() === real;
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
  if (!baseAdmitida(url, argumentos.destino)) {
    // Sin la URL ni el destino real: la URL lleva la contraseña.
    console.error(
      "ABORTA: DATABASE_URL no apunta a localhost y --destino no nombra su proyecto o host. No se conecto.",
    );
    process.exitCode = 2;
    return;
  }
  const cliente = crearClienteDelScript(url);
  const opciones: OpcionesDePresentacion = { lote: argumentos.lote };
  const informes: InformeDePresentacion[] = [];
  let fallidas = 0;
  try {
    if (argumentos.empresa !== null) {
      try {
        informes.push(await compararEmpresaPresentacion(cliente, argumentos.empresa, opciones));
      } catch (error) {
        fallidas++;
        console.error(`empresa ${argumentos.empresa}: fallo al leer (${nombreDeError(error)})`);
      }
    } else {
      const resumen = await paraCadaEmpresa(
        async (id) => {
          informes.push(await compararEmpresaPresentacion(cliente, id, opciones));
        },
        { cliente: cliente as unknown as ClienteDeOrganizaciones },
      );
      fallidas = resumen.fallidas.length;
      for (const f of resumen.fallidas) console.error(`empresa ${f.organizacionId}: fallo al leer`);
    }
    for (const informe of informes) for (const linea of lineasDeInforme(informe)) console.log(linea);
    const codigo = codigoDeSalida(informes, fallidas);
    const suma = (f: (i: InformeDePresentacion) => number) => informes.reduce((n, i) => n + f(i), 0);
    console.log(
      `total: empresas=${informes.length + fallidas} ordenes=${suma((i) => i.ordenes)} ` +
        `nombres-distintos=${suma((i) => i.nombresDistintos.length)} ` +
        `consultas-distintas=${suma((i) => i.consultasDistintas.length)} ` +
        `huellas-distintas=${suma((i) => i.huellasDistintas.length)} fallidas=${fallidas} salida=${codigo}`,
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
    console.error(`geo:equivalencia-presentacion: fallo (${nombreDeError(error)})`);
    process.exitCode = 2;
  });
}
