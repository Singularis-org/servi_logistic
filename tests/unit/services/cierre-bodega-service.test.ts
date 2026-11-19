import { describe, it, expect, vi } from "vitest";
import { CierreBodegaService } from "@/lib/services/CierreBodegaService";
// ⭑ FICHA 431: el error que sustituye al `P2002` del indice unico parcial retirado.
import { ConsolidacionParcialError } from "@/lib/utils/consolidacion-parcial";
import type {
  CierreBodegaResumenRow,
  CierreDiaConsolidableRow,
  ICierreBodegaRepository,
} from "@/lib/interfaces/repositories/ICierreBodegaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { tarjetasAConsolidar } from "@/components/private/cierres/cola/cola-cierres-vista";

// Feature 40 — tests unit del CierreBodegaService (lado adminSatelite; dobles de
// repo/orden, sin DB/red). Cubre R1 (rol), R3 (acota a su zona), R4 (sin zona), R5
// (lista consolidables), R6 (pendientes -> conflict), R7 (vacio -> conflict),
// R10 (totales agregados exactos), R23 (listar no muta).
//
// ⭑ FICHA 431 — R8 de la feature 40 («a lo sumo una consolidacion `solicitado` por zona») YA NO
// EXISTE: se retiro con el indice unico parcial que lo respaldaba, porque con la aprobacion
// convertida en marca de conciliacion era el mismo bloqueo mudado de sitio. En su sitio viven dos
// casos de esta ficha: R6 (se puede consolidar otra vez) y R7 (la carrera la pierde el
// todo-o-nada del repositorio, no un indice). Lo que SI se queda es el gate de NIVEL 1 (R5 de la
// 431 = R6 de la 40), y esta anclado a proposito.

const ADMIN_SATELITE: Actor = { usuarioId: "adm-sat", rol: "adminSatelite" };
const MAESTRO: Actor = { usuarioId: "adm-maestro", rol: "maestro" };
const MENSAJERO: Actor = { usuarioId: "m1", rol: "mensajero" };

const ZONA_SAT = "z-cartago";

function consolidableRow(
  overrides: Partial<CierreDiaConsolidableRow> = {},
): CierreDiaConsolidableRow {
  return {
    cierreDiaId: "cd1",
    mensajeroId: "m1",
    mensajeroNombre: "Ana Mensajera",
    totales: { efectivo: "10.00", simpe: "5.00", transferencia: "0.00", general: "15.00" },
    totalPagoMensajero: "0.00", // feature 39/R18: snapshot del pago (override en tests R18/R19)
    totalIngresoBodegaRechazos: "0.00", // feature 56/R17: snapshot del ingreso (override en tests R17/R18)
    // SLT-106 (R67/R194): campos requeridos de la fila. Este servicio no los deriva ni los lee.
    paraLaCentral: "15.00",
    aprobadoAt: "2026-11-10T15:00:00.000Z",
    gestionesAjustadas: 0,
    pagoIndependienteEfectivo: false, // SLT-139: cierre viejo por defecto
    ...overrides,
  };
}

type Repo = ICierreBodegaRepository;

function fakeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    findCierresDiaConsolidables: vi.fn(async () => [consolidableRow()]),
    // FICHA 379: el resumen del dinero atrapado lo consume `UsuarioService`, no este servicio.
    // El stub existe para que el doble siga siendo un `ICierreBodegaRepository` valido; su
    // comportamiento se mide contra Postgres real en `tests/integration/db`.
    resumirConsolidablesPendientes: vi.fn(async () => ({ cantidad: 0, totalGeneral: "0.00" })),
    contarCierresDiaSolicitados: vi.fn(async () => 0),
    // SLT-106 (R199): los nombres de los cierres sin resolver; lo lee `listarConsolidacion`.
    findMensajerosConCierreSinResolver: vi.fn(async () => [] as string[]),
    // ⭑ FICHA 431: `existeCierreBodegaSolicitado` se retiro del contrato con el indice unico
    // parcial que lo respaldaba. Ver el caso de R6 mas abajo.
    crearCierreBodega: vi.fn(async () => "cb1"),
    findCierresBodegaByZona: vi.fn(async () => [] as CierreBodegaResumenRow[]),
    // Feature 170 (T I.1): el listado paginado vive en su propia suite (*-paginado).
    findCierresBodegaByZonaPaginado: vi.fn(async () => ({
      items: [] as CierreBodegaResumenRow[],
      total: 0,
    })),
    // Feature 170 (T J.1): la cola de consolidables paginada vive en `consolidables-paginado`.
    findCierresDiaConsolidablesPaginado: vi.fn(async () => ({
      items: [] as CierreDiaConsolidableRow[],
      total: 0,
    })),
    ...overrides,
  };
}

