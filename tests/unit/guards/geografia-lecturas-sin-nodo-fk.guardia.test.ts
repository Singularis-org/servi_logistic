import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

// SLT-44 (T4.6; R12; design §3, §10) — LAS LECTURAS DE ESTA FEATURE NO LEEN `nodo_geografico_id`.
//
// LA REGLA: el nodo de una asignacion de zona o de una marca especial se lee de su `distrito_id` (el
// nodo tiene el mismo id que el distrito). Ninguna lectura de SLT-44 nombra la columna nueva de
// `orden`, `zona_distrito` ni `distrito_zona_especial`, ni como campo de Prisma (`nodoGeograficoId`)
// ni como columna SQL (`nodo_geografico_id`). Decision cerrada «¿De donde se lee el lugar…?».
//
// QUE SE PIERDE SI ESTO NO EXISTE. El deploy pasaria a depender de que haya corrido el backfill de
// SLT-43: con la columna en NULL, la zona y la marca de cada distrito saldrian vacias, y la carga
// masiva y la cotizacion rechazarian filas o tarifarian sin el pacto especial. Lo mide ademas, en
// base propia y con la columna en NULL, `tests/integration/db/geo-lecturas-sin-backfill.test.ts`.
//
// Se mide sobre el codigo sin comentarios: un comentario que explica la regla no es una lectura.

const RAIZ = path.resolve(__dirname, "../../..");

/** Los archivos enteros de las lecturas de SLT-44 (design §3, §5). */
const ARCHIVOS = [
  "lib/repositories/CatalogoGeograficoRepository.ts",
  "lib/repositories/GeoRepository.ts",
  "lib/repositories/CoberturaRepository.ts",
  "lib/repositories/_shared/zona-especial.ts",
];

/** De `OrdenRepository` solo el bloque de las lecturas de SLT-44; el resto es de SLT-65. */
const ORDEN_REPOSITORY = "lib/repositories/OrdenRepository.ts";
const DESDE = "async findAllProvincias(";
const HASTA = "async findDistritoParaCorreccion(";

/**
 * SLT-65 (T7.2; R19; design §14) — las lecturas de SLT-65 (design §2.1, filas 1–7) viven en estos
 * archivos, y se barren ENTEROS: `OrdenRepository` deja de mirarse solo en el bloque de SLT-44.
 * `_shared/sin-transaccion-anidada.ts` no entra: no lee ninguna tabla (envuelve el cliente).
 */
const ARCHIVOS_SLT65 = [
  ORDEN_REPOSITORY,
  "lib/repositories/CierreDiaRepository.ts",
  "lib/repositories/ZonaRepository.ts",
  "lib/repositories/_shared/lugar-orden.ts",
];

/** Una marca por archivo de SLT-65 que prueba que el barrido lee la lectura de verdad. */
const LECTURAS_SLT65: Record<string, string[]> = {
  [ORDEN_REPOSITORY]: [
    "marcasDeOrdenes(",
    "async findBaseCobroDevolucion(",
    "async findParaCorreccion(",
    "async contarSinEntregarPorNodoGeografico(",
  ],
  "lib/repositories/CierreDiaRepository.ts": ["export async function leerDescriptivosDeOrdenes(", "deLaEmpresa()"],
  "lib/repositories/ZonaRepository.ts": ["export async function planificarReconciliacion(", "deLaEmpresa()"],
  "lib/repositories/_shared/lugar-orden.ts": ["export function lugarDeLaOrden(", "export function whereLugarEn("],
};

/**
 * SLT-45 (design §3.2; decision humana 2026-11-06) — LAS DOS ESCRITURAS EXENTAS, POR NOMBRE.
 *
 * Esta guardia mide LECTURAS. SLT-45 escribe el nodo de la orden al crearla (`toCreateManyInput`,
 * R25) y al corregir su ubicacion (`corregirDatosCliente`, R26): son escrituras de la columna, no
 * lecturas, y las lecturas siguen saliendo de las FK viejas (`distrito_id`/`canton_id`) hasta SLT-48.
 * Se recortan solo esos dos metodos de `OrdenRepository`; cualquier OTRA mencion del archivo (o de
 * `CierreDiaRepository`, `ZonaRepository`, `lugar-orden`) sigue siendo hallazgo.
 */
