import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RolValue } from "@prisma/client";
import { ZonaService } from "@/lib/services/ZonaService";
import type {
  CreateZonaResult,
  IZonaRepository,
  UpdateZonaResult,
} from "@/lib/interfaces/repositories/IZonaRepository";
import type { Actor } from "@/lib/interfaces/services/IZonaService";
import type { ActualizarZonaInput, CrearZonaInput, ZonaDTO } from "@/lib/types/zona";

const MAESTRO: Actor = { usuarioId: "m1", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "a1", rol: "admin" };
const MENSAJERO: Actor = { usuarioId: "x", rol: "mensajero" };
const TIENDA: Actor = { usuarioId: "t", rol: "adminTienda" };
const DESCONOCIDO: Actor = { usuarioId: "z", rol: "invitado" as RolValue };
const NO_MAESTROS = [ADMIN, MENSAJERO, TIENDA, DESCONOCIDO];

function dto(overrides: Partial<ZonaDTO> = {}): ZonaDTO {
  return { id: "z1", nombre: "GAM", cobroVehiculo: false, distritosCount: 1, esCentral: false, ...overrides };
}

/**
 * FICHA 366: `update` ya no devuelve el DTO pelado, sino el DTO MAS el conteo de R12.
 * FICHA 376: y el desenlace viaja NOMBRADO en `estado`, porque ahora hay DOS formas de no guardar.
 */
function resultadoUpdate(
  zona: ZonaDTO = dto(),
  ordenesReconciliadas = 0,
  ordenesRetenidasEnBodegaSatelite = 0,
): UpdateZonaResult {
  // FICHA 377: y el conteo de las RETENIDAS, que es un numero distinto y disjunto del anterior.
  return { estado: "ok", zona, ordenesReconciliadas, ordenesRetenidasEnBodegaSatelite };
}

/** SLT-75: `create` devuelve un desenlace nombrado, como `update`. */
function resultadoCreate(zona: ZonaDTO = dto()): CreateZonaResult {
  return { estado: "ok", zona };
}