function newService(opts: { repo?: Repo; zonaSatelite?: string | null } = {}) {
  const repo = opts.repo ?? fakeRepo();
  const ordenRepo = {
    findUsuarioZonaId: vi.fn(async () =>
      opts.zonaSatelite === undefined ? ZONA_SAT : opts.zonaSatelite,
    ),
  } as unknown as Pick<IOrdenRepository, "findUsuarioZonaId">;
  const service = new CierreBodegaService(repo, ordenRepo as IOrdenRepository, reglasPaisFijas());
  return { service, repo, ordenRepo };
}

// --- autorizacion + alcance (R1/R3) ---

describe("CierreBodegaService — autorizacion y alcance (R1/R3)", () => {
  it("R1: listarConsolidacion con rol != adminSatelite -> forbidden, sin tocar repos", async () => {
    for (const actor of [MAESTRO, MENSAJERO]) {
      const { service, repo, ordenRepo } = newService();
      const r = await service.listarConsolidacion(actor);
      expect(r.status).toBe("forbidden");
      expect(ordenRepo.findUsuarioZonaId).not.toHaveBeenCalled();
      expect(repo.findCierresDiaConsolidables).not.toHaveBeenCalled();
    }
  });

  it("R1: solicitarCierreBodega con rol != adminSatelite -> forbidden, sin crear", async () => {
    const { service, repo } = newService();
    const r = await service.solicitarCierreBodega(MAESTRO);
    expect(r.status).toBe("forbidden");
    expect(repo.crearCierreBodega).not.toHaveBeenCalled();
  });

  it("R3: adminSatelite -> consolida SOLO su zona (findUsuarioZonaId + WHERE por esa zona)", async () => {
    const { service, repo, ordenRepo } = newService();
    await service.listarConsolidacion(ADMIN_SATELITE);
    expect(ordenRepo.findUsuarioZonaId).toHaveBeenCalledWith("adm-sat");
    expect(repo.findCierresDiaConsolidables).toHaveBeenCalledWith(ZONA_SAT);
    // SLT-106 (R199): la pantalla pide los NOMBRES de los cierres sin resolver de SU zona; el conteo
    // queda para la puerta de `solicitarCierreBodega` (R200).
    expect(repo.findMensajerosConCierreSinResolver).toHaveBeenCalledWith(ZONA_SAT);
    expect(repo.contarCierresDiaSolicitados).not.toHaveBeenCalled();
    expect(repo.findCierresBodegaByZona).toHaveBeenCalledWith(ZONA_SAT);
  });
});

// --- sin zona (R4) ---