const ESCRITURAS_EXENTAS_SLT45: Record<string, string[]> = {
  [ORDEN_REPOSITORY]: ["private toCreateManyInput(", "async corregirDatosCliente("],
};

/**
 * `codigo` sin el cuerpo de cada metodo de `metodos` (desde su firma hasta la primera linea `  }`).
 * Lanza si falta una firma: una exencion que no encuentra su metodo no puede quedar en silencio.
 */
export function sinMetodos(codigo: string, metodos: readonly string[]): string {
  let resto = codigo;
  for (const metodo of metodos) {
    const inicio = resto.indexOf(metodo);
    if (inicio < 0) throw new Error(`no se encontro el metodo exento ${metodo}`);
    const fin = resto.indexOf("\n  }\n", inicio);
    if (fin < 0) throw new Error(`no se encontro el cierre de ${metodo}`);
    resto = resto.slice(0, inicio) + resto.slice(fin + 4);
  }
  return resto;
}

/** Cada mencion de la columna nueva en el texto, tal como esta escrita. */
export function mencionesDelNodoEn(codigo: string): string[] {
  return [...codigo.matchAll(/\bnodo_?geografico_?id\b/gi)].map((m) => m[0]);
}

/**
 * El bloque de `codigo` desde `desde` hasta el cierre del metodo que empieza en `hasta` (la primera
 * linea `  }` tras el). Lanza si falta una de las dos marcas: un bloque vacio dejaria la guardia
 * verde sin mirar nada.
 */
export function bloqueDeLecturas(codigo: string, desde: string, hasta: string): string {
  const inicio = codigo.indexOf(desde);
  const metodo = codigo.indexOf(hasta, inicio);
  if (inicio < 0 || metodo < 0) throw new Error(`no se encontro el bloque ${desde} … ${hasta}`);
  const fin = codigo.indexOf("\n  }\n", metodo);
  if (fin < 0) throw new Error(`no se encontro el cierre de ${hasta}`);
  return codigo.slice(inicio, fin + 4);
}

function leer(rel: string): string {
  return quitarComentarios(readFileSync(path.join(RAIZ, rel), "utf8"));
}

describe("SLT-44 R12 — el detector se prueba a si mismo", () => {
  it("CONTRAPRUEBA (control positivo): la lectura por `distritoId` no es hallazgo", () => {
    expect(mencionesDelNodoEn("tx.zonaDistrito.findMany({ select: { distritoId: true } })")).toEqual([]);
  });

  it("CONTRAPRUEBA: el campo de Prisma y la columna SQL se detectan", () => {
    expect(mencionesDelNodoEn("tx.zonaDistrito.findMany({ select: { nodoGeograficoId: true } })")).toEqual([
      "nodoGeograficoId",
    ]);
    expect(mencionesDelNodoEn("SELECT zd.nodo_geografico_id FROM zona_distrito zd")).toEqual(["nodo_geografico_id"]);
  });

  it("un comentario que nombra la columna no cuenta", () => {
    expect(mencionesDelNodoEn(quitarComentarios("// no `nodo_geografico_id`: el distrito_id\nconst a = 1;"))).toEqual([]);
  });

  it("el bloque de `OrdenRepository` va de la primera lectura al cierre de la ultima, y nada mas", () => {
    const texto = [
      "  async antes() { nodoGeograficoId }",
      "  async findAllProvincias() {",
      "    return 1;",
      "  }",
      "  async findDistritoParaCorreccion(id) {",
      "    return nodoGeograficoId;",
      "  }",
      "  async despues() { nodoGeograficoId }",
      "",
    ].join("\n");
    const bloque = bloqueDeLecturas(texto, DESDE, HASTA);
    expect(bloque.startsWith("async findAllProvincias(")).toBe(true);
    expect(bloque.endsWith("    return nodoGeograficoId;\n  }")).toBe(true);
    expect(mencionesDelNodoEn(bloque)).toEqual(["nodoGeograficoId"]);
    expect(() => bloqueDeLecturas("sin metodos", DESDE, HASTA)).toThrow(/no se encontro/);
  });
});

