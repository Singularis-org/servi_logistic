// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { consultarMetricaFinanciera } from "@/lib/actions/analitica-financiera";
import {
  etiquetaEnElPais,
  getMetrica,
  listarMetricas,
  rotuloIngresoPorImpuesto,
} from "@/lib/analytics/metrics";
import { MONEDA_PLATAFORMA } from "@/lib/config/moneda";
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";
import type { IPaisService, PaisParaPantallas } from "@/lib/interfaces/services/IPaisService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import {
  AnaliticaFinancieraService,
  PAIS_DE_LA_PLATAFORMA,
  type PaisDeLaAnalitica,
} from "@/lib/services/AnaliticaFinancieraService";
import type { ResultadoFinanciero } from "@/lib/types/analitica-financiera";
import { ETIQUETAS_NEUTRAS } from "@/lib/types/pais";
import { MONEDA_DE_PRUEBA, reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";
import {
  AHORA,
  armarServicio,
  consultaDe,
  type DatosFinancieros,
} from "@/tests/unit/services/_dobles-analitica-financiera";

// SLT-242 — Moneda del pais en pantallas: analitica.
//
// Un `describe` por requisito, con el `R<n>` en el nombre. Cada bloque de tasks.md AÑADE los suyos al
// final del archivo, con sus propios imports y dobles locales: no se reordena lo de los demas. Las
// pantallas se prueban con `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` + «IVA» y sin proveedor (R12,
// R13).
//
// El `vi.mock` de abajo es del servidor (bloque 1: R9, R10). Por defecto es la clase real, asi que no
// cambia nada a los bloques que no lo configuran; los casos que lo necesitan lo fijan y `afterEach` lo
// devuelve a la real. Con `responderConDoble`, el servicio que construye la accion no consulta nada:
// los repositorios de Prisma se construyen (cliente perezoso) pero no se llaman.

/** Lo que registra el servicio espiado: con que se construyo y si responde con un doble. */
const espia = vi.hoisted(() => ({
  construidos: [] as unknown[][],
  responderConDoble: false,
}));

vi.mock("@/lib/services/AnaliticaFinancieraService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/services/AnaliticaFinancieraService")>();
  type Args = ConstructorParameters<typeof real.AnaliticaFinancieraService>;
  /**
   * La clase real, que ademas apunta sus argumentos. Con `responderConDoble`, `consultar` no toca los
   * repositorios (que en la accion son los de Prisma) y devuelve un `ok` fijo.
   */
  class AnaliticaFinancieraServiceEspiado extends real.AnaliticaFinancieraService {
    constructor(...args: Args) {
      super(...args);
      espia.construidos.push(args);
    }
    override async consultar(
      consulta: Parameters<InstanceType<typeof real.AnaliticaFinancieraService>["consultar"]>[0],
    ) {
      if (espia.responderConDoble) {
        return { status: "ok" as const, datos: { doble: true } as unknown as ResultadoFinanciero };
      }
      return super.consultar(consulta);
    }
  }
  return { ...real, AnaliticaFinancieraService: AnaliticaFinancieraServiceEspiado };
});

