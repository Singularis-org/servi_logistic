import { pathToFileURL } from "node:url";

import type { PrismaClient } from "@prisma/client";

import { prepararConteoEntregas, type ConsultaConteoEntregas } from "@/lib/analytics/entregas-conteo";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { CicloVidaRepository } from "@/lib/repositories/CicloVidaRepository";
import { ConteoCargadasPorDiaRepository } from "@/lib/repositories/ConteoCargadasPorDiaRepository";
import { ConteoDevolucionesRepository } from "@/lib/repositories/ConteoDevolucionesRepository";
import { ConteoEntregasRepository } from "@/lib/repositories/ConteoEntregasRepository";
import { ConteoPorStatusRepository } from "@/lib/repositories/ConteoPorStatusRepository";
import { InformeTransitoRepository } from "@/lib/repositories/InformeTransitoRepository";
import { cortesPorZona } from "@/lib/whatsapp-envios/informes/transito/calculo";
import { estadosIncluidos, PARAMETROS_POR_DEFECTO } from "@/lib/whatsapp-envios/informes/transito/parametros";
import type { ConsultaTransito } from "@/lib/whatsapp-envios/informes/transito/tipos";

import * as hoy from "./geo-equivalencia/analitica-de-hoy";
import { crearCaptura } from "./geo-equivalencia/captura-consultas";
import {
  medirOFallar,
  nombreDeError,
  variacion,
  type EntornoDeMedicion,
  type LadoDeLaRegla,
  type LadoMedido,
  type MedicionDeLectura as MedicionGenerica,
  type ResultadoDeLectura as ResultadoGenerico,
} from "./geo-equivalencia/medicion";
import { crearClienteDeMedicion, esBaseLocal, leerArgumentos, UMBRAL_DE_REGRESION } from "./geo-explain-consultas";

// SLT-71 (design §9; R19–R22) — `pnpm geo:explain-analitica [--empresa <id>]`.
//
// Mide, para las seis lecturas de SLT-71, la de HOY (la copia congelada de
// `geo-equivalencia/analitica-de-hoy.ts`) frente a la NUEVA (los repositorios, catalogo incluido). La
// medicion es la de SLT-65, compartida en `geo-equivalencia/medicion.ts`: cada lectura se corre y se
// capturan sus consultas; cada consulta se repite como `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` con
// su contexto, 5 corridas por lado; por corrida se suman los `Execution Time` y se toma la mediana.
//
// Las de analitica se miden con la faceta de la provincia con mas ordenes vivas de la empresa: es la
// que mas ids manda al `= ANY` y donde el plan del `OR` puede cambiar. Sin faceta, «despues» es
// identico a «antes» (R5): eso lo prueba `geo-analitica-lugar.test.ts`, no este script. Transito, con
// los parametros por defecto y todas las zonas.
//
// LA REGLA (`veredicto`; decisiones del 2026-11-04 y del 2026-10-31):
//   - un Seq Scan sobre `orden` que antes no estaba es regresion en las seis, ciclo de vida incluido;
//   - en transito y en los cuatro conteos, +20 % de la mediana total (catalogo incluido) es regresion
//     si tambien sube mas de 20 % la suma SIN las consultas del catalogo; si no, es «costo fijo del
//     catalogo» (R21): se imprime con las dos medianas sin catalogo y no bloquea;
//   - en ciclo de vida, el porcentaje se imprime y no bloquea.
//
// SOLO LECTURA (R18): el cliente de SLT-65 (`default_transaction_read_only = on`), y solo se explican
// `SELECT`. SIN DATOS PERSONALES (R18): no imprime SQL, parametros ni nombres; solo etiquetas, ids de
// empresa y nodo, y numeros. SOLO CONTRA localhost. Lo corre una PERSONA sobre la copia de produccion
// restaurada en local antes del merge (T8.3). Ningun agente fuera de la base de tests local.

const USO = "Uso: pnpm geo:explain-analitica [--empresa <organizacion_id>]";

/** Salidas (R22): 0 sin regresion, 1 con regresion, 2 si una lectura fallo (o argumentos o base malos). */
export type CodigoDeSalida = 0 | 1 | 2;

export type NombreDeLectura =
  | "transito-filas"
  | "conteo-entregas"
  | "conteo-por-status"
  | "conteo-cargadas-por-dia"
  | "conteo-devoluciones"
  | "ciclo-vida";

export const LECTURAS: readonly NombreDeLectura[] = [
  "transito-filas",
  "conteo-entregas",
  "conteo-por-status",
  "conteo-cargadas-por-dia",
  "conteo-devoluciones",
  "ciclo-vida",
];

/** Las que bloquean por +20 % (decision «¿Que lecturas bloquean por +20 %?»): todas menos ciclo de vida. */
export const BLOQUEAN_POR_PORCENTAJE: ReadonlySet<NombreDeLectura> = new Set(LECTURAS.filter((l) => l !== "ciclo-vida"));