function buildRepo(overrides: Partial<IZonaRepository> = {}): IZonaRepository {
  return {
    create: vi.fn().mockResolvedValue(resultadoCreate(dto())),
    findById: vi.fn().mockResolvedValue(dto()),
    list: vi.fn().mockResolvedValue({ items: [dto()], total: 1 }),
    listLite: vi.fn().mockResolvedValue([]), // feature 144; no ejercitado aqui
    update: vi.fn().mockResolvedValue(resultadoUpdate()),
    hardDelete: vi.fn().mockResolvedValue("ok"),
    // por defecto: todos los ids existen.
    countExistingDistritos: vi.fn(async (ids: string[]) => ids.length),
    countExistingVehiculos: vi.fn(async (ids: string[]) => ids.length),
    findCentralZonaId: vi.fn().mockResolvedValue(null), // feature 54
    // FICHA 376 (Q4): por defecto, cero ordenes vivas en cada zona pedida.
    impactoDeAsignacion: vi.fn(), // SLT-89 (T4.1): el doble declara el metodo nuevo; aqui no se ejercita
    contarOrdenesVivasPorZona: vi.fn(async (ids: string[]) =>
      ids.map((zonaId) => ({ zonaId, ordenesVivas: 0 })),
    ),
    // FICHA 429: los metodos de la superficie del SINPE por bodega. El doble los declara
    // para seguir cumpliendo `IZonaRepository`; esta suite no los ejercita.
    listarSinpe: vi.fn().mockResolvedValue([]),
    findSinpeByZona: vi.fn().mockResolvedValue(null),
    zonaIdDeUsuario: vi.fn().mockResolvedValue(null),
    guardarSinpe: vi.fn().mockResolvedValue(null),
    confirmarSinpe: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function crearInput(overrides: Partial<CrearZonaInput> = {}): CrearZonaInput {
  return {
    nombre: "GAM",
    cobroVehiculo: false,
    esCentral: false, // feature 54
    distritoIds: ["d1"],
    tarifas: [],
    // FICHA 429 (R11): crear una bodega EXIGE los dos campos del SINPE. Valores FICTICIOS: el
    // repositorio es publico y aqui no se escribe ningun numero real.
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
    ...overrides,
  };
}

/**
 * SLT-89 (T3.7, R16): guardar una zona existente exige el «antes» (decision del 2026-11-09). El de
 * estos casos es el distrito de `crearInput`, lo que el doble del repositorio da por sembrado.
 */
const ANTES = { distritoIds: ["d1"], nodoIds: [] };

/** `crearInput` con el «antes» obligatorio de actualizar. Mismos campos que antes, mas ese. */
function actualizarInput(overrides: Partial<CrearZonaInput> = {}) {
  return { ...crearInput(overrides), antes: ANTES };
}

let repo: IZonaRepository;
let service: ZonaService;

beforeEach(() => {
  repo = buildRepo();
  service = new ZonaService(repo);
});

describe("autorizacion — solo maestro (feature 24)", () => {
  it("crear: maestro OK", async () => {
    const r = await service.crear(crearInput(), MAESTRO);
    expect(r.status).toBe("ok");
  });

  it.each(NO_MAESTROS)("crear: rol %o -> forbidden y no persiste", async (actor) => {
    const r = await service.crear(crearInput(), actor);
    expect(r.status).toBe("forbidden");
    expect(repo.create).not.toHaveBeenCalled();
  });

  // `arbol` salio de esta lista el 2026-08-07 al borrarse la cadena entera; el gate maestro
  // de las cinco operaciones que quedan se sigue probando igual.
  it("listar/obtener/actualizar/borrar: no-maestro -> forbidden", async () => {
    expect((await service.listar({ page: 1, pageSize: 25 }, ADMIN)).status).toBe("forbidden");
    expect((await service.obtener("z1", ADMIN)).status).toBe("forbidden");
    expect((await service.actualizar("z1", actualizarInput(), ADMIN)).status).toBe("forbidden");
    expect((await service.borrar("z1", ADMIN)).status).toBe("forbidden");
    expect(repo.hardDelete).not.toHaveBeenCalled();
  });
});

describe("crear — validacion de existencia", () => {
  it("distritoId inexistente -> validation_error", async () => {
    repo = buildRepo({ countExistingDistritos: vi.fn().mockResolvedValue(0) });
    service = new ZonaService(repo);
    const r = await service.crear(crearInput({ distritoIds: ["dX"] }), MAESTRO);
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(r.fieldErrors).toHaveProperty("distritoIds");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("vehiculoId inexistente -> validation_error", async () => {
    repo = buildRepo({ countExistingVehiculos: vi.fn().mockResolvedValue(0) });
    service = new ZonaService(repo);
    const input = crearInput({
      cobroVehiculo: true,
      tarifas: [{ cobroEntregado: 10, cobroRechazado: 5, vehiculoId: "vX" }],
    });
    const r = await service.crear(input, MAESTRO);
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(r.fieldErrors).toHaveProperty("tarifas");
  });

  it("deduplica distritoIds antes de crear", async () => {
    await service.crear(crearInput({ distritoIds: ["d1", "d1", "d2"] }), MAESTRO);
    const arg = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.distritoIds).toEqual(["d1", "d2"]);
  });

  it("mapea vehiculoId undefined -> null hacia el repo", async () => {
    await service.crear(crearInput({ cobroVehiculo: false, tarifas: [{ cobroEntregado: 1, cobroRechazado: 2 }] }), MAESTRO);
    const arg = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.tarifas[0].vehiculoId).toBeNull();
  });

  it("⭑ FICHA 429 (R11): el par del SINPE llega al repositorio TAL CUAL, sin default ni relleno", async () => {
    // El servicio no decide nada sobre el formato: eso se decide UNA vez en el borde
    // (`sinpeNumeroSchema`) y otra en el `CHECK` de la base. Aqui solo se comprueba que no se pierde
    // ni se sustituye por un valor «por defecto» — que es como una bodega acabaria con el numero de
    // otra sin que nadie lo pidiera.
    await service.crear(
      crearInput({ sinpeNumero: "70000001", sinpeNombre: "Otro Titular de Prueba" }),
      MAESTRO,
    );
    const arg = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.sinpeNumero).toBe("70000001");
    expect(arg.sinpeNombre).toBe("Otro Titular de Prueba");
  });

  it("⭑ FICHA 429: ACTUALIZAR no manda el SINPE al repositorio, ni siquiera como `undefined`", async () => {
    // `UpdateZonaData` no lo lleva, y ese es el punto: un guardado de distritos no puede tocar el
    // numero de cobro de una bodega. Se afirma sobre el ARGUMENTO, no sobre el tipo.
    // Se le pasa un input que SI lleva los dos campos: si el servicio los reenviara, el argumento
    // del repositorio los traeria. `prepararDatos` los deja fuera por construccion (`DatosSinMarca`).
    await service.actualizar("z1", actualizarInput() as unknown as ActualizarZonaInput, MAESTRO);
    const arg = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(arg)).not.toContain("sinpeNumero");
    expect(Object.keys(arg)).not.toContain("sinpeNombre");
  });
});