describe("SLT-44 R12 — las lecturas de la feature no leen la columna nueva", () => {
  it("el barrido lee de verdad (anti-vacuidad)", () => {
    for (const rel of ARCHIVOS) expect(leer(rel).length, rel).toBeGreaterThan(500);
    const bloque = bloqueDeLecturas(leer(ORDEN_REPOSITORY), DESDE, HASTA);
    // Las cuatro lecturas de SLT-44 estan dentro del bloque, y leen el catalogo.
    for (const metodo of ["findAllProvincias", "findCantonesByProvinciaIds", "findDistritosByCantonIds", "findDistritoParaCorreccion"]) {
      expect(bloque).toContain(`async ${metodo}(`);
    }
    expect(bloque).toContain("deLaEmpresa()");
  });

  it("ningun archivo de las lecturas nombra `nodoGeograficoId` ni `nodo_geografico_id`", () => {
    const hallazgos = [
      ...ARCHIVOS.flatMap((rel) => mencionesDelNodoEn(leer(rel)).map((m) => `${rel}: ${m}`)),
      ...mencionesDelNodoEn(bloqueDeLecturas(leer(ORDEN_REPOSITORY), DESDE, HASTA)).map(
        (m) => `${ORDEN_REPOSITORY} (lecturas de SLT-44): ${m}`,
      ),
    ];
    expect(
      hallazgos,
      "el nodo de una asignacion o de una marca se lee de su `distrito_id`: asi la lectura no depende " +
        "del backfill de SLT-43 (R12)",
    ).toEqual([]);
  });
});

describe("SLT-65 R19 — el barrido ampliado se prueba a si mismo", () => {
  it("CONTRAPRUEBA: una mencion FUERA del bloque de SLT-44 la ve el barrido del archivo entero, y no el del bloque", () => {
    const texto = [
      "  async findAllProvincias() {",
      "    return 1;",
      "  }",
      "  async findDistritoParaCorreccion(id) {",
      "    return 2;",
      "  }",
      "  async contarSinEntregarPorNodoGeografico(nivel, id) {",
      "    return tx.orden.count({ where: { nodoGeograficoId: id } });",
      "  }",
      "",
    ].join("\n");
    expect(mencionesDelNodoEn(bloqueDeLecturas(texto, DESDE, HASTA))).toEqual([]);
    expect(mencionesDelNodoEn(texto)).toEqual(["nodoGeograficoId"]);
  });

  it("CONTRAPRUEBA sobre un archivo real: `lugar-orden.ts` nombra la columna en su comentario, y el barrido no lo cuenta", () => {
    const rel = "lib/repositories/_shared/lugar-orden.ts";
    const crudo = readFileSync(path.join(RAIZ, rel), "utf8");
    // Si el comentario dejara de nombrarla, este caso dejaria de probar la exclusion: que lo diga.
    expect(mencionesDelNodoEn(crudo).length, `${rel} ya no nombra la columna en un comentario`).toBeGreaterThan(0);
    expect(mencionesDelNodoEn(leer(rel))).toEqual([]);
  });
});

describe("SLT-45 — la exencion de las 2 escrituras se prueba a si misma", () => {
  it("CONTRAPRUEBA: solo se recortan los metodos exentos; una mencion en otro metodo sigue siendo hallazgo", () => {
    const texto = [
      "  async corregirDatosCliente(id, data) {",
      "    return tx.orden.updateMany({ data: { nodoGeograficoId: data.nodoGeograficoId } });",
      "  }",
      "  async findParaCorreccion(id) {",
      "    return tx.orden.findFirst({ select: { nodoGeograficoId: true } });",
      "  }",
      "  private toCreateManyInput(data) {",
      "    return { nodoGeograficoId: data.nodoGeograficoId };",
      "  }",
      "",
    ].join("\n");
    const resto = sinMetodos(texto, ESCRITURAS_EXENTAS_SLT45[ORDEN_REPOSITORY]);
    expect(mencionesDelNodoEn(resto)).toEqual(["nodoGeograficoId"]);
    expect(resto).toContain("async findParaCorreccion(");
    expect(() => sinMetodos("sin metodos", ["async corregirDatosCliente("])).toThrow(/no se encontro/);
  });

  it("las 2 escrituras exentas existen en `OrdenRepository` y escriben el nodo (si dejan de hacerlo, la exencion sobra)", () => {
    const codigo = leer(ORDEN_REPOSITORY);
    for (const metodo of ESCRITURAS_EXENTAS_SLT45[ORDEN_REPOSITORY]) {
      const cuerpo = bloqueDeLecturas(codigo, metodo, metodo);
      expect(mencionesDelNodoEn(cuerpo).length, metodo).toBeGreaterThan(0);
    }
  });
});

