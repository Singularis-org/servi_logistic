import { describe, it, expect, vi } from "vitest";

import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import type {
  IGestionOrdenRepository,
  MiAsignacionRow,
  OrdenGestionRow,
} from "@/lib/interfaces/repositories/IGestionOrdenRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { GestionarInput } from "@/lib/interfaces/services/IMisAsignacionesService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { MisAsignacionesService } from "@/lib/services/MisAsignacionesService";
import { MSG_TOPE_INTENTOS_GESTION } from "@/lib/services/mensajes-bloqueo";
import { reintentosConfig } from "@/lib/config/reintentos";
import { RESERVA_MOTIVO_SERVIDOR } from "@/lib/utils/dia-reparto-textos";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { bloqueoConRechazado } from "@/tests/fixtures/bloqueo-cierre";
import { fakeIntentosEnLote } from "@/tests/fixtures/intentos-entrega";

/**
 * FICHA 477 (T3.3; R12, R13) — VOLVER A GESTIONAR CON EL BLOQUEO PUESTO, con dobles.
 *
 *   R12  bloqueado: la orden EN CORRECCION se escoge y se gestiona, y sigue sujeta a las guardas de
 *        hoy (tope de intentos, reserva de dia).
 *   R13  bloqueado: cualquier otra orden recibe el motivo de bloqueo de hoy, SIN efectos (ni lectura
 *        de la orden, ni evidencia subida, ni puntero fijado).
 *   R27  (datos) el listado marca `enCorreccion` con UNA consulta en lote, y solo si esta bloqueado.
 *
 * El predicado (que orden esta en correccion) se mide contra Postgres en
 * `tests/integration/db/477-ordenes-en-correccion-sql-real.test.ts`.
 */

const MENSAJERO: Actor = { usuarioId: "m1", rol: "mensajero" };
const FOTO = { contentType: "image/jpeg" as const, bytes: new Uint8Array([1]) };
const HOY = new Date("2026-10-15T15:00:00.000Z"); // 09:00 en Costa Rica

function ordenRow(over: Partial<OrdenGestionRow> = {}): OrdenGestionRow {
  return {
    id: "o1",
    estatusValue: "en_reparto",
    deletedAt: null,
    mensajeroAsignadoId: "m1",
    montoCobrar: 100,
    zonaId: "z1",
    fechaReparto: null,
    ...over,
  };
}

function montar(opts: {
  bloqueado?: boolean;
  enCorreccion?: string[];
  orden?: OrdenGestionRow;
  intentos?: number;
  filas?: MiAsignacionRow[];
}) {
  const repo = {
    findMisAsignaciones: vi.fn(async () => opts.filas ?? []),
    findMisAsignacionesByIds: vi.fn(async () => []),
    contarEntregadas: vi.fn(async () => 0),
    sumMontoCobrarGestionadas: vi.fn(async () => 0),
    findByIdsParaGestion: vi.fn(async () => [opts.orden ?? ordenRow()]),
    getOrdenEnGestion: vi.fn(async () => null),
    setOrdenEnGestion: vi.fn(async () => true),
    liberarOrdenEnGestion: vi.fn(async () => true),
    recogerLote: vi.fn(async (ids: string[]) => ids.length),
    registrarGestionPendiente: vi.fn(async () => ({ gestionId: "g-nueva", ordenEventoId: "ev" })),
    findBloqueoDeGestion: vi.fn(async () => null),
    findPendientesYAyudas: vi.fn(async () => ({
      conGestionPendiente: new Set<string>(),
      conAyudaAbierta: new Set<string>(),
    })),
    reprogramarDesdeDevuelta: vi.fn(async () => true),
    crearGestionDesdeAyuda: vi.fn(async () => "g-ayuda"),
    rechazarDesdeDevuelta: vi.fn(async () => true),
  } satisfies IGestionOrdenRepository;
  const ordenRepo = {
    findEstatusIdByValue: vi.fn(async () => "os-x"),
    findBloqueoDetalle: vi.fn(async () => (opts.bloqueado ? bloqueoConRechazado() : SIN_BLOQUEO)),
    findOrdenesEnCorreccion: vi.fn(async () => new Set(opts.enCorreccion ?? [])),
  } satisfies Pick<IOrdenRepository, "findEstatusIdByValue" | "findBloqueoDetalle" | "findOrdenesEnCorreccion">;
  const storage = {
    upload: vi.fn(async (input: { path: string }) => input.path),
    remove: vi.fn(async () => {}),
  } satisfies IFileStorage;
  const service = new MisAsignacionesService(
    repo,
    ordenRepo,
    storage,
    { createSignedUrl: vi.fn(async () => ""), createSignedUrls: vi.fn(async () => ({})) },
    { findByMensajero: vi.fn(async () => null), upsertOrigen: vi.fn(async () => {}) },
    { findMarcarLuegoByMensajero: vi.fn(async () => new Set<string>()) },
    fakeIntentosEnLote({ o1: opts.intentos ?? 0 }),
  );
  return { service, repo, ordenRepo, storage };
}

