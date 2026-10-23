import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomInt, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { OrdenService } from "@/lib/services/OrdenService";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";
import { EliminarOrdenService } from "@/lib/services/EliminarOrdenService";
import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import { MSG_ORDEN_NO_EXISTE } from "@/lib/services/mensajes-eliminar-orden";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { listarOrdenesSchema } from "@/lib/types/orden";
import type { RawRow } from "@/lib/parsers/spreadsheet";

import { crearOrganizacion } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";

// SL-17 / T3.1 (design §9.2) — R28, R7, R8 y R9 con DOS empresas con datos, contra Postgres.
//
// Las piezas son las de la app: `OrdenRepository`, `OrdenService`, `EliminarOrdenService` y
// `BulkOrdenService`, cableados como en `lib/actions/ordenes.ts` y `lib/actions/eliminar-orden.ts`,
// sobre el cliente EXTENDIDO (`conAislamientoPorEmpresa`, el mismo que devuelve
// `getPrismaClient()`), y con la empresa B fijada por `conEmpresa` como haria la sesion. Lo que
// se mide se mide con el cliente BASE (dueno de las tablas, sin extension ni RLS): ve todo lo
// que de verdad quedo en la base.
//
// POR QUE COMMITEA Y NO VA EN UNA TRANSACCION REVERTIDA: los repositorios abren su propia
// `$transaction`, y la envoltura de la extension baja cada operacion a `servi_app` en SU
// transaccion. Meterlo todo en la del test cambiaria justo lo que se quiere medir. El precio es
// limpiar a mano (`afterAll`), acotado a las dos empresas de esta ejecucion.
//
// DOS CAPAS: el filtro de la extension (design §6.2) y la RLS que activa su envoltura (§6.3).
// En las lecturas y escrituras de modelo cualquiera de las dos basta; el SQL a mano de
// `softDelete` y el `include` de zonas de la carga masiva solo los cubre la RLS. La evidencia de
// que el test ve la fuga cuando faltan esta en `progress/impl_SL-17.md` (T3.1).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
// Token comun a las dos empresas: una busqueda por texto que casa en A y en B a la vez. Si B
// trajera algo de A, saldria aqui.
const TOKEN = `tok${RUN}`;

let base: PrismaClient;
let app: PrismaClient;

interface Empresa {
  id: string;
  maestro: Actor;
  tiendaId: string;
  zonaId: string;
  ordenes: { id: string; numGuia: number; numRemision: string }[];
}

let A: Empresa;
let B: Empresa;
interface Geo {
  provinciaId: string;
  provincia: string;
  cantonId: string;
  canton: string;
  distritoId: string;
  distrito: string;
}
// Tres distritos del catalogo: uno que las DOS empresas tienen en su zona (como pasara en
// produccion: dos empresas que reparten en la misma ciudad) y uno propio de cada una.
let geo: { comun: Geo; soloA: Geo; soloB: Geo };
let estatusInicialId: string;

/* -------------------------------------------------------------------------- */
/* Siembra (cliente base, empresa explicita en cada fila)                      */
/* -------------------------------------------------------------------------- */

