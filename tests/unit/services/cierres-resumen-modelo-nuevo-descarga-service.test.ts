import { describe, it, expect, vi } from "vitest";

import { CierresAdminService } from "@/lib/services/CierresAdminService";
import type {
  Alcance,
  CierreAdminResumenRow,
  ICierresAdminRepository,
} from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { IngresoEmpresaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ESTADOS_COLA_CIERRE_DIA } from "@/lib/utils/colas-cierre";
import { sinRetenidas } from "@/tests/fixtures/retenidas-doble";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

vi.mock("@/lib/config/descarga", async (original) => {
  const real = await original<typeof import("@/lib/config/descarga")>();
  return { ...real, descargaConfig: { ...real.descargaConfig, MAX_FILAS: 4 } };
});

// SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» (T2.3; R377, R378, R382, R383) — la
// rama de cifras de los dos `listar…Completo`, con dobles. Lo que esta suite NO ve es el SQL de la
// lectura en lote (su `WHERE` de alcance y el numero de consultas): eso vive en
// `tests/integration/db/cierres-resumen-modelo-nuevo-descarga-sql-real.test.ts`.
//
// Cifras a mano. Cierre N1 (central, nuevo, aprobado, con la marca): recaudado 100 000,00; P 3 000,00;
// ingreso de bodega por rechazos 500,00; un pago vigente de 1 200,00. G1 «Tienda Norte» entrega con
// flete 4 520,00 y comision 1 130,00 (con IVA); G2 «Tienda Sur» novedad con flete 2 260,00 (con IVA).

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const SATELITE: Actor = { usuarioId: "u-sat", rol: "adminSatelite" };
const SIN_ZONA: Actor = { usuarioId: "u-sin-zona", rol: "adminSatelite" };
const ZONA_POR_USUARIO: Record<string, string | null> = { "u-sat": "z-a", "u-sin-zona": null };

function fila(over: Partial<CierreAdminResumenRow> & { cierreId: string }): CierreAdminResumenRow {
  return {
    pagoIndependienteEfectivo: false,
    incluyeModeloNuevo: false,
    mensajeroId: `m-${over.cierreId}`,
    mensajeroNombre: `Mensajero ${over.cierreId}`,
    estado: "aprobado",
    destinoTipo: "bodega_central",
    destinoZonaId: "z-central",
    destinoZonaNombre: "Central",
    totales: { efectivo: "100.00", simpe: "0.00", transferencia: "0.00", general: "100.00" },
    totalPagoMensajero: "10.00",
    totalIngresoBodegaRechazos: "0.00",
    solicitadoAt: "2026-11-06T18:00:00.000Z",
    resueltoAt: "2026-11-06T20:00:00.000Z",
    motivoRechazo: null,
    ...over,
  };
}

/** Un cierre del modelo nuevo con los snapshots de N1. */
function nuevo(cierreId: string, over: Partial<CierreAdminResumenRow> = {}): CierreAdminResumenRow {
  return fila({
    cierreId,
    incluyeModeloNuevo: true,
    pagoIndependienteEfectivo: true,
    totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
    totalPagoMensajero: "3000.00",
    totalIngresoBodegaRechazos: "500.00",
    ...over,
  });
}

function ingreso(c: Partial<IngresoEmpresaDTO> & { total: string }): IngresoEmpresaDTO {
  return {
    montoCobrar: null,
    cobraComision: false,
    esCentral: false,
    esZonaEspecial: false,
    fleteOrigen: "normal",
    fleteDevolucionOrigen: "normal",
    flete: null,
    ivaFlete: null,
    fleteDevolucion: null,
    ivaFleteDevolucion: null,
    comisionCod: null,
    ivaComisionCod: null,
    fleteConIva: null,
    fleteDevolucionConIva: null,
    comisionConIva: null,
    fulfillment: null,
    ivaFulfillment: null,
    tarifa: null,
    tarifaModelo: "nuevo",
    ...c,
  };
}

/** Las gestiones de N1 en la forma del detalle (solo lo que leen las cifras). */
const GESTIONES_N1 = [
  {
    resultado: "entregado",
    pagos: [
      { metodo: "efectivo", monto: "70000.00" },
      { metodo: "SINPE", monto: "30000.00" },
    ],
    tiendaId: "t-norte",
    tiendaNombre: "Tienda Norte",
    ingresoEmpresa: ingreso({
      flete: "4000.00",
      ivaFlete: "520.00",
      fleteConIva: "4520.00",
      comisionCod: "1000.00",
      ivaComisionCod: "130.00",
      comisionConIva: "1130.00",
      total: "5650.00",
    }),
  },
  {
    resultado: "novedad",
    pagos: [],
    tiendaId: "t-sur",
    tiendaNombre: "Tienda Sur",
    ingresoEmpresa: ingreso({
      fleteDevolucion: "2000.00",
      ivaFleteDevolucion: "260.00",
      fleteDevolucionConIva: "2260.00",
      total: "2260.00",
    }),
  },
] as unknown as CierreGestionPendienteRow[];