const ENTREGA: GestionarInput = {
  ordenId: "o1",
  resultado: "entregado",
  montoRecibido: 100,
  metodoPago: "efectivo",
  pagos: [{ metodo: "efectivo", monto: 100 }],
  evidencias: [FOTO],
};
const REPROGRAMA: GestionarInput = {
  ordenId: "o1",
  resultado: "reprogramado",
  fechaReprogramacion: "2026-10-20",
  motivo: "otro dia",
};

describe("477 · R12 — bloqueado: la orden EN CORRECCION se escoge y se gestiona", () => {
  it("escoger: pasa la exencion y fija el puntero", async () => {
    const { service, repo, ordenRepo } = montar({ bloqueado: true, enCorreccion: ["o1"] });

    const r = await service.escogerParaGestion("o1", MENSAJERO, HOY);

    expect(r).toEqual({ status: "ok", ordenId: "o1" });
    expect(ordenRepo.findOrdenesEnCorreccion).toHaveBeenCalledWith("m1", ["o1"]);
    expect(repo.setOrdenEnGestion).toHaveBeenCalledWith("m1", "o1");
  });

  it("gestionar: registra la gestion pendiente", async () => {
    const { service, repo } = montar({ bloqueado: true, enCorreccion: ["o1"] });

    const r = await service.gestionar(ENTREGA, MENSAJERO, HOY);

    expect(r.status).toBe("ok");
    expect(repo.registrarGestionPendiente).toHaveBeenCalledTimes(1);
  });

  it("y sigue sujeta al TOPE de intentos (R12: las demas guardas de hoy)", async () => {
    const { service, repo, storage } = montar({
      bloqueado: true,
      enCorreccion: ["o1"],
      intentos: reintentosConfig.MIN_INTENTOS_ENTREGA - 1,
    });

    const r = await service.gestionar(REPROGRAMA, MENSAJERO, HOY);

    expect(r).toEqual({ status: "conflict", motivo: MSG_TOPE_INTENTOS_GESTION });
    expect(repo.registrarGestionPendiente).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("y a la RESERVA de dia (R12)", async () => {
    const { service, repo } = montar({
      bloqueado: true,
      enCorreccion: ["o1"],
      orden: ordenRow({ fechaReparto: new Date("2026-10-17T00:00:00.000Z") }),
    });

    const escoger = await service.escogerParaGestion("o1", MENSAJERO, HOY);
    const gestionar = await service.gestionar(ENTREGA, MENSAJERO, HOY);

    expect(escoger).toEqual({ status: "conflict", motivo: RESERVA_MOTIVO_SERVIDOR });
    expect(gestionar).toEqual({ status: "conflict", motivo: RESERVA_MOTIVO_SERVIDOR });
    expect(repo.setOrdenEnGestion).not.toHaveBeenCalled();
    expect(repo.registrarGestionPendiente).not.toHaveBeenCalled();
  });
});

describe("477 · R13 — bloqueado: cualquier OTRA orden, el motivo de hoy y sin efectos", () => {
  it("escoger: conflict de bloqueo, sin leer la orden ni fijar el puntero", async () => {
    const { service, repo } = montar({ bloqueado: true, enCorreccion: ["o-otra"] });

    const r = await service.escogerParaGestion("o1", MENSAJERO, HOY);

    expect(r.status).toBe("conflict");
    if (r.status === "conflict") expect(r.motivo).toMatch(/no puedes entregar, cobrar ni recibir trabajo nuevo/i);
    expect(repo.findByIdsParaGestion).not.toHaveBeenCalled();
    expect(repo.setOrdenEnGestion).not.toHaveBeenCalled();
  });

  it("gestionar: conflict de bloqueo, sin subir evidencias ni registrar", async () => {
    const { service, repo, storage } = montar({ bloqueado: true });

    const r = await service.gestionar(ENTREGA, MENSAJERO, HOY);

    expect(r.status).toBe("conflict");
    if (r.status === "conflict") expect(r.motivo).toMatch(/no puedes entregar, cobrar ni recibir trabajo nuevo/i);
    expect(repo.findByIdsParaGestion).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(repo.registrarGestionPendiente).not.toHaveBeenCalled();
  });

  it("libre: ni siquiera pregunta por la correccion (la exencion solo existe con bloqueo)", async () => {
    const { service, ordenRepo } = montar({ bloqueado: false });

    const r = await service.escogerParaGestion("o1", MENSAJERO, HOY);

    expect(r.status).toBe("ok");
    expect(ordenRepo.findOrdenesEnCorreccion).not.toHaveBeenCalled();
  });
});

function filaEnReparto(id: string): MiAsignacionRow {
  return {
    id,
    numGuia: 1,
    numRemision: `R-${id}`,
    estatusValue: "en_reparto",
    destinatario: "Ana",
    telefonoDest: "8888",
    direccion: null,
    producto: "P",
    peso: null,
    montoCobrar: 100,
    latitud: null,
    longitud: null,
    notas: null,
    tiendaNombre: "T",
    zonaNombre: "Z",
    provinciaNombre: "P",
    cantonNombre: "C",
    distritoNombre: null,
    sinpeNumero: null,
    sinpeNombre: null,
    fechaReparto: null,
  } as unknown as MiAsignacionRow;
}

describe("477 · R27 (datos) — `enCorreccion` en el listado de Entregas", () => {
  it("bloqueado: UNA consulta en lote y `true` solo en la orden en correccion", async () => {
    const { service, ordenRepo } = montar({
      bloqueado: true,
      enCorreccion: ["o1"],
      filas: [filaEnReparto("o1"), filaEnReparto("o2")],
    });

    const r = await service.listarMisAsignaciones(MENSAJERO, HOY);

    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(ordenRepo.findOrdenesEnCorreccion).toHaveBeenCalledTimes(1);
    expect(ordenRepo.findOrdenesEnCorreccion).toHaveBeenCalledWith("m1", ["o1", "o2"]);
    expect(Object.fromEntries(r.porGestionar.map((o) => [o.id, o.enCorreccion]))).toEqual({
      o1: true,
      o2: false,
    });
  });

  it("libre: `false` en todas y SIN consultar el predicado", async () => {
    const { service, ordenRepo } = montar({ bloqueado: false, filas: [filaEnReparto("o1")] });

    const r = await service.listarMisAsignaciones(MENSAJERO, HOY);

    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(ordenRepo.findOrdenesEnCorreccion).not.toHaveBeenCalled();
    expect(r.porGestionar.map((o) => o.enCorreccion)).toEqual([false]);
  });
});