describe("CierreBodegaService — adminSatelite sin zona (R4)", () => {
  it("R4: listarConsolidacion sin zona -> sinZona true, vacio, no puede solicitar, sin consultar consolidables", async () => {
    const { service, repo } = newService({ zonaSatelite: null });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.sinZona).toBe(true);
    expect(r.consolidables).toEqual([]);
    expect(r.puedesSolicitar).toBe(false);
    expect(r.motivoBloqueo).toBeTruthy();
    // SLT-133 (L3 de bodega, R141/R144): texto exacto en «tú», en `motivoBloqueo`.
    expect(r.motivoBloqueo).toBe("No tienes una zona asignada; contacta a tu administrador.");
    expect(repo.findCierresDiaConsolidables).not.toHaveBeenCalled();
    // SLT-107 (R287): sin zona, las tres cifras de «Solicitados» en cero.
    expect(r.solicitadosResumen).toEqual({
      porLlegar: { monto: "0.00", cierres: 0 },
      recibido30Dias: { monto: "0.00", cierres: 0 },
      faltaPorRecibir: { monto: "0.00", cierres: 0 },
    });
  });

  it("R4: solicitarCierreBodega sin zona -> validation_error {zona}, sin crear", async () => {
    const { service, repo } = newService({ zonaSatelite: null });
    const r = await service.solicitarCierreBodega(ADMIN_SATELITE);
    expect(r.status).toBe("validation_error");
    if (r.status !== "validation_error") throw new Error("esperaba validation_error");
    expect(r.fieldErrors.zona).toBeDefined();
    // SLT-133 (L3 de bodega, R141/R144): viaja en `fieldErrors.zona`, en «tú».
    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { zona: ["No tienes una zona asignada; contacta a tu administrador."] },
    });
    expect(repo.crearCierreBodega).not.toHaveBeenCalled();
  });
});

// --- consolidacion (R5/R23) ---

describe("CierreBodegaService.listarConsolidacion — consolidables (R5/R23)", () => {
  it("R5: lista los cierre_dia consolidables devueltos por el repo", async () => {
    const repo = fakeRepo({
      findCierresDiaConsolidables: vi.fn(async () => [
        consolidableRow({ cierreDiaId: "cd1" }),
        consolidableRow({ cierreDiaId: "cd2", mensajeroId: "m2", mensajeroNombre: "Beto" }),
      ]),
    });
    const { service } = newService({ repo });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.consolidables.map((c) => c.cierreDiaId)).toEqual(["cd1", "cd2"]);
    expect(r.puedesSolicitar).toBe(true);
    expect(r.motivoBloqueo).toBeNull();
  });

  it("R23: listar NO muta (nunca invoca crearCierreBodega)", async () => {
    const { service, repo } = newService();
    await service.listarConsolidacion(ADMIN_SATELITE);
    expect(repo.crearCierreBodega).not.toHaveBeenCalled();
  });
});

// --- precondiciones de solicitar (R6/R7 de la 40; R5/R6/R7 de la ficha 431) ---

