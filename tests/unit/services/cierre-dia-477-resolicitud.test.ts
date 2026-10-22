import { describe, it, expect, vi } from "vitest";

import { CierreDiaService } from "@/lib/services/CierreDiaService";
import type {
  CierreGestionPendienteRow,
  CorreccionCierreRow,
  ICierreDiaRepository,
} from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { CierreEstado } from "@/lib/types/cierre";
import type { CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { PagoTarifa } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { conPagos } from "@/tests/fixtures/cierre-pagos";

/**
 * FICHA 477 (T4.5, T4.7; R21, R22, R25, R26) — el SERVICIO de la re-solicitud y del listado de
 * correcciones, con dobles. Lo que vive en el `WHERE` (vincular, podar, recalcular) se mide contra
 * Postgres en `tests/integration/db/477-resolicitud-rechazado-sql-real.test.ts`.
 *
 *   R21  un `vencido` sigue por `transicionarASolicitado` y NUNCA llama a la rama nueva.
 *   R17  el `rechazado` resuelve la tarifa con la ZONA DESTINO del cierre y el vehiculo del mensajero.
 *   R22  `false` de la escritura -> el `conflict` de hoy, sin aviso.
 *   146  el aviso a la bodega recibe el id del cierre tocado.
 *   T4.7 `listarCierreDia` -> `correcciones`: `[]` sin consultas extra si no hay rechazados; con uno,
 *        sus gestiones vigentes (snapshot) y sus ordenes en correccion con `regestionada`.
 */

const MENSAJERO: Actor = { usuarioId: "m1", rol: "mensajero" };
const MSG_DUPLICADO = "Ese cierre ya se envio a aprobacion; actualiza la pagina.";
const TARIFA_DESTINO: PagoTarifa = { cobroEntregado: "1700.00", cobroRechazado: "200.00" };

function montar(opts: {
  resolicitable?: { id: string; estado: CierreEstado; destinoZonaId: string } | null;
  resolicitado?: boolean;
  cierresPasados?: CierrePasadoDTO[];
  correcciones?: CorreccionCierreRow[];
  gestionesDelCierre?: CierreGestionPendienteRow[];
} = {}) {
  const repo = {
    findCierreResolicitableMasViejo: vi.fn(async () => opts.resolicitable ?? null),
    transicionarASolicitado: vi.fn(async () => true),
    resolicitarCierreRechazado: vi.fn(async () => opts.resolicitado ?? true),
    findCierreParaAviso: vi.fn(async (cierreId: string) => ({
      id: cierreId,
      destinoZonaId: "z-destino",
      mensajeroNombre: "Ana",
    })),
    findGestionesPendientes: vi.fn(async () => [] as CierreGestionPendienteRow[]),
    contarOrdenesPendientesGestion: vi.fn(async () => 0),
    findCierresByMensajero: vi.fn(async () => opts.cierresPasados ?? []),
    findCorreccionesPendientes: vi.fn(async () => opts.correcciones ?? []),
    findCierrePropioConGestiones: vi.fn(async () => ({
      cierre: {} as CierrePasadoDTO,
      gestiones: opts.gestionesDelCierre ?? [],
      sinGestion: [],
      sinGestionRegistrado: true,
      rechazosDeTienda: [],
    })),
    crearCierre: vi.fn(async () => "c-nuevo"),
  };
  const ordenRepo = {
    findUsuarioZonaId: vi.fn(async () => "z-mensajero-hoy"),
    findUsuarioVehiculoId: vi.fn(async () => "veh-moto"),
    findEstatusIdByValue: vi.fn(async () => "s-reparto"),
    findBloqueoDetalle: vi.fn(async () => SIN_BLOQUEO),
    findOrdenesEnCorreccion: vi.fn(async () => new Set<string>()),
  };
  const tarifaRepo = { resolvePagoTarifa: vi.fn(async () => TARIFA_DESTINO) };
  const notificar = vi.fn(async () => {});
  const firmar = vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://f/${p}`])));
  const service = new CierreDiaService(
    repo as unknown as ICierreDiaRepository,
    { findCentralZonaId: vi.fn(async () => null) },
    ordenRepo,
    { createSignedUrl: vi.fn(), createSignedUrls: firmar },
    tarifaRepo as never,
    notificar,
  );
  return { service, repo, ordenRepo, tarifaRepo, notificar, firmar };
}

describe("477 · solicitarCierre — la rama de re-solicitud por estado", () => {
  it("R21: un `vencido` sigue por `transicionarASolicitado` y nunca toca la rama nueva", async () => {
    const { service, repo, tarifaRepo } = montar({
      resolicitable: { id: "c-venc", estado: "vencido", destinoZonaId: "z-destino" },
    });

    const r = await service.solicitarCierre(MENSAJERO);

    expect(r).toEqual({ status: "ok", via: "resolicitado" });
    expect(repo.transicionarASolicitado).toHaveBeenCalledWith("c-venc", "vencido");
    expect(repo.resolicitarCierreRechazado).not.toHaveBeenCalled();
    expect(tarifaRepo.resolvePagoTarifa).not.toHaveBeenCalled(); // R21: solo estado
  });

  it("R17: el `rechazado` resuelve la tarifa con la ZONA DESTINO del cierre y el vehiculo", async () => {
    const { service, repo, tarifaRepo, ordenRepo } = montar({
      resolicitable: { id: "c-rech", estado: "rechazado", destinoZonaId: "z-destino" },
    });

    const r = await service.solicitarCierre(MENSAJERO);

    expect(r).toEqual({ status: "ok", via: "resolicitado" });
    // La zona del CIERRE, no la del mensajero hoy (que podria haber cambiado de zona).
    expect(tarifaRepo.resolvePagoTarifa).toHaveBeenCalledWith("z-destino", "veh-moto");
    expect(ordenRepo.findUsuarioZonaId).not.toHaveBeenCalled();
    expect(repo.resolicitarCierreRechazado).toHaveBeenCalledWith({
      cierreId: "c-rech",
      mensajeroId: "m1",
      tarifa: TARIFA_DESTINO,
    });
    expect(repo.transicionarASolicitado).not.toHaveBeenCalled();
    expect(repo.crearCierre).not.toHaveBeenCalled();
  });

  it("R22: la escritura pierde la carrera -> el conflict de hoy, sin aviso", async () => {
    const { service, notificar } = montar({
      resolicitable: { id: "c-rech", estado: "rechazado", destinoZonaId: "z-destino" },
      resolicitado: false,
    });

    const r = await service.solicitarCierre(MENSAJERO);

    expect(r).toEqual({ status: "conflict", motivo: MSG_DUPLICADO });
    expect(notificar).not.toHaveBeenCalled();
  });

  it("146/R24: el aviso a la bodega lleva el id del cierre re-solicitado", async () => {
    const { service, repo, notificar } = montar({
      resolicitable: { id: "c-rech", estado: "rechazado", destinoZonaId: "z-destino" },
    });

    await service.solicitarCierre(MENSAJERO);

    expect(repo.findCierreParaAviso).toHaveBeenCalledWith("c-rech");
    expect(notificar).toHaveBeenCalledWith({ cierreId: "c-rech", zonaId: "z-destino", mensajeroNombre: "Ana" });
  });
});

/** Una gestion vigente del cierre, con el snapshot congelado. */
function gestionDelCierre(over: Partial<Omit<CierreGestionPendienteRow, "pagos">> = {}): CierreGestionPendienteRow {
  return conPagos({
    gestionId: "g2",
    ordenId: "o2",
    fechaGestion: "2026-10-10",
    numGuia: 102,
    numRemision: "R-2",
    destinatario: "Eva",
    direccion: null,
    zonaNombre: "Z",
    provinciaNombre: "P",
    cantonNombre: "C",
    distritoNombre: null,
    producto: "Prod",
    tiendaId: "t1",
    tiendaNombre: "Tienda",
    resultado: "entregado",
    montoRecibido: "3000.00",
    metodoPago: "efectivo",
    motivo: null,
    fechaReprogramacion: null,
    evidenciaStoragePath: null, evidenciaStoragePaths: [],
    pagoMensajero: "1500.00",
    ingresoBodegaRechazo: "0.00",
    esRechazoSla: false,
    desdeAyudaTienda: false,
    causaIncidente: null,
    indemnizacion: null,
    ...over,
  });
}

function pasado(estado: CierreEstado, id = `c-${estado}`): CierrePasadoDTO {
  return {
    cierreId: id,
    estado,
    destinoTipo: "bodega_satelite",
    destinoZonaId: "z-destino",
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
    totalPagoMensajero: "0.00",
    totalIngresoBodegaRechazos: "0.00",
    solicitadoAt: "2026-10-10T18:00:00.000Z",
  };
}

describe("477 · T4.7 — listarCierreDia devuelve `correcciones`", () => {
  it("sin rechazados: `[]` y NI UNA consulta mas", async () => {
    const { service, repo } = montar({ cierresPasados: [pasado("solicitado"), pasado("aprobado")] });

    const r = await service.listarCierreDia(MENSAJERO);

    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.correcciones).toEqual([]);
    expect(repo.findCorreccionesPendientes).not.toHaveBeenCalled();
    expect(repo.findCierrePropioConGestiones).not.toHaveBeenCalled();
  });

  it("R25/R26: con un rechazado, sus gestiones vigentes (snapshot) y sus ordenes en correccion", async () => {
    const vigente = gestionDelCierre({ evidenciaStoragePath: "ev/g2.jpg", evidenciaStoragePaths: ["ev/g2.jpg"], desdeAyudaTienda: true });
    const { service, repo, firmar } = montar({
      cierresPasados: [pasado("rechazado", "c-rech")],
      correcciones: [
        {
          cierreId: "c-rech",
          motivoRechazo: "No cuadra el efectivo",
          ordenesEnCorreccion: [
            { ordenId: "o1", numGuia: 101, numRemision: "R-1", destinatario: "Ana", regestionada: true },
            { ordenId: "o3", numGuia: null, numRemision: "R-3", destinatario: "Luis", regestionada: false },
          ],
        },
      ],
      gestionesDelCierre: [vigente],
    });

    const r = await service.listarCierreDia(MENSAJERO);

    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(repo.findCierrePropioConGestiones).toHaveBeenCalledWith("c-rech", "m1");
    expect(firmar).toHaveBeenCalledWith(["ev/g2.jpg"], expect.any(Number));
    expect(r.correcciones).toHaveLength(1);
    const c = r.correcciones?.[0];
    expect(c?.cierreId).toBe("c-rech");
    expect(c?.motivoRechazo).toBe("No cuadra el efectivo");
    expect(c?.ordenesEnCorreccion).toEqual([
      { ordenId: "o1", numGuia: 101, numRemision: "R-1", destinatario: "Ana", regestionada: true },
      { ordenId: "o3", numGuia: null, numRemision: "R-3", destinatario: "Luis", regestionada: false },
    ]);
    // El snapshot congelado (no la tarifa de hoy), la evidencia firmada y la marca de la tienda (R25).
    expect(c?.gestiones).toHaveLength(1);
    expect(c?.gestiones[0]).toMatchObject({
      gestionId: "g2",
      pagoMensajero: "1500.00",
      evidenciaUrl: "https://f/ev/g2.jpg", evidenciaUrls: ["https://f/ev/g2.jpg"],
      desdeAyudaTienda: true,
    });
  });

  it("un storage caido no deja al mensajero sin la lista (firma best-effort)", async () => {
    const { service, firmar } = montar({
      cierresPasados: [pasado("rechazado", "c-rech")],
      correcciones: [{ cierreId: "c-rech", motivoRechazo: null, ordenesEnCorreccion: [] }],
      gestionesDelCierre: [gestionDelCierre({ evidenciaStoragePath: "ev/g2.jpg", evidenciaStoragePaths: ["ev/g2.jpg"] })],
    });
    firmar.mockRejectedValueOnce(new Error("storage caido"));

    const r = await service.listarCierreDia(MENSAJERO);

    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.correcciones?.[0].gestiones[0].evidenciaUrl).toBeNull();
    expect(r.correcciones?.[0].gestiones[0].evidenciaUrls).toEqual([]); // 486/R10
  });
});

