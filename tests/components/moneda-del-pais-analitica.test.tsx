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