/** Lo que la hoja «Cierres» espera de N1, escrito a mano. */
function cifrasN1(cierreId: string, pagoEntregado: string | null) {
  return {
    cierreId,
    pagoTienda: "94350.00",
    ganaLaTienda: "92090.00",
    totalFacturado: "7910.00",
    ivaFacturado: "910.00",
    netoEmpresa: "3500.00",
    gestiones: 2,
    pagoEntregado,
    partesPorTienda: [
      { tiendaNombre: "Tienda Norte", recaudado: "100000.00", pagoTienda: "94350.00", ganaLaTienda: "94350.00" },
      { tiendaNombre: "Tienda Sur", recaudado: "0.00", pagoTienda: "0.00", ganaLaTienda: "-2260.00" },
    ],
  };
}

function esCola(f: CierreAdminResumenRow): boolean {
  return (ESTADOS_COLA_CIERRE_DIA as readonly string[]).includes(f.estado);
}

function casaAlcance(f: CierreAdminResumenRow, a: Alcance): boolean {
  return f.destinoTipo === a.destinoTipo && (a.destinoZonaId === null || f.destinoZonaId === a.destinoZonaId);
}

function montar(filas: CierreAdminResumenRow[], gestiones: Record<string, CierreGestionPendienteRow[]> = {}) {
  const findGestionesDeCierresEnAlcance = vi.fn<ICierresAdminRepository["findGestionesDeCierresEnAlcance"]>(
    async (ids) =>
      new Map(ids.map((id) => [id, gestiones[id] ?? []])),
  );
  const repo = {
    findHistoricoCompleto: vi.fn(async (a: Alcance) => filas.filter((f) => casaAlcance(f, a) && !esCola(f))),
    findColaCompleta: vi.fn(async (a: Alcance) => filas.filter((f) => casaAlcance(f, a) && esCola(f))),
    contarSenalesPorCierre: vi.fn(async () => new Map()),
    findGestionesDeCierresEnAlcance,
  } as unknown as ICierresAdminRepository;
  const ordenRepo = {
    contarCierresAbiertosPorMensajero: vi.fn(async () => new Map()),
    findUsuarioZonaId: vi.fn(async (u: string) => ZONA_POR_USUARIO[u] ?? null),
  } as unknown as IOrdenRepository;
  const zonaRepo = { findCentralZonaId: vi.fn(async () => "z-central") } as unknown as IZonaRepository;
  const ceros = async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, "0.00"]));
  const svc = new CierresAdminService(
    repo,
    zonaRepo,
    ordenRepo,
    { createSignedUrls: vi.fn(async () => ({})) } as unknown as ISignedUrlProvider,
    {
      // Un pago vigente de 1 200,00 en cada cierre aprobado.
      sumarVigentesPorCierre: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, "1200.00"]))),
      obtenerCierreParaPago: vi.fn(async () => null),
    },
    { sumarPremiosVivosPorCierre: vi.fn(ceros), sumarPagadoSatelitePorCierre: vi.fn(ceros) },
    sinRetenidas(),
    undefined,
    undefined,
    undefined,
    undefined,
    reglasPaisFijas(),
  );
  return { svc, findGestionesDeCierresEnAlcance };
}

describe("SLT-140 (a) R377/R383 — solo cierres viejos: como hoy", () => {
  it("sin la clave `cifrasModeloNuevo` y sin leer gestiones, en las dos pestañas", async () => {
    const { svc, findGestionesDeCierresEnAlcance } = montar([
      fila({ cierreId: "v1" }),
      fila({ cierreId: "v2", estado: "solicitado", resueltoAt: null }),
    ]);
    const historico = await svc.listarHistoricoCierresAdminCompleto(MAESTRO);
    const cola = await svc.listarPendientesCierresAdminCompleto(MAESTRO);
    expect(historico.status).toBe("ok");
    expect(cola.status).toBe("ok");
    expect(Object.keys(historico).sort()).toEqual(["items", "status", "total"]);
    expect(Object.keys(cola).sort()).toEqual(["items", "status", "total"]);
    expect(findGestionesDeCierresEnAlcance).not.toHaveBeenCalled();
  });
});