describe("borrar", () => {
  it("hardDelete ok -> ok", async () => {
    expect((await service.borrar("z1", MAESTRO)).status).toBe("ok");
  });
  it("hardDelete not_found -> not_found", async () => {
    repo = buildRepo({ hardDelete: vi.fn().mockResolvedValue("not_found") });
    service = new ZonaService(repo);
    expect((await service.borrar("zX", MAESTRO)).status).toBe("not_found");
  });
  it("hardDelete referenced -> conflict con motivo `en_uso`", async () => {
    repo = buildRepo({ hardDelete: vi.fn().mockResolvedValue("referenced") });
    service = new ZonaService(repo);
    const r = await service.borrar("z1", MAESTRO);
    expect(r.status).toBe("conflict");
    if (r.status === "conflict") expect(r.motivo).toBe("en_uso");
  });

  // ⭑ FICHA 376 / R11 — los DOS conflictos tienen que ser distinguibles SIN inferirlo.
  it("⭑ R11: hardDelete `es_central` -> conflict con motivo `es_central`, distinto de `en_uso`", async () => {
    // Antes de esta ficha los dos rechazos habrian llegado como el MISMO `{ status: "conflict" }` y
    // la pantalla habria dicho «la zona esta en uso» para un caso en el que no hay nada en uso: la
    // salida no es vaciar la zona, es marcar OTRA zona como central.
    repo = buildRepo({ hardDelete: vi.fn().mockResolvedValue("es_central") });
    service = new ZonaService(repo);
    const r = await service.borrar("z1", MAESTRO);
    expect(r.status).toBe("conflict");
    if (r.status === "conflict") {
      expect(r.motivo).toBe("es_central");
      expect(r.motivo).not.toBe("en_uso");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 376 — la guarda «siempre tiene que haber una central», traducida hacia fuera
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("376 — el desenlace `sin_zona_central` del repositorio", () => {
  /**
   * ⚠️ LO QUE ESTE BLOQUE **NO** MIDE, y esta dicho a proposito: que la guarda FUNCIONE. Eso vive
   * en un `WHERE`/un `if` DENTRO de la transaccion del repositorio, y con un doble el service ve
   * lo que el doble quiera devolver. La guarda se mide contra Postgres real en
   * `tests/integration/db/zona-central-guarda-y-rastro.test.ts`. Aqui se mide SOLO la traduccion:
   * que el desenlace no se pierda ni se confunda con `not_found`.
   */
  it("⭑ R6: `sin_zona_central` -> validation_error con el motivo colgado de `esCentral`", async () => {
    repo = buildRepo({ update: vi.fn().mockResolvedValue({ estado: "sin_zona_central" }) });
    service = new ZonaService(repo);

    const r = await service.actualizar("z1", actualizarInput({ esCentral: false }), MAESTRO);
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") {
      // R6: señala EL CAMPO de la marca, para que la pantalla lo pinte junto a la casilla (R23).
      expect(Object.keys(r.fieldErrors)).toEqual(["esCentral"]);
      // LITERAL a proposito, y no la constante que lo genera: ESE texto es el contrato con la
      // persona que esta guardando. Comparar contra su propia fuente dejaria pasar cualquier
      // reescritura del mensaje, incluida una que no diga que hacer.
      expect(r.fieldErrors.esCentral).toEqual([
        // SLT-51 (R10): la marca se rotula «zona de bodega principal» en la pantalla.
        "Tiene que haber una zona de bodega principal. Para quitarle la marca a ésta, márcala en otra zona.",
      ]);
      // Y es DISTINGUIBLE de los otros errores de validacion de la zona (R6): ninguno de los dos
      // que ya existian cuelga de este campo.
      expect(r.fieldErrors).not.toHaveProperty("distritoIds");
      expect(r.fieldErrors).not.toHaveProperty("tarifas");
    }
  });

  it("R6: `sin_zona_central` NO se confunde con `not_found`", async () => {
    repo = buildRepo({ update: vi.fn().mockResolvedValue({ estado: "sin_zona_central" }) });
    service = new ZonaService(repo);
    expect((await service.actualizar("z1", actualizarInput(), MAESTRO)).status).not.toBe("not_found");
  });

  it("⭑ R1: `esCentral` AUSENTE llega al repositorio como `undefined`, no como `false`", async () => {
    // El defecto que abre la ficha, en el unico punto donde el service podia reintroducirlo: un
    // `?? false` aqui volveria a apagar la marca por omision, y ningun test de arriba lo veria.
    const { esCentral: _omitida, ...sinMarca } = crearInput();
    void _omitida;
    await service.actualizar("z1", { ...sinMarca, antes: ANTES } as ActualizarZonaInput, MAESTRO);

    const datos = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(datos).toHaveProperty("esCentral");
    expect(datos.esCentral).toBeUndefined();
    // Y el resto del guardado SI viaja (R4): esto no es un payload vacio.
    expect(datos.nombre).toBe("GAM");
    expect(datos.distritoIds).toEqual(["d1"]);
  });

  it("R3: un `false` EXPLICITO llega al repositorio como `false`, no como `undefined`", async () => {
    // La otra mitad de R1/R3: «no lo mandé» y «lo mandé apagado» tienen que seguir siendo cosas
    // distintas cuando llegan al repositorio, porque una se ignora y la otra se rechaza CON MOTIVO.
    await service.actualizar("z1", actualizarInput({ esCentral: false }), MAESTRO);
    const datos = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(datos.esCentral).toBe(false);
  });
});

describe("376/Q4 — el impacto de mover la marca", () => {
  it("reenvia el conteo del repositorio TAL CUAL", async () => {
    repo = buildRepo({
      contarOrdenesVivasPorZona: vi.fn().mockResolvedValue([
        { zonaId: "z-gam", ordenesVivas: 850 },
        { zonaId: "z-nueva", ordenesVivas: 0 },
      ]),
      // FICHA 429: los metodos de la superficie del SINPE por bodega. El doble los declara
      // para seguir cumpliendo `IZonaRepository`; esta suite no los ejercita.
      listarSinpe: vi.fn().mockResolvedValue([]),
      findSinpeByZona: vi.fn().mockResolvedValue(null),
      zonaIdDeUsuario: vi.fn().mockResolvedValue(null),
      guardarSinpe: vi.fn().mockResolvedValue(null),
      confirmarSinpe: vi.fn().mockResolvedValue(null),
    });
    service = new ZonaService(repo);

    const r = await service.impactoZonaCentral(["z-gam", "z-nueva"], MAESTRO);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.impacto).toEqual([
        { zonaId: "z-gam", ordenesVivas: 850 },
        { zonaId: "z-nueva", ordenesVivas: 0 },
      ]);
    }
    expect(repo.contarOrdenesVivasPorZona).toHaveBeenCalledWith(["z-gam", "z-nueva"]);
  });

  it("no-maestro -> forbidden y no consulta nada", async () => {
    const r = await service.impactoZonaCentral(["z1"], ADMIN);
    expect(r.status).toBe("forbidden");
    expect(repo.contarOrdenesVivasPorZona).not.toHaveBeenCalled();
  });
});

describe("listar — include", () => {
  it("include ['tarifas'] -> pide includeTarifas=true al repo", async () => {
    await service.listar({ page: 1, pageSize: 25, include: ["tarifas"] }, MAESTRO);
    const arg = (repo.list as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.includeTarifas).toBe(true);
  });
  it("sin include -> includeTarifas=false", async () => {
    await service.listar({ page: 1, pageSize: 25 }, MAESTRO);
    const arg = (repo.list as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.includeTarifas).toBe(false);
  });
});

describe("actualizar", () => {
  it("update devuelve `not_found` -> not_found", async () => {
    // FICHA 376: el desenlace viaja nombrado, no como `null`. Sigue siendo el mismo caso.
    repo = buildRepo({ update: vi.fn().mockResolvedValue({ estado: "not_found" }) });
    service = new ZonaService(repo);
    expect((await service.actualizar("zX", actualizarInput(), MAESTRO)).status).toBe("not_found");
  });

  // ⭑ FICHA 366 (T6) — el service no calcula nada de esto: lo TRANSPORTA. Lo que se mide aqui es
  // que no lo pierde por el camino (el conteo) y que no llega al repositorio sin firma (el actor).
  it("⭑ R12: reenvia `ordenesReconciliadas` del repo TAL CUAL, sin tocarlo", async () => {
    repo = buildRepo({
      update: vi.fn().mockResolvedValue(resultadoUpdate(dto(), 5)),
    });
    service = new ZonaService(repo);

    const r = await service.actualizar("z1", actualizarInput(), MAESTRO);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.ordenesReconciliadas).toBe(5);
  });

  it("R14: cero se reenvia como cero (no como ausencia)", async () => {
    const r = await service.actualizar("z1", actualizarInput(), MAESTRO);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.ordenesReconciliadas).toBe(0);
  });

  // ⭑ FICHA 377 (T6, R7/R8) — LOS DOS NUMEROS, SIN MEZCLARSE.
  it("⭑ 377/R7/R8: reenvia los DOS conteos del repo TAL CUAL y por separado", async () => {
    // Numeros DISTINTOS entre si a proposito: si el service devolviera dos veces el mismo campo
    // —o la suma— este caso lo caza. Con `{5, 5}` no lo cazaria.
    repo = buildRepo({ update: vi.fn().mockResolvedValue(resultadoUpdate(dto(), 5, 3)) });
    service = new ZonaService(repo);

    const r = await service.actualizar("z1", actualizarInput(), MAESTRO);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.ordenesReconciliadas).toBe(5);
      expect(r.ordenesRetenidasEnBodegaSatelite).toBe(3);
    }
  });

  it("⭑ 377/R10: sin nada retenido, el service reenvia CERO (no lo omite)", async () => {
    // R10 pide que el numero exista y valga 0, no que desaparezca: la pantalla decide callarse
    // mirando el cero, y no puede decidirlo sobre un `undefined`.
    repo = buildRepo({ update: vi.fn().mockResolvedValue(resultadoUpdate(dto(), 2, 0)) });
    service = new ZonaService(repo);

    const r = await service.actualizar("z1", actualizarInput(), MAESTRO);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.ordenesRetenidasEnBodegaSatelite).toBe(0);
      expect(Object.keys(r).sort()).toEqual([
        "ordenesReconciliadas",
        "ordenesRetenidasEnBodegaSatelite",
        "status",
        "zona",
      ]);
    }
  });

  it("⭑ R10: `actor.usuarioId` llega al repo como TERCER argumento de `update`", async () => {
    // Sin esto, cada fila del historial que produzca la reconciliacion quedaria firmada por EL
    // SISTEMA (`resolverActorCongelado(tx, null)`), y el rastro no diria quien la disparo.
    await service.actualizar("z1", actualizarInput(), MAESTRO);
    const llamada = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(llamada[0]).toBe("z1");
    expect(llamada[2]).toBe(MAESTRO.usuarioId);
  });
});