describe("SLT-65 R19 — las lecturas de SLT-65 no leen la columna nueva (archivos enteros)", () => {
  it("el barrido lee de verdad (anti-vacuidad)", () => {
    for (const rel of ARCHIVOS_SLT65) {
      const codigo = leer(rel);
      expect(codigo.length, rel).toBeGreaterThan(300);
      for (const marca of LECTURAS_SLT65[rel]) expect(codigo, `${rel}: ${marca}`).toContain(marca);
    }
  });

  it("ni `OrdenRepository` (fuera de las 2 escrituras de SLT-45), ni `CierreDiaRepository`, ni `ZonaRepository`, ni `lugar-orden` nombran la columna", () => {
    const hallazgos = ARCHIVOS_SLT65.flatMap((rel) =>
      mencionesDelNodoEn(sinMetodos(leer(rel), ESCRITURAS_EXENTAS_SLT45[rel] ?? [])).map((m) => `${rel}: ${m}`),
    );
    expect(
      hallazgos,
      "el lugar de una orden sale de `distrito_id`/`canton_id` y el nodo de una asignacion o de una " +
        "marca de su `distrito_id`: asi la lectura no depende del backfill de SLT-43 (R19)",
    ).toEqual([]);
  });
});

// =============================================================================================
// SLT-71 (T7.1; R14; design §6) — las lecturas de analitica y de transito que pasan al catalogo
// =============================================================================================

/**
 * Los archivos de SLT-71, ENTEROS, con su ancla antivacio: la llamada que prueba que el archivo lee
 * el catalogo de verdad (`lugaresDelFiltro(` en las lecturas con facetas, `deLaEmpresa()` en transito
 * y en el modulo que resuelve las facetas). El lugar de la orden sale de `distrito_id`/`canton_id`
 * (`sqlLugarEn`), nunca de `orden.nodo_geografico_id`: asi la lectura no depende del backfill de
 * SLT-43 (decision «¿Lugar de una orden?»).
 */
const LECTURAS_SLT71: Record<string, string[]> = {
  "lib/repositories/InformeTransitoRepository.ts": ["async filasEnAlerta(", "deLaEmpresa()"],
  "lib/repositories/ConteoPorStatusRepository.ts": ["lugaresDelFiltro("],
  "lib/repositories/ConteoDevolucionesRepository.ts": ["lugaresDelFiltro("],
  "lib/repositories/ConteoCargadasPorDiaRepository.ts": ["lugaresDelFiltro("],
  "lib/repositories/CicloVidaRepository.ts": ["lugaresDelFiltro("],
  "lib/repositories/ConteoProductosRepository.ts": ["lugaresDelFiltro("],
  "lib/repositories/DineroProductosRepository.ts": ["lugaresDelFiltro("],
  "lib/repositories/CohorteCargaRepository.ts": ["lugaresDelFiltro("],
  "lib/repositories/ConteoHoyGestionRepository.ts": ["lugaresDelFiltro("],
  "lib/repositories/_shared/lugares-del-filtro.ts": ["export async function lugaresDelFiltro(", "deLaEmpresa()"],
};

/** Las anclas de `marcas` que no estan en `codigo`: un archivo sin su ancla no se esta mirando. */
export function marcasQueFaltan(codigo: string, marcas: readonly string[]): string[] {
  return marcas.filter((m) => !codigo.includes(m));
}