describe("CierreBodegaService.solicitarCierreBodega — precondiciones (R6/R7)", () => {
  // ⭑ FICHA 431 / R5 — EL GATE DE NIVEL 1, QUE **NO** SE TOCA. Este caso ya existia y ahora vale
  // por dos: es el control de cuadre que SOBREVIVE a la ficha, y es el que mas facil se confunde
  // con el que se retira. Si alguien se lo lleva por delante creyendo que era «el bloqueo de la
  // 431», esto se pone rojo. Los dos son distintos:
  //   · NIVEL 1 (este): cierres del DIA de sus mensajeros sin resolver -> NO puede consolidar. VIVE.
  //   · NIVEL 2 (retirado): consolidacion pendiente de conciliar -> ya NO impide nada.
  it("R6/431-R5: con cierre_dia solicitado pendiente -> conflict, sin crear; y bloquea el gate al listar", async () => {
    const repo = fakeRepo({
      contarCierresDiaSolicitados: vi.fn(async () => 2),
      // SLT-106 (R199): los mismos dos cierres, vistos por su mensajero (mismo `where` en el repo).
      findMensajerosConCierreSinResolver: vi.fn(async () => ["Beto Mensajero", "Ana Mensajera"]),
    });
    const { service } = newService({ repo });
    const r = await service.solicitarCierreBodega(ADMIN_SATELITE);
    expect(r.status).toBe("conflict");
    // SLT-133 (M1, R141/R144): mismo status y campo `motivo`, en «tú».
    expect(r).toEqual({
      status: "conflict",
      motivo: "Primero resuelve los cierres de tus mensajeros antes de cerrar la bodega.",
    });
    expect(repo.crearCierreBodega).not.toHaveBeenCalled();

    const l = await service.listarConsolidacion(ADMIN_SATELITE);
    if (l.status !== "ok") throw new Error("esperaba ok");
    expect(l.puedesSolicitar).toBe(false);
    expect(l.motivoBloqueo).toBeTruthy();
    // SLT-106 (R199/R47): la pantalla ya no recibe el texto de la puerta: nombra a los mensajeros.
    // La puerta de `solicitar` (arriba) conserva el suyo (R200).
    expect(l.motivoBloqueo).toBe(
      "Todavía no puedes consolidar: Ana Mensajera y Beto Mensajero tienen cierres sin resolver. Apruébalos o recházalos primero.",
    );
    expect(l.bloqueo).toBe("sin_resolver");
  });

  it("R7: sin consolidables -> conflict, sin crear", async () => {
    const repo = fakeRepo({ findCierresDiaConsolidables: vi.fn(async () => []) });
    const { service } = newService({ repo });
    const r = await service.solicitarCierreBodega(ADMIN_SATELITE);
    expect(r.status).toBe("conflict");
    expect(repo.crearCierreBodega).not.toHaveBeenCalled();
  });

  // ⭑ FICHA 431 / R6 — AQUI VIVIA «R8: ya existe un cierre de bodega solicitado -> conflict», el
  // caso que fijaba el gate «a lo sumo una consolidacion pendiente por zona». SE INVIERTE A
  // PROPOSITO: ese gate era el mismo bloqueo mudado de sitio, y ahora la satelite puede consolidar
  // otra vez sin que nadie marque la anterior. El caso no se borra, se da la vuelta.
  it("⭑ 431/R6: con una consolidacion sin conciliar Y cola consolidable -> SE PUEDE consolidar otra vez", async () => {
    const repo = fakeRepo({
      // La cola de nivel 1 esta limpia; lo unico «pendiente» es la consolidacion anterior, que ya
      // no es asunto de este camino: el servicio ni siquiera puede preguntarlo.
      contarCierresDiaSolicitados: vi.fn(async () => 0),
    });
    const { service } = newService({ repo });

    const r = await service.solicitarCierreBodega(ADMIN_SATELITE);

    expect(r.status).toBe("ok");
    expect(repo.crearCierreBodega).toHaveBeenCalledTimes(1);
    // Y el contrato ya no ofrece por donde volver a preguntarlo: el metodo no existe.
    expect((repo as unknown as Record<string, unknown>).existeCierreBodegaSolicitado).toBeUndefined();
  });

  // ⭑ FICHA 431 / R7 — el `P2002` del indice unico parcial YA NO PUEDE OCURRIR (el indice se borro).
  // Lo sustituye el todo-o-nada del repositorio, que lanza cuando vincularia menos cierres de los
  // que sus totales snapshot ya sumaron. El desenlace sigue siendo `conflict`, con el motivo que YA
  // existia (`MSG_VACIO`), sin inventar uno nuevo.
  it("⭑ 431/R7: ConsolidacionParcialError del repositorio -> conflict (carrera concurrente)", async () => {
    const repo = fakeRepo({
      crearCierreBodega: vi.fn(async () => {
        throw new ConsolidacionParcialError(1, 3);
      }),
    });
    const { service } = newService({ repo });

    const r = await service.solicitarCierreBodega(ADMIN_SATELITE);

    expect(r.status).toBe("conflict");
    if (r.status === "conflict") expect(r.motivo).toMatch(/aprobados para consolidar/i);
  });

  it("⭑ 431/R7: un error CUALQUIERA de `crearCierreBodega` NO se traga: se propaga", async () => {
    // Sin este caso, el `catch` de arriba podria ampliarse a `catch (e) { return conflict }` y una
    // caida de base se leeria en pantalla como «no hay nada que consolidar».
    const repo = fakeRepo({
      crearCierreBodega: vi.fn(async () => {
        throw new Error("la base se cayo");
      }),
    });
    const { service } = newService({ repo });

    await expect(service.solicitarCierreBodega(ADMIN_SATELITE)).rejects.toThrow("la base se cayo");
  });
});