/**
 * SLT-51 (R6/R7/R9) — el servicio TRANSPORTA la ausencia de costos; que el repositorio no toque
 * las filas se mide contra Postgres en `tests/integration/db/zona-guardado-conserva-costos.test.ts`.
 */
describe("SLT-51 — actualizar sin cobroVehiculo ni tarifas", () => {
  it("R7: llegan al repo como `undefined` (no como `false`/`[]`) y no se consultan vehiculos", async () => {
    await service.actualizar("z1", { nombre: "GAM", distritoIds: ["d1"], antes: ANTES }, MAESTRO);
    const data = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(data.cobroVehiculo).toBeUndefined();
    expect(data.tarifas).toBeUndefined();
    expect(repo.countExistingVehiculos).not.toHaveBeenCalled();
  });

  it("R9: con los dos presentes, valida vehiculos y los pasa mapeados como hoy", async () => {
    await service.actualizar(
      "z1",
      {
        nombre: "GAM",
        distritoIds: ["d1"],
        cobroVehiculo: true,
        tarifas: [{ cobroEntregado: 10, cobroRechazado: 5, vehiculoId: "v1" }],
        antes: ANTES,
      },
      MAESTRO,
    );
    expect(repo.countExistingVehiculos).toHaveBeenCalledWith(["v1"]);
    const data = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(data.cobroVehiculo).toBe(true);
    expect(data.tarifas).toEqual([{ cobroEntregado: 10, cobroRechazado: 5, vehiculoId: "v1" }]);
  });

  it("R5: crear sigue pasando valores (false y []) al repo", async () => {
    await service.crear(crearInput(), MAESTRO);
    const data = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(data.cobroVehiculo).toBe(false);
    expect(data.tarifas).toEqual([]);
  });
});

