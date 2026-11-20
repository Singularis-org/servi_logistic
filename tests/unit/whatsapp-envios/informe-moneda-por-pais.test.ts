import { describe, it, expect, vi } from "vitest";
import { fuentesDePagina, objetos, paginas, textoLegible, textosDePagina } from "../pdf/pdf-inspector";
import { crearInformeTransito } from "@/lib/whatsapp-envios/informes/transito/informe";
import { PARAMETROS_POR_DEFECTO } from "@/lib/whatsapp-envios/informes/transito/parametros";
import type { FilaTransito, ZonaInforme } from "@/lib/whatsapp-envios/informes/transito/tipos";
import type { IInformeTransitoRepository } from "@/lib/interfaces/repositories/IInformeTransitoRepository";
import { crearInformePicking } from "@/lib/whatsapp-envios/informes/picking/informe";
import type { IPickingRepository } from "@/lib/interfaces/repositories/IPickingRepository";
import { crearInformeAvisoInterno } from "@/lib/whatsapp-envios/informes/aviso-interno";
import { informePruebaEnvio } from "@/lib/whatsapp-envios/informes/prueba-envio";
import type { ContextoInforme, InformeWhatsapp } from "@/lib/whatsapp-envios/informes/tipos";
import type { FormatoMoneda } from "@/lib/config/moneda";
import { PaisSinMoneda } from "@/lib/db/errores-pais";
import { EjecucionEnvioService, type MetaEnvios } from "@/lib/services/EjecucionEnvioService";
import { destinatario, ejecucionFila, ejecucionesRepo, envio, enviosRepo, plantilla } from "../services/_dobles-envios-474";
import { MONEDA_CR, MONEDA_DE_PRUEBA, ZONA_DE_CR, reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SL-21 (R12, R13, R16; design §5.3) — el informe de tránsito pinta `por_cobrar` y los importes de su
// PDF en la moneda del país de la empresa, que pide perezosa al contexto; los informes que no pintan
// importes (picking, aviso interno, prueba) no la leen. El motor la conecta con el puerto.

const UN_DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date("2026-10-05T11:00:00.000Z");
const GAM: ZonaInforme = { id: "z-gam", nombre: "GAM", esCentral: true };
const SUR: ZonaInforme = { id: "z-sur", nombre: "FGAM Zona Sur", esCentral: false };

function fila(over: Partial<FilaTransito>, dias: number): FilaTransito {
  return {
    ordenId: `o-${dias}-${over.montoCobrar ?? "x"}`,
    numRemision: "GM-1",
    numGuia: 48127,
    estado: "en_reparto",
    zonaId: GAM.id,
    destinatario: "María Jiménez",
    canton: "San José",
    distrito: "Hatillo",
    montoCobrar: "18500.00",
    hitoAt: new Date(AHORA.getTime() - dias * UN_DIA),
    ultimaTransicionAt: new Date(AHORA.getTime() - 1 * UN_DIA),
    ...over,
  };
}

const FILAS = [fila({ montoCobrar: "18500.00" }, 12), fila({ montoCobrar: "24900.00" }, 9)];

const repoTransito: IInformeTransitoRepository = {
  zonas: async () => [GAM, SUR],
  filasEnAlerta: async () => FILAS,
  contarSinHito: async () => 0,
};

/** Una moneda perezosa que, si alguien la pide, lanza como un país sin moneda; queda espiada. */
function monedaQueLanza() {
  return vi.fn((): Promise<FormatoMoneda> => Promise.reject(new PaisSinMoneda("XC")));
}

/** Texto legible de todas las páginas del PDF (la fuente embebida escribe en Identity-H). */
function textoDelPdf(bytes: Uint8Array): string[] {
  const n = paginas(objetos(bytes)).length;
  return Array.from({ length: n }, (_, i) => {
    const fuentes = fuentesDePagina(bytes, i);
    return textosDePagina(bytes, i).map((t) => textoLegible(t, fuentes.get(t.fuenteRes)));
  }).flat();
}

async function generarTransito(moneda: FormatoMoneda) {
  const r = await crearInformeTransito({ repo: repoTransito }).generar({
    parametros: PARAMETROS_POR_DEFECTO,
    ahora: AHORA,
    zona: ZONA_DE_CR,
    moneda: async () => moneda,
    conDocumento: true,
  });
  if (r.tipo !== "contenido" || r.documento === undefined) throw new Error("se esperaba contenido con PDF");
  return { valores: r.valores, pdf: textoDelPdf(r.documento.bytes) };
}

describe("R12 — informe de tránsito en la moneda del país", () => {
  it("`por_cobrar` y los importes del PDF salen en la moneda del país", async () => {
    const { valores, pdf } = await generarTransito(MONEDA_DE_PRUEBA);
    expect(valores.por_cobrar).toBe("€43 400");
    const todo = pdf.join("\n");
    expect(pdf[pdf.indexOf("POR COBRAR") + 1]).toBe("€43 400");
    expect(todo).toContain("€18 500");
    expect(todo).toContain("€24 900");
    expect(todo).not.toContain("₡");
  });

  it("R16: con Costa Rica, los textos de siempre", async () => {
    const { valores, pdf } = await generarTransito(MONEDA_CR);
    expect(valores.por_cobrar).toBe("₡43.400");
    expect(pdf[pdf.indexOf("POR COBRAR") + 1]).toBe("₡43.400");
    expect(pdf.join("\n")).toContain("₡18.500");
  });

  it("sin moneda en el país, la generación falla con PaisSinMoneda", async () => {
    const moneda = monedaQueLanza();
    await expect(
      crearInformeTransito({ repo: repoTransito }).generar({
        parametros: PARAMETROS_POR_DEFECTO,
        ahora: AHORA,
        zona: ZONA_DE_CR,
        moneda,
        conDocumento: false,
      }),
    ).rejects.toBeInstanceOf(PaisSinMoneda);
  });

  it("un llamante que no pasa la moneda lanza en vez de pintar una inventada", async () => {
    await expect(
      crearInformeTransito({ repo: repoTransito }).generar({
        parametros: PARAMETROS_POR_DEFECTO,
        ahora: AHORA,
        zona: ZONA_DE_CR,
        conDocumento: false,
      }),
    ).rejects.toThrow(/moneda/);
  });

  it("sin alertas y sin «enviar si vacío», responde vacío sin leer la moneda", async () => {
    const moneda = monedaQueLanza();
    const r = await crearInformeTransito({
      repo: { ...repoTransito, filasEnAlerta: async () => [] },
    }).generar({ parametros: PARAMETROS_POR_DEFECTO, ahora: AHORA, zona: ZONA_DE_CR, moneda, conDocumento: true });
    expect(r.tipo).toBe("vacio");
    expect(moneda).not.toHaveBeenCalled();
  });
});

describe("R13 — los informes que no pintan importes no leen la moneda", () => {
  it("picking", async () => {
    const repo: IPickingRepository = {
      tiendaDelPicking: async () => ({ id: "t1", nombre: "Abarrotes", fulfillment: true, esTienda: true, activo: true }),
      ordenesEnPreparacion: async () => [
        { ordenId: "o1", numRemision: "NA-1", numGuia: null, producto: "2 * Crema", entrada: new Date(AHORA.getTime() - 4 * UN_DIA) },
      ],
      tiendasFulfillment: async () => [],
      entradasEnPreparacion: async () => [],
    };
    const moneda = monedaQueLanza();
    const r = await crearInformePicking({ repo }).generar({
      parametros: { tiendaId: "t1", diasAtraso: 2 },
      ahora: AHORA,
      zona: ZONA_DE_CR,
      moneda,
      conDocumento: true,
    });
    expect(r.tipo).toBe("contenido");
    expect(moneda).not.toHaveBeenCalled();
  });

  it("aviso interno", async () => {
    const moneda = monedaQueLanza();
    const r = await crearInformeAvisoInterno({ baseUrl: () => "https://example.com" }).generar({
      parametros: {},
      ahora: AHORA,
      zona: ZONA_DE_CR,
      moneda,
      conDocumento: false,
      evento: {
        clave: "cierre_dia_por_aprobar",
        referencia: "c1",
        datos: { texto: "Hay un cierre por aprobar", rolFila: "maestro", creadoAt: "2026-10-05T11:00:00.000Z" },
      },
    });
    expect(r.tipo).toBe("contenido");
    expect(moneda).not.toHaveBeenCalled();
  });

  it("prueba de envío", async () => {
    const moneda = monedaQueLanza();
    const r = await informePruebaEnvio.generar({
      parametros: { simularVacio: false },
      ahora: AHORA,
      zona: ZONA_DE_CR,
      moneda,
      conDocumento: true,
    });
    expect(r.tipo).toBe("contenido");
    expect(moneda).not.toHaveBeenCalled();
  });
});

describe("R12, R13 — el motor conecta la moneda perezosa con el puerto", () => {
  it("EjecucionEnvioService pasa al informe una moneda que lee el puerto solo al pedirla", async () => {
    const reglasPais = reglasPaisFijas({ moneda: MONEDA_DE_PRUEBA });
    const leerMoneda = vi.spyOn(reglasPais, "moneda");
    let ctxRecibido: ContextoInforme<unknown> | null = null;
    const informe = {
      parametros: { safeParse: (p: unknown) => ({ success: true, data: p }) },
      generar: vi.fn(async (ctx: ContextoInforme<unknown>) => {
        ctxRecibido = ctx;
        return { tipo: "error" as const, motivo: "fin del test" };
      }),
    } as unknown as InformeWhatsapp<unknown>;
    const ej = ejecucionesRepo(ejecucionFila({ origen: "programado" }));
    const s = new EjecucionEnvioService({
      reglasPais,
      envios: enviosRepo({
        obtener: vi.fn(async () => envio({ encendido: true, informeClave: "transito", plantillaId: "pl-t", parametros: {} })),
        resolverDestinatarios: vi.fn(async () => [destinatario()]),
      }),
      ejecuciones: ej.repo,
      plantillas: {
        findEnviableDeInformeById: vi.fn(async () =>
          plantilla({ id: "pl-t", informeClave: "transito", llevaDocumento: false, variables: ["por_cobrar"] }),
        ),
      },
      almacen: { guardar: vi.fn(), leer: vi.fn(), firmar: vi.fn(), borrar: vi.fn() },
      cola: { enqueue: vi.fn(async () => null) },
      meta: vi.fn((): MetaEnvios => ({ enviador: { enviarPlantilla: vi.fn() }, subidor: { subir: vi.fn() }, idioma: "es" })),
      now: () => AHORA,
      informe: () => informe,
      logger: { warn: () => {} },
    });

    await s.ejecutar("ej-1");

    expect(informe.generar).toHaveBeenCalledTimes(1);
    expect(leerMoneda).not.toHaveBeenCalled();
    const ctx = ctxRecibido as ContextoInforme<unknown> | null;
    expect(ctx?.moneda).toBeTypeOf("function");
    await expect(ctx?.moneda?.()).resolves.toEqual(MONEDA_DE_PRUEBA);
    expect(leerMoneda).toHaveBeenCalledTimes(1);
  });
});