async function sembrarEmpresa(letra: "A" | "B"): Promise<Empresa> {
  const organizacionId = (await crearOrganizacion(base, { nombre: `T31 ${letra} ${RUN}` })).id;
  const roles = await base.rol.findMany({ select: { id: true, value: true } });
  const rolDe = (v: string) => {
    const r = roles.find((x) => x.value === v);
    if (r === undefined) throw new Error(`falta el rol «${v}»: corre \`pnpm run db:seed\``);
    return r.id;
  };
  const tipo = await base.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const usuario = (rol: string, prefijo: string) =>
    base.usuario.create({
      data: {
        nombre: `${prefijo} ${letra} ${RUN}`,
        email: `${prefijo.toLowerCase()}-${letra.toLowerCase()}-${RUN}@ejemplo.test`,
        telefono: "88880000",
        passwordHash: "x",
        cedula: `T31-${prefijo}-${letra}-${RUN}`,
        tipoIdentificacionId: tipo.id,
        rolId: rolDe(rol),
        estado: "activo",
        organizacionId,
      },
      select: { id: true },
    });
  const maestro = await usuario("maestro", "Maestro");
  const tienda = await usuario("adminTienda", "Tienda");
  const zona = await base.zona.create({
    data: { nombre: `Zona T31 ${letra} ${RUN}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId },
    select: { id: true },
  });
  const propio = letra === "A" ? geo.soloA : geo.soloB;
  await base.zonaDistrito.createMany({
    data: [geo.comun, propio].map((g) => ({ zonaId: zona.id, distritoId: g.distritoId, organizacionId })),
  });

  const ordenes: Empresa["ordenes"] = [];
  for (let i = 1; i <= 2; i += 1) {
    const numRemision = `T31-${letra}${i}-${RUN}`;
    const numGuia = 1_500_000_000 + randomInt(0, 600_000_000);
    const o = await base.orden.create({
      data: {
        numRemision,
        numGuia,
        estatusId: estatusInicialId,
        destinatario: `Cliente ${TOKEN} ${letra}${i}`,
        telefonoDest: "88887777",
        tiendaId: tienda.id,
        zonaId: zona.id,
        provinciaId: propio.provinciaId,
        cantonId: propio.cantonId,
        distritoId: propio.distritoId,
        producto: "Caja",
        organizacionId,
      },
      select: { id: true },
    });
    ordenes.push({ id: o.id, numGuia, numRemision });
  }
  return {
    id: organizacionId,
    maestro: { usuarioId: maestro.id, rol: "maestro", organizacionId },
    tiendaId: tienda.id,
    zonaId: zona.id,
    ordenes,
  };
}

/** La fila completa, leida como dueno: lo que de verdad hay en la base. */
function filaDe(id: string) {
  return base.orden.findUniqueOrThrow({ where: { id } });
}

/** Ordenes de A en la base, con todas sus columnas. */
async function ordenesDeA() {
  return base.orden.findMany({ where: { organizacionId: A.id }, orderBy: { id: "asc" } });
}

/* -------------------------------------------------------------------------- */
/* Las piezas de la app, cableadas como en sus composition roots               */
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

function ordenService(): OrdenService {
  const repo = ordenRepo();
  return new OrdenService(repo, historial(repo));
}

function eliminarService(): EliminarOrdenService {
  const repo = ordenRepo();
  return new EliminarOrdenService(repo, historial(repo));
}

function bulkService(): BulkOrdenService {
  return new BulkOrdenService(ordenRepo(), new TarifaVigenteRepository(app));
}

/** Lo que B ve en el listado de `/ordenes` para un termino (o sin termino). */
async function listarComoB(q?: string): Promise<string[]> {
  const input = listarOrdenesSchema.parse({ pageSize: 100, ...(q !== undefined ? { filter: { q } } : {}) });
  const r = await conEmpresa(B.id, () => ordenService().listar(input, B.maestro));
  if (r.status !== "ok") throw new Error(`listar devolvio ${r.status}`);
  return r.items.map((o) => o.id).sort();
}

function fila(numRemision: string, g: Geo): RawRow {
  return {
    num_remision: numRemision,
    destinatario: `Nueva ${TOKEN}`,
    telefono: "88887777",
    provincia: g.provincia,
    canton_distrito: `${g.canton} (${g.distrito})`,
    direccion: "",
    producto: "Caja",
    notas: "",
    monto_cobrar: "",
  };
}

const ids = (e: Empresa) => e.ordenes.map((o) => o.id).sort();

/* -------------------------------------------------------------------------- */

describeSiHayBase("SL-17 — aislamiento de órdenes entre dos empresas (Postgres)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    // Sin sesion: la empresa solo puede venir de `conEmpresa`. Fuera de el, todo falla cerrado.
    app = conAislamientoPorEmpresa(base, async () => null);

    const estatus = await base.orderStatus.findUnique({ where: { value: "por_recolectar_en_tienda" }, select: { id: true } });
    if (estatus === null) throw new Error("falta el estatus `por_recolectar_en_tienda`: corre `pnpm run db:seed`");
    estatusInicialId = estatus.id;

    // Distritos del catalogo cuyo nombre y el de su canton no lleven parentesis (la plantilla los
    // usa de separador), activos en toda la cadena y sin zona de NADIE: una zona de otro test en
    // la misma base cambiaria la resolucion de la carga masiva.
    const distritos = await base.distrito.findMany({
      where: {
        activo: true,
        zonas: { none: {} },
        NOT: [{ nombre: { contains: "(" } }, { canton: { nombre: { contains: "(" } } }],
        canton: { activo: true, provincia: { activo: true } },
      },
      select: { id: true, nombre: true, canton: { select: { id: true, nombre: true, provincia: { select: { id: true, nombre: true } } } } },
      orderBy: { id: "asc" },
      take: 3,
    });
    if (distritos.length < 3) throw new Error("faltan distritos libres en la base: aplica las migraciones");
    const [comun, soloA, soloB] = distritos.map(
      (d): Geo => ({
        provinciaId: d.canton.provincia.id,
        provincia: d.canton.provincia.nombre,
        cantonId: d.canton.id,
        canton: d.canton.nombre,
        distritoId: d.id,
        distrito: d.nombre,
      }),
    );
    geo = { comun, soloA, soloB };

    A = await sembrarEmpresa("A");
    B = await sembrarEmpresa("B");
  });

  afterAll(async () => {
    if (base === undefined) return;
    const orgs = [A?.id, B?.id].filter((x): x is string => typeof x === "string");
    if (orgs.length > 0) {
      // En el orden que piden las FK. Todo lo de estas dos empresas es de esta ejecucion.
      for (const tabla of [
        "historial_accion",
        "orden_historial_estado",
        "jobs",
        "orden",
        "carga",
        "zona_distrito",
        "zona",
        "usuario",
        "organizacion",
      ]) {
        const columna = tabla === "organizacion" ? "id" : "organizacion_id";
        await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "${columna}" = ANY($1::text[])`, orgs);
      }
    }
    await base.$disconnect();
  });

  it("la siembra deja datos en las dos empresas (sin ellos, el resto no mediria nada)", async () => {
    expect(await base.orden.count({ where: { organizacionId: A.id } })).toBe(2);
    expect(await base.orden.count({ where: { organizacionId: B.id } })).toBe(2);
  });

  /* ------------------------------- R28 / R7 ------------------------------- */

  it("R28/R7: el listado de B trae sus órdenes y ninguna de A", async () => {
    const vistos = await listarComoB();
    expect(vistos).toEqual(ids(B));
  });

  it("R28/R7: la búsqueda por texto de B, con un término que casa en las dos, solo trae las de B", async () => {
    expect(await listarComoB(TOKEN)).toEqual(ids(B));
  });

  it("R28/R7: buscar por guía desde B — la de A no aparece, la propia sí", async () => {
    expect(await listarComoB(String(A.ordenes[0].numGuia))).toEqual([]);
    expect(await listarComoB(String(B.ordenes[0].numGuia))).toEqual([B.ordenes[0].id]);
  });

  it("R28/R7: leer por id desde B — una orden de A es «no encontrado», la propia se lee", async () => {
    const repo = ordenRepo();
    const [deA, deB] = await conEmpresa(B.id, () => Promise.all([repo.findById(A.ordenes[0].id), repo.findById(B.ordenes[0].id)]));
    expect(deA).toBeNull();
    expect(deB?.id).toBe(B.ordenes[0].id);
  });

  it("R7: findUnique, findFirstOrThrow y findUniqueOrThrow del cliente de la app sobre una orden de A", async () => {
    const idA = A.ordenes[0].id;
    await conEmpresa(B.id, async () => {
      expect(await app.orden.findUnique({ where: { id: idA } })).toBeNull();
      await expect(app.orden.findFirstOrThrow({ where: { id: idA } })).rejects.toMatchObject({ code: "P2025" });
      await expect(app.orden.findUniqueOrThrow({ where: { id: idA } })).rejects.toMatchObject({ code: "P2025" });
      // Control: la propia, por el mismo camino.
      expect((await app.orden.findUnique({ where: { id: B.ordenes[0].id } }))?.id).toBe(B.ordenes[0].id);
    });
  });

  it("R7: count, aggregate y groupBy de B no cuentan las de A", async () => {
    const where: Prisma.OrdenWhereInput = { destinatario: { contains: TOKEN } };
    const r = await conEmpresa(B.id, async () => ({
      count: await app.orden.count({ where }),
      aggregate: await app.orden.aggregate({ where, _count: { _all: true } }),
      groupBy: await app.orden.groupBy({ by: ["organizacionId", "tiendaId"], where, _count: { _all: true }, orderBy: { tiendaId: "asc" } }),
    }));
    expect(r.count).toBe(2);
    expect(r.aggregate._count._all).toBe(2);
    expect(r.groupBy).toEqual([{ organizacionId: B.id, tiendaId: B.tiendaId, _count: { _all: 2 } }]);
    // Y la base tiene 4: las dos de A existen, B no las ve.
    expect(await base.orden.count({ where })).toBe(4);
  });

  /* ---------------------------------- R8 ---------------------------------- */

  it("R8: el repositorio actualiza desde B una orden de A → «no encontrado», y la fila de A no cambia", async () => {
    const idA = A.ordenes[0].id;
    const antes = await filaDe(idA);
    const repo = ordenRepo();
    const contexto = { actorUsuarioId: B.maestro.usuarioId, origenTipo: "ajuste_estado" } as const;

    const r = await conEmpresa(B.id, () => repo.update(idA, { destinatario: `Pisada desde B ${RUN}`, notas: "B" }, contexto));

    expect(r).toBeNull();
    expect(await filaDe(idA)).toEqual(antes);
  });

  it("R8: update, delete, updateMany y deleteMany del cliente de la app sobre una orden de A → P2025 / 0 filas", async () => {
    const idA = A.ordenes[1].id;
    const antes = await ordenesDeA();
    await conEmpresa(B.id, async () => {
      await expect(app.orden.update({ where: { id: idA }, data: { notas: "B" } })).rejects.toMatchObject({ code: "P2025" });
      await expect(app.orden.delete({ where: { id: idA } })).rejects.toMatchObject({ code: "P2025" });
      expect((await app.orden.updateMany({ where: { id: idA }, data: { notas: "B" } })).count).toBe(0);
      expect((await app.orden.deleteMany({ where: { id: idA } })).count).toBe(0);
    });
    expect(await ordenesDeA()).toEqual(antes);
  });

  it("R8: el servicio de borrado de B, con una orden de A, responde «no existe» y no borra nada", async () => {
    const idA = A.ordenes[0].id;
    const antes = await ordenesDeA();

    const r = await conEmpresa(B.id, () => eliminarService().eliminar({ ordenIds: [idA] }, B.maestro));

    expect(r).toEqual({ status: "conflict", detalle: [{ ordenId: idA, motivo: MSG_ORDEN_NO_EXISTE }] });
    expect(await ordenesDeA()).toEqual(antes);
  });

  it("R8: el borrado por SQL a mano del repositorio (softDelete) desde B no alcanza la orden de A; la propia sí", async () => {
    const idA = A.ordenes[1].id;
    const antes = await ordenesDeA();
    const repo = ordenRepo();
    const actor = B.maestro.usuarioId;

    const deA = await conEmpresa(B.id, () => repo.softDelete({ ids: [idA], ownerId: null, actorUsuarioId: actor }));
    expect(deA).toBe(0);
    expect(await ordenesDeA()).toEqual(antes);

    // Control: el mismo camino borra la de B (y se deshace, para no cambiar los demas casos).
    const idB = B.ordenes[1].id;
    const deB = await conEmpresa(B.id, () => repo.softDelete({ ids: [idB], ownerId: null, actorUsuarioId: actor }));
    expect(deB).toBe(1);
    await base.orden.update({ where: { id: idB }, data: { deletedAt: null } });
  });

  /* ---------------------------------- R9 ---------------------------------- */

  it("R9: una orden creada por la carga masiva de B queda con organizacion_id = B en la base", async () => {
    const numRemision = `T31-B-nueva-${RUN}`;
    const actor: Actor = { usuarioId: B.tiendaId, rol: "adminTienda", organizacionId: B.id };

    const r = await conEmpresa(B.id, () => bulkService().cargarMasiva([fila(numRemision, geo.soloB)], actor));

    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.summary.creadas).toBe(1);
    const creada = await base.orden.findFirstOrThrow({ where: { numRemision }, select: { id: true, organizacionId: true, zonaId: true, cargaId: true } });
    expect(creada.organizacionId).toBe(B.id);
    // La zona salio del `zona_distrito` que B ve: la suya, no la de A.
    expect(creada.zonaId).toBe(B.zonaId);
    const carga = await base.carga.findUniqueOrThrow({ where: { id: creada.cargaId ?? "" }, select: { organizacionId: true } });
    expect(carga.organizacionId).toBe(B.id);
    expect(await base.ordenHistorialEstado.count({ where: { ordenId: creada.id, NOT: { organizacionId: B.id } } })).toBe(0);
  });

  it("crear desde B con la tienda de A: «tienda no encontrada» por la lectura previa y no escribe nada", async () => {
    const numRemision = `T31-cruzada-${RUN}`;
    // La tienda de A como dueña, con la empresa B en contexto (D15, tasks T3.1). La lectura previa
    // de `cargarMasiva` (`findUsuarioFulfillment`) no ve la tienda de A desde B y corta con el
    // error de dominio. Si se quitara, la seguiria parando el trigger de M3: el caso siguiente.
    const actor: Actor = { usuarioId: A.tiendaId, rol: "adminTienda", organizacionId: B.id };
    const antes = await Promise.all([
      base.orden.count({ where: { organizacionId: { in: [A.id, B.id] } } }),
      base.carga.count({ where: { organizacionId: { in: [A.id, B.id] } } }),
    ]);

    const r = await conEmpresa(B.id, () => bulkService().cargarMasiva([fila(numRemision, geo.soloB)], actor));

    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.summary).toMatchObject({ creadas: 0, conError: 1, cargaId: null });
    expect(r.summary.filas[0]).toMatchObject({ resultado: "error", errores: { tienda: ["tienda no encontrada"] } });
    expect(await base.orden.count({ where: { numRemision } })).toBe(0);
    expect(
      await Promise.all([
        base.orden.count({ where: { organizacionId: { in: [A.id, B.id] } } }),
        base.carga.count({ where: { organizacionId: { in: [A.id, B.id] } } }),
      ]),
    ).toEqual(antes);
  });

  it("sin la lectura previa, la red es la base: crear desde B una orden con la tienda de A da EmpresaCruzada (SL017) y 0 filas", async () => {
    const numRemision = `T31-cruzada-sql-${RUN}`;
    // El cliente de la app, saltandose el servicio: es lo que pasaria si la lectura previa
    // faltara. Todo lo demas es de B; solo la tienda es de A.
    const r = await conEmpresa(B.id, () =>
      app.orden.create({
        data: {
          numRemision,
          estatusId: estatusInicialId,
          destinatario: "Cruzada",
          telefonoDest: "88887777",
          tiendaId: A.tiendaId,
          zonaId: B.zonaId,
          provinciaId: geo.soloB.provinciaId,
          cantonId: geo.soloB.cantonId,
          distritoId: geo.soloB.distritoId,
          producto: "Caja",
        },
        select: { id: true },
      }),
    ).then(
      (v) => ({ ok: v }),
      (e: unknown) => ({ error: e }),
    );

    expect(r).toMatchObject({ error: { name: "EmpresaCruzada" } });
    expect(await base.orden.count({ where: { numRemision } })).toBe(0);
  });

  /* ---------------- include desde un modelo de plataforma (T3.10) ---------------- */
  //
  // Una lectura de un modelo de PLATAFORMA (`distrito`) que incluye una relacion de NEGOCIO
  // (`zonas` → `zona_distrito`): la extension no la filtra (el modelo no tiene empresa), pero la
  // envuelve con `servi_app`, y la RLS de `zona_distrito` deja solo lo de B. Sin la envoltura
  // corria como dueno: B veia la zona de A, y en la carga masiva un distrito que cubren las dos
  // resolvia DOS zonas y la fila salia «no tiene zona asignada».

  it("R7: B, leyendo un distrito que cubren las dos empresas con sus zonas, solo ve la suya", async () => {
    // Las dos filas existen en la base: si no, «solo la de B» no probaria nada.
    expect(await base.zonaDistrito.count({ where: { distritoId: geo.comun.distritoId, zonaId: { in: [A.zonaId, B.zonaId] } } })).toBe(2);
    const r = await conEmpresa(B.id, () =>
      app.distrito.findUniqueOrThrow({ where: { id: geo.comun.distritoId }, select: { zonas: { select: { zonaId: true } } } }),
    );
    expect(r.zonas).toEqual([{ zonaId: B.zonaId }]);
  });

  it("R7/R9: la carga masiva de B en un distrito que también cubre A crea la orden en la zona de B", async () => {
    const numRemision = `T31-B-comun-${RUN}`;
    const actor: Actor = { usuarioId: B.tiendaId, rol: "adminTienda", organizacionId: B.id };

    const r = await conEmpresa(B.id, () => bulkService().cargarMasiva([fila(numRemision, geo.comun)], actor));

    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.summary, JSON.stringify(r.summary.filas)).toMatchObject({ creadas: 1, conError: 0 });
    expect(await base.orden.findFirstOrThrow({ where: { numRemision }, select: { organizacionId: true, zonaId: true } })).toEqual({
      organizacionId: B.id,
      zonaId: B.zonaId,
    });
  });
});