describe("esCentral — invariante 'una central' (feature 55/R3/R4/R6)", () => {
  it("crear segunda central: el repo reasigna y el service devuelve ok (sin filtrar P2002/500)", async () => {
    // ya existe otra central; el repo reasigna en su transaccion y devuelve la nueva central
    repo = buildRepo({
      findCentralZonaId: vi.fn().mockResolvedValue("z-old"),
      create: vi.fn().mockResolvedValue(resultadoCreate(dto({ id: "z-new", esCentral: true }))),
    });
    service = new ZonaService(repo);

    const r = await service.crear(crearInput({ esCentral: true }), MAESTRO);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.zona.esCentral).toBe(true); // R3
    // el flag esCentral=true se propaga tal cual al repo
    const arg = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.esCentral).toBe(true);
  });

  it("editar a central existiendo otra: el repo reasigna y el service devuelve ok", async () => {
    repo = buildRepo({
      findCentralZonaId: vi.fn().mockResolvedValue("z-old"),
      update: vi.fn().mockResolvedValue(resultadoUpdate(dto({ id: "z1", esCentral: true }))),
    });
    service = new ZonaService(repo);

    const r = await service.actualizar("z1", actualizarInput({ esCentral: true }), MAESTRO);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.zona.esCentral).toBe(true); // R3
  });

  it("⭑ 376/R12: `actor.usuarioId` llega al repo como SEGUNDO argumento de `create`", async () => {
    // Sin esto, las dos filas que produce crear una zona central quedarian firmadas por EL SISTEMA
    // (`resolverActorCongelado(tx, null)`) y el rastro no diria quien movio la marca.
    await service.crear(crearInput({ esCentral: true }), MAESTRO);
    expect((repo.create as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(MAESTRO.usuarioId);
  });

  it("crear con esCentral=false persiste false (R4)", async () => {
    repo = buildRepo({ create: vi.fn().mockResolvedValue(resultadoCreate(dto({ esCentral: false }))) });
    service = new ZonaService(repo);
    const r = await service.crear(crearInput({ esCentral: false }), MAESTRO);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.zona.esCentral).toBe(false);
    const arg = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.esCentral).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ SLT-75 (T4) — `distrito_en_otra_zona` sale por la rama `validation_error`, en `distritoIds`.
// ⚠️ Los textos esperados van ESCRITOS A MANO: son el contrato de R3 y R8. Generarlos con la misma
// funcion del servicio dejaria la asercion verde aunque el texto cambiara.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("SLT-75 — ZonaService: un distrito en otra zona es un error de validacion", () => {
  const CONFLICTOS_DESORDENADOS = [
    { distritoNombre: "Ñandú Sintético", zonaNombre: "Zona Norte" },
    { distritoNombre: "Árbol Sintético", zonaNombre: "Zona Sur" },
    { distritoNombre: "Nogal Sintético", zonaNombre: "Zona Este" },
  ];

  it("⭑ R2: `update` con `distrito_en_otra_zona` → validation_error en `distritoIds`", async () => {
    repo = buildRepo({
      update: vi.fn().mockResolvedValue({
        estado: "distrito_en_otra_zona",
        conflictos: [{ distritoNombre: "Árbol Sintético", zonaNombre: "Zona Sur" }],
      }),
    });
    service = new ZonaService(repo);

    const r = await service.actualizar("z1", actualizarInput(), MAESTRO);

    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: ["Árbol Sintético ya está en la zona Zona Sur."] },
    });
  });

  it("R1: `create` con `distrito_en_otra_zona` → validation_error en `distritoIds`", async () => {
    repo = buildRepo({
      create: vi.fn().mockResolvedValue({
        estado: "distrito_en_otra_zona",
        conflictos: [{ distritoNombre: "Árbol Sintético", zonaNombre: "Zona Sur" }],
      }),
    });
    service = new ZonaService(repo);

    const r = await service.crear(crearInput(), MAESTRO);

    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: ["Árbol Sintético ya está en la zona Zona Sur."] },
    });
  });

  it("⭑ R3: un mensaje por conflicto, con la forma exacta y ordenados por distrito", async () => {
    repo = buildRepo({
      update: vi
        .fn()
        .mockResolvedValue({ estado: "distrito_en_otra_zona", conflictos: CONFLICTOS_DESORDENADOS }),
    });
    service = new ZonaService(repo);

    const r = await service.actualizar("z1", actualizarInput(), MAESTRO);

    // Orden del español: «Á» va con la «A», y la «Ñ» va DESPUES de la «N».
    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: {
        distritoIds: [
          "Árbol Sintético ya está en la zona Zona Sur.",
          "Nogal Sintético ya está en la zona Zona Este.",
          "Ñandú Sintético ya está en la zona Zona Norte.",
        ],
      },
    });
  });

  it("⭑ R8: `conflictos: null` (lo paro el indice) → el mensaje de recargar, en `distritoIds`", async () => {
    repo = buildRepo({
      update: vi.fn().mockResolvedValue({ estado: "distrito_en_otra_zona", conflictos: null }),
      create: vi.fn().mockResolvedValue({ estado: "distrito_en_otra_zona", conflictos: null }),
    });
    service = new ZonaService(repo);
    const esperado = {
      status: "validation_error",
      fieldErrors: {
        distritoIds: [
          "Alguno de los elegidos acaba de asignarse a otra zona. Recarga la página y vuelve a intentarlo.",
        ],
      },
    };

    expect(await service.actualizar("z1", actualizarInput(), MAESTRO)).toEqual(esperado);
    expect(await service.crear(crearInput(), MAESTRO)).toEqual(esperado);
  });
});