export type MedicionDeLectura = MedicionGenerica<NombreDeLectura>;
export type ResultadoDeLectura = ResultadoGenerico<NombreDeLectura>;

/** Un maestro sintetico de la empresa: alcance `global` dentro de ella. */
const ACTOR_MAESTRO = { usuarioId: "geo-explain-analitica", rol: "maestro" } as const;

// ---------------------------------------------------------------------------------------------
// La regla (R20, R21)
// ---------------------------------------------------------------------------------------------

export type Veredicto = "ok" | "costo-fijo-del-catalogo" | "regresion";

type LadoDelVeredicto = LadoDeLaRegla & Pick<LadoMedido, "sinCatalogo">;

/** La suma sin catalogo de un lado; sin ella (un lado hecho a mano), la total. */
const sinCatalogo = (l: LadoDelVeredicto): LadoDeLaRegla => ({
  medianaMs: l.sinCatalogo?.medianaMs ?? l.medianaMs,
  seqScanSobreOrden: l.seqScanSobreOrden,
});

/**
 * R20, R21. «Mas de 20 %» es estricto: justo 20 % no es regresion. Un Seq Scan sobre `orden` es
 * nuevo si despues hay mas que antes (aparece uno que antes no estaba).
 */
export function veredicto(m: {
  bloqueaPorPorcentaje: boolean;
  antes: LadoDelVeredicto;
  despues: LadoDelVeredicto;
}): Veredicto {
  if (m.despues.seqScanSobreOrden > m.antes.seqScanSobreOrden) return "regresion";
  if (!m.bloqueaPorPorcentaje) return "ok";
  if (variacion(m.antes, m.despues) <= UMBRAL_DE_REGRESION) return "ok";
  return variacion(sinCatalogo(m.antes), sinCatalogo(m.despues)) > UMBRAL_DE_REGRESION ? "regresion" : "costo-fijo-del-catalogo";
}

