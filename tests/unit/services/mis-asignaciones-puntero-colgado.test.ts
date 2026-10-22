import { describe, it, expect, vi } from "vitest";

import { MisAsignacionesService } from "@/lib/services/MisAsignacionesService";
import type {
  IGestionOrdenRepository,
  MiAsignacionRow,
  OrdenGestionRow,
} from "@/lib/interfaces/repositories/IGestionOrdenRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { IOrdenMensajeroMetaRepository } from "@/lib/interfaces/repositories/IOrdenMensajeroMetaRepository";
import type { IRutaOptimizadaRepository } from "@/lib/interfaces/repositories/IRutaOptimizadaRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { GestionarInput } from "@/lib/interfaces/services/IMisAsignacionesService";
import { SIN_BLOQUEO } from "@/lib/utils/bloqueo-cierre";
import { fakeIntentosEnLote } from "@/tests/fixtures/intentos-entrega";

/**
 * FICHA 484 (T7b; R9, R10, R13, R14) — EL PUNTERO «ORDEN EN GESTION» COLGADO, en el SERVICIO.
 *
 * Dobles validos: aqui no se prueba ningun `WHERE`. La lectura del repositorio que decide si el
 * puntero es vigente la mide `tests/integration/db/484-puntero-vigente-sql-real.test.ts` contra
 * Postgres. Lo que este archivo fija es el CONTRATO del servicio:
 *   - `listarMisAsignaciones` publica el puntero SOLO si su orden esta en `porGestionar` o
 *     `conAyuda` de la MISMA respuesta (R9), y no escribe nada para conseguirlo (R10);
 *   - la guarda R21 de `gestionar` no rechaza cuando el repositorio dice «sin orden en gestion»
 *     (R13) y sigue rechazando cuando dice «otra» (R14).
 */

const MENSAJERO: Actor = { usuarioId: "m1", rol: "mensajero" };

function asignacion(id: string, estatusValue: string): MiAsignacionRow {
  return {
    id,
    numGuia: 1,
    numRemision: `R-${id}`,
    estatusValue,
    destinatario: "Ana",
    telefonoDest: "099",
    direccion: "calle",
    producto: "caja",
    peso: null,
    montoCobrar: 100,
    latitud: null,
    longitud: null,
    notas: null,
    tiendaNombre: "T",
    zonaNombre: "Z",
    provinciaNombre: "P",
    cantonNombre: "C",
    distritoNombre: "D",
    sinpeNumero: "80000000",
    sinpeNombre: "Titular",
    mensajeroAsignadoId: "m1",
  } as MiAsignacionRow;
}

function gestionRow(): OrdenGestionRow {
  return {
    id: "o1",
    estatusValue: "en_reparto",
    deletedAt: null,
    mensajeroAsignadoId: "m1",
    montoCobrar: 100,
    zonaId: "z-satelite",
    fechaReparto: null,
  };
}

/** Todos los metodos de ESCRITURA del repositorio, para comprobar que listar no llama a ninguno. */
const ESCRITURAS = [
  "setOrdenEnGestion",
  "liberarOrdenEnGestion",
  "recogerLote",
  "registrarGestionPendiente",
  "reprogramarDesdeDevuelta",
  "crearGestionDesdeAyuda",
  "rechazarDesdeDevuelta",
] as const;

function fakeRepo(over: Partial<IGestionOrdenRepository> = {}): IGestionOrdenRepository {
  return {
    findMisAsignaciones: vi.fn(async () => []),
    findMisAsignacionesByIds: vi.fn(async () => []),
    contarEntregadas: vi.fn(async () => 0),
    sumMontoCobrarGestionadas: vi.fn(async () => 0),
    findByIdsParaGestion: vi.fn(async () => [gestionRow()]),
    getOrdenEnGestion: vi.fn(async () => null),
    setOrdenEnGestion: vi.fn(async () => true),
    liberarOrdenEnGestion: vi.fn(async () => true),
    recogerLote: vi.fn(async (ids: string[]) => ids.length),
    registrarGestionPendiente: vi.fn(async () => ({ gestionId: "g1", ordenEventoId: "ev-g1" })),
    findBloqueoDeGestion: vi.fn(async () => null),
    findPendientesYAyudas: vi.fn(async () => ({
      conGestionPendiente: new Set<string>(),
      conAyudaAbierta: new Set<string>(),
    })),
    reprogramarDesdeDevuelta: vi.fn(async () => true),
    crearGestionDesdeAyuda: vi.fn(async () => "g-desde-ayuda"),
    rechazarDesdeDevuelta: vi.fn(async () => true),
    ...over,
  };
}

const ESTATUS: Record<string, string> = {
  en_reparto: "os-reparto",
  novedad: "os-devuelta",
  devolucion_por_confirmar: "os-devolucion-por-confirmar",
  mensajero_recogiendo_en_bodega: "os-espera",
};

function fakeOrdenRepo(): Pick<
  IOrdenRepository,
  "findEstatusIdByValue" | "findBloqueoDetalle" | "findOrdenesEnCorreccion"
> {
  return {
    findEstatusIdByValue: vi.fn(async (v: string) => ESTATUS[v] ?? null),
    findBloqueoDetalle: vi.fn(async () => SIN_BLOQUEO),
    findOrdenesEnCorreccion: vi.fn(async () => new Set<string>()),
  };
}