describe("SLT-140 (b) R378/R383 — conjunto mixto", () => {
  it("UNA llamada con los ids nuevos y el alcance del conjunto; una entrada por nuevo, en el orden de `items`", async () => {
    const { svc, findGestionesDeCierresEnAlcance } = montar(
      [nuevo("n-b"), fila({ cierreId: "v1" }), nuevo("n-a")],
      { "n-a": GESTIONES_N1, "n-b": GESTIONES_N1 },
    );
    const r = await svc.listarHistoricoCierresAdminCompleto(MAESTRO);
    if (r.status !== "ok") throw new Error(`status ${r.status}`);
    expect(r.items.map((c) => c.cierreId)).toEqual(["n-b", "v1", "n-a"]);
    expect(findGestionesDeCierresEnAlcance).toHaveBeenCalledTimes(1);
    expect(findGestionesDeCierresEnAlcance.mock.calls[0][0]).toEqual(["n-b", "n-a"]);
    expect(findGestionesDeCierresEnAlcance.mock.calls[0][1]).toEqual({ destinoTipo: "bodega_central", destinoZonaId: null });
    // P 3 000,00 − pendiente 1 800,00 = 1 200,00 entregados (con la marca y un pago de 1 200,00).
    expect(r.cifrasModeloNuevo).toEqual([cifrasN1("n-b", "1200.00"), cifrasN1("n-a", "1200.00")]);
    expect(r.items.find((c) => c.cierreId === "n-a")?.pendientePagoMensajero).toBe("1800.00");
  });

  it("la clasificacion la da `incluyeModeloNuevo`, no la marca de pago: un viejo con la marca no lleva cifras", async () => {
    const { svc } = montar([fila({ cierreId: "v-marca", pagoIndependienteEfectivo: true }), nuevo("n-a")], {
      "n-a": GESTIONES_N1,
    });
    const r = await svc.listarHistoricoCierresAdminCompleto(MAESTRO);
    if (r.status !== "ok") throw new Error(`status ${r.status}`);
    expect(r.cifrasModeloNuevo?.map((c) => c.cierreId)).toEqual(["n-a"]);
  });
});

describe("SLT-140 (c) R382 — la satelite no recibe «Pago entregado»", () => {
  it("`pagoEntregado` es null en todas sus entradas, con el alcance de su zona", async () => {
    const { svc, findGestionesDeCierresEnAlcance } = montar(
      [nuevo("s1", { destinoTipo: "bodega_satelite", destinoZonaId: "z-a" })],
      { s1: GESTIONES_N1 },
    );
    const r = await svc.listarHistoricoCierresAdminCompleto(SATELITE);
    if (r.status !== "ok") throw new Error(`status ${r.status}`);
    expect(r.cifrasModeloNuevo).toEqual([cifrasN1("s1", null)]);
    expect(findGestionesDeCierresEnAlcance.mock.calls[0][1]).toEqual({ destinoTipo: "bodega_satelite", destinoZonaId: "z-a" });
  });
});

describe("SLT-140 (d) R382 — un cierre no aprobado no tiene «Pago entregado»", () => {
  it("central con un nuevo `solicitado` en Pendientes: cifras completas y `pagoEntregado` null", async () => {
    const { svc } = montar([nuevo("n2", { estado: "solicitado", resueltoAt: null })], { n2: GESTIONES_N1 });
    const r = await svc.listarPendientesCierresAdminCompleto(MAESTRO);
    if (r.status !== "ok") throw new Error(`status ${r.status}`);
    expect(r.cifrasModeloNuevo).toEqual([cifrasN1("n2", null)]);
  });
});

describe("SLT-140 (e) — tope y sin zona como hoy, sin leer gestiones", () => {
  it("`limite_excedido` (5 > 4) no lee gestiones ni trae cifras", async () => {
    const { svc, findGestionesDeCierresEnAlcance } = montar(
      ["n1", "n2", "n3", "n4", "n5"].map((id) => nuevo(id)),
    );
    expect(await svc.listarHistoricoCierresAdminCompleto(MAESTRO)).toEqual({
      status: "limite_excedido",
      total: 5,
      limite: 4,
    });
    expect(findGestionesDeCierresEnAlcance).not.toHaveBeenCalled();
  });

  it("sin zona: conjunto vacio, sin cifras y sin leer gestiones", async () => {
    const { svc, findGestionesDeCierresEnAlcance } = montar([nuevo("s1", { destinoTipo: "bodega_satelite" })]);
    expect(await svc.listarHistoricoCierresAdminCompleto(SIN_ZONA)).toEqual({ status: "ok", items: [], total: 0 });
    expect(await svc.listarPendientesCierresAdminCompleto(SIN_ZONA)).toEqual({ status: "ok", items: [], total: 0 });
    expect(findGestionesDeCierresEnAlcance).not.toHaveBeenCalled();
  });
});