/**
 * SLT-89 · R2, R4, R16, R36 (design §5.1, §5.5) — el «antes» obligatorio, el cambio concurrente y los
 * nodos que no son distritos, traducidos por el service.
 */
describe("SLT-89 — guardar una zona con nodos", () => {
  /** Un repositorio que FALLA si se le toca: el rechazo tiene que salir antes. */
  function repoQueFalla(): IZonaRepository {
    const falla = vi.fn(async () => {
      throw new Error("el repositorio no debia tocarse");
    });
    return buildRepo({
      update: falla,
      create: falla,
      countExistingDistritos: falla,
      countExistingVehiculos: falla,
    });
  }

  it("⭑ R16: actualizar sin `antes` → `validation_error` en `antes` y el repositorio no se toca", async () => {
    service = new ZonaService(repoQueFalla());
    const { antes: _antes, ...sinAntes } = actualizarInput();
    void _antes;
    const r = await service.actualizar("z1", sinAntes as unknown as ActualizarZonaInput, MAESTRO);
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["antes"]);
  });

  it("R36: un rol que no es maestro → `forbidden` antes de mirar el «antes» ni el repositorio", async () => {
    service = new ZonaService(repoQueFalla());
    for (const actor of NO_MAESTROS) {
      expect(await service.actualizar("z1", {} as ActualizarZonaInput, actor)).toEqual({ status: "forbidden" });
      expect(await service.crear(crearInput({ nodoIds: ["c1"] }), actor)).toEqual({ status: "forbidden" });
    }
  });

  it("⭑ R16: el «antes» y los nodos llegan al repositorio tal cual (los nodos sin repetidos)", async () => {
    const antes = { distritoIds: ["d1"], nodoIds: ["c1"] };
    await service.actualizar("z1", { ...actualizarInput(), nodoIds: ["c1", "c2", "c1"], antes }, MAESTRO);
    const datos = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(datos.antes).toEqual(antes);
    expect(datos.nodoIds).toEqual(["c1", "c2"]);
  });

  it("R38: sin nodos, el repositorio no recibe `nodoIds` (lo de hoy)", async () => {
    await service.actualizar("z1", actualizarInput(), MAESTRO);
    await service.crear(crearInput(), MAESTRO);
    expect((repo.update as ReturnType<typeof vi.fn>).mock.calls[0][1]).not.toHaveProperty("nodoIds");
    expect((repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty("nodoIds");
  });

  it("⭑ R16: `cambio_concurrente` del repositorio → `conflict` con motivo", async () => {
    repo = buildRepo({ update: vi.fn().mockResolvedValue({ estado: "cambio_concurrente" }) });
    service = new ZonaService(repo);
    expect(await service.actualizar("z1", actualizarInput(), MAESTRO)).toEqual({
      status: "conflict",
      motivo: "cambio_concurrente",
    });
  });

  it("⭑ R2: los nodos en otra zona se cuelgan de `nodoIds`, ordenados, con el mismo mensaje", async () => {
    const res = {
      estado: "distrito_en_otra_zona",
      conflictos: [],
      conflictosDeNodos: [
        { distritoNombre: "Zarcero", zonaNombre: "Norte" },
        { distritoNombre: "Alajuela", zonaNombre: "Centro" },
      ],
    };
    repo = buildRepo({ update: vi.fn().mockResolvedValue(res), create: vi.fn().mockResolvedValue(res) });
    service = new ZonaService(repo);
    const esperado = {
      status: "validation_error",
      fieldErrors: { nodoIds: ["Alajuela ya está en la zona Centro.", "Zarcero ya está en la zona Norte."] },
    };
    expect(await service.actualizar("z1", actualizarInput(), MAESTRO)).toEqual(esperado);
    expect(await service.crear(crearInput(), MAESTRO)).toEqual(esperado);
  });

  it("R4: un nodo que no existe o que es un distrito → `validation_error` en `nodoIds`", async () => {
    const res = { estado: "nodo_invalido", motivos: ["no_existe", "es_distrito"] };
    repo = buildRepo({ update: vi.fn().mockResolvedValue(res), create: vi.fn().mockResolvedValue(res) });
    service = new ZonaService(repo);
    const esperado = {
      status: "validation_error",
      fieldErrors: { nodoIds: ["uno o mas nodoIds no existen", "uno o mas nodoIds van en distritoIds"] },
    };
    expect(await service.actualizar("z1", actualizarInput(), MAESTRO)).toEqual(esperado);
    expect(await service.crear(crearInput(), MAESTRO)).toEqual(esperado);
  });
});

/** SLT-89 · R13, R36 (design §5.3, §7) — el aviso de impacto del guardado de nodos. */
describe("SLT-89 — impactoAsignacion", () => {
  const IMPACTO = {
    cambianDeZona: 3,
    cambianDeTarifa: 4,
    noSeMueven: { enBodegaSatelite: 2, conGestionFinal: 1, enCierre: 1 },
  };

  it("⭑ R36: un rol que no es maestro → `forbidden` sin tocar el repositorio", async () => {
    const falla = vi.fn(async () => {
      throw new Error("el repositorio no debia tocarse");
    });
    service = new ZonaService(buildRepo({ impactoDeAsignacion: falla }));
    for (const actor of NO_MAESTROS) {
      expect(await service.impactoAsignacion({ distritoIds: ["d1"], nodoIds: [] }, actor)).toEqual({ status: "forbidden" });
    }
    expect(falla).not.toHaveBeenCalled();
  });

  it("maestro: reenvia las cifras del repositorio tal cual, con los ids sin repetidos", async () => {
    repo = buildRepo({ impactoDeAsignacion: vi.fn().mockResolvedValue(IMPACTO) });
    service = new ZonaService(repo);
    const r = await service.impactoAsignacion({ zonaId: "z1", distritoIds: ["d1", "d1"], nodoIds: ["c1"] }, MAESTRO);
    expect(r).toEqual({ status: "ok", impacto: IMPACTO });
    expect(repo.impactoDeAsignacion).toHaveBeenCalledWith({ zonaId: "z1", distritoIds: ["d1"], nodoIds: ["c1"] });
  });

  it("sin `zonaId` pregunta por una zona nueva (`null`); la zona que no existe es `not_found`", async () => {
    repo = buildRepo({ impactoDeAsignacion: vi.fn().mockResolvedValue(null) });
    service = new ZonaService(repo);
    expect(await service.impactoAsignacion({ distritoIds: [], nodoIds: ["c1"] }, MAESTRO)).toEqual({ status: "not_found" });
    expect(repo.impactoDeAsignacion).toHaveBeenCalledWith({ zonaId: null, distritoIds: [], nodoIds: ["c1"] });
  });
});