export function codigoDeSalida(resultados: readonly ResultadoDeLectura[]): CodigoDeSalida {
  if (resultados.some((r) => r.estado === "fallida")) return 2;
  return resultados.some((r) => r.estado === "medida" && veredicto(r.medicion) === "regresion") ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Que se mide
// ---------------------------------------------------------------------------------------------

/** La provincia con mas ordenes vivas de la empresa (el mismo id que su nodo), o `null`. */
export async function provinciaConMasOrdenes(cliente: PrismaClient, organizacionId: string): Promise<string | null> {
  return conEmpresa(organizacionId, async () => {
    const filas = await cliente.orden.groupBy({
      by: ["provinciaId"],
      where: { deletedAt: null },
      _count: { _all: true },
      orderBy: [{ _count: { provinciaId: "desc" } }, { provinciaId: "asc" }],
      take: 1,
    });
    return filas[0]?.provinciaId ?? null;
  });
}

function consultaDeAnalitica(provinciaId: string): ConsultaConteoEntregas {
  const p = prepararConteoEntregas({ provincia_id: [provinciaId] }, ACTOR_MAESTRO);
  // Solo el estado: el detalle de la preparacion podria repetir la entrada.
  if (p.status !== "ok") throw new Error(`geo:explain-analitica: consulta no concedida (${p.status})`);
  return p.consulta;
}

/** Las seis lecturas de design §9.2, dentro del contexto de la empresa. */
export async function medirLecturas(
  entorno: EntornoDeMedicion,
  organizacionId: string,
  provinciaId: string | null,
): Promise<ResultadoDeLectura[]> {
  const { cliente } = entorno;
  return conEmpresa(organizacionId, async () => {
    const resultados: ResultadoDeLectura[] = [];
    const medir = (lectura: NombreDeLectura, antes: () => Promise<unknown>, despues: () => Promise<unknown>) =>
      medirOFallar(entorno, { lectura, antes, despues, completarAntes: false, bloqueaPorPorcentaje: BLOQUEAN_POR_PORCENTAJE.has(lectura) });

    // Transito: la consulta de una generacion se arma fuera de la medicion (las zonas son la primera de
    // las 3 llamadas, igual en los dos lados). Un repositorio nuevo por corrida: la carga del catalogo,
    // una por instancia, entra en cada una.
    let transito: ConsultaTransito | null = null;
    try {
      const zonas = await new InformeTransitoRepository(cliente).zonas();
      transito = {
        hito: PARAMETROS_POR_DEFECTO.hito,
        estados: estadosIncluidos(PARAMETROS_POR_DEFECTO),
        cortes: cortesPorZona(zonas, PARAMETROS_POR_DEFECTO, new Date()),
      };
    } catch (error) {
      resultados.push({ estado: "fallida", lectura: "transito-filas", error: nombreDeError(error) });
    }
    if (transito !== null) {
      const q = transito;
      resultados.push(
        await medir(
          "transito-filas",
          () => hoy.filasEnAlertaDeHoy(cliente, q),
          () => new InformeTransitoRepository(cliente).filasEnAlerta(q),
        ),
      );
    }

    if (provinciaId === null) {
      for (const lectura of LECTURAS.filter((l) => l !== "transito-filas")) {
        resultados.push({ estado: "sin-muestra", lectura, motivo: "sin ordenes vivas" });
      }
      return resultados;
    }
    const q = consultaDeAnalitica(provinciaId);
    resultados.push(
      await medir(
        "conteo-entregas",
        async () => hoy.plegarEnDesenlaces(await hoy.contarPorStatusDeHoy(cliente, q)),
        () => new ConteoEntregasRepository(new ConteoPorStatusRepository(cliente)).contar(q),
      ),
      await medir(
        "conteo-por-status",
        () => hoy.contarPorStatusDeHoy(cliente, q),
        () => new ConteoPorStatusRepository(cliente).contarPorStatus(q),
      ),
      await medir(
        "conteo-cargadas-por-dia",
        () => hoy.contarCargadasPorDiaDeHoy(cliente, q),
        () => new ConteoCargadasPorDiaRepository(cliente).contarCargadasPorDia(q),
      ),
      await medir(
        "conteo-devoluciones",
        () => hoy.contarDevolucionesPorCausaDeHoy(cliente, q),
        () => new ConteoDevolucionesRepository(cliente).contarDevolucionesPorCausa(q),
      ),
      await medir(
        "ciclo-vida",
        () => hoy.acumularCiclosDeHoy(cliente, q),
        () => new CicloVidaRepository(cliente).acumularCiclos(q),
      ),
    );
    return resultados;
  });
}

// ---------------------------------------------------------------------------------------------
// El informe: etiquetas y numeros (R18, R19)
// ---------------------------------------------------------------------------------------------

const ms = (n: number): string => n.toFixed(3);

function porcentaje(antes: LadoDeLaRegla, despues: LadoDeLaRegla): string {
  const v = variacion(antes, despues);
  if (!Number.isFinite(v)) return "+inf %";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)} %`;
}

export function lineaDeObjetivos(organizacionId: string, provinciaId: string | null): string {
  return `empresa ${organizacionId}: provincia=${provinciaId ?? "ninguna"} transito=parametros-por-defecto`;
}

export function lineaDeResultado(r: ResultadoDeLectura): string {
  if (r.estado === "sin-muestra") return `lectura ${r.lectura}: sin muestra (${r.motivo})`;
  if (r.estado === "fallida") return `lectura ${r.lectura}: fallo al leer (${r.error})`;
  const m = r.medicion;
  const v = veredicto(m);
  const sinCat =
    v === "costo-fijo-del-catalogo"
      ? ` | sin catalogo antes=${ms(sinCatalogo(m.antes).medianaMs)} ms despues=${ms(sinCatalogo(m.despues).medianaMs)} ms ` +
        `(${porcentaje(sinCatalogo(m.antes), sinCatalogo(m.despues))})`
      : "";
  return (
    `lectura ${m.lectura}: consultas antes=${m.antes.consultas} despues=${m.despues.consultas}` +
    ` | mediana de ${m.antes.corridasMs.length} antes=${ms(m.antes.medianaMs)} ms despues=${ms(m.despues.medianaMs)} ms (${porcentaje(m.antes, m.despues)})` +
    sinCat +
    ` | seq-scan orden antes=${m.antes.seqScanSobreOrden} despues=${m.despues.seqScanSobreOrden}` +
    ` | bloquea-20%=${m.bloqueaPorPorcentaje ? "si" : "no"} veredicto=${v}`
  );
}

// ---------------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------------

/**
 * Sin `--empresa`: la empresa con mas ordenes vivas. Se cuenta empresa por empresa en su contexto
 * (`paraCadaEmpresa`, que lista en plataforma por SL-17): este script no abre plataforma.
 */
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
  const entorno: EntornoDeMedicion = { cliente, captura };
  try {
    const organizacionId = argumentos.empresa ?? (await empresaConMasOrdenesVivas(cliente));
    if (organizacionId === null) {
      console.error("no hay ninguna empresa con ordenes vivas");
      process.exitCode = 2;
      return;
    }
    const provinciaId = await provinciaConMasOrdenes(cliente, organizacionId);
    const resultados = await medirLecturas(entorno, organizacionId, provinciaId);
    console.log(lineaDeObjetivos(organizacionId, provinciaId));
    for (const r of resultados) console.log(lineaDeResultado(r));
    const codigo = codigoDeSalida(resultados);
    const medidas = resultados.flatMap((r) => (r.estado === "medida" ? [veredicto(r.medicion)] : []));
    console.log(
      `total: lecturas=${resultados.length} con-regresion=${medidas.filter((v) => v === "regresion").length} ` +
        `costo-fijo-del-catalogo=${medidas.filter((v) => v === "costo-fijo-del-catalogo").length} ` +
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
    console.error(`Fallo geo:explain-analitica (${nombreDeError(error)}).`);
    process.exit(2);
  });
}