// --- totales agregados (R10) ---

describe("CierreBodegaService — totales agregados exactos (R10)", () => {
  it("R10: totalesAgregados == suma al centavo de los snapshots de los consolidables", async () => {
    const repo = fakeRepo({
      findCierresDiaConsolidables: vi.fn(async () => [
        consolidableRow({
          cierreDiaId: "cd1",
          totales: { efectivo: "10.00", simpe: "5.55", transferencia: "0.00", general: "15.55" },
        }),
        consolidableRow({
          cierreDiaId: "cd2",
          totales: { efectivo: "0.01", simpe: "0.00", transferencia: "100.44", general: "100.45" },
        }),
      ]),
    });
    const { service } = newService({ repo });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.totalesAgregados).toEqual({
      efectivo: "10.01",
      simpe: "5.55",
      transferencia: "100.44",
      general: "116.00",
    });
    expect(typeof r.totalesAgregados.general).toBe("string");
  });

  it("R10: solicitar crea con la MISMA suma agregada + los ids de los consolidables", async () => {
    const repo = fakeRepo({
      findCierresDiaConsolidables: vi.fn(async () => [
        consolidableRow({
          cierreDiaId: "cd1",
          totales: { efectivo: "10.00", simpe: "5.55", transferencia: "0.00", general: "15.55" },
        }),
        consolidableRow({
          cierreDiaId: "cd2",
          totales: { efectivo: "0.01", simpe: "0.00", transferencia: "100.44", general: "100.45" },
        }),
      ]),
    });
    const { service } = newService({ repo });
    const r = await service.solicitarCierreBodega(ADMIN_SATELITE);
    expect(r).toEqual({
      status: "ok",
      cierreBodegaId: "cb1",
      totales: { efectivo: "10.01", simpe: "5.55", transferencia: "100.44", general: "116.00" },
    });
    const arg = (repo.crearCierreBodega as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg).toMatchObject({
      zonaId: ZONA_SAT,
      solicitadoPor: "adm-sat",
      cierreDiaIds: ["cd1", "cd2"],
      totales: { efectivo: "10.01", simpe: "5.55", transferencia: "100.44", general: "116.00" },
    });
  });
});

// --- Feature 39: pago a mensajeros agregado (R18/R19) ---

describe("CierreBodegaService — pago a mensajeros agregado (R18/R19)", () => {
  it("R18: listarConsolidacion expone totalPagoMensajeroAgregado = suma snapshot de los consolidables", async () => {
    const repo = fakeRepo({
      findCierresDiaConsolidables: vi.fn(async () => [
        consolidableRow({ cierreDiaId: "cd1", totalPagoMensajero: "10.50" }),
        consolidableRow({ cierreDiaId: "cd2", totalPagoMensajero: "0.25" }),
      ]),
    });
    const { service } = newService({ repo });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.totalPagoMensajeroAgregado).toBe("10.75"); // suma exacta al centavo
    expect(typeof r.totalPagoMensajeroAgregado).toBe("string"); // R23
    // R21: separado del dinero recibido (no altera totalesAgregados).
    expect(r.totalesAgregados.general).toBe("30.00"); // (15.00 + 15.00) de los dos consolidables
  });

  it("R18: sin zona -> totalPagoMensajeroAgregado 0.00", async () => {
    const { service } = newService({ zonaSatelite: null });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.totalPagoMensajeroAgregado).toBe("0.00");
  });

  it("R19: solicitarCierreBodega pasa a crearCierreBodega el pago agregado snapshoteado", async () => {
    const repo = fakeRepo({
      findCierresDiaConsolidables: vi.fn(async () => [
        consolidableRow({ cierreDiaId: "cd1", totalPagoMensajero: "10.50" }),
        consolidableRow({ cierreDiaId: "cd2", totalPagoMensajero: "0.25" }),
      ]),
    });
    const { service } = newService({ repo });
    const r = await service.solicitarCierreBodega(ADMIN_SATELITE);
    expect(r.status).toBe("ok");
    const arg = (repo.crearCierreBodega as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.totalPagoMensajero).toBe("10.75"); // R19: snapshot agregado en la tx
  });
});

