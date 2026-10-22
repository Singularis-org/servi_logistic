import { describe, it, expect, vi } from "vitest";

import { CierreDiaService } from "@/lib/services/CierreDiaService";
import type {
  GestionDeshacerRow,
  ICierreDiaRepository,
} from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { bloqueoConRechazado } from "@/tests/fixtures/bloqueo-cierre";

/**
 * FICHA 477 (T2.5; R4-R10) — LAS GUARDAS DEL DESHACER CON LA EXENCION POR OBJETO (D4), con dobles.
 * Las reglas que viven en un `WHERE` se miden contra Postgres en
 * `tests/integration/db/477-deshacer-cierre-rechazado-sql-real.test.ts`; aqui se mide el ORDEN de
 * las guardas del servicio y que ninguna rechazada llama a una escritura.
 *
 *   R4   caso (b): la gestion rehecha (sin cierre, de una orden en correccion) se deshace por la
 *        rama 454 aunque el mensajero este bloqueado.
 *   R5   bloqueado + gestion NO corregible -> el MISMO `conflict` de bloqueo para inexistente,
 *        ajena, sin cierre fuera de correccion y de un cierre `solicitado`.
 *   R6   cierre `solicitado`/`aprobado` sin bloqueo -> «ya incluida en un cierre solicitado».
 *   R7   la registro la tienda -> «la resolvio la tienda».
 *   R8   no es la ultima -> su motivo.
 *   R9   orden fuera de `en_reparto` o borrada -> su motivo.
 *   R10  legada en un rechazado propio -> «ya incluida en un cierre solicitado».
 */

const MENSAJERO: Actor = { usuarioId: "m1", rol: "mensajero" };
const MSG_YA_EN_CIERRE = "Esta gestion ya esta incluida en un cierre solicitado; no se puede deshacer.";
const MSG_TIENDA =
  "Esta orden la resolvió la tienda; solo ella puede corregirlo. Escribile por el chat de la orden.";
const MSG_NO_ES_LA_ULTIMA = "Esta orden tiene una gestion mas reciente; hay que deshacer esa primero.";
const MSG_ORDEN_MOVIDA = "Esta orden ya fue procesada por la bodega; ya no se puede deshacer.";
const MSG_ORDEN_BORRADA = "Esta orden fue eliminada; ya no se puede deshacer su gestion.";

/** Caso (a) por defecto: gestion 454 del actor, vinculada a SU cierre `rechazado`, orden en reparto. */
function gestion(over: Partial<GestionDeshacerRow> = {}): GestionDeshacerRow {
  return {
    gestionId: "g1",
    ordenId: "o1",
    mensajeroId: "m1",
    resultado: "entregado",
    cierreId: "c-rech",
    anuladaAt: null,
    orden: { deletedAt: null, estatusId: "s-reparto", estatusValue: "en_reparto" },
    desdeAyudaTienda: false,
    registradaComoPendiente: true,
    cierreEstado: "rechazado",
    cierreMensajeroId: "m1",
    ...over,
  };
}