describe("SLT-71 R14 — el barrido de SLT-71 se prueba a si mismo", () => {
  it("CONTRAPRUEBA: una lectura con faceta que filtra por la columna nueva se detecta", () => {
    const repositorio = [
      "async contarPorStatus(consulta) {",
      "  const lugares = await lugaresDelFiltro(() => this.catalogoGeografico(), consulta.filtro);",
      '  return this.prisma.$queryRaw`SELECT 1 FROM "orden" o WHERE o."nodo_geografico_id" = ANY(${ids})`;',
      "}",
    ].join("\n");
    expect(marcasQueFaltan(repositorio, ["lugaresDelFiltro("])).toEqual([]);
    expect(mencionesDelNodoEn(repositorio)).toEqual(["nodo_geografico_id"]);
  });

  it("CONTRAPRUEBA: un archivo que ya no carga el catalogo pierde su ancla y el antivacio lo dice", () => {
    expect(marcasQueFaltan('SELECT 1 FROM "orden" o WHERE o."provincia_id" IN (...)', ["lugaresDelFiltro("])).toEqual([
      "lugaresDelFiltro(",
    ]);
  });
});

describe("SLT-71 R14 — las lecturas de SLT-71 no leen la columna nueva (archivos enteros)", () => {
  it("el barrido lee de verdad (anti-vacuidad): cada archivo existe, es largo y tiene su ancla", () => {
    for (const [rel, marcas] of Object.entries(LECTURAS_SLT71)) {
      const codigo = leer(rel);
      expect(codigo.length, rel).toBeGreaterThan(300);
      expect(marcasQueFaltan(codigo, marcas), rel).toEqual([]);
    }
    expect(Object.keys(LECTURAS_SLT71)).toHaveLength(10);
  });

  it("ni transito, ni los cuatro conteos y ciclo de vida, ni las cuatro que comparten el recorte, ni `lugares-del-filtro` nombran la columna", () => {
    const hallazgos = Object.keys(LECTURAS_SLT71).flatMap((rel) => mencionesDelNodoEn(leer(rel)).map((m) => `${rel}: ${m}`));
    expect(
      hallazgos,
      "el lugar de una orden sale de `COALESCE(distrito_id, canton_id)` (`sqlLugarEn`) y los nombres de " +
        "transito de `canton_id`/`distrito_id` en el catalogo: asi la lectura no depende del backfill de SLT-43 (R14)",
    ).toEqual([]);
  });
});

// =============================================================================================
// SLT-47 (R15) — los archivos nuevos del filtro de lugar
// =============================================================================================

/**
 * Los archivos de SLT-47 que calculan el lugar, ENTEROS, con su ancla antivacio. El lugar de la
 * orden sale de `lugarDeLaOrden`/`whereLugarEn`/`sqlLugarEn` (FK viejas), nunca de
 * `orden.nodo_geografico_id`: asi el filtro y la ruta no dependen del backfill de SLT-43. El listado
 * de `/ordenes` y la bodega satelite (`OrdenRepository`) ya los vigila el bloque de SLT-65, y
 * `lugares-del-filtro` el de SLT-71.
 */
const LECTURAS_SLT47: Record<string, string[]> = {
  "lib/repositories/_shared/ruta-del-lugar.ts": ["export function rutaDelLugar(", "lugarDeLaOrden("],
  "lib/repositories/_shared/lugares-del-filtro.ts": ["export function resolverLugar(", "nodosBajo("],
  "lib/repositories/OrdenRepository.ts": ["private async criterioLugar(", "private lugaresSatelite("],
};

describe("SLT-47 R15 — el filtro de lugar y la ruta no leen la columna nueva", () => {
  it("el barrido lee de verdad (anti-vacuidad): cada archivo existe y tiene su ancla", () => {
    for (const [rel, marcas] of Object.entries(LECTURAS_SLT47)) {
      const codigo = leer(rel);
      expect(codigo.length, rel).toBeGreaterThan(300);
      expect(marcasQueFaltan(codigo, marcas), rel).toEqual([]);
    }
  });

  it("ni `ruta-del-lugar` ni `lugares-del-filtro` nombran la columna", () => {
    const hallazgos = ["lib/repositories/_shared/ruta-del-lugar.ts", "lib/repositories/_shared/lugares-del-filtro.ts"].flatMap(
      (rel) => mencionesDelNodoEn(leer(rel)).map((m) => `${rel}: ${m}`),
    );
    expect(hallazgos).toEqual([]);
  });
});