// --- Total neto + deuda de la central (el pago a mensajeros solo sale del EFECTIVO) ---

/** Consolidable con `efectivo` (y `general`) a medida: el reparto solo mira el efectivo. */
function conEfectivo(
  efectivo: string,
  overrides: Partial<CierreDiaConsolidableRow> = {},
): CierreDiaConsolidableRow {
  return consolidableRow({
    totales: {
      efectivo,
      simpe: "0.00",
      transferencia: "0.00",
      general: efectivo,
    },
    ...overrides,
  });
}

describe("CierreBodegaService — total neto y deuda de la central", () => {
  it("el efectivo alcanza para todos -> no hay deuda y el neto descuenta todo el pago", async () => {
    const repo = fakeRepo({
      findCierresDiaConsolidables: vi.fn(async () => [
        conEfectivo("5000.00", { cierreDiaId: "cd1", totalPagoMensajero: "1000.00" }),
        conEfectivo("0.00", { cierreDiaId: "cd2", totalPagoMensajero: "2000.00" }),
      ]),
    });
    const { service } = newService({ repo });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.totalesAgregados.efectivo).toBe("5000.00");
    expect(r.totalPagoMensajeroAgregado).toBe("3000.00");
    expect(r.totalCentralDebeAgregado).toBe("0.00");
    expect(r.totalNetoAgregado).toBe("2000.00"); // 5000 general - 3000 pagados
  });

  it("efectivo insuficiente -> se paga completo a los que alcanzan y la central debe el resto", async () => {
    // El caso del usuario: 5000 en efectivo, 6 mensajeros de 1500 c/u. Solo se le puede
    // pagar a 3 (4500); el pago no puede ser parcial, así que los 500 sobrantes no se usan.
    const repo = fakeRepo({
      findCierresDiaConsolidables: vi.fn(async () =>
        Array.from({ length: 6 }, (_, i) =>
          conEfectivo(i === 0 ? "5000.00" : "0.00", {
            cierreDiaId: `cd${i + 1}`,
            mensajeroId: `m${i + 1}`,
            totalPagoMensajero: "1500.00",
          }),
        ),
      ),
    });
    const { service } = newService({ repo });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.totalPagoMensajeroAgregado).toBe("9000.00"); // se mantiene sin cambios
    expect(r.totalCentralDebeAgregado).toBe("4500.00"); // los 3 que no se pudieron pagar
    expect(r.totalNetoAgregado).toBe("500.00"); // 5000 general - 4500 pagados
  });

  it("con montos distintos se paga de menor a mayor (le paga a la mayor cantidad posible)", async () => {
    // 5000 en efectivo y montos 4000/3000/2000/1000: de menor a mayor entran 1000+2000 =
    // 3000; el de 3000 ya no cabe (3000+3000 > 5000) y el de 4000 tampoco.
    const repo = fakeRepo({
      findCierresDiaConsolidables: vi.fn(async () => [
        conEfectivo("5000.00", { cierreDiaId: "cd1", totalPagoMensajero: "4000.00" }),
        conEfectivo("0.00", { cierreDiaId: "cd2", totalPagoMensajero: "3000.00" }),
        conEfectivo("0.00", { cierreDiaId: "cd3", totalPagoMensajero: "2000.00" }),
        conEfectivo("0.00", { cierreDiaId: "cd4", totalPagoMensajero: "1000.00" }),
      ]),
    });
    const { service } = newService({ repo });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.totalPagoMensajeroAgregado).toBe("10000.00");
    expect(r.totalCentralDebeAgregado).toBe("7000.00"); // 3000 + 4000 sin pagar
    expect(r.totalNetoAgregado).toBe("2000.00"); // 5000 general - 3000 pagados
  });

  it("el pago a mensajeros NO se paga con SINPE ni transferencia: solo cuenta el efectivo", async () => {
    const repo = fakeRepo({
      findCierresDiaConsolidables: vi.fn(async () => [
        consolidableRow({
          totales: {
            efectivo: "0.00",
            simpe: "9000.00",
            transferencia: "0.00",
            general: "9000.00",
          },
          totalPagoMensajero: "1500.00",
        }),
      ]),
    });
    const { service } = newService({ repo });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    // Hay 9000 recibidos, pero ninguno en efectivo: no se puede pagar nada en mano.
    expect(r.totalCentralDebeAgregado).toBe("1500.00");
    expect(r.totalNetoAgregado).toBe("9000.00"); // no se descuenta lo que no se pagó
  });

  it("sin zona -> neto y deuda en 0.00", async () => {
    const { service } = newService({ zonaSatelite: null });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.totalNetoAgregado).toBe("0.00");
    expect(r.totalCentralDebeAgregado).toBe("0.00");
    expect(typeof r.totalNetoAgregado).toBe("string"); // money-safe
  });
});

