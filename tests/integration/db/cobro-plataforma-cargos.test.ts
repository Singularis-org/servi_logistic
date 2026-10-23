import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { handleCargaMasivaChunk } from "@/app/api/ordenes/carga-masiva/chunk/route";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { RawRow } from "@/lib/parsers/spreadsheet";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { ApiOrdenEliminacionService } from "@/lib/services/ApiOrdenEliminacionService";
import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import { EliminarOrdenService } from "@/lib/services/EliminarOrdenService";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";
import { RecuperarOrdenService } from "@/lib/services/RecuperarOrdenService";

import { comoApp, crearOrganizacion } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { deudaDe, movimientosDe, tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";

// SL-40 (design §11.1) — los cargos y reversos del cobro de la plataforma, contra Postgres.
//
// LAS VÍAS SON LAS DE LA APP, NO SQL A MANO. Hoy una orden nace por tres caminos, y los tres acaban
// en `OrdenRepository.createManyOrdenes` o `createManyOrdenesConGuia`:
//   · la pantalla de carga masiva, que el navegador manda en lotes a `handleCargaMasivaChunk`
//     (`app/api/ordenes/carga-masiva/chunk/route.ts`). Con una tienda sin fulfillment numera la
//     guía (`createManyOrdenesConGuia`). No hay otra creación por pantalla: `crearOrden` se borró el
//     2026-08-07 (`lib/actions/ordenes.ts`);
//   · la misma carga masiva (`BulkOrdenService.cargarMasiva`) con una tienda con fulfillment, que va
//     por la otra rama del repositorio (`createManyOrdenes`, sin guía);
//   · la API por API key (`BulkOrdenService.cargarViaApi`, el servicio que construye
//     `app/api/ordenes/api-key/carga/route.ts`).
// Se anula por pantalla con `EliminarOrdenService` (`lib/actions/eliminar-orden.ts`), por API con
// `ApiOrdenEliminacionService` (`app/api/ordenes/api-key/orden/[id]/route.ts`), y se recupera con
// `RecuperarOrdenService` (`lib/actions/recuperar-orden.ts`), cableados como en sus composition roots
// sobre el cliente EXTENDIDO y con la empresa fijada por `conEmpresa`, como haría la sesión.
//
// El valor global y la excepción se fijan como dueño, bajo el lock de `_fixtures/cobro-plataforma-40`:
// el repositorio del superadmin es de la tanda B (T5) y aquí es preparación, no lo que se mide.
//
// Lo que se mide se mide con el cliente BASE (dueño, sin extensión ni RLS). Las órdenes se commitean
// (los repositorios abren su propia transacción) y se limpian en el `afterAll`, acotado a las dos
// empresas de esta ejecución.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);

let base: PrismaClient;
let app: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;

interface Geo {
  provinciaId: string;
  provincia: string;
  cantonId: string;
  canton: string;
  distritoId: string;
  distrito: string;
}

interface Empresa {
  id: string;
  maestro: Actor;
  /** Tienda sin fulfillment: sus órdenes nacen con guía. */
  tienda: Actor;
  /** Tienda con fulfillment: sus órdenes nacen en bodega y sin guía. */
  tiendaFulfillment: Actor;
  zonaId: string;
  geo: Geo;
}

let A: Empresa;
let B: Empresa;
let estatus: { porRecolectar: string; enBodegaCentral: string; devolviendo: string };
/** id de cada orden por su nombre en design §2.5. */
const orden: Record<string, string> = {};

/* -------------------------------------------------------------------------- */
/* Siembra (cliente base, empresa explícita en cada fila)                      */
/* -------------------------------------------------------------------------- */

async function sembrarEmpresa(letra: "A" | "B", geo: Geo): Promise<Empresa> {
  const organizacionId = (await crearOrganizacion(base, { nombre: `SL40 ${letra} ${RUN}` })).id;
  const roles = await base.rol.findMany({ select: { id: true, value: true } });
  const rolDe = (v: string) => {
    const r = roles.find((x) => x.value === v);
    if (r === undefined) throw new Error(`falta el rol «${v}»: corre \`pnpm run db:seed\``);
    return r.id;
  };
  const tipo = await base.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const usuario = async (rol: string, prefijo: string, fulfillment = false) =>
    (
      await base.usuario.create({
        data: {
          nombre: `${prefijo} ${letra} ${RUN}`,
          email: `sl40-${prefijo.toLowerCase()}-${letra.toLowerCase()}-${RUN}@ejemplo.test`,
          telefono: "88880000",
          passwordHash: "x",
          cedula: `SL40-${prefijo}-${letra}-${RUN}`,
          tipoIdentificacionId: tipo.id,
          rolId: rolDe(rol),
          estado: "activo",
          fulfillment,
          organizacionId,
        },
        select: { id: true },
      })
    ).id;
  const maestro = await usuario("maestro", "Maestro");
  const tienda = await usuario("adminTienda", "Tienda");
  const tiendaFulfillment = await usuario("adminTienda", "Bodega", true);
  const zona = await base.zona.create({
    data: { nombre: `Zona SL40 ${letra} ${RUN}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId },
    select: { id: true },
  });
  await base.zonaDistrito.create({ data: { zonaId: zona.id, distritoId: geo.distritoId, organizacionId } });
  // La API exige tarifa por (tienda, zona): sin ella la fila sale «sin tarifa» y no se crea.
  await base.tarifa.create({
    data: {
      valorFlete: "2000.00",
      valorFleteDevuelto: "1000.00",
      valorFleteGam: "2000.00",
      valorFleteDevueltoGam: "1000.00",
      comisionCod: "0.00",
      ivaFlete: "0.00",
      ivaComisionCod: "0.00",
      tiendaId: tienda,
      zonaId: zona.id,
      organizacionId,
    },
  });
  return {
    id: organizacionId,
    maestro: { usuarioId: maestro, rol: "maestro", organizacionId },
    tienda: { usuarioId: tienda, rol: "adminTienda", organizacionId },
    tiendaFulfillment: { usuarioId: tiendaFulfillment, rol: "adminTienda", organizacionId },
    zonaId: zona.id,
    geo,
  };
}

/* -------------------------------------------------------------------------- */
/* Las vías de la app, cableadas como en sus composition roots                 */
/* -------------------------------------------------------------------------- */

function ordenRepo(): OrdenRepository {
  return new OrdenRepository(app);
}

function historial(repo: OrdenRepository): OrdenHistorialService {
  return new OrdenHistorialService(
    repo,
    new OrdenHistorialRepository(app),
    new OrdenDiaRepartoCambioRepository(app),
    new OrdenTraspasoRepository(app),
  );
}

function bulk(): BulkOrdenService {
  return new BulkOrdenService(ordenRepo(), new TarifaVigenteRepository(app));
}

function filaPantalla(numRemision: string, g: Geo): RawRow {
  return {
    num_remision: numRemision,
    destinatario: `Cliente SL40 ${RUN}`,
    telefono: "88887777",
    provincia: g.provincia,
    canton_distrito: `${g.canton} (${g.distrito})`,
    direccion: "",
    producto: "Caja",
    notas: "",
    monto_cobrar: "",
  };
}

/** Busca la orden recién creada por su remisión, dentro de la empresa. */
async function idDe(e: Empresa, numRemision: string): Promise<string> {
  return (await base.orden.findFirstOrThrow({ where: { numRemision, organizacionId: e.id }, select: { id: true } })).id;
}

/** Vía 1: la pantalla de carga masiva, por su route handler (tienda sin fulfillment, con guía). */
async function crearPorPantalla(e: Empresa, nombre: string): Promise<string> {
  const numRemision = `SL40-${nombre}-${RUN}`;
  const req = new Request("http://localhost/api/ordenes/carga-masiva/chunk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rows: [filaPantalla(numRemision, e.geo)] }),
  });
  const res = await conEmpresa(e.id, () => handleCargaMasivaChunk(req, { getActor: async () => e.tienda, bulkService: bulk() }));
  const cuerpo = (await res.json()) as { creadas?: number; filas?: unknown };
  expect(res.status, JSON.stringify(cuerpo)).toBe(200);
  expect(cuerpo.creadas, JSON.stringify(cuerpo.filas)).toBe(1);
  return idDe(e, numRemision);
}

/** Vía 2: la carga masiva con una tienda con fulfillment (rama `createManyOrdenes`, sin guía). */
async function crearPorCargaMasiva(e: Empresa, nombre: string): Promise<string> {
  const numRemision = `SL40-${nombre}-${RUN}`;
  const r = await conEmpresa(e.id, () => bulk().cargarMasiva([filaPantalla(numRemision, e.geo)], e.tiendaFulfillment));
  expect(r.status).toBe("ok");
  if (r.status !== "ok") throw new Error(`cargarMasiva devolvio ${r.status}`);
  expect(r.summary.creadas, JSON.stringify(r.summary.filas)).toBe(1);
  return idDe(e, numRemision);
}

/** El actor de la API key: la tienda real a la que apunta la key (ficha 302). */
const actorApi = (e: Empresa): Actor => ({ usuarioId: e.tienda.usuarioId, rol: "apiKey", organizacionId: e.id });

/** Vía 3: la API por API key (`cargarViaApi`, con guía). */
async function crearPorApi(e: Empresa, nombre: string): Promise<string> {
  const numRemision = `SL40-${nombre}-${RUN}`;
  const fila = {
    num_remision: numRemision,
    destinatario: `Cliente SL40 ${RUN}`,
    telefono: "88887777",
    producto: "Caja",
    provincia: e.geo.provincia,
    canton: e.geo.canton,
    distrito: e.geo.distrito,
  };
  const r = await conEmpresa(e.id, () => bulk().cargarViaApi([fila] as unknown as RawRow[], actorApi(e)));
  expect(r.status).toBe("ok");
  if (r.status !== "ok") throw new Error(`cargarViaApi devolvio ${r.status}`);
  expect(r.summary.creadas, JSON.stringify(r.summary.filas)).toBe(1);
  return idDe(e, numRemision);
}

function eliminarPorPantalla(e: Empresa, ordenId: string) {
  const repo = ordenRepo();
  return conEmpresa(e.id, () => new EliminarOrdenService(repo, historial(repo)).eliminar({ ordenIds: [ordenId] }, e.maestro));
}

function eliminarPorApi(e: Empresa, ordenId: string) {
  const repo = ordenRepo();
  return conEmpresa(e.id, () => new ApiOrdenEliminacionService(repo, historial(repo)).eliminar(actorApi(e), ordenId));
}

function recuperar(e: Empresa, ordenId: string) {
  return conEmpresa(e.id, () => new RecuperarOrdenService(ordenRepo()).recuperar({ ordenIds: [ordenId] }, e.maestro));
}

/* -------------------------------------------------------------------------- */
/* Lecturas como dueño                                                         */
/* -------------------------------------------------------------------------- */

const cargo = (monto: string, fuente: string, secuencia: number) => ({ tipo: "cargo", fuente, monto, secuencia });
const reverso = (monto: string, fuente: string, secuencia: number) => ({ tipo: "reverso", fuente, monto, secuencia });

/** Una fila completa de un movimiento, para comprobar que nadie la reescribe. */
function filaCompleta(ordenId: string, secuencia: number) {
  return base.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT "id", "organizacion_id", "tipo"::text, "fuente"::text, "monto"::text, "ocurrido_at", "created_at"
       FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1 AND "secuencia" = $2`,
    ordenId,
    secuencia,
  );
}

/** SQLSTATE de un error de Prisma con driver adapter («Code: `42501`») o de `pg` (`code`). */
function sqlstateDe(error: unknown): string {
  const texto = JSON.stringify(error, Object.getOwnPropertyNames(error as object)) + String((error as Error)?.message ?? "");
  const conCode = /Code: `([0-9A-Z]{5})`/.exec(texto) ?? /"code":"([0-9A-Z]{5})"/.exec(texto);
  return conCode?.[1] ?? `?? ${String((error as Error)?.message ?? error).replace(/\s+/g, " ").slice(0, 160)}`;
}

class Revertir extends Error {
  constructor(readonly valor: unknown = null) {
    super("rollback deliberado del test");
  }
}

/** Corre `sql` en su propia transacción revertida, como `servi_app` con la empresa fijada. */
async function intentarComoEmpresa(organizacionId: string, sql: string, ...args: unknown[]): Promise<string | null> {
  return base
    .$transaction(async (tx) => {
      await comoApp(tx, organizacionId);
      await tx.$executeRawUnsafe(sql, ...args);
      throw new Revertir(null);
    })
    .catch((e: unknown) => (e instanceof Revertir ? null : sqlstateDe(e)));
}

/* -------------------------------------------------------------------------- */

describeSiHayBase("SL-40 — cargos y reversos del cobro de la plataforma por orden (Postgres)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    // Sin sesión: la empresa solo puede venir de `conEmpresa`.
    app = conAislamientoPorEmpresa(base, async () => null);

    const estados = await base.orderStatus.findMany({
      where: { value: { in: ["por_recolectar_en_tienda", "en_bodega_central", "devolviendo_a_tienda"] } },
      select: { id: true, value: true },
    });
    const id = (v: string) => {
      const e = estados.find((x) => x.value === v);
      if (e === undefined) throw new Error(`falta el estatus «${v}»: corre \`pnpm run db:seed\``);
      return e.id;
    };
    estatus = {
      porRecolectar: id("por_recolectar_en_tienda"),
      enBodegaCentral: id("en_bodega_central"),
      devolviendo: id("devolviendo_a_tienda"),
    };

    // Dos distritos sin zona de NADIE (otra zona en el mismo distrito cambiaría la resolución de la
    // carga) y sin paréntesis (la plantilla los usa de separador).
    const distritos = await base.distrito.findMany({
      where: {
        activo: true,
        zonas: { none: {} },
        NOT: [{ nombre: { contains: "(" } }, { canton: { nombre: { contains: "(" } } }],
        canton: { activo: true, provincia: { activo: true } },
      },
      select: { id: true, nombre: true, canton: { select: { id: true, nombre: true, provincia: { select: { id: true, nombre: true } } } } },
      orderBy: { id: "desc" },
      take: 2,
    });
    if (distritos.length < 2) throw new Error("faltan distritos libres en la base: aplica las migraciones");
    const [geoA, geoB] = distritos.map(
      (d): Geo => ({
        provinciaId: d.canton.provincia.id,
        provincia: d.canton.provincia.nombre,
        cantonId: d.canton.id,
        canton: d.canton.nombre,
        distritoId: d.id,
        distrito: d.nombre,
      }),
    );

    tarifaGlobal = await tomarTarifaGlobal();
    await bajoLockDeEscrituraReal(async () => {
      A = await sembrarEmpresa("A", geoA);
      B = await sembrarEmpresa("B", geoB);
    });
  }, 120_000);

  afterAll(async () => {
    if (base === undefined) return;
    const orgs = [A?.id, B?.id].filter((x): x is string => typeof x === "string");
    if (orgs.length > 0) {
      // En el orden que piden las FK. Los movimientos se van con su orden (ON DELETE CASCADE).
      await bajoLockDeEscrituraReal(async () => {
        for (const tabla of [
          "historial_accion",
          "orden_historial_estado",
          "jobs",
          "orden",
          "carga",
          "tarifas",
          "zona_distrito",
          "zona",
          "usuario",
          "organizacion",
        ]) {
          const columna = tabla === "organizacion" ? "id" : "organizacion_id";
          await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "${columna}" = ANY($1::text[])`, orgs);
        }
      });
    }
    await tarifaGlobal?.soltar();
    await base.$disconnect();
  }, 120_000);

  /* ------------------------- control de no vacuidad ------------------------ */

  it("control: los dos triggers están instalados en «orden» y las empresas existen", async () => {
    const triggers = await base.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = '"orden"'::regclass AND NOT tgisinternal
         AND tgname IN ('cobro_plataforma_al_crear_orden', 'cobro_plataforma_al_cambiar_borrado') ORDER BY tgname`,
    );
    expect(triggers.map((t) => t.tgname)).toEqual(["cobro_plataforma_al_cambiar_borrado", "cobro_plataforma_al_crear_orden"]);
    expect(await base.organizacion.count({ where: { id: { in: [A.id, B.id] } } })).toBe(2);
  });

  /* ------------------------------ R3 / D11 -------------------------------- */

  it("R3/D11: sin valor global ni excepción, la orden se carga con 0.00 y fuente «sin_configurar»", async () => {
    await tarifaGlobal!.fijar(null);
    orden.o0 = await crearPorPantalla(A, "o0");
    expect(await movimientosDe(base, orden.o0)).toEqual([cargo("0.00", "sin_configurar", 1)]);
    expect(await deudaDe(base, A.id)).toBe("0.00");
  });

  /* --------------------------- §2.5, paso a paso --------------------------- */

  it("R12/R19: A crea o1 y o2 por pantalla y o3 por carga masiva con el global en 500.00 → tres cargos de 500.00", async () => {
    await tarifaGlobal!.fijar("500.00");
    await base.$executeRawUnsafe(`UPDATE "organizacion" SET "cobro_plataforma_por_orden" = 300.00 WHERE "id" = $1`, B.id);

    orden.o1 = await crearPorPantalla(A, "o1");
    orden.o2 = await crearPorPantalla(A, "o2");
    orden.o3 = await crearPorCargaMasiva(A, "o3");

    // La vía de o3 no numera guía: es la otra rama del repositorio.
    expect((await base.orden.findUniqueOrThrow({ where: { id: orden.o3 }, select: { numGuia: true } })).numGuia).toBeNull();
    expect((await base.orden.findUniqueOrThrow({ where: { id: orden.o1 }, select: { numGuia: true } })).numGuia).not.toBeNull();
    for (const o of [orden.o1, orden.o2, orden.o3]) {
      expect(await movimientosDe(base, o)).toEqual([cargo("500.00", "global", 1)]);
    }
    expect(await deudaDe(base, A.id)).toBe("1500.00");
    expect(await deudaDe(base, B.id)).toBe("0.00");
  });

  it("R3/R20: B crea p1 con su excepción de 300.00 → cargo de 300.00 con fuente «empresa», sin tocar a A", async () => {
    orden.p1 = await crearPorPantalla(B, "p1");
    expect(await movimientosDe(base, orden.p1)).toEqual([cargo("300.00", "empresa", 1)]);
    expect(await deudaDe(base, A.id)).toBe("1500.00");
    expect(await deudaDe(base, B.id)).toBe("300.00");
  });

  it("R14: el superadmin sube el global a 600.00 → los cargos ya registrados no cambian", async () => {
    const antes = await filaCompleta(orden.o1, 1);
    await tarifaGlobal!.fijar("600.00");
    expect(await filaCompleta(orden.o1, 1)).toEqual(antes);
    expect(await deudaDe(base, A.id)).toBe("1500.00");
    expect(await deudaDe(base, B.id)).toBe("300.00");
  });

  it("R12/R14: A crea o4 por la API → cargo de 600.00 (la tarifa de ese instante)", async () => {
    orden.o4 = await crearPorApi(A, "o4");
    expect(await movimientosDe(base, orden.o4)).toEqual([cargo("600.00", "global", 1)]);
    expect(await deudaDe(base, A.id)).toBe("2100.00");
  });

  it("R15: A elimina o1 por pantalla → reverso de 500.00 con el instante del borrado, y el cargo queda igual", async () => {
    const cargoAntes = await filaCompleta(orden.o1, 1);
    const r = await eliminarPorPantalla(A, orden.o1);
    expect(r.status).toBe("ok");

    expect(await movimientosDe(base, orden.o1)).toEqual([cargo("500.00", "global", 1), reverso("500.00", "global", 2)]);
    expect(await filaCompleta(orden.o1, 1)).toEqual(cargoAntes);
    const { deletedAt } = await base.orden.findUniqueOrThrow({ where: { id: orden.o1 }, select: { deletedAt: true } });
    const [rev] = await filaCompleta(orden.o1, 2);
    expect(deletedAt).not.toBeNull();
    expect(rev.ocurrido_at).toEqual(deletedAt);
    expect(await deudaDe(base, A.id)).toBe("1600.00");
  });

  it("R17: eliminar o1 otra vez (servicio, repositorio y una fecha de borrado reescrita) no registra nada", async () => {
    const r = await eliminarPorPantalla(A, orden.o1);
    expect(r.status).toBe("conflict");
    const n = await conEmpresa(A.id, () => ordenRepo().softDelete({ ids: [orden.o1], ownerId: null, actorUsuarioId: A.maestro.usuarioId }));
    expect(n).toBe(0);
    // Un escritor que reescribiera la fecha de una orden ya borrada: el trigger se dispara (cambia
    // `deleted_at`) y el último movimiento, un reverso, es lo que impide el segundo.
    await base.$executeRawUnsafe(`UPDATE "orden" SET "deleted_at" = "deleted_at" + interval '1 minute' WHERE "id" = $1`, orden.o1);

    expect(await movimientosDe(base, orden.o1)).toEqual([cargo("500.00", "global", 1), reverso("500.00", "global", 2)]);
    expect(await deudaDe(base, A.id)).toBe("1600.00");
  });

  it("R16: el maestro recupera o1 → cargo nuevo de 500.00 (no la tarifa de hoy, 600.00)", async () => {
    const r = await recuperar(A, orden.o1);
    expect(r).toEqual({ status: "ok", recuperadas: 1 });
    expect(await movimientosDe(base, orden.o1)).toEqual([
      cargo("500.00", "global", 1),
      reverso("500.00", "global", 2),
      cargo("500.00", "global", 3),
    ]);
    expect(await deudaDe(base, A.id)).toBe("2100.00");
  });

  it("R17: recuperar o1 otra vez no registra nada", async () => {
    const r = await recuperar(A, orden.o1);
    expect(r.status).toBe("conflict");
    expect(await movimientosDe(base, orden.o1)).toHaveLength(3);
    expect(await deudaDe(base, A.id)).toBe("2100.00");
  });

  it("R15: A elimina o2 por la API → reverso de 500.00", async () => {
    const r = await eliminarPorApi(A, orden.o2);
    expect(r.status).toBe("ok");
    expect(await movimientosDe(base, orden.o2)).toEqual([cargo("500.00", "global", 1), reverso("500.00", "global", 2)]);
    const { deletedAt } = await base.orden.findUniqueOrThrow({ where: { id: orden.o2 }, select: { deletedAt: true } });
    const [rev] = await filaCompleta(orden.o2, 2);
    expect(rev.ocurrido_at).toEqual(deletedAt);
    expect(await deudaDe(base, A.id)).toBe("1600.00");
    expect(await deudaDe(base, B.id)).toBe("300.00");
  });

  it("P3/D6: la cancelación por API no es una anulación → o4 conserva su cargo, sin reverso", async () => {
    await base.orden.update({ where: { id: orden.o4 }, data: { estatusId: estatus.enBodegaCentral } });
    const { numGuia } = await base.orden.findUniqueOrThrow({ where: { id: orden.o4 }, select: { numGuia: true } });
    const r = await conEmpresa(A.id, () =>
      ordenRepo().cancelarViaApi({ numGuia: numGuia!, ownerId: A.tienda.usuarioId, devueltaOrigenEstatusId: estatus.devolviendo }),
    );
    expect(r.status).toBe("ok");
    expect(await movimientosDe(base, orden.o4)).toEqual([cargo("600.00", "global", 1)]);
    expect(await deudaDe(base, A.id)).toBe("1600.00");
  });

  it("R3/R5: quitada la excepción de B, su orden siguiente usa el global (600.00)", async () => {
    await base.$executeRawUnsafe(`UPDATE "organizacion" SET "cobro_plataforma_por_orden" = NULL WHERE "id" = $1`, B.id);
    orden.p2 = await crearPorPantalla(B, "p2");
    expect(await movimientosDe(base, orden.p2)).toEqual([cargo("600.00", "global", 1)]);
    expect(await movimientosDe(base, orden.p1)).toEqual([cargo("300.00", "empresa", 1)]);
    expect(await deudaDe(base, B.id)).toBe("900.00");
  });

  /* ---------------------------------- R13 --------------------------------- */

  it("R13: una transacción que crea una orden y no se confirma no deja cargo (dentro sí lo había)", async () => {
    const numRemision = `SL40-r13-${RUN}`;
    let creada: string | undefined;
    let dentro: number | undefined;
    const r = await conEmpresa(A.id, () =>
      app.$transaction(async (tx) => {
        const o = await tx.orden.create({
          data: {
            numRemision,
            estatusId: estatus.porRecolectar,
            destinatario: "R13",
            telefonoDest: "88887777",
            tiendaId: A.tienda.usuarioId,
            zonaId: A.zonaId,
            provinciaId: A.geo.provinciaId,
            cantonId: A.geo.cantonId,
            distritoId: A.geo.distritoId,
            producto: "Caja",
          },
          select: { id: true },
        });
        creada = o.id;
        const filas = await tx.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`,
          o.id,
        );
        dentro = filas[0].n;
        throw new Revertir();
      }),
    ).catch((e: unknown) => e);

    expect(r).toBeInstanceOf(Revertir);
    expect(creada).toBeDefined();
    // Control: el trigger corrió dentro de la transacción. Sin esto, «cero después» no probaría nada.
    expect(dentro).toBe(1);
    expect(await base.orden.count({ where: { id: creada } })).toBe(0);
    expect(await movimientosDe(base, creada!)).toEqual([]);
  });

  /* ---------------------------------- R18 --------------------------------- */

  it("R18: una orden sin cargo (anterior a la ficha) se elimina y se recupera sin registrar nada", async () => {
    const o = await base.orden.create({
      data: {
        numRemision: `SL40-r18-${RUN}`,
        estatusId: estatus.porRecolectar,
        destinatario: "R18",
        telefonoDest: "88887777",
        tiendaId: A.tienda.usuarioId,
        zonaId: A.zonaId,
        provinciaId: A.geo.provinciaId,
        cantonId: A.geo.cantonId,
        distritoId: A.geo.distritoId,
        producto: "Caja",
        organizacionId: A.id,
      },
      select: { id: true },
    });
    // Así queda una orden de antes de la ficha: viva y sin ningún movimiento.
    await base.$executeRawUnsafe(`DELETE FROM "cobro_plataforma_movimiento" WHERE "orden_id" = $1`, o.id);
    expect(await movimientosDe(base, o.id)).toEqual([]);
    const deuda = await deudaDe(base, A.id);

    expect((await eliminarPorPantalla(A, o.id)).status).toBe("ok");
    expect((await base.orden.findUniqueOrThrow({ where: { id: o.id }, select: { deletedAt: true } })).deletedAt).not.toBeNull();
    expect(await movimientosDe(base, o.id)).toEqual([]);

    expect(await recuperar(A, o.id)).toEqual({ status: "ok", recuperadas: 1 });
    expect(await movimientosDe(base, o.id)).toEqual([]);
    expect(await deudaDe(base, A.id)).toBe(deuda);
  });

  /* ---------------------------------- R8 ---------------------------------- */

  it("R8: la empresa (servi_app) no puede escribir cargos, ni el valor global, ni su excepción → 42501", async () => {
    const r = {
      insertarMovimiento: await intentarComoEmpresa(
        A.id,
        `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
         VALUES (gen_random_uuid()::text, $1, $2, 99, 'reverso', 'global', 1000.00, now())`,
        A.id,
        orden.o3,
      ),
      actualizarMovimiento: await intentarComoEmpresa(
        A.id,
        `UPDATE "cobro_plataforma_movimiento" SET "monto" = 0 WHERE "organizacion_id" = $1`,
        A.id,
      ),
      borrarMovimiento: await intentarComoEmpresa(A.id, `DELETE FROM "cobro_plataforma_movimiento" WHERE "organizacion_id" = $1`, A.id),
      insertarTarifa: await intentarComoEmpresa(
        A.id,
        `INSERT INTO "cobro_plataforma_tarifa" ("id", "monto") VALUES (true, 0) ON CONFLICT ("id") DO UPDATE SET "monto" = 0`,
      ),
      actualizarTarifa: await intentarComoEmpresa(A.id, `UPDATE "cobro_plataforma_tarifa" SET "monto" = 0`),
      actualizarExcepcion: await intentarComoEmpresa(
        A.id,
        `UPDATE "organizacion" SET "cobro_plataforma_por_orden" = 0 WHERE "id" = $1`,
        A.id,
      ),
    };
    expect(r).toEqual({
      insertarMovimiento: "42501",
      actualizarMovimiento: "42501",
      borrarMovimiento: "42501",
      insertarTarifa: "42501",
      actualizarTarifa: "42501",
      actualizarExcepcion: "42501",
    });
    // Control: la empresa SÍ lee sus cargos (la política la deja). Si no pudiera ni leer, el 42501 de
    // arriba podría venir de otro sitio.
    const leidos = await base.$transaction(async (tx) => {
      await comoApp(tx, A.id);
      return tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "cobro_plataforma_movimiento"`);
    });
    expect(leidos[0].n).toBeGreaterThan(0);
  });

  /* ---------------------------------- R20 --------------------------------- */

  it("R20: cada movimiento lleva la empresa de su orden, y un cargo de A con una orden de B → SL017", async () => {
    const [{ total, cruzados }] = await base.$queryRawUnsafe<{ total: number; cruzados: number }[]>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE m."organizacion_id" <> o."organizacion_id")::int AS cruzados
         FROM "cobro_plataforma_movimiento" m JOIN "orden" o ON o."id" = m."orden_id"
        WHERE m."organizacion_id" = ANY($1::text[]) OR o."organizacion_id" = ANY($1::text[])`,
      [A.id, B.id],
    );
    expect(total).toBeGreaterThan(0);
    expect(cruzados).toBe(0);

    // Como dueño (sin RLS): el rechazo solo puede venir del trigger de misma empresa.
    const intento = await base
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO "cobro_plataforma_movimiento" ("id", "organizacion_id", "orden_id", "secuencia", "tipo", "fuente", "monto", "ocurrido_at")
           VALUES (gen_random_uuid()::text, $1, $2, 99, 'cargo', 'global', 1.00, now())`,
          A.id,
          orden.p1,
        );
        throw new Revertir();
      })
      .catch((e: unknown) => (e instanceof Revertir ? "insertado" : sqlstateDe(e)));
    expect(intento).toBe("SL017");
  });

  /* ---------------------------------- R24 --------------------------------- */

  it("R24: B (servi_app, por la RLS y por la extensión) ve sus cargos y ninguno de A", async () => {
    const deA = [orden.o0, orden.o1, orden.o2, orden.o3, orden.o4];
    expect((await base.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "cobro_plataforma_movimiento" WHERE "orden_id" = ANY($1::text[])`,
      deA,
    ))[0].n).toBeGreaterThan(0);

    const porRls = await base.$transaction(async (tx) => {
      await comoApp(tx, B.id);
      return tx.$queryRawUnsafe<{ organizacion_id: string; n: number }[]>(
        `SELECT "organizacion_id", count(*)::int AS n FROM "cobro_plataforma_movimiento" GROUP BY 1`,
      );
    });
    expect(porRls).toEqual([{ organizacion_id: B.id, n: 2 }]);

    const porExtension = await conEmpresa(B.id, () =>
      app.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "cobro_plataforma_movimiento" WHERE "orden_id" = ANY($1::text[])`,
        deA,
      ),
    );
    expect(porExtension[0].n).toBe(0);
  });
});