function montar(opts: {
  fila?: GestionDeshacerRow | null;
  bloqueado?: boolean;
  enCorreccion?: string[];
  ultima?: string | null;
}) {
  const repo = {
    findGestionParaDeshacer: vi.fn(async () => (opts.fila === undefined ? gestion() : opts.fila)),
    findUltimaGestionNoAnuladaId: vi.fn(async () => (opts.ultima === undefined ? "g1" : opts.ultima)),
    anularGestionDeCierreRechazado: vi.fn(async () => true),
    anularGestionPendiente: vi.fn(async () => true),
    anularGestionYDevolverAGestion: vi.fn(async () => true),
  };
  const ordenRepo = {
    findUsuarioZonaId: vi.fn(async () => "z1"),
    findUsuarioVehiculoId: vi.fn(async () => null),
    findEstatusIdByValue: vi.fn(async () => "s-reparto"),
    findBloqueoDetalle: vi.fn(async () => (opts.bloqueado ? bloqueoConRechazado() : SIN_BLOQUEO)),
    findOrdenesEnCorreccion: vi.fn(async () => new Set(opts.enCorreccion ?? [])),
  } satisfies Pick<
    IOrdenRepository,
    | "findUsuarioZonaId"
    | "findUsuarioVehiculoId"
    | "findEstatusIdByValue"
    | "findBloqueoDetalle"
    | "findOrdenesEnCorreccion"
  >;
  const service = new CierreDiaService(
    repo as unknown as ICierreDiaRepository,
    { findCentralZonaId: vi.fn(async () => null) },
    ordenRepo,
    { createSignedUrl: vi.fn(), createSignedUrls: vi.fn(async () => ({})) },
    { resolvePagoTarifa: vi.fn(async () => null) } as never,
  );
  const escrituras = () =>
    repo.anularGestionDeCierreRechazado.mock.calls.length +
    repo.anularGestionPendiente.mock.calls.length +
    repo.anularGestionYDevolverAGestion.mock.calls.length;
  return { service, repo, ordenRepo, escrituras };
}

describe("477 · deshacer — caso (a): gestion de un cierre rechazado propio", () => {
  it("bloqueado: la deshace por la escritura que desvincula, con el cierre leido", async () => {
    const { service, repo, escrituras } = montar({ bloqueado: true });

    const r = await service.deshacerGestion("g1", MENSAJERO);

    expect(r).toEqual({ status: "ok", ordenId: "o1" });
    expect(repo.anularGestionDeCierreRechazado).toHaveBeenCalledWith({
      gestionId: "g1",
      ordenId: "o1",
      mensajeroId: "m1",
      cierreId: "c-rech",
      actorUsuarioId: "m1",
      estatusEnRepartoId: "s-reparto",
    });
    expect(escrituras()).toBe(1);
  });

  it("R11 (servicio): la escritura pierde la carrera -> conflict «ya en un cierre solicitado»", async () => {
    const { service, repo } = montar({ bloqueado: true });
    repo.anularGestionDeCierreRechazado.mockResolvedValueOnce(false);

    const r = await service.deshacerGestion("g1", MENSAJERO);

    expect(r).toEqual({ status: "conflict", motivo: MSG_YA_EN_CIERRE });
  });
});

describe("477 · R4 — caso (b): la gestion rehecha de una orden en correccion", () => {
  it("bloqueado: se deshace por la rama 454 (anulacion sin transicion)", async () => {
    const { service, repo, ordenRepo, escrituras } = montar({
      bloqueado: true,
      fila: gestion({ cierreId: null, cierreEstado: null, cierreMensajeroId: null }),
      enCorreccion: ["o1"],
    });

    const r = await service.deshacerGestion("g1", MENSAJERO);

    expect(r).toEqual({ status: "ok", ordenId: "o1" });
    expect(ordenRepo.findOrdenesEnCorreccion).toHaveBeenCalledWith("m1", ["o1"]);
    expect(repo.anularGestionPendiente).toHaveBeenCalledTimes(1);
    expect(escrituras()).toBe(1);
  });
});

describe("477 · R5 — bloqueado y NO corregible: el MISMO conflict de bloqueo, sin efectos", () => {
  const casos: [string, GestionDeshacerRow | null, string[]][] = [
    ["inexistente", null, []],
    ["ajena", gestion({ mensajeroId: "otro", cierreMensajeroId: "otro" }), []],
    ["sin cierre y fuera de correccion", gestion({ cierreId: null, cierreEstado: null, cierreMensajeroId: null }), []],
    ["de un cierre `solicitado`", gestion({ cierreEstado: "solicitado" }), []],
    ["de un `rechazado` AJENO", gestion({ cierreMensajeroId: "otro" }), []],
  ];

  it.each(casos)("%s", async (_n, fila, enCorreccion) => {
    const { service, escrituras } = montar({ bloqueado: true, fila, enCorreccion });
    const referencia = await montar({ bloqueado: true, fila: null }).service.deshacerGestion(
      "g1",
      MENSAJERO,
    );

    const r = await service.deshacerGestion("g1", MENSAJERO);

    expect(referencia.status).toBe("conflict");
    expect(r).toEqual(referencia); // IGUAL respuesta: no revela si la gestion existe
    if (r.status === "conflict") expect(r.motivo).toMatch(/no puedes entregar/i);
    expect(escrituras()).toBe(0);
  });
});