// --- Feature 56: ingreso de bodega por devoluciones a origen agregado (R17/R18) ---

describe("CierreBodegaService — ingreso de bodega por devoluciones a origen agregado (R17/R18)", () => {
  it("R17: listarConsolidacion expone totalIngresoBodegaRechazosAgregado = suma snapshot de los consolidables", async () => {
    const repo = fakeRepo({
      findCierresDiaConsolidables: vi.fn(async () => [
        consolidableRow({ cierreDiaId: "cd1", totalIngresoBodegaRechazos: "6.00" }),
        consolidableRow({ cierreDiaId: "cd2", totalIngresoBodegaRechazos: "0.50" }),
      ]),
    });
    const { service } = newService({ repo });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.totalIngresoBodegaRechazosAgregado).toBe("6.50"); // suma exacta al centavo
    expect(typeof r.totalIngresoBodegaRechazosAgregado).toBe("string"); // R22
    // R20: separado del dinero recibido y del pago a mensajeros (no altera esos agregados).
    expect(r.totalesAgregados.general).toBe("30.00");
    expect(r.totalPagoMensajeroAgregado).toBe("0.00");
  });

  it("R17: sin zona -> totalIngresoBodegaRechazosAgregado 0.00", async () => {
    const { service } = newService({ zonaSatelite: null });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.totalIngresoBodegaRechazosAgregado).toBe("0.00");
  });

  it("R18: solicitarCierreBodega congela en crearCierreBodega el ingreso agregado snapshoteado (misma tx)", async () => {
    const repo = fakeRepo({
      findCierresDiaConsolidables: vi.fn(async () => [
        consolidableRow({ cierreDiaId: "cd1", totalIngresoBodegaRechazos: "6.00" }),
        consolidableRow({ cierreDiaId: "cd2", totalIngresoBodegaRechazos: "0.50" }),
      ]),
    });
    const { service } = newService({ repo });
    const r = await service.solicitarCierreBodega(ADMIN_SATELITE);
    expect(r.status).toBe("ok");
    const arg = (repo.crearCierreBodega as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.totalIngresoBodegaRechazos).toBe("6.50"); // R18: snapshot agregado en la tx
  });
});