// ==============================================================================================
// FEATURE 486 (R3/R4/R7/R8) — la correccion de un cierre rechazado entrega TODAS las fotos.
// ==============================================================================================
describe("486 · correccion 477 — todas las evidencias de cada gestion", () => {
  it("R3/R8: una gestion con 3 fotos llega con las 3 URLs, en orden, firmadas en UNA llamada", async () => {
    const rutas = ["ev/g2-0.jpg", "ev/g2-1.jpg", "ev/g2-2.jpg"];
    const { service, firmar } = montar({
      cierresPasados: [pasado("rechazado", "c-rech")],
      correcciones: [{ cierreId: "c-rech", motivoRechazo: null, ordenesEnCorreccion: [] }],
      gestionesDelCierre: [
        gestionDelCierre({ evidenciaStoragePath: rutas[0], evidenciaStoragePaths: rutas }),
        gestionDelCierre({ gestionId: "g3", ordenId: "o3", evidenciaStoragePath: null, evidenciaStoragePaths: [] }),
      ],
    });

    const r = await service.listarCierreDia(MENSAJERO);

    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(firmar).toHaveBeenCalledTimes(1);
    expect(firmar).toHaveBeenCalledWith(rutas, expect.any(Number));
    const gs = r.correcciones?.[0].gestiones ?? [];
    expect(gs.map((g) => g.evidenciaUrls)).toEqual([
      ["https://f/ev/g2-0.jpg", "https://f/ev/g2-1.jpg", "https://f/ev/g2-2.jpg"],
      [],
    ]);
    // R7: ninguna ruta cruda en lo que cruza al cliente.
    const json = JSON.stringify(r.correcciones);
    for (const ruta of rutas) expect(json).not.toContain(`"${ruta}"`);
  });
});