describe("477 · R6-R10 — los motivos de hoy, sin llamar a ninguna escritura", () => {
  it("R6: cierre `solicitado` sin bloqueo -> «ya incluida en un cierre solicitado»", async () => {
    const { service, escrituras } = montar({ fila: gestion({ cierreEstado: "solicitado" }) });
    expect(await service.deshacerGestion("g1", MENSAJERO)).toEqual({
      status: "conflict",
      motivo: MSG_YA_EN_CIERRE,
    });
    expect(escrituras()).toBe(0);
  });

  it("R6: cierre `aprobado` sin bloqueo -> el mismo motivo", async () => {
    const { service, escrituras } = montar({ fila: gestion({ cierreEstado: "aprobado" }) });
    expect(await service.deshacerGestion("g1", MENSAJERO)).toEqual({
      status: "conflict",
      motivo: MSG_YA_EN_CIERRE,
    });
    expect(escrituras()).toBe(0);
  });

  it("R7: la registro la tienda -> «la resolvio la tienda»", async () => {
    const { service, escrituras } = montar({ bloqueado: true, fila: gestion({ desdeAyudaTienda: true }) });
    expect(await service.deshacerGestion("g1", MENSAJERO)).toEqual({ status: "conflict", motivo: MSG_TIENDA });
    expect(escrituras()).toBe(0);
  });

  it("R8: no es la gestion no anulada mas reciente -> su motivo", async () => {
    const { service, escrituras } = montar({ bloqueado: true, ultima: "g-posterior" });
    expect(await service.deshacerGestion("g1", MENSAJERO)).toEqual({
      status: "conflict",
      motivo: MSG_NO_ES_LA_ULTIMA,
    });
    expect(escrituras()).toBe(0);
  });

  it("R9: orden fuera de `en_reparto` -> «procesada por la bodega»", async () => {
    const { service, escrituras } = montar({
      bloqueado: true,
      fila: gestion({ orden: { deletedAt: null, estatusId: "s-x", estatusValue: "novedad_interna" } }),
    });
    expect(await service.deshacerGestion("g1", MENSAJERO)).toEqual({
      status: "conflict",
      motivo: MSG_ORDEN_MOVIDA,
    });
    expect(escrituras()).toBe(0);
  });

  it("R9: orden borrada -> «fue eliminada»", async () => {
    const { service, escrituras } = montar({
      bloqueado: true,
      fila: gestion({ orden: { deletedAt: new Date(), estatusId: "s-reparto", estatusValue: "en_reparto" } }),
    });
    expect(await service.deshacerGestion("g1", MENSAJERO)).toEqual({
      status: "conflict",
      motivo: MSG_ORDEN_BORRADA,
    });
    expect(escrituras()).toBe(0);
  });

  it("R10: gestion LEGADA en un rechazado propio -> «ya incluida en un cierre solicitado»", async () => {
    const { service, escrituras } = montar({
      bloqueado: true,
      fila: gestion({ registradaComoPendiente: false }),
    });
    expect(await service.deshacerGestion("g1", MENSAJERO)).toEqual({
      status: "conflict",
      motivo: MSG_YA_EN_CIERRE,
    });
    expect(escrituras()).toBe(0);
  });
});