// ── SLT-139 (T7.2, R322, R323, R341) — «La central debe» y el neto con cierres viejos y nuevos ──
//
// La tabla de `specs/SLT-139-pago-independiente-satelite/tasks.md > T7.2`, con los importes ESCRITOS
// A MANO. V = viejo (marca `false`), N/N0 = nuevos (marca `true`). Con el codigo de antes el primer
// conjunto daba «La central debe» 0.00 (efectivo 7 000 >= 0 + 2 500 + 3 000) y neto 4 500.00.

describe("SLT-139 R322/R323 — la consolidacion reparte solo el efectivo de los cierres viejos", () => {
  const V = (): CierreDiaConsolidableRow =>
    consolidableRow({
      cierreDiaId: "V",
      mensajeroId: "mV",
      totales: { efectivo: "2000.00", simpe: "3000.00", transferencia: "0.00", general: "5000.00" },
      totalPagoMensajero: "3000.00",
      pagoIndependienteEfectivo: false,
    });
  const Vp = (): CierreDiaConsolidableRow =>
    consolidableRow({
      cierreDiaId: "Vp",
      mensajeroId: "mVp",
      totales: { efectivo: "2000.00", simpe: "0.00", transferencia: "0.00", general: "2000.00" },
      totalPagoMensajero: "1500.00",
      pagoIndependienteEfectivo: false,
    });
  const N = (): CierreDiaConsolidableRow =>
    consolidableRow({
      cierreDiaId: "N",
      mensajeroId: "mN",
      totales: { efectivo: "4000.00", simpe: "0.00", transferencia: "0.00", general: "4000.00" },
      totalPagoMensajero: "2500.00",
      pagoIndependienteEfectivo: true,
    });
  const N0 = (): CierreDiaConsolidableRow =>
    consolidableRow({
      cierreDiaId: "N0",
      mensajeroId: "mN0",
      totales: { efectivo: "1000.00", simpe: "0.00", transferencia: "0.00", general: "1000.00" },
      totalPagoMensajero: "0.00",
      pagoIndependienteEfectivo: true,
    });

  async function consolidar(filas: CierreDiaConsolidableRow[]) {
    const repo = fakeRepo({ findCierresDiaConsolidables: vi.fn(async () => filas) });
    const { service } = newService({ repo });
    const r = await service.listarConsolidacion(ADMIN_SATELITE);
    if (r.status !== "ok") throw new Error("esperaba ok");
    const pintaCentralDebe = tarjetasAConsolidar({
      totales: r.totalesAgregados,
      pagoMensajeros: r.totalPagoMensajeroAgregado,
      ganaBodega: r.totalIngresoBodegaRechazosAgregado,
      paraLaCentral: r.paraLaCentralAgregado,
      centralDebe: r.totalCentralDebeAgregado,
      mensajeros: filas.length,
      incluyeModeloNuevo: false,
    }).some((c) => c.id === "centralDebe");
    return { r, pintaCentralDebe };
  }

  it.each([
    // [conjunto, filas, «La central debe», neto, se pinta]
    ["V + N + N0", () => [V(), N(), N0()], "3000.00", "7500.00", true],
    ["N + N0 (solo nuevos)", () => [N(), N0()], "0.00", "2500.00", false],
    ["V solo (todos viejos: igual que antes de la ficha)", () => [V()], "3000.00", "5000.00", true],
    ["V' + N (los pagos viejos alcanzan)", () => [Vp(), N()], "0.00", "2000.00", false],
  ] as const)("%s -> central debe %s, neto %s", async (_n, filas, debe, neto, pinta) => {
    const { r, pintaCentralDebe } = await consolidar(filas());
    expect(r.totalCentralDebeAgregado).toBe(debe);
    expect(r.totalNetoAgregado).toBe(neto);
    expect(pintaCentralDebe).toBe(pinta);
  });

  it("R341: el pago agregado y «Debe llegar a la central» del primer conjunto no cambian", async () => {
    const { r } = await consolidar([V(), N(), N0()]);
    expect(r.totalPagoMensajeroAgregado).toBe("5500.00");
    expect(r.paraLaCentralAgregado).toBe("4500.00");
  });
});