afterEach(() => {
  espia.construidos.length = 0;
  espia.responderConDoble = false;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
// Bloque 1 — servidor: catalogo, servicio y accion (R7-R11, design §6, §7)
// ---------------------------------------------------------------------------------------------

const RAIZ = join(__dirname, "..", "..");
const leerFuente = (rel: string): string => readFileSync(join(RAIZ, rel), "utf8");

const PAIS_DE_PRUEBA: PaisDeLaAnalitica = { monedaCodigo: MONEDA_DE_PRUEBA.codigo, impuestoNombre: "IGV" };

const PANTALLAS_DE_PRUEBA: PaisParaPantallas = {
  etiquetas: ETIQUETAS_NEUTRAS,
  moneda: MONEDA_DE_PRUEBA,
  impuestoNombre: "IGV",
};

/** Datos con los que todas las vistas financieras devuelven al menos un importe. */
const DATOS: Partial<DatosFinancieros> = {
  caja: [
    { categoria: "ingreso_iva_flete", tipo: "ingreso", suma: "130.00" },
    { categoria: "ingreso_flete", tipo: "ingreso", suma: "1000.00" },
    { categoria: "ingreso_comision_cod", tipo: "ingreso", suma: "50.00" },
  ],
  porMetodo: [{ metodo: "efectivo", suma: "200.00" }],
  porTienda: [{ tiendaId: "t-1", tipo: "credito", suma: "200.00" }],
  saldoTiendas: [{ tiendaId: "t-1", tipo: "credito", suma: "300.00" }],
  cuentaMensajeros: [{ tipo: "devengo", suma: "400.00" }],
};

/** El servicio real, con los dobles de los repositorios de la 127 y el pais que se le pase. */
function servicioConPais(pais?: PaisDeLaAnalitica): AnaliticaFinancieraService {
  const d = armarServicio(DATOS);
  return pais === undefined
    ? new AnaliticaFinancieraService(
        d.ingresos,
        d.recaudo,
        d.cuentasPorPagar,
        d.conciliacion,
        d.logger,
        undefined,
        reglasPaisFijas(),
      )
    : new AnaliticaFinancieraService(
        d.ingresos,
        d.recaudo,
        d.cuentasPorPagar,
        d.conciliacion,
        d.logger,
        undefined,
        reglasPaisFijas(),
        pais,
      );
}

async function datosDe(servicio: AnaliticaFinancieraService, metricaId: string): Promise<ResultadoFinanciero> {
  const r = await servicio.consultar(consultaDe(metricaId));
  if (r.status !== "ok") throw new Error(`${metricaId}: se esperaba ok y llego ${r.status}`);
  return r.datos;
}

/** El campo `moneda` de cada importe de las vistas: el total y cada fila, con su lugar. */
function monedasDeLasVistas(datos: ResultadoFinanciero): readonly { lugar: string; moneda: string }[] {
  if (datos.tipo !== "vistas") throw new Error(`${datos.metricaId}: se esperaban vistas`);
  return datos.vistas.flatMap((v) => [
    { lugar: `${v.id} · total`, moneda: v.total.moneda },
    ...v.filas.map((f) => ({ lugar: `${v.id} · ${f.cubo}`, moneda: f.importe.moneda })),
  ]);
}

/** Las metricas que el caso de R7 recorre: caja (con y sin neto), tesoreria, recaudo y las dos cuentas. */
const METRICAS_CON_IMPORTES = [
  "ingreso_iva",
  "ingreso_comision_cod",
  "dinero_en_caja",
  "cod_recaudado",
  "cuenta_por_pagar_tienda",
  "cuenta_por_pagar_mensajero",
] as const;

describe("SLT-242 R7 — el campo `moneda` de cada importe es el codigo de la moneda del pais", () => {
  it.each(METRICAS_CON_IMPORTES)("%s: el total y todas las filas llevan «XTS»", async (metricaId) => {
    const monedas = monedasDeLasVistas(await datosDe(servicioConPais(PAIS_DE_PRUEBA), metricaId));
    expect(monedas.length).toBeGreaterThan(1);
    expect(monedas.filter((m) => m.moneda !== "XTS")).toEqual([]);
  });

  it("cod_recaudado: las DOS vistas (por metodo y por tienda) llevan «XTS», con filas", async () => {
    const datos = await datosDe(servicioConPais(PAIS_DE_PRUEBA), "cod_recaudado");
    if (datos.tipo !== "vistas") throw new Error("se esperaban vistas");
    expect(datos.vistas).toHaveLength(2);
    for (const vista of datos.vistas) {
      expect(vista.filas.length).toBeGreaterThan(0);
      expect(vista.total.moneda).toBe("XTS");
      expect(vista.filas.map((f) => f.importe.moneda)).toEqual(vista.filas.map(() => "XTS"));
    }
  });

  it("sin el argumento del pais, la moneda de la plataforma (el codigo de hoy)", async () => {
    const monedas = monedasDeLasVistas(await datosDe(servicioConPais(), "ingreso_iva"));
    expect(monedas.length).toBeGreaterThan(1);
    expect(new Set(monedas.map((m) => m.moneda))).toEqual(new Set([MONEDA_PLATAFORMA.codigo]));
    expect(PAIS_DE_LA_PLATAFORMA).toEqual({ monedaCodigo: MONEDA_PLATAFORMA.codigo, impuestoNombre: IMPUESTO_ROTULO });
  });

  it("el servicio no lee `monedaConfig` (fuente sin comentarios)", () => {
    const codigo = quitarComentarios(leerFuente("lib/services/AnaliticaFinancieraService.ts"));
    expect(codigo).not.toMatch(/\bmonedaConfig\b/);
    // Contraprueba: el censo SI ve un `monedaConfig` de codigo.
    expect(quitarComentarios("const m = monedaConfig.currency;")).toMatch(/\bmonedaConfig\b/);
  });
});

describe("SLT-242 R8 — la etiqueta de la metrica del impuesto nombra el impuesto del pais", () => {
  it("con «IGV», `ingreso_iva` responde «Ingreso por IGV»", async () => {
    const datos = await datosDe(servicioConPais(PAIS_DE_PRUEBA), "ingreso_iva");
    expect(datos.etiqueta).toBe("Ingreso por IGV");
  });

  it("con «IGV», `ingreso_flete` responde su etiqueta del catalogo, sin cambiar", async () => {
    const datos = await datosDe(servicioConPais(PAIS_DE_PRUEBA), "ingreso_flete");
    expect(datos.etiqueta).toBe(getMetrica("ingreso_flete")?.etiqueta);
    expect(datos.etiqueta).toBe("Ingreso por flete");
  });

  it("sin el argumento del pais, `ingreso_iva` responde la etiqueta de hoy", async () => {
    const datos = await datosDe(servicioConPais(), "ingreso_iva");
    expect(datos.etiqueta).toBe("Ingreso por IVA");
  });

  it("`rotuloIngresoPorImpuesto` pone el nombre que se le pasa", () => {
    expect(rotuloIngresoPorImpuesto("IGV")).toBe("Ingreso por IGV");
    expect(rotuloIngresoPorImpuesto(IMPUESTO_ROTULO)).toBe("Ingreso por IVA");
  });

  it("`etiquetaEnElPais` con las 10 financieras: solo cambia la de `ingreso_iva`", () => {
    const financieras = listarMetricas({ dominio: "financiera" });
    expect(financieras).toHaveLength(10);
    for (const m of financieras) {
      const esperada = m.id === "ingreso_iva" ? "Ingreso por IGV" : m.etiqueta;
      expect(etiquetaEnElPais(m, "IGV"), m.id).toBe(esperada);
      // Con el rotulo de la plataforma, la etiqueta del catalogo de hoy (R12).
      expect(etiquetaEnElPais(m, IMPUESTO_ROTULO), m.id).toBe(m.etiqueta);
    }
  });

  it("`etiquetaEnElPais` con un id que no esta en el catalogo devuelve su etiqueta tal cual", () => {
    expect(etiquetaEnElPais({ id: "toString", etiqueta: "Otra" }, "IGV")).toBe("Otra");
  });
});

const MAESTRO_DE_EMPRESA: Actor = { usuarioId: "u-maestro", rol: "maestro", zonaId: null, organizacionId: "org-1" };
const TIENDA_DE_EMPRESA: Actor = { usuarioId: "t-propia", rol: "adminTienda", zonaId: null, organizacionId: "org-1" };

/** El servicio de paises doblado (solo `paraPantallas`) y la accion sin `deps.service`. */
function doblarLaAccion(paraPantallas: IPaisService["paraPantallas"]) {
  const paisService = { paraPantallas: vi.fn(paraPantallas) };
  espia.responderConDoble = true;
  return { paisService, logger: { logError: vi.fn() } };
}

/** El octavo argumento con el que la accion construyo el servicio (el pais). */
function paisConElQueSeConstruyo(): unknown {
  expect(espia.construidos).toHaveLength(1);
  return espia.construidos[0][7];
}

describe("SLT-242 R9 — la accion lee el pais de la empresa de la sesion y lo pasa al servicio", () => {
  it("con una empresa: `paraPantallas` con su `organizacionId` y el servicio construido con «XTS» e «IGV»", async () => {
    const { paisService, logger } = doblarLaAccion(async () => PANTALLAS_DE_PRUEBA);

    const respuesta = await consultarMetricaFinanciera("ingreso_iva", { rango: "dia" }, {
      now: AHORA,
      reglasPais: reglasPaisFijas(),
      getActor: async () => MAESTRO_DE_EMPRESA,
      logger,
      paisService,
    });

    expect(respuesta.status).toBe("ok");
    expect(paisService.paraPantallas).toHaveBeenCalledTimes(1);
    expect(paisService.paraPantallas).toHaveBeenCalledWith("org-1");
    expect(paisConElQueSeConstruyo()).toEqual({ monedaCodigo: "XTS", impuestoNombre: "IGV" });
  });

  it("con un filtro invalido: `validation_error` y el pais no se lee", async () => {
    const { paisService, logger } = doblarLaAccion(async () => PANTALLAS_DE_PRUEBA);

    const respuesta = await consultarMetricaFinanciera("ingreso_iva", { rango: "no-es-un-rango" }, {
      now: AHORA,
      reglasPais: reglasPaisFijas(),
      getActor: async () => MAESTRO_DE_EMPRESA,
      logger,
      paisService,
    });

    expect(respuesta.status).toBe("validation_error");
    expect(paisService.paraPantallas).not.toHaveBeenCalled();
    expect(espia.construidos).toHaveLength(0);
  });

  it("con un acceso denegado: `forbidden` y el pais no se lee", async () => {
    const { paisService, logger } = doblarLaAccion(async () => PANTALLAS_DE_PRUEBA);

    const respuesta = await consultarMetricaFinanciera("egresos", { rango: "dia" }, {
      now: AHORA,
      reglasPais: reglasPaisFijas(),
      getActor: async () => TIENDA_DE_EMPRESA,
      logger,
      paisService,
    });

    expect(respuesta).toEqual({ status: "forbidden", code: "FORBIDDEN" });
    expect(paisService.paraPantallas).not.toHaveBeenCalled();
    expect(espia.construidos).toHaveLength(0);
  });

  it("con `deps.service` inyectado: el pais no se lee", async () => {
    const { paisService, logger } = doblarLaAccion(async () => PANTALLAS_DE_PRUEBA);
    espia.responderConDoble = false;
    const { servicio } = armarServicio(DATOS);
    espia.construidos.length = 0; // `armarServicio` construye el suyo: no es el de la accion.

    const respuesta = await consultarMetricaFinanciera("ingreso_iva", { rango: "dia" }, {
      now: AHORA,
      reglasPais: reglasPaisFijas(),
      getActor: async () => MAESTRO_DE_EMPRESA,
      logger,
      paisService,
      service: servicio,
    });

    expect(respuesta.status).toBe("ok");
    expect(paisService.paraPantallas).not.toHaveBeenCalled();
    expect(espia.construidos).toHaveLength(0);
  });

  it("la empresa sale del actor, no de `next/headers`: la accion no lo importa (fuente sin comentarios)", () => {
    const codigo = quitarComentarios(leerFuente("lib/actions/analitica-financiera.ts"));
    expect(codigo).not.toMatch(/next\/headers|empresaDeLaPeticion/);
    expect(codigo).toMatch(/paisParaPantallasDelActor\(\s*actor\?\.organizacionId \?\? null/);
  });
});

describe("SLT-242 R10 — sin los datos del pais, la moneda y el rotulo de la plataforma, y la consulta no falla", () => {
  it("si `paraPantallas` lanza: servicio con `PAIS_DE_LA_PLATAFORMA`, respuesta `ok` y el error en `console.error`", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { paisService, logger } = doblarLaAccion(async () => {
      throw new Error("la base no responde");
    });

    const respuesta = await consultarMetricaFinanciera("ingreso_iva", { rango: "dia" }, {
      now: AHORA,
      reglasPais: reglasPaisFijas(),
      getActor: async () => MAESTRO_DE_EMPRESA,
      logger,
      paisService,
    });

    expect(respuesta.status).toBe("ok");
    expect(paisService.paraPantallas).toHaveBeenCalledWith("org-1");
    expect(paisConElQueSeConstruyo()).toEqual(PAIS_DE_LA_PLATAFORMA);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain("org-1");
  });

  it("sin empresa en el actor: la plataforma, sin leer el pais", async () => {
    const { paisService, logger } = doblarLaAccion(async () => PANTALLAS_DE_PRUEBA);

    const respuesta = await consultarMetricaFinanciera("ingreso_iva", { rango: "dia" }, {
      now: AHORA,
      reglasPais: reglasPaisFijas(),
      getActor: async () => ({ ...MAESTRO_DE_EMPRESA, organizacionId: null }),
      logger,
      paisService,
    });

    expect(respuesta.status).toBe("ok");
    expect(paisService.paraPantallas).not.toHaveBeenCalled();
    expect(paisConElQueSeConstruyo()).toEqual(PAIS_DE_LA_PLATAFORMA);
  });
});

describe("SLT-242 R11 — el catalogo toma el nombre del impuesto de un solo rotulo", () => {
  it("las descripciones de `ingreso_iva` y `ganancia_empresa` llevan `IMPUESTO_ROTULO` (texto de hoy)", () => {
    const iva = getMetrica("ingreso_iva")?.descripcion ?? "";
    const ganancia = getMetrica("ganancia_empresa")?.descripcion ?? "";
    expect(iva.startsWith(`${IMPUESTO_ROTULO} facturado sobre flete`)).toBe(true);
    expect(iva.split(IMPUESTO_ROTULO)).toHaveLength(4); // 3 apariciones
    expect(ganancia).toContain(`Sin el ${IMPUESTO_ROTULO}: el ${IMPUESTO_ROTULO} cobrado se publica aparte`);
  });

  it("la etiqueta de `ingreso_iva` en el catalogo es la de hoy (R12)", () => {
    expect(getMetrica("ingreso_iva")?.etiqueta).toBe("Ingreso por IVA");
  });

  it("`metrics.ts` no escribe «IVA» fuera de los comentarios", () => {
    const codigo = quitarComentarios(leerFuente("lib/analytics/metrics.ts"));
    expect(codigo).not.toMatch(/\bIVA\b/);
    // Contraprueba: el mismo censo ve un «IVA» escrito en un texto.
    expect(quitarComentarios('const e = "Ingreso por IVA"; // IVA')).toMatch(/\bIVA\b/);
    expect(quitarComentarios("// solo el comentario dice IVA\nconst e = 1;")).not.toMatch(/\bIVA\b/);
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 4 — la lista de excepciones de `pais-sin-literales` (R16, design §8)
// ---------------------------------------------------------------------------------------------

describe("SLT-242 R16 — la lista de excepciones de `pais-sin-literales` pierde las 2 de SLT-242", () => {
  it("ninguna excepcion sigue a nombre de SLT-242", async () => {
    const { EXCEPCIONES_PAIS_SIN_LITERALES } = await import("@/tests/unit/guards/_pais-sin-literales-excepciones");
    expect(EXCEPCIONES_PAIS_SIN_LITERALES.filter((e) => e.ficha === "SLT-242")).toEqual([]);
    expect(EXCEPCIONES_PAIS_SIN_LITERALES.map((e) => e.archivo)).not.toContain("lib/analytics/metrics.ts");
    expect(EXCEPCIONES_PAIS_SIN_LITERALES.map((e) => e.archivo)).not.toContain(
      "lib/services/AnaliticaFinancieraService.ts",
    );
  });

  it("el tope baja a 12 y la lista no lo supera", async () => {
    const { EXCEPCIONES_PAIS_SIN_LITERALES, TOPE_EXCEPCIONES } = await import(
      "@/tests/unit/guards/_pais-sin-literales-excepciones"
    );
    expect(TOPE_EXCEPCIONES).toBe(12);
    expect(EXCEPCIONES_PAIS_SIN_LITERALES.length).toBeLessThanOrEqual(TOPE_EXCEPCIONES);
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 2 — formateador y paquete de analitica (R2, R4, R5, R6, R12, R13; design §3, §4)
// ---------------------------------------------------------------------------------------------

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";

import { CifraAnalitica, MontoAnalitico } from "@/components/private/analytics/CifraAnalitica";
import { formatearValor } from "@/components/private/analytics/formato";
import { GraficaBarras } from "@/components/private/analytics/GraficaBarras";
import { GraficaDonut } from "@/components/private/analytics/GraficaDonut";
import { GraficaLineas } from "@/components/private/analytics/GraficaLineas";
import { GraficaRanking } from "@/components/private/analytics/GraficaRanking";
import { GraficaReparto } from "@/components/private/analytics/GraficaReparto";
import { KpiCard } from "@/components/private/analytics/KpiCard";
import { KpiValor } from "@/components/private/analytics/KpiValor";
import { SerieTextual } from "@/components/private/analytics/SerieTextual";
import { TablaResumen } from "@/components/private/analytics/TablaResumen";
import type { MetricaUnidad } from "@/components/private/analytics/tipos";
import { formatearMontoEn, SIN_MONTO } from "@/lib/config/moneda";
import { MonedaDelPaisProvider } from "@/providers/MonedaDelPaisProvider";
import { MONEDA_CR } from "@/tests/fabricas/reglas-pais";

/**
 * Los lienzos de recharts se sustituyen por un doble que pinta lo que devuelve el `formatear` que
 * les pasa la grafica: es la unica forma de ver ese texto, porque con el `ResizeObserver` del setup
 * recharts no pinta nada (`AnalyticsGraficas.test.tsx`). El doble formatea siempre 7654321. Ningun
 * otro bloque de este archivo mira el lienzo.
 */
vi.mock("@/components/private/analytics/lienzo/BarrasLienzo", () => ({
  default: ({ formatear }: { formatear: (v: number | null) => string }) => (
    <p data-testid="lienzo">{formatear(7654321)}</p>
  ),
}));
vi.mock("@/components/private/analytics/lienzo/LineasLienzo", () => ({
  default: ({ formatear }: { formatear: (v: number | null) => string }) => (
    <p data-testid="lienzo">{formatear(7654321)}</p>
  ),
}));
vi.mock("@/components/private/analytics/lienzo/DonutLienzo", () => ({
  default: ({ formatear }: { formatear: (v: number | null) => string }) => (
    <p data-testid="lienzo">{formatear(7654321)}</p>
  ),
}));

/** El valor que formatea el doble del lienzo (escrito tambien en los `vi.mock`, que se izan). */
const VALOR_DE_LIENZO = 7654321;

afterEach(() => {
  cleanup();
});

/** Los tres montajes de cada caso de pantalla (R12, R13). */
type Montaje = "prueba" | "cr" | "sin proveedor";

function montar(montaje: Montaje, ui: ReactElement): ReactElement {
  if (montaje === "prueba") {
    return (
      <MonedaDelPaisProvider moneda={MONEDA_DE_PRUEBA} impuestoNombre="IGV">
        {ui}
      </MonedaDelPaisProvider>
    );
  }
  if (montaje === "cr") {
    return (
      <MonedaDelPaisProvider moneda={MONEDA_CR} impuestoNombre="IVA">
        {ui}
      </MonedaDelPaisProvider>
    );
  }
  return ui;
}

const colapsar = (texto: string): string => texto.replace(/\s+/g, " ").trim();

/** El texto que pinta `ui` en cada montaje, con los espacios colapsados como los lee testing-library. */
function textosDe(ui: ReactElement): Record<Montaje, string> {
  const leer = (montaje: Montaje): string => {
    const { container, unmount } = render(montar(montaje, ui));
    const texto = colapsar(container.textContent ?? "");
    unmount();
    return texto;
  };
  return { prueba: leer("prueba"), cr: leer("cr"), "sin proveedor": leer("sin proveedor") };
}

/** Con la moneda de prueba: espacio de miles y sin decimales (`tests/fabricas/reglas-pais.ts`). */
const MILLON_EN_PRUEBA = "€1 234 567";
const VACIO_DE_PRUEBA = { titulo: "Sin datos", descripcion: "Prueba con otro rango" };
const SERIE_EN_DINERO = [{ id: "a", etiqueta: "Cobrado", puntos: [{ categoria: "lunes", valor: 1234567 }] }];
const TEXTO_DEL_SIGNO = { sube: "Sube", baja: "Baja", igual: "Igual" };

describe("SLT-242 R6 — sin moneda, el typecheck rechaza una unidad que puede ser `moneda`", () => {
  it("una unidad `MetricaUnidad` o el literal `moneda` sin moneda no compilan; con moneda, si", () => {
    const unidad = "moneda" as MetricaUnidad;
    // @ts-expect-error R6: una unidad que puede ser `moneda` pide la moneda.
    expect(() => formatearValor(1, unidad)).toThrow(/moneda/);
    // @ts-expect-error R6: el literal `moneda` tambien.
    expect(() => formatearValor(1, "moneda")).toThrow(/moneda/);
    expect(formatearValor(1234567, unidad, MONEDA_DE_PRUEBA)).toBe(MILLON_EN_PRUEBA);
  });

  it("con una unidad que no es `moneda`, la moneda no es obligatoria", () => {
    expect(typeof formatearValor(3500, "conteo")).toBe("string");
    expect(typeof formatearValor(0.5, "porcentaje")).toBe("string");
    expect(typeof formatearValor(90, "segundos")).toBe("string");
  });

  it("si llega `moneda` sin moneda desde codigo sin tipos, lanza nombrando la unidad", () => {
    const sinTipos = formatearValor as unknown as (valor: number | null, unidad: string) => string;
    expect(() => sinTipos(10, "moneda")).toThrow(/"moneda"/);
    // El dato ausente se decide antes: sin importe no hay nada que formatear y no lanza.
    expect(sinTipos(null, "moneda")).toBe(SIN_MONTO);
  });

  it("`moneda` con una moneda pinta con ESA moneda (las reglas de `formatearMontoEn`)", () => {
    for (const moneda of [MONEDA_DE_PRUEBA, MONEDA_CR, MONEDA_PLATAFORMA]) {
      expect(formatearValor(1234567, "moneda", moneda), moneda.codigo).toBe(formatearMontoEn(moneda, 1234567));
    }
  });
});

const NO_MONETARIAS = [
  ["conteo", 1234567],
  ["porcentaje", 0.842],
  ["segundos", 5400],
] as const;

describe("SLT-242 R5 — conteos, porcentajes y duraciones no cambian con la moneda del pais", () => {
  it.each(NO_MONETARIAS)("formatearValor con %s: el mismo texto con cualquier moneda y sin ella", (unidad, valor) => {
    expect(formatearValor(valor, unidad, MONEDA_DE_PRUEBA)).toBe(formatearValor(valor, unidad, MONEDA_PLATAFORMA));
    expect(formatearValor(valor, unidad, MONEDA_DE_PRUEBA)).toBe(formatearValor(valor, unidad));
  });

  it.each(NO_MONETARIAS)("CifraAnalitica y KpiValor con %s: el mismo texto en los tres montajes", (unidad, valor) => {
    for (const ui of [
      <CifraAnalitica key="c" valor={valor} unidad={unidad} />,
      <KpiValor key="k" valor={valor} unidad={unidad} />,
    ]) {
      const textos = textosDe(ui);
      expect(textos.prueba).toBe(textos["sin proveedor"]);
      expect(textos.cr).toBe(textos["sin proveedor"]);
    }
  });
});

describe("SLT-242 R13 — la hoja de cliente sin proveedor pinta con la moneda de la plataforma", () => {
  it("CifraAnalitica en moneda: con la de prueba, la del pais; con CR, igual que sin proveedor", () => {
    const textos = textosDe(<CifraAnalitica valor={1234567} unidad="moneda" />);
    expect(textos.prueba).toBe(MILLON_EN_PRUEBA);
    expect(textos["sin proveedor"]).toBe(colapsar(formatearValor(1234567, "moneda", MONEDA_PLATAFORMA)));
    expect(textos.cr).toBe(textos["sin proveedor"]);
  });

  it("CifraAnalitica sin dato: el marcador de hoy en los tres montajes", () => {
    const textos = textosDe(<CifraAnalitica valor={null} unidad="moneda" />);
    expect(textos).toEqual({ prueba: SIN_MONTO, cr: SIN_MONTO, "sin proveedor": SIN_MONTO });
  });

  it("CifraAnalitica devuelve solo el texto: queda dentro del elemento de quien la monta, sin envoltorio", () => {
    const { container } = render(
      <p>
        {"Bruto: "}
        <CifraAnalitica valor={1000} unidad="moneda" />
      </p>,
    );
    expect(container.querySelector("p")?.children).toHaveLength(0);
    expect(
      screen.getByText(colapsar(`Bruto: ${formatearValor(1000, "moneda", MONEDA_PLATAFORMA)}`)),
    ).toBeInTheDocument();
  });
});

describe("SLT-242 R4 — MontoAnalitico pinta el importe string con la moneda del pais, sin pasar por `number`", () => {
  it("con la de prueba, la del pais; con CR, igual que sin proveedor", () => {
    const textos = textosDe(<MontoAnalitico monto="1234567.40" />);
    expect(textos.prueba).toBe(MILLON_EN_PRUEBA);
    expect(textos["sin proveedor"]).toBe(colapsar(formatearMontoEn(MONEDA_PLATAFORMA, "1234567.40")));
    expect(textos.cr).toBe(textos["sin proveedor"]);
  });

  it("un importe que `number` no representa sale exacto: el cuadre es sobre la cadena", () => {
    // 2^53 + 1: como `number` seria ...992; la cadena conserva el 3.
    const textos = textosDe(<MontoAnalitico monto="9007199254740993.00" />);
    expect(textos.prueba).toBe("€9 007 199 254 740 993");
    expect(textos.cr).toBe(textos["sin proveedor"]);
  });

  it("sin importe, el marcador de hoy en los tres montajes", () => {
    const textos = textosDe(<MontoAnalitico monto={null} />);
    expect(textos).toEqual({ prueba: SIN_MONTO, cr: SIN_MONTO, "sin proveedor": SIN_MONTO });
  });
});

describe("SLT-242 R2 — los componentes del paquete pintan la unidad `moneda` con la moneda del pais", () => {
  /** El caso comun: con la de prueba sale su texto; con CR, lo mismo que sin proveedor. */
  function esperarMonedaDelPais(ui: ReactElement, enPrueba: string): Record<Montaje, string> {
    const textos = textosDe(ui);
    expect(textos.prueba).toContain(enPrueba);
    expect(textos["sin proveedor"]).not.toContain(enPrueba);
    expect(textos.cr).toBe(textos["sin proveedor"]);
    return textos;
  }

  it("KpiValor (la cifra animada, fotograma final)", () => {
    const textos = esperarMonedaDelPais(<KpiValor valor={1234567} unidad="moneda" />, MILLON_EN_PRUEBA);
    expect(textos["sin proveedor"]).toBe(colapsar(formatearValor(1234567, "moneda", MONEDA_PLATAFORMA)));
  });

  it("KpiCard: la cifra y la variacion", () => {
    const textos = esperarMonedaDelPais(
      <KpiCard
        etiqueta="Ingreso"
        valor={1234567}
        unidad="moneda"
        variacion={{ delta: -2500000, etiqueta: "vs. ayer", texto: TEXTO_DEL_SIGNO }}
      />,
      MILLON_EN_PRUEBA,
    );
    expect(textos.prueba).toContain("Baja €2 500 000 vs. ayer");
    expect(textos["sin proveedor"]).toContain(
      colapsar(`Baja ${formatearValor(2500000, "moneda", MONEDA_PLATAFORMA)} vs. ayer`),
    );
  });

  it("KpiCard: la linea de variacion sigue siendo UN solo <p> con el texto entero", () => {
    render(
      <KpiCard
        etiqueta="Ingreso"
        valor={1}
        unidad="moneda"
        variacion={{ delta: 3, etiqueta: "vs. ayer", texto: TEXTO_DEL_SIGNO }}
      />,
    );
    const linea = screen.getByText(colapsar(`Sube ${formatearValor(3, "moneda", MONEDA_PLATAFORMA)} vs. ayer`));
    expect(linea.tagName).toBe("P");
    expect(linea.children).toHaveLength(0);
  });

  it('KpiCard no declara "use client" (se monta desde servidor); CifraAnalitica si', () => {
    expect(leerFuente("components/private/analytics/KpiCard.tsx")).not.toMatch(/^\s*["']use client["']/m);
    expect(leerFuente("components/private/analytics/CifraAnalitica.tsx").startsWith('"use client"')).toBe(true);
  });

  it("TablaResumen: las celdas y el total de una columna en moneda", () => {
    const tabla = (
      <TablaResumen
        titulo="Resumen"
        encabezadoCategoria="Dia"
        columnas={[{ id: "monto", etiqueta: "Monto", unidad: "moneda" }]}
        filas={[
          { id: "a", categoria: "lunes", valores: { monto: 1000000 } },
          { id: "b", categoria: "martes", valores: { monto: 234567 } },
        ]}
        totales={{ etiqueta: "Total" }}
        vacio={VACIO_DE_PRUEBA}
      />
    );
    // Una celda (lunes) y el total (1 000 000 + 234 567).
    esperarMonedaDelPais(tabla, "€1 000 000");
    esperarMonedaDelPais(tabla, MILLON_EN_PRUEBA);
  });

  it("SerieTextual (la alternativa textual)", () => {
    const sinRecorte = { recortado: false, mostrados: 1, recibidos: 1 };
    esperarMonedaDelPais(
      <SerieTextual
        series={SERIE_EN_DINERO}
        unidad="moneda"
        etiqueta="Cobrado"
        recorteSeries={sinRecorte}
        recortePuntos={sinRecorte}
      />,
      `Cobrado, lunes: ${MILLON_EN_PRUEBA}`,
    );
  });

  it.each([
    ["GraficaBarras", GraficaBarras],
    ["GraficaLineas", GraficaLineas],
    ["GraficaDonut", GraficaDonut],
  ] as const)("%s: el formateador del lienzo y la alternativa textual", async (_n, Grafica) => {
    const ui = <Grafica titulo="Cobrado" series={SERIE_EN_DINERO} unidad="moneda" vacio={VACIO_DE_PRUEBA} />;
    const lienzoDe = async (montaje: Montaje): Promise<string> => {
      const { unmount } = render(montar(montaje, ui));
      const texto = colapsar((await screen.findByTestId("lienzo")).textContent ?? "");
      unmount();
      return texto;
    };

    expect(await lienzoDe("prueba")).toBe("€7 654 321");
    const sinProveedor = await lienzoDe("sin proveedor");
    expect(sinProveedor).toBe(colapsar(formatearValor(VALOR_DE_LIENZO, "moneda", MONEDA_PLATAFORMA)));
    expect(await lienzoDe("cr")).toBe(sinProveedor);
    esperarMonedaDelPais(ui, `Cobrado, lunes: ${MILLON_EN_PRUEBA}`);
  });

  it.each([
    ["GraficaRanking", GraficaRanking],
    ["GraficaReparto", GraficaReparto],
  ] as const)("%s: la cifra de cada fila (y su alternativa textual)", (_n, Grafica) => {
    const ui = (
      <Grafica
        titulo="Cobrado"
        series={[
          {
            id: "a",
            etiqueta: "Cobrado",
            puntos: [
              { categoria: "Norte", valor: 1234567 },
              { categoria: "Sur", valor: 765433 },
            ],
          },
        ]}
        unidad="moneda"
        vacio={VACIO_DE_PRUEBA}
      />
    );
    esperarMonedaDelPais(ui, MILLON_EN_PRUEBA);
    esperarMonedaDelPais(ui, "€765 433");
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 3 — pantallas de `/analitica` (R1, R3, R4, R12, R13, R17; design §4.2, §5)
// ---------------------------------------------------------------------------------------------

import userEvent from "@testing-library/user-event";
import { waitFor, within } from "@testing-library/react";
import { SWRConfig } from "swr";

import { FiltroEntregasProvider } from "@/app/(app)/_components/filtro-entregas";
import {
  DETALLE_DINERO_TEXTOS,
  DineroProductoDetalle,
  pistasConImpuesto,
} from "@/app/(app)/analitica/_components/entregas/DineroProductoDetalle";
import {
  PRODUCTOS_COLUMNAS,
  PRODUCTOS_TEXTOS,
  ProductosTabla,
  textoPendiente,
} from "@/app/(app)/analitica/_components/entregas/ProductosTabla";
import { PanelConciliacion } from "@/app/(app)/analitica/_components/financiero/PanelConciliacion";
import { TableroFinanciero } from "@/app/(app)/analitica/_components/financiero/TableroFinanciero";
import { KpisFinancieros } from "@/app/(app)/analitica/_components/finanzas/KpisFinancieros";
import { consultarConteoProductos } from "@/lib/actions/conteo-productos";
import { consultarDetalleDineroProducto } from "@/lib/actions/detalle-dinero-producto";
import { SIN_MONTO_RAYA, type FormatoMoneda } from "@/lib/config/moneda";
import type { ResultadoFinancieroVistas } from "@/lib/types/analitica-financiera";
import type { ConteoProductosDTO, DineroProductoDTO, FilaProductoDTO } from "@/lib/types/conteo-productos";
import { ToastProvider } from "@/providers/ToastProvider";
import { dtoConciliacionServido, dtoNoTemporalServido } from "@/tests/fixtures/dto-financiero-servido";
import { importeConNeto, importeSoloBruto } from "@/tests/fixtures/importe-analitico";

// Las dos acciones de la tabla de productos, dobladas como en `ProductosTablaDinero.test.tsx`.
// Ningun bloque anterior de este archivo las usa.
vi.mock("@/lib/actions/conteo-productos", () => ({ consultarConteoProductos: vi.fn() }));
vi.mock("@/lib/actions/detalle-dinero-producto", () => ({ consultarDetalleDineroProducto: vi.fn() }));

const conteoMock = vi.mocked(consultarConteoProductos);
const detalleMock = vi.mocked(consultarDetalleDineroProducto);

const MONTAJES: readonly Montaje[] = ["prueba", "cr", "sin proveedor"];

/** La moneda con la que cada montaje debe pintar: CR y sin proveedor, la de la plataforma (R12, R13). */
const monedaDe = (montaje: Montaje): FormatoMoneda => (montaje === "prueba" ? MONEDA_DE_PRUEBA : MONEDA_PLATAFORMA);

/** El importe tal como lo pinta el tablero con una moneda dada (los espacios, colapsados). */
const enTablero = (valor: number, moneda: FormatoMoneda): string => colapsar(formatearValor(valor, "moneda", moneda));

/** El importe tal como lo pinta la tabla de productos con una moneda dada (raya larga sin importe). */
const enProductos = (valor: string, moneda: FormatoMoneda): string =>
  colapsar(formatearMontoEn(moneda, valor, SIN_MONTO_RAYA));

/** Los `<dd>` que pinta `ui` en cada montaje: las cifras del total del DTO y del cuadre. */
function cifrasDeDd(ui: ReactElement): Record<Montaje, string[]> {
  const leer = (montaje: Montaje): string[] => {
    const { container, unmount } = render(montar(montaje, ui));
    const dd = [...container.querySelectorAll("dd")].map((n) => colapsar(n.textContent ?? ""));
    unmount();
    return dd;
  };
  return { prueba: leer("prueba"), cr: leer("cr"), "sin proveedor": leer("sin proveedor") };
}

function tablero(datos: ResultadoFinancieroVistas): ReactElement {
  return <TableroFinanciero paneles={[{ estado: "ok", id: datos.metricaId, datos }]} />;
}

const ETIQUETA_CUENTA = "Por pagar a tiendas";

/** Una vista con filas (tabla + total del DTO), con el total en las dos cifras. */
const CUENTA_CON_NETO = dtoNoTemporalServido("cuenta_por_pagar_tienda", ETIQUETA_CUENTA, [
  {
    filas: [{ cubo: "tienda-aaa", importe: importeConNeto("2500000.00", "2400000.00") }],
    total: importeConNeto("1234567.00", "765433.00"),
  },
]);
/** La misma, sin neto: solo «Total bruto». */
const CUENTA_SOLO_BRUTO = dtoNoTemporalServido("cuenta_por_pagar_tienda", ETIQUETA_CUENTA, [
  {
    filas: [{ cubo: "tienda-aaa", importe: importeSoloBruto("2500000.00") }],
    total: importeSoloBruto("1234567.00"),
  },
]);
/** Sin filas: el KPI (el neto) y su linea del bruto. */
const CUENTA_KPI = dtoNoTemporalServido("cuenta_por_pagar_tienda", ETIQUETA_CUENTA, [
  { filas: [], total: importeConNeto("2500000.00", "1234567.00") },
]);
/** Sin importe: el total del DTO con los dos campos vacios. */
const CUENTA_SIN_IMPORTE = dtoNoTemporalServido("cuenta_por_pagar_tienda", ETIQUETA_CUENTA, [
  {
    filas: [{ cubo: "tienda-aaa", importe: importeConNeto("2500000.00", "2400000.00") }],
    total: importeConNeto("", ""),
  },
]);

function conciliacion(cuadre: { totalSnapshot: string; totalLedger: string; diferencia: string }) {
  return dtoConciliacionServido("Conciliación de cierres", {
    porEstado: [
      {
        nivel: "cierre_dia",
        estado: "aprobado",
        cantidad: 7,
        totales: { efectivo: "765433.00", simpe: "11.00", transferencia: "12.00", general: "33.00" },
        fechadoPor: "resuelto_at",
      },
    ],
    cuadre: { cuadra: true, cierresDescuadrados: [], ...cuadre },
  });
}

describe("SLT-242 R1 — el tablero financiero y la conciliacion pintan los importes con la moneda del pais", () => {
  it("TotalDelDto con neto: «Total neto» y «Total bruto» en la moneda del pais; con CR, igual que sin proveedor", () => {
    const dd = cifrasDeDd(tablero(CUENTA_CON_NETO));
    expect(dd.prueba).toEqual(["€765 433", MILLON_EN_PRUEBA]);
    expect(dd["sin proveedor"]).toEqual([enTablero(765433, MONEDA_PLATAFORMA), enTablero(1234567, MONEDA_PLATAFORMA)]);
    expect(dd.cr).toEqual(dd["sin proveedor"]);
  });

  it("TotalDelDto solo bruto: solo «Total bruto», en la moneda del pais", () => {
    const textos = textosDe(tablero(CUENTA_SOLO_BRUTO));
    expect(textos.prueba).toContain(`Total bruto${MILLON_EN_PRUEBA}`);
    expect(textos.prueba).not.toContain("Total neto");
    expect(textos["sin proveedor"]).toContain(`Total bruto${enTablero(1234567, MONEDA_PLATAFORMA)}`);
    expect(textos.cr).toBe(textos["sin proveedor"]);
  });

  it("la tabla del detalle (paquete) y el total del DTO salen en la misma moneda", () => {
    const textos = textosDe(tablero(CUENTA_CON_NETO));
    expect(textos.prueba).toContain("€2 500 000");
    expect(textos["sin proveedor"]).toContain(enTablero(2500000, MONEDA_PLATAFORMA));
    expect(textos.cr).toBe(textos["sin proveedor"]);
  });

  it.each(MONTAJES)("el KPI (%s): la linea «Bruto: …» es UN solo <p> con la moneda que toca", (montaje) => {
    render(montar(montaje, tablero(CUENTA_KPI)));
    const linea = screen.getByText(`Bruto: ${enTablero(2500000, monedaDe(montaje))}`);
    expect(linea.tagName).toBe("P");
    expect(linea.children).toHaveLength(0);
    if (montaje === "prueba") expect(screen.getByText("Bruto: €2 500 000")).toBe(linea);
  });

  it("el KPI: con CR, el mismo texto que sin proveedor", () => {
    const textos = textosDe(tablero(CUENTA_KPI));
    expect(textos.prueba).toContain("Bruto: €2 500 000");
    expect(textos.cr).toBe(textos["sin proveedor"]);
  });

  it("sin importe, el total del DTO pinta el marcador de hoy en los tres montajes", () => {
    const dd = cifrasDeDd(tablero(CUENTA_SIN_IMPORTE));
    for (const montaje of MONTAJES) expect(dd[montaje], montaje).toEqual([SIN_MONTO, SIN_MONTO]);
  });

  it("PanelConciliacion: las tres cifras del cuadre y los totales por metodo, en la moneda del pais", () => {
    const ui = (
      <PanelConciliacion
        datos={conciliacion({ totalSnapshot: "1234567.00", totalLedger: "1234000.00", diferencia: "567.00" })}
      />
    );
    const dd = cifrasDeDd(ui);
    expect(dd.prueba).toEqual([MILLON_EN_PRUEBA, "€1 234 000", "€567"]);
    expect(dd["sin proveedor"]).toEqual([
      enTablero(1234567, MONEDA_PLATAFORMA),
      enTablero(1234000, MONEDA_PLATAFORMA),
      enTablero(567, MONEDA_PLATAFORMA),
    ]);
    expect(dd.cr).toEqual(dd["sin proveedor"]);

    // Los totales por metodo los pinta la tabla del paquete.
    const textos = textosDe(ui);
    expect(textos.prueba).toContain("€765 433");
    expect(textos["sin proveedor"]).toContain(enTablero(765433, MONEDA_PLATAFORMA));
    expect(textos.cr).toBe(textos["sin proveedor"]);
  });

  it("PanelConciliacion sin importe en el cuadre: el marcador de hoy", () => {
    const dd = cifrasDeDd(
      <PanelConciliacion datos={conciliacion({ totalSnapshot: "", totalLedger: "", diferencia: "" })} />,
    );
    for (const montaje of MONTAJES) expect(dd[montaje], montaje).toEqual([SIN_MONTO, SIN_MONTO, SIN_MONTO]);
  });
});

/** Cuadrado como en `ProductosTablaDinero.test.tsx`: 6215 + 28785 = 35000; 35000 + 10000 = 45000. */
const DINERO_DE_FILA: DineroProductoDTO = {
  recaudado: "45000.00",
  liquidado: { recaudado: "35000.00", empresa: "6215.00", tienda: "28785.00", ordenes: 4 },
  pendiente: { recaudado: "10000.00", ordenes: 1 },
  retorno: "2260.00",
  fulfillment: "0.00",
};

function filaDeProducto(producto: string, dinero: DineroProductoDTO | null): FilaProductoDTO {
  return {
    tiendaId: "t1",
    tienda: "Tienda Uno",
    producto,
    unidades: 6,
    ordenes: 5,
    porStatus: [{ status: "entregado", conteo: 5 }],
    ordenesAcompanadas: 3,
    dinero,
  };
}

const CONTEO: ConteoProductosDTO = {
  filas: [filaDeProducto("Base Dr", DINERO_DE_FILA), filaDeProducto("Creatina", null)],
  ordenes: 10,
  ordenesSinProducto: 0,
  dinero: { estado: "concedido" },
  lastSync: "2026-09-01T18:30:00.000Z",
};

const DETALLE = {
  status: "ok" as const,
  datos: {
    producto: "Base Dr",
    tiendaNombre: "Tienda Uno",
    totales: DINERO_DE_FILA,
    total: 1,
    page: 1,
    pageSize: 25,
    ordenes: [
      {
        ordenId: "o1",
        guia: "77001",
        destinatario: "Ana Pérez",
        resultados: ["entregado" as const],
        estado: "liquidada" as const,
        recaudado: "35000.00",
        empresa: "6215.00",
        tienda: "28785.00",
        retorno: null,
      },
    ],
  },
};

/** Los importes del detalle de dinero (cabecera y la orden). */
const IMPORTES_DEL_DETALLE = ["45000.00", "6215.00", "28785.00", "10000.00", "2260.00", "35000.00"] as const;

function conProveedoresDeTabla(ui: ReactElement): ReactElement {
  return (
    <ToastProvider>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <FiltroEntregasProvider>{ui}</FiltroEntregasProvider>
      </SWRConfig>
    </ToastProvider>
  );
}

const detalleSuelto = (
  <DineroProductoDetalle filtroSerializado="{}" tiendaId="t1" tiendaNombre="Tienda Uno" producto="Base Dr" />
);

/** El texto de la fila de la tabla de productos que lleva `producto`. */
function textoDeFila(producto: string): string {
  return colapsar(screen.getByRole("cell", { name: producto }).closest("tr")?.textContent ?? "");
}

describe("SLT-242 R3 — la tabla y el detalle de productos pintan los importes con la moneda del pais", () => {
  it("textoPendiente con la moneda que se le pasa", () => {
    expect(colapsar(textoPendiente("10000.00", 1, MONEDA_DE_PRUEBA))).toBe("Pendiente de cierre: €10 000 (1 orden)");
    expect(textoPendiente("10000.00", 1, MONEDA_PLATAFORMA)).toBe(
      `Pendiente de cierre: ${formatearMontoEn(MONEDA_PLATAFORMA, "10000.00", SIN_MONTO_RAYA)} (1 orden)`,
    );
  });

  it.each(MONTAJES)("ProductosTabla (%s): celdas, detalle de la fila y «Pendiente de cierre»", async (montaje) => {
    const moneda = monedaDe(montaje);
    conteoMock.mockResolvedValue({ status: "ok", datos: CONTEO });
    detalleMock.mockResolvedValue(DETALLE);
    const usuario = userEvent.setup();
    render(montar(montaje, conProveedoresDeTabla(<ProductosTabla dinero />)));

    await screen.findByText("Base Dr");
    // La columna de dinero: con importe, la moneda; sin dinero en la fila, la raya larga de hoy.
    expect(textoDeFila("Base Dr")).toContain(enProductos("45000.00", moneda));
    expect(textoDeFila("Creatina")).toContain(SIN_MONTO_RAYA);
    if (montaje === "prueba") expect(textoDeFila("Base Dr")).toContain("€45 000");

    await usuario.click(screen.getByRole("button", { name: PRODUCTOS_TEXTOS.abrirDetalle("Base Dr", "Tienda Uno") }));
    const bloque = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-slot="detalle-producto"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const empresa = within(bloque).getByText(PRODUCTOS_COLUMNAS.empresa).nextElementSibling;
    expect(colapsar(empresa?.textContent ?? "")).toBe(enProductos("6215.00", moneda));
    expect(screen.getByText(colapsar(textoPendiente("10000.00", 1, moneda)))).toBeInTheDocument();
    if (montaje === "prueba") {
      expect(screen.getByText("Pendiente de cierre: €10 000 (1 orden)")).toBeInTheDocument();
    }
  });

  it("DineroProductoDetalle: sus importes en la moneda del pais; con CR, igual que sin proveedor", async () => {
    detalleMock.mockResolvedValue(DETALLE);
    const leer = async (montaje: Montaje): Promise<string> => {
      const { unmount } = render(montar(montaje, conProveedoresDeTabla(detalleSuelto)));
      const panel = screen.getByRole("region", { name: DETALLE_DINERO_TEXTOS.region("Base Dr", "Tienda Uno") });
      await within(panel).findByRole("link", { name: DETALLE_DINERO_TEXTOS.verOrden("77001") });
      const texto = colapsar(panel.textContent ?? "");
      unmount();
      return texto;
    };

    const prueba = await leer("prueba");
    for (const importe of IMPORTES_DEL_DETALLE) {
      expect(prueba, importe).toContain(enProductos(importe, MONEDA_DE_PRUEBA));
    }
    expect(prueba).toContain("€28 785");
    // El retorno de la orden no liquidado: la raya larga de hoy.
    expect(prueba).toContain(SIN_MONTO_RAYA);

    const sinProveedor = await leer("sin proveedor");
    for (const importe of IMPORTES_DEL_DETALLE) {
      expect(sinProveedor, importe).toContain(enProductos(importe, MONEDA_PLATAFORMA));
    }
    expect(await leer("cr")).toBe(sinProveedor);
  });
});

describe("SLT-242 R4 — las tarjetas financieras pintan el importe con la moneda del pais", () => {
  const tarjetas = (
    <KpisFinancieros
      kpis={[
        { estado: "ok", id: "ingresos", etiqueta: "Ingresos", monto: "1234.50" },
        { estado: "denegado", id: "egresos", etiqueta: "Egresos" },
      ]}
    />
  );

  it("un KPI `ok` de monto «1234.50»: «€1 235» con la de prueba; con CR, igual que sin proveedor", () => {
    const textos = textosDe(tarjetas);
    expect(textos.prueba).toContain("Ingresos€1 235");
    expect(textos["sin proveedor"]).toContain(
      `Ingresos${colapsar(formatearMontoEn(MONEDA_PLATAFORMA, "1234.50", SIN_MONTO))}`,
    );
    expect(textos.cr).toBe(textos["sin proveedor"]);
  });

  it("el archivo no formatea por su cuenta: monta `MontoAnalitico` (sin pasar el importe por `number`)", () => {
    const codigo = quitarComentarios(leerFuente("app/(app)/analitica/_components/finanzas/KpisFinancieros.tsx"));
    expect(codigo).toContain("<MontoAnalitico monto={kpi.monto} />");
    expect(codigo).not.toMatch(/\bformatMontoString\s*\(/);
  });
});

describe("SLT-242 R17 — las pistas del detalle de dinero nombran el impuesto del pais", () => {
  const RETORNO_IGV =
    "Flete por devolución a origen + IGV de las órdenes en Devolución a origen por rechazo. Fuera del reparto";

  it("pistasConImpuesto con «IGV», y con el rotulo de la plataforma el texto de hoy", () => {
    expect(pistasConImpuesto("IGV")).toEqual({
      empresaPista: "Solo de lo ya liquidado: flete + IGV y comisión + IGV",
      retornoPista: RETORNO_IGV,
    });
    expect(pistasConImpuesto(IMPUESTO_ROTULO)).toEqual({
      empresaPista: "Solo de lo ya liquidado: flete + IVA y comisión + IVA",
      retornoPista:
        "Flete por devolución a origen + IVA de las órdenes en Devolución a origen por rechazo. Fuera del reparto",
    });
    // Las entradas de la constante de textos siguen diciendo lo de hoy (las leen otras suites).
    expect(DETALLE_DINERO_TEXTOS.totales.empresaPista).toBe(pistasConImpuesto(IMPUESTO_ROTULO).empresaPista);
    expect(DETALLE_DINERO_TEXTOS.totales.retornoPista).toBe(pistasConImpuesto(IMPUESTO_ROTULO).retornoPista);
  });

  it.each(MONTAJES)("DineroProductoDetalle (%s) pinta las dos pistas con el impuesto que toca", async (montaje) => {
    detalleMock.mockResolvedValue(DETALLE);
    render(montar(montaje, conProveedoresDeTabla(detalleSuelto)));
    await screen.findByRole("link", { name: DETALLE_DINERO_TEXTOS.verOrden("77001") });

    const pistas = pistasConImpuesto(montaje === "prueba" ? "IGV" : "IVA");
    expect(screen.getByText(pistas.empresaPista)).toBeInTheDocument();
    expect(screen.getByText(pistas.retornoPista)).toBeInTheDocument();
    if (montaje === "prueba") {
      expect(screen.getByText(RETORNO_IGV)).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/\bIVA\b/);
    } else {
      // Con CR y sin proveedor, el texto de hoy: el mismo que esperan las otras suites.
      expect(screen.getByText(DETALLE_DINERO_TEXTOS.totales.empresaPista)).toBeInTheDocument();
      expect(screen.getByText(DETALLE_DINERO_TEXTOS.totales.retornoPista)).toBeInTheDocument();
    }
  });

  it("`DineroProductoDetalle.tsx` no escribe «IVA» fuera de los comentarios", () => {
    const codigo = quitarComentarios(leerFuente("app/(app)/analitica/_components/entregas/DineroProductoDetalle.tsx"));
    expect(codigo).not.toMatch(/\bIVA\b/);
    // Contraprueba: el mismo censo ve un «IVA» escrito en un texto, y no uno en un comentario.
    expect(quitarComentarios('const p = "flete + IVA y comisión + IVA"; // IVA')).toMatch(/\bIVA\b/);
    expect(quitarComentarios("/** flete + IVA */\nconst p = 1;")).not.toMatch(/\bIVA\b/);
  });
});