function fakeRutaRepo(): Pick<IRutaOptimizadaRepository, "findByMensajero" | "upsertOrigen"> {
  return { findByMensajero: vi.fn(async () => null), upsertOrigen: vi.fn(async () => {}) };
}

function fakeMetaRepo(): Pick<IOrdenMensajeroMetaRepository, "findMarcarLuegoByMensajero"> {
  return { findMarcarLuegoByMensajero: vi.fn(async () => new Set<string>()) };
}

function montar(repo: IGestionOrdenRepository) {
  const ruta = fakeRutaRepo();
  const servicio = new MisAsignacionesService(
    repo,
    fakeOrdenRepo(),
    { upload: vi.fn(async (i: { path: string }) => i.path), remove: vi.fn(async () => {}) },
    {
      createSignedUrl: vi.fn(async (p: string) => p),
      createSignedUrls: vi.fn(async (ps: string[]) => Object.fromEntries(ps.map((p) => [p, p]))),
    },
    ruta,
    fakeMetaRepo(),
    fakeIntentosEnLote(),
  );
  return { servicio, ruta };
}

/** Reparto con «b» por gestionar, «c» con ayuda, «a» por recoger y «d» con gestion pendiente. */
function repoConListas(puntero: string | null) {
  return fakeRepo({
    findMisAsignaciones: vi.fn(async () => [
      asignacion("a", "mensajero_recogiendo_en_bodega"),
      asignacion("b", "en_reparto"),
      asignacion("c", "en_reparto"),
      asignacion("d", "en_reparto"),
    ]),
    findPendientesYAyudas: vi.fn(async () => ({
      conGestionPendiente: new Set(["d"]),
      conAyudaAbierta: new Set(["c"]),
    })),
    getOrdenEnGestion: vi.fn(async () => puntero),
  });
}

async function listar(puntero: string | null) {
  const repo = repoConListas(puntero);
  const { servicio, ruta } = montar(repo);
  const r = await servicio.listarMisAsignaciones(MENSAJERO);
  if (r.status !== "ok") throw new Error(`listar no fue ok: ${r.status}`);
  return { r, repo, ruta };
}

describe("484 — listarMisAsignaciones con el puntero colgado (R9, R10)", () => {
  it("R9: un puntero a una orden que NO esta en ninguna lista sale como `null`", async () => {
    const { r } = await listar("o-de-bodega");
    expect(r.ordenEnGestionId).toBeNull();
  });

  it("R9: un puntero a una orden «por recoger» o con gestion pendiente tampoco se publica", async () => {
    expect((await listar("a")).r.ordenEnGestionId).toBeNull();
    expect((await listar("d")).r.ordenEnGestionId).toBeNull();
  });

  it("R9: un puntero a una orden de «por gestionar» se publica tal cual", async () => {
    const { r } = await listar("b");
    expect(r.porGestionar.map((o) => o.id)).toContain("b");
    expect(r.ordenEnGestionId).toBe("b");
  });

  it("R9: un puntero a una orden «con ayuda» se publica tal cual", async () => {
    const { r } = await listar("c");
    expect(r.conAyuda.map((o) => o.id)).toEqual(["c"]);
    expect(r.ordenEnGestionId).toBe("c");
  });

  it("R9: sin puntero, `null`", async () => {
    expect((await listar(null)).r.ordenEnGestionId).toBeNull();
  });

  it("R10: con el puntero colgado, listar NO invoca ningun metodo de escritura", async () => {
    const { r, repo, ruta } = await listar("o-de-bodega");
    expect(r.ordenEnGestionId).toBeNull();
    for (const m of ESCRITURAS) {
      expect(repo[m], `${m} no debe llamarse al listar`).not.toHaveBeenCalled();
    }
    expect(ruta.upsertOrigen).not.toHaveBeenCalled();
  });
});

const NOVEDAD: GestionarInput = {
  ordenId: "o1",
  resultado: "novedad",
  causaDevolucion: "not_found",
  motivo: "No aparece",
  evidencias: [{ contentType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) }],
  ubicacionAusencia: "no_disponible",
} as GestionarInput;

describe("484 — la guarda R21 de `gestionar` (R13, R14)", () => {
  it("R13: si el repositorio no informa orden en gestion (puntero colgado), NO rechaza por «otra orden activa»", async () => {
    const repo = fakeRepo({ getOrdenEnGestion: vi.fn(async () => null) });
    const r = await montar(repo).servicio.gestionar(NOVEDAD, MENSAJERO);
    expect(r).not.toEqual({ status: "conflict", motivo: "tienes otra orden activa en gestion" });
    expect(r.status).toBe("ok");
    expect(repo.registrarGestionPendiente).toHaveBeenCalledTimes(1);
  });

  it("R14: con un puntero vigente a OTRA orden, responde conflicto y no persiste", async () => {
    const repo = fakeRepo({ getOrdenEnGestion: vi.fn(async () => "o-otra") });
    const r = await montar(repo).servicio.gestionar(NOVEDAD, MENSAJERO);
    expect(r).toEqual({ status: "conflict", motivo: "tienes otra orden activa en gestion" });
    expect(repo.registrarGestionPendiente).not.toHaveBeenCalled();
  });
});
