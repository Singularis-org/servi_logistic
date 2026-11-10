import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BugReportStatus, PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { llevaSqlstate } from "@/lib/db/sqlstate";
import { BugReportRepository } from "@/lib/repositories/BugReportRepository";
import { ReportesBugPlataformaService } from "@/lib/services/ReportesBugPlataformaService";
import { TRANSICIONES_REPORTE, type FiltrosReportes, type NuevoBugReport } from "@/lib/types/reporte-bug";
import { comoApp, datosDeOrganizacionDePrueba } from "@/tests/fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";
import { idDeRol, insertarUsuario, liberarHuecoDeSuperadmin, tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SLT-87 (design §2, §6; R11, R12, R13, R14, R19) — `bug_report` contra Postgres real.
// SLT-97 (design §2, §4, §5; R3, R4, R5, R7–R10, R13–R18, R20, R21, R23) — el estado, el historial y las
// lecturas del superadmin, al final del archivo.
//
// El repositorio va con el cliente EXTENDIDO (el de la app) y un resolutor nulo: fuera de un contexto
// explícito toda operación de negocio fallaría, así que si escribe es porque abre su `comoPlataforma`.
// Lo que queda en la base se mide con el cliente BASE (dueño), que no filtra.
//
// SIEMBRA OBLIGATORIA. Dos empresas, un usuario en cada una y un reporte de A, commiteados en
// `beforeAll` y COMPROBADOS: «servi_app no lee la fila de su propia empresa» necesita que la fila exista.
//
// Los casos de SLT-97 siembran dentro de una transacción del dueño que se revierte, con el repositorio
// sobre un cliente que abre SAVEPOINT reales (`repoEn`): así «si falla el historial, el estado no cambia»
// mide un rollback de verdad. Sus reportes llevan fechas de 2001, que ningún otro test usa, y cada caso
// filtra por su ventana: lo que hay commiteado en la base no se cuela en los totales.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);

let soltarSuperadmin: () => Promise<void> = async () => {};
let base: PrismaClient;
let repo: BugReportRepository;
let A: string;
let B: string;
let usuarioA: string;
let usuarioB: string;
let reporteA: string;

class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
  }
}

/** Transacción del dueño que siempre se revierte. El lock de aviso de la 227 va primero. */
async function revertida<T>(fn: (tx: TxDeTest) => Promise<T>): Promise<T> {
  try {
    await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        throw new Revertir(await fn(tx));
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (e instanceof Revertir) return e.valor as T;
    throw e;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

/** SQLSTATE de un error de SQL a mano por Prisma 7 + adapter-pg (P2010 con la causa del driver). */
function sqlstateDe(e: unknown): string {
  const o = e as { message?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string } } } };
  const causa = o.meta?.driverAdapterError?.cause;
  return (
    causa?.originalCode ??
    causa?.code ??
    /Code: `([0-9A-Z]{5})`/.exec(String(o.message))?.[1] ??
    `?? ${String(o.message ?? e).slice(0, 160)}`
  );
}

/** Corre `sql` en un SAVEPOINT: un rechazo no aborta la transacción del caso. SQLSTATE o `null`. */
async function intentar(tx: TxDeTest, sql: string, ...args: unknown[]): Promise<string | null> {
  const punto = `sp_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await tx.$queryRawUnsafe(sql, ...args);
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
    return null;
  } catch (e) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
    return sqlstateDe(e);
  }
}

const datosDe = (organizationId: string, reporterUserId: string, extra: Partial<NuevoBugReport> = {}): NuevoBugReport => ({
  organizationId,
  reporterUserId,
  reporterRole: "mensajero",
  description: `No carga el mapa ${RUN}`,
  pagePath: "/mis-asignaciones/abc",
  userAgent: "Mozilla/5.0 (Android 14) Chrome/130",
  viewportWidth: 390,
  viewportHeight: 844,
  isStandalone: true,
  ...extra,
});

/** INSERT a mano con todas las columnas obligatorias; `campos` pisa las que el caso quiere romper. */
function insertSql(campos: { description?: string; pagePath?: string } = {}): [string, ...unknown[]] {
  return [
    `INSERT INTO "bug_report" ("id", "organization_id", "reporter_user_id", "reporter_name", "reporter_role",
       "description", "page_path", "user_agent")
     VALUES ($1, $2, $3, 'Nombre', 'mensajero', $4, $5, 'agente')`,
    randomUUID(),
    A,
    usuarioA,
    campos.description ?? "descripcion valida",
    campos.pagePath ?? "/ruta",
  ];
}

/* -------------------------------------------------------------------------- */
/* SLT-97                                                                     */
/* -------------------------------------------------------------------------- */

const ESTADOS: readonly BugReportStatus[] = ["new", "in_review", "resolved", "dismissed"];
const SUPERADMIN: Actor = { usuarioId: "se-fija-en-cada-caso", rol: "superadmin" };
const NOMBRE_DEL_SUPERADMIN = "Prueba SL-32";

class HistorialCaido extends Error {
  constructor() {
    super("escritura del historial rota a propósito por el test");
    this.name = "HistorialCaido";
  }
}

/**
 * El cliente de la tx del caso con un `$transaction` que abre un SAVEPOINT real y hace `ROLLBACK TO` al
 * fallar, como `clienteConSavepoint` de `_postgres-real.ts`. Con `romperHistorial`, el
 * `bugReportStatusChange.create` del repositorio lanza: el resto (lectura, UPDATE condicionado, nombre
 * del actor) es el real (R21).
 */
function repoEn(tx: TxDeTest, romperHistorial = false): BugReportRepository {
  const proxy: unknown = new Proxy(tx as object, {
    get(objetivo, prop) {
      if (romperHistorial && prop === "bugReportStatusChange") {
        return {
          create: () => {
            throw new HistorialCaido();
          },
        };
      }
      if (prop === "$transaction") {
        return async (fn: (t: unknown) => unknown) => {
          const punto = `sp_${randomUUID().replace(/-/g, "")}`;
          await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
          try {
            const salida = await fn(proxy);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
            return salida;
          } catch (error) {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
            throw error;
          }
        };
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? valor.bind(objetivo) : valor;
    },
  });
  return new BugReportRepository(proxy as PrismaClient);
}

function servicioEn(tx: TxDeTest): ReportesBugPlataformaService {
  return new ReportesBugPlataformaService(repoEn(tx));
}

/** `FiltrosReportes` ya parseados, con los valores por defecto del zod. */
const filtrosDe = (f: Partial<FiltrosReportes>): FiltrosReportes => ({ estado: "todos", pagina: 1, ...f });

/**
 * Un reporte sembrado a mano dentro de la tx del caso. Las fechas van como texto ISO con `Z` y el cast a
 * `timestamp` descarta la zona: queda la hora UTC, que es como Prisma lee `TIMESTAMP(3)`.
 */
async function sembrarReporte(
  tx: TxDeTest,
  o: {
    org?: string;
    usuario?: string;
    status?: BugReportStatus;
    creado?: string;
    borrado?: string | null;
    descripcion?: string;
    sinVentana?: boolean;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO "bug_report" ("id", "organization_id", "reporter_user_id", "reporter_name", "reporter_role",
       "description", "page_path", "user_agent", "viewport_width", "viewport_height", "is_standalone",
       "status", "created_at", "updated_at", "deleted_at")
     VALUES ($1, $2, $3, 'Ana Pérez a', 'mensajero', $4, '/ordenes', 'Mozilla/5.0 (Android 14)', $5, $6, $7,
       $8::"bug_report_status", $9::timestamp, $9::timestamp, $10::timestamp)`,
    id,
    o.org ?? A,
    o.usuario ?? usuarioA,
    o.descripcion ?? `Reporte ${RUN}`,
    o.sinVentana ? null : 390,
    o.sinVentana ? null : 844,
    o.sinVentana ? null : true,
    o.status ?? "new",
    o.creado ?? "2001-01-01T12:00:00.000Z",
    o.borrado ?? null,
  );
  return id;
}

/** Una entrada del historial escrita a mano por el dueño (los triggers solo miran UPDATE y DELETE). */
async function sembrarCambio(
  tx: TxDeTest,
  reporteId: string,
  o: { de: BugReportStatus; a: BugReportStatus; nota?: string | null; creado: string },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO "bug_report_status_change" ("id", "bug_report_id", "from_status", "to_status", "note",
       "actor_user_id", "actor_name", "created_at")
     VALUES ($1, $2, $3::"bug_report_status", $4::"bug_report_status", $5, 'actor-opaco', 'Quien Sea', $6::timestamp)`,
    id,
    reporteId,
    o.de,
    o.a,
    o.nota ?? null,
    o.creado,
  );
  return id;
}

async function estadoDe(tx: TxDeTest, id: string): Promise<BugReportStatus> {
  const f = await tx.$queryRawUnsafe<{ status: BugReportStatus }[]>(
    `SELECT "status" FROM "bug_report" WHERE "id" = $1`,
    id,
  );
  return f[0].status;
}

async function cambiosDe(tx: TxDeTest, id: string): Promise<number> {
  const f = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "bug_report_status_change" WHERE "bug_report_id" = $1`,
    id,
  );
  return f[0].n;
}

/**
 * El superadmin sin empresa del caso, DENTRO de la tx revertida (mismo criterio que
 * `vehiculos-plataforma.test.ts`): si la base no tiene ninguno se siembra; si ya tiene uno, se usa ese
 * con el nombre fijado solo en esta tx, para que el congelado sea determinista.
 */
async function superadminSinEmpresa(tx: TxDeTest): Promise<string> {
  const rolSuperadmin = await idDeRol(tx, "superadmin");
  const existente = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "usuario" WHERE "rol_id" = $1`, rolSuperadmin);
  if (existente.length === 0) {
    await liberarHuecoDeSuperadmin(tx, rolSuperadmin);
    const u = await insertarUsuario(tx, rolSuperadmin, null);
    if (!u.desenlace.ok) throw new Error(`no se sembro el superadmin: ${JSON.stringify(u.desenlace)}`);
    return u.id;
  }
  const id = existente[0].id;
  await tx.$executeRawUnsafe(
    `UPDATE "usuario" SET "nombre" = $1, "primer_apellido" = NULL, "segundo_apellido" = NULL WHERE "id" = $2`,
    NOMBRE_DEL_SUPERADMIN,
    id,
  );
  return id;
}

describeSiHayBase("SLT-87 — bug_report en Postgres (R11–R14, R19)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    repo = new BugReportRepository(conAislamientoPorEmpresa(base, async () => null));
    // SLT-97: los casos del historial usan el superadmin como actor (R21). Este lock va antes que el de
    // la 227 (orden de `superadmin-32.ts`).
    soltarSuperadmin = await tomarLockDeSuperadmin();

    await bajoLockDeEscrituraReal(async () => {
      A = (await base.organizacion.create({ data: datosDeOrganizacionDePrueba(`BR A ${RUN}`), select: { id: true } })).id;
      B = (await base.organizacion.create({ data: datosDeOrganizacionDePrueba(`BR B ${RUN}`), select: { id: true } })).id;
      const rolId = (await base.rol.findFirstOrThrow({ where: { value: "mensajero" } })).id;
      const tipoIdentificacionId = (await base.tipoIdentificacion.findFirstOrThrow({ select: { id: true } })).id;
      const usuario = (org: string, tag: string) =>
        base.usuario.create({
          data: {
            nombre: "Ana",
            primerApellido: "Pérez",
            segundoApellido: tag,
            email: `br-${tag}-${RUN}@ejemplo.test`,
            telefono: "88887777",
            cedula: `br-${tag}-${RUN}`,
            tipoIdentificacionId,
            rolId,
            passwordHash: "no-utilizable",
            estado: "activo",
            organizacionId: org,
          },
          select: { id: true },
        });
      usuarioA = (await usuario(A, "a")).id;
      usuarioB = (await usuario(B, "b")).id;
    });
    // El reporte de A, por el repositorio real.
    const creado = await bajoLockDeEscrituraReal(() => repo.crear(datosDe(A, usuarioA)));
    expect(creado).not.toBeNull();
    reporteA = creado!.id;
    expect(await base.bugReport.count({ where: { id: reporteA, organizationId: A } })).toBe(1);
  }, 120_000);

  afterAll(async () => {
    try {
      if (!base) return;
      await bajoLockDeEscrituraReal(async () => {
        // Los reportes caen con su usuario (CASCADE); el usuario, antes que su empresa (RESTRICT).
        const orgs = [A, B].filter(Boolean);
        await base.usuario.deleteMany({ where: { organizacionId: { in: orgs } } });
        await base.organizacion.deleteMany({ where: { id: { in: orgs } } });
      });
      await base.$disconnect();
    } finally {
      await soltarSuperadmin();
    }
  }, 120_000);

  it("R13 — crear guarda la empresa, el usuario, el rol y el nombre del actor, la ruta sin query, el agente y la ventana", async () => {
    const fila = await base.bugReport.findUniqueOrThrow({ where: { id: reporteA } });
    expect(fila).toMatchObject({
      organizationId: A,
      reporterUserId: usuarioA,
      reporterRole: "mensajero",
      reporterName: "Ana Pérez a",
      description: `No carga el mapa ${RUN}`,
      pagePath: "/mis-asignaciones/abc",
      userAgent: "Mozilla/5.0 (Android 14) Chrome/130",
      viewportWidth: 390,
      viewportHeight: 844,
      isStandalone: true,
    });
  });

  it("R13 — crear devuelve lo que pinta el correo: el nombre, el email y la empresa leídos de la base", async () => {
    const creado = await bajoLockDeEscrituraReal(() =>
      repo.crear(datosDe(B, usuarioB, { viewportWidth: null, viewportHeight: null, isStandalone: null })),
    );
    expect(creado).toMatchObject({
      reporterName: "Ana Pérez b",
      reporterEmail: `br-b-${RUN}@ejemplo.test`,
      organizationName: `BR B ${RUN}`,
      viewportWidth: null,
      isStandalone: null,
    });
    const fila = await base.bugReport.findUniqueOrThrow({ where: { id: creado!.id } });
    expect(fila.organizationId).toBe(B);
    expect(fila.createdAt).toEqual(creado!.createdAt);
  });

  it("R11/R13 — con un usuario de otra empresa devuelve null y no escribe", async () => {
    const antes = await base.bugReport.count({ where: { reporterUserId: usuarioB } });

    const r = await bajoLockDeEscrituraReal(() => repo.crear(datosDe(A, usuarioB)));

    expect(r).toBeNull();
    expect(await base.bugReport.count({ where: { reporterUserId: usuarioB } })).toBe(antes);
    expect(await base.bugReport.count({ where: { organizationId: A, reporterUserId: usuarioB } })).toBe(0);
  });

  it("R14 — crear funciona también llamado dentro del contexto de una empresa (abre su propio comoPlataforma)", async () => {
    const creado = await bajoLockDeEscrituraReal(() => conEmpresa(A, () => repo.crear(datosDe(A, usuarioA))));
    expect(creado).not.toBeNull();
    expect(await base.bugReport.count({ where: { id: creado!.id } })).toBe(1);
  });

  it("R19 — la fila nace con created_at y updated_at y deleted_at nulo; las columnas están en inglés", async () => {
    const fila = await base.bugReport.findUniqueOrThrow({ where: { id: reporteA } });
    expect(fila.createdAt).toBeInstanceOf(Date);
    expect(fila.updatedAt).toBeInstanceOf(Date);
    expect(fila.deletedAt).toBeNull();

    const columnas = await base.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'bug_report' ORDER BY column_name`,
    );
    expect(columnas.map((c) => c.column_name)).toEqual(
      [
        "created_at",
        "deleted_at",
        "description",
        "id",
        "is_standalone",
        "organization_id",
        "page_path",
        "reporter_name",
        "reporter_role",
        "reporter_user_id",
        // SLT-97 (design §2.1).
        "status",
        "updated_at",
        "user_agent",
        "viewport_height",
        "viewport_width",
      ],
    );
  });

  it("R12 — el CHECK rechaza una descripción de 501 caracteres y una página con `?`", async () => {
    const r = await revertida(async (tx) => ({
      control: await intentar(tx, ...insertSql()),
      quinientos: await intentar(tx, ...insertSql({ description: "x".repeat(500) })),
      quinientosUno: await intentar(tx, ...insertSql({ description: "x".repeat(501) })),
      soloEspacios: await intentar(tx, ...insertSql({ description: "   " })),
      conQuery: await intentar(tx, ...insertSql({ pagePath: "/ordenes?estado=x" })),
      conFragmento: await intentar(tx, ...insertSql({ pagePath: "/ordenes#a" })),
      sinBarra: await intentar(tx, ...insertSql({ pagePath: "ordenes" })),
      superadmin: await intentar(
        tx,
        `INSERT INTO "bug_report" ("id", "organization_id", "reporter_user_id", "reporter_name", "reporter_role",
           "description", "page_path", "user_agent")
         VALUES ($1, $2, $3, 'Nombre', 'superadmin', 'd', '/r', 'a')`,
        randomUUID(),
        A,
        usuarioA,
      ),
    }));
    expect(r).toEqual({
      control: null,
      quinientos: null,
      quinientosUno: "23514",
      soloEspacios: "23514",
      conQuery: "23514",
      conFragmento: "23514",
      sinBarra: "23514",
      superadmin: "23514",
    });
  });

  it("R14 — control: el dueño sí lee bug_report (el 42501 de abajo es de privilegios, no de una tabla ausente)", async () => {
    const r = await revertida((tx) => intentar(tx, `SELECT 1 FROM "bug_report" WHERE "id" = $1`, reporteA));
    expect(r).toBeNull();
  });

  it("R14 — con servi_app, SELECT, INSERT, UPDATE y DELETE de bug_report dan 42501, aun con una fila de su propia empresa", async () => {
    const r = await revertida(async (tx) => {
      await comoApp(tx, A);
      return {
        select: await intentar(tx, `SELECT * FROM "bug_report"`),
        selectPropia: await intentar(tx, `SELECT * FROM "bug_report" WHERE "organization_id" = $1`, A),
        insert: await intentar(tx, ...insertSql()),
        update: await intentar(tx, `UPDATE "bug_report" SET "description" = 'cambio' WHERE "id" = $1`, reporteA),
        deleteLogico: await intentar(tx, `UPDATE "bug_report" SET "deleted_at" = now() WHERE "id" = $1`, reporteA),
        delete: await intentar(tx, `DELETE FROM "bug_report" WHERE "id" = $1`, reporteA),
      };
    });
    expect(r).toEqual({
      select: "42501",
      selectPropia: "42501",
      insert: "42501",
      update: "42501",
      deleteLogico: "42501",
      delete: "42501",
    });
    // Nada cambió.
    const fila = await base.bugReport.findUniqueOrThrow({ where: { id: reporteA } });
    expect(fila.description).toBe(`No carga el mapa ${RUN}`);
    expect(fila.deletedAt).toBeNull();
  });

  it("R14 — la empresa tampoco lee por el modelo: el cliente de la app en conEmpresa da 42501", async () => {
    const app = conAislamientoPorEmpresa(base, async () => null);
    // Por el modelo, el runtime relanza el error del driver: se busca el SQLSTATE en todo el grafo.
    const es42501 = (p: Promise<unknown>) =>
      p.then(
        () => false,
        (e: unknown) => llevaSqlstate(e, "42501"),
      );
    expect(await es42501(conEmpresa(A, () => app.bugReport.findMany({ where: { organizationId: A } })))).toBe(true);
    expect(await es42501(conEmpresa(A, () => app.bugReport.count()))).toBe(true);
  });

  describe("SLT-97 — estado, historial y lecturas del superadmin", () => {
    it("R16 — crear deja el reporte en new, y la migración deja en new los que ya existían", async () => {
      expect((await base.bugReport.findUniqueOrThrow({ where: { id: reporteA } })).status).toBe("new");
      // La columna llegó con `NOT NULL DEFAULT 'new'`: es lo que puso en «Nuevo» las filas de antes.
      const col = await base.$queryRawUnsafe<{ is_nullable: string; column_default: string | null }[]>(
        `SELECT is_nullable, column_default FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'bug_report' AND column_name = 'status'`,
      );
      expect(col).toEqual([{ is_nullable: "NO", column_default: "'new'::bug_report_status" }]);
      expect(await base.bugReport.count({ where: { organizationId: { in: [A, B] }, status: { not: "new" } } })).toBe(0);
    });

    it("R3 — con servi_app, SELECT, INSERT, UPDATE y DELETE de bug_report_status_change y UPDATE de bug_report.status dan 42501", async () => {
      const r = await revertida(async (tx) => {
        const id = await sembrarReporte(tx);
        const cambio = await sembrarCambio(tx, id, { de: "new", a: "in_review", creado: "2001-01-02T00:00:00.000Z" });
        await comoApp(tx, A);
        return {
          select: await intentar(tx, `SELECT * FROM "bug_report_status_change"`),
          insert: await intentar(
            tx,
            `INSERT INTO "bug_report_status_change" ("id", "bug_report_id", "from_status", "to_status", "actor_user_id", "actor_name")
             VALUES ($1, $2, 'new', 'resolved', 'x', 'x')`,
            randomUUID(),
            id,
          ),
          update: await intentar(tx, `UPDATE "bug_report_status_change" SET "note" = 'x' WHERE "id" = $1`, cambio),
          delete: await intentar(tx, `DELETE FROM "bug_report_status_change" WHERE "id" = $1`, cambio),
          updateEstado: await intentar(tx, `UPDATE "bug_report" SET "status" = 'resolved' WHERE "id" = $1`, id),
        };
      });
      expect(r).toEqual({ select: "42501", insert: "42501", update: "42501", delete: "42501", updateEstado: "42501" });
    });

    it("R4 — cambiar el estado no deja filas en historial_accion ni en jobs", async () => {
      const r = await revertida(async (tx) => {
        const contar = async () =>
          (
            await tx.$queryRawUnsafe<{ h: number; j: number }[]>(
              `SELECT (SELECT count(*)::int FROM "historial_accion" WHERE "organizacion_id" = $1) AS h,
                      (SELECT count(*)::int FROM "jobs" WHERE "organizacion_id" = $1) AS j`,
              A,
            )
          )[0];
        const id = await sembrarReporte(tx);
        const actorId = await superadminSinEmpresa(tx);
        const antes = await contar();
        const s = servicioEn(tx);
        const actor = { ...SUPERADMIN, usuarioId: actorId };
        const a = await s.cambiarEstado(actor, { reporteId: id, estado: "in_review", nota: "x" });
        const b = await s.cambiarEstado(actor, { reporteId: id, estado: "resolved", nota: "" });
        return { a, b, antes, despues: await contar(), cambios: await cambiosDe(tx, id) };
      });
      expect(r.a).toEqual({ status: "ok", estado: "in_review" });
      expect(r.b).toEqual({ status: "ok", estado: "resolved" });
      expect(r.cambios).toBe(2);
      expect(r.despues).toEqual(r.antes);
    });

    it("R5 — listar ordena del más reciente al más antiguo y devuelve 25 por página", async () => {
      const r = await revertida(async (tx) => {
        const ids: string[] = [];
        // 27 reportes en enero de 2001; los dos últimos con la misma hora: desempata el id.
        for (let d = 1; d <= 26; d++) {
          ids.push(await sembrarReporte(tx, { creado: `2001-01-${String(d).padStart(2, "0")}T08:00:00.000Z` }));
        }
        ids.push(await sembrarReporte(tx, { creado: "2001-01-26T08:00:00.000Z" }));
        const consulta = {
          estados: null,
          organizationId: null,
          desde: new Date("2001-01-01T00:00:00.000Z"),
          hastaExclusivo: new Date("2001-02-01T00:00:00.000Z"),
          tamano: 25,
        };
        const repo = repoEn(tx);
        return { ids, p1: await repo.listar({ ...consulta, pagina: 1 }), p2: await repo.listar({ ...consulta, pagina: 2 }) };
      });
      expect(r.p1.total).toBe(27);
      expect(r.p1.filas).toHaveLength(25);
      expect(r.p2.filas).toHaveLength(2);
      const fechas = [...r.p1.filas, ...r.p2.filas].map((f) => f.creadoEn);
      expect(fechas).toEqual([...fechas].sort().reverse());
      const empatados = [...r.ids.slice(25, 27)].sort();
      expect(r.p1.filas.slice(0, 2).map((f) => f.id)).toEqual(empatados);
      expect(new Set([...r.p1.filas, ...r.p2.filas].map((f) => f.id))).toEqual(new Set(r.ids));
      expect(r.p1.filas[0]).toMatchObject({ empresa: `BR A ${RUN}`, usuario: "Ana Pérez a", rol: "mensajero", estado: "new" });
    });

    it("R6 — la fila lleva el resumen de 120 letras con «…» y no la descripción entera", async () => {
      const larga = "a".repeat(119) + "bcdef";
      const r = await revertida(async (tx) => {
        await sembrarReporte(tx, { descripcion: larga, creado: "2001-02-01T00:00:00.000Z" });
        return servicioEn(tx).listar(SUPERADMIN, filtrosDe({ desde: "2001-02-01", hasta: "2001-02-01" }));
      });
      expect(r).toMatchObject({ status: "ok", total: 1 });
      if (r.status !== "ok") throw new Error("inalcanzable");
      expect(r.items[0].resumen).toBe(`${"a".repeat(119)}b…`);
    });

    it("R7 — el filtro de estado devuelve solo los estados pedidos: pendientes, todos y cada uno", async () => {
      const r = await revertida(async (tx) => {
        for (const status of ESTADOS) await sembrarReporte(tx, { status, creado: "2001-03-05T10:00:00.000Z" });
        const s = servicioEn(tx);
        const salida: Record<string, string[]> = {};
        for (const estado of ["pendientes", "todos", ...ESTADOS] as const) {
          const l = await s.listar(SUPERADMIN, filtrosDe({ estado, desde: "2001-03-01", hasta: "2001-03-31" }));
          salida[estado] = l.status === "ok" ? l.items.map((i) => i.estado).sort() : [l.status];
        }
        return salida;
      });
      expect(r).toEqual({
        pendientes: ["in_review", "new"],
        todos: ["dismissed", "in_review", "new", "resolved"],
        new: ["new"],
        in_review: ["in_review"],
        resolved: ["resolved"],
        dismissed: ["dismissed"],
      });
    });

    it("R8 — con dos empresas, el filtro de empresa devuelve solo los de la elegida", async () => {
      const r = await revertida(async (tx) => {
        const deA = await sembrarReporte(tx, { creado: "2001-04-05T10:00:00.000Z" });
        const deB = await sembrarReporte(tx, { org: B, usuario: usuarioB, creado: "2001-04-06T10:00:00.000Z" });
        const s = servicioEn(tx);
        const ventana = { desde: "2001-04-01", hasta: "2001-04-30" };
        const ids = async (empresa?: string) => {
          const l = await s.listar(SUPERADMIN, filtrosDe({ ...ventana, empresa }));
          return l.status === "ok" ? l.items.map((i) => i.id) : [l.status];
        };
        return { deA, deB, todas: await ids(), soloA: await ids(A), soloB: await ids(B) };
      });
      expect(r.todas).toEqual([r.deB, r.deA]);
      expect(r.soloA).toEqual([r.deA]);
      expect(r.soloB).toEqual([r.deB]);
    });

    it("R9 — desde y hasta son inclusivos por día UTC: 23:59:59.999Z de hasta entra y 00:00Z del día siguiente no", async () => {
      const r = await revertida(async (tx) => {
        await sembrarReporte(tx, { creado: "2001-07-09T23:59:59.999Z" });
        const primero = await sembrarReporte(tx, { creado: "2001-07-10T00:00:00.000Z" });
        const ultimo = await sembrarReporte(tx, { creado: "2001-07-12T23:59:59.999Z" });
        const despues = await sembrarReporte(tx, { creado: "2001-07-13T00:00:00.000Z" });
        const s = servicioEn(tx);
        const l = await s.listar(SUPERADMIN, filtrosDe({ desde: "2001-07-10", hasta: "2001-07-12" }));
        const siguiente = await s.listar(SUPERADMIN, filtrosDe({ desde: "2001-07-13", hasta: "2001-07-31" }));
        return { primero, ultimo, despues, l, siguiente };
      });
      expect(r.l).toMatchObject({ status: "ok", total: 2 });
      if (r.l.status !== "ok" || r.siguiente.status !== "ok") throw new Error("inalcanzable");
      expect(r.l.items.map((i) => i.id)).toEqual([r.ultimo, r.primero]);
      expect(r.siguiente.items.map((i) => i.id)).toEqual([r.despues]);
    });

    it("R10 — empresa, estado y fechas se combinan", async () => {
      const r = await revertida(async (tx) => {
        const cumple = await sembrarReporte(tx, { status: "in_review", creado: "2001-05-10T10:00:00.000Z" });
        // Cada uno falla un solo filtro: el estado, la empresa y la fecha.
        await sembrarReporte(tx, { status: "new", creado: "2001-05-10T11:00:00.000Z" });
        await sembrarReporte(tx, { org: B, usuario: usuarioB, status: "in_review", creado: "2001-05-10T12:00:00.000Z" });
        await sembrarReporte(tx, { status: "in_review", creado: "2001-05-20T10:00:00.000Z" });
        const l = await servicioEn(tx).listar(
          SUPERADMIN,
          filtrosDe({ estado: "in_review", empresa: A, desde: "2001-05-01", hasta: "2001-05-15" }),
        );
        return { cumple, l };
      });
      expect(r.l).toMatchObject({ status: "ok", total: 1 });
      if (r.l.status !== "ok") throw new Error("inalcanzable");
      expect(r.l.items.map((i) => i.id)).toEqual([r.cumple]);
    });

    it("R13 — un reporte con deleted_at no sale en el listado ni cuenta en el total", async () => {
      const r = await revertida(async (tx) => {
        const vivo = await sembrarReporte(tx, { creado: "2001-09-01T10:00:00.000Z" });
        await sembrarReporte(tx, { creado: "2001-09-02T10:00:00.000Z", borrado: "2001-09-03T00:00:00.000Z" });
        const l = await servicioEn(tx).listar(SUPERADMIN, filtrosDe({ desde: "2001-09-01", hasta: "2001-09-30" }));
        return { vivo, l };
      });
      expect(r.l).toMatchObject({ status: "ok", total: 1 });
      if (r.l.status !== "ok") throw new Error("inalcanzable");
      expect(r.l.items.map((i) => i.id)).toEqual([r.vivo]);
    });

    it("R14 — detalle trae la empresa, el correo de quien reportó y el historial", async () => {
      const r = await revertida(async (tx) => {
        const id = await sembrarReporte(tx, {
          descripcion: "Línea 1\nLínea 2",
          status: "resolved",
          creado: "2001-10-01T14:05:00.000Z",
        });
        const viejo = await sembrarCambio(tx, id, { de: "new", a: "in_review", nota: "Lo miro", creado: "2001-10-02T00:00:00.000Z" });
        const nuevo = await sembrarCambio(tx, id, { de: "in_review", a: "resolved", creado: "2001-10-03T00:00:00.000Z" });
        const sinVentana = await sembrarReporte(tx, { sinVentana: true });
        const s = servicioEn(tx);
        return { id, viejo, nuevo, d: await s.detalle(SUPERADMIN, id), dSin: await s.detalle(SUPERADMIN, sinVentana) };
      });
      expect(r.d).toEqual({
        status: "ok",
        reporte: {
          id: r.id,
          descripcion: "Línea 1\nLínea 2",
          empresa: `BR A ${RUN}`,
          usuario: "Ana Pérez a",
          correo: `br-a-${RUN}@ejemplo.test`,
          rol: "mensajero",
          pagina: "/ordenes",
          navegador: "Mozilla/5.0 (Android 14)",
          ventana: { ancho: 390, alto: 844 },
          appInstalada: true,
          creadoEn: "2001-10-01T14:05:00.000Z",
          estado: "resolved",
          destinosPermitidos: [],
        },
        historial: [
          { id: r.nuevo, desde: "in_review", hacia: "resolved", nota: null, actor: "Quien Sea", creadoEn: "2001-10-03T00:00:00.000Z" },
          { id: r.viejo, desde: "new", hacia: "in_review", nota: "Lo miro", actor: "Quien Sea", creadoEn: "2001-10-02T00:00:00.000Z" },
        ],
      });
      expect(r.dSin).toMatchObject({
        status: "ok",
        reporte: { ventana: null, appInstalada: null, destinosPermitidos: ["in_review", "resolved", "dismissed"] },
        historial: [],
      });
    });

    it("R15 — detalle de un reporte con deleted_at devuelve null", async () => {
      const r = await revertida(async (tx) => {
        const borrado = await sembrarReporte(tx, { borrado: "2001-01-02T00:00:00.000Z" });
        const repo = repoEn(tx);
        return {
          borrado: await repo.detalle(borrado),
          inexistente: await repo.detalle(randomUUID()),
          servicio: await servicioEn(tx).detalle(SUPERADMIN, borrado),
          cambio: await repo.cambiarEstado({ reporteId: borrado, destino: "resolved", nota: null, actorUsuarioId: "x" }),
          estado: await estadoDe(tx, borrado),
        };
      });
      expect(r).toEqual({
        borrado: null,
        inexistente: null,
        servicio: { status: "not_found" },
        cambio: { resultado: "not_found" },
        estado: "new",
      });
    });

    it("R17 — los 16 pares origen × destino: la base acepta exactamente los de TRANSICIONES_REPORTE y rechaza los 4 al mismo estado", async () => {
      const r = await revertida(async (tx) => {
        const salida: Record<string, string | null> = {};
        for (const de of ESTADOS) {
          for (const a of ESTADOS) {
            const id = await sembrarReporte(tx, { status: de });
            salida[`${de}->${a}`] = await intentar(
              tx,
              `UPDATE "bug_report" SET "status" = $2::"bug_report_status" WHERE "id" = $1`,
              id,
              a,
            );
          }
        }
        return salida;
      });
      expect(Object.keys(r)).toHaveLength(16);
      const esperado: Record<string, string | null> = {};
      for (const de of ESTADOS) {
        for (const a of ESTADOS) {
          // Al mismo estado tampoco: no es un paso de TRANSICIONES_REPORTE y la base lo rechaza (design §2.3).
          esperado[`${de}->${a}`] = TRANSICIONES_REPORTE[de].includes(a) ? null : "SL097";
        }
      }
      expect(r).toEqual(esperado);
    });

    it("R18 — cambiarEstado hacia atrás, al mismo estado o desde un cerrado devuelve transicion_invalida con el actual, sin cambiar nada ni escribir historial", async () => {
      const casos: [BugReportStatus, BugReportStatus][] = [
        ["in_review", "new"],
        ["in_review", "in_review"],
        ["new", "new"],
        ["resolved", "dismissed"],
        ["resolved", "new"],
        ["dismissed", "in_review"],
      ];
      const r = await revertida(async (tx) => {
        const repo = repoEn(tx);
        const salida: unknown[] = [];
        for (const [de, a] of casos) {
          const id = await sembrarReporte(tx, { status: de });
          const res = await repo.cambiarEstado({ reporteId: id, destino: a, nota: "no debe quedar", actorUsuarioId: "x" });
          salida.push({ res, estado: await estadoDe(tx, id), cambios: await cambiosDe(tx, id) });
        }
        return salida;
      });
      expect(r).toEqual(
        casos.map(([de]) => ({ res: { resultado: "transicion_invalida", actual: de }, estado: de, cambios: 0 })),
      );
    });

    it("R18 — un UPDATE a mano de resolved a new da SL097, también como dueño", async () => {
      const r = await revertida(async (tx) => {
        const id = await sembrarReporte(tx, { status: "resolved" });
        const dueno = (await tx.$queryRawUnsafe<{ u: string }[]>(`SELECT current_user AS u`))[0].u;
        return {
          dueno,
          error: await intentar(tx, `UPDATE "bug_report" SET "status" = 'new' WHERE "id" = $1`, id),
          estado: await estadoDe(tx, id),
        };
      });
      expect(r.dueno).not.toBe("servi_app");
      expect(r.error).toBe("SL097");
      expect(r.estado).toBe("resolved");
    });

    it("R20 — una nota vacía se guarda como NULL y el CHECK rechaza una de 501", async () => {
      const r = await revertida(async (tx) => {
        const id = await sembrarReporte(tx);
        const actorId = await superadminSinEmpresa(tx);
        const res = await servicioEn(tx).cambiarEstado(
          { ...SUPERADMIN, usuarioId: actorId },
          { reporteId: id, estado: "in_review", nota: "" },
        );
        const notas = await tx.$queryRawUnsafe<{ note: string | null }[]>(
          `SELECT "note" FROM "bug_report_status_change" WHERE "bug_report_id" = $1`,
          id,
        );
        const otro = await sembrarReporte(tx);
        const insertar = (n: string) =>
          intentar(
            tx,
            `INSERT INTO "bug_report_status_change" ("id", "bug_report_id", "from_status", "to_status", "note", "actor_user_id", "actor_name")
             VALUES ($1, $2, 'new', 'resolved', $3, 'x', 'x')`,
            randomUUID(),
            otro,
            n,
          );
        return {
          res,
          notas: notas.map((f) => f.note),
          quinientos: await insertar("x".repeat(500)),
          quinientosConEspacios: await insertar(`  ${"x".repeat(500)}  `),
          quinientosUno: await insertar("x".repeat(501)),
          vacia: await insertar(""),
          soloEspacios: await insertar("   "),
        };
      });
      expect(r).toEqual({
        res: { status: "ok", estado: "in_review" },
        notas: [null],
        quinientos: null,
        quinientosConEspacios: null,
        quinientosUno: "23514",
        vacia: "23514",
        soloEspacios: "23514",
      });
    });

    it("R21 — cambiarEstado deja una entrada con from, to, nota, actor_name del superadmin y created_at", async () => {
      const r = await revertida(async (tx) => {
        const id = await sembrarReporte(tx);
        const actorId = await superadminSinEmpresa(tx);
        const res = await repoEn(tx).cambiarEstado({
          reporteId: id,
          destino: "in_review",
          nota: "Lo miro",
          actorUsuarioId: actorId,
        });
        const filas = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT "from_status"::text AS de, "to_status"::text AS a, "note", "actor_user_id", "actor_name", "created_at"
             FROM "bug_report_status_change" WHERE "bug_report_id" = $1`,
          id,
        );
        return { res, actorId, filas, estado: await estadoDe(tx, id) };
      });
      expect(r.res).toEqual({ resultado: "ok" });
      expect(r.estado).toBe("in_review");
      expect(r.filas).toHaveLength(1);
      expect(r.filas[0]).toMatchObject({
        de: "new",
        a: "in_review",
        note: "Lo miro",
        actor_user_id: r.actorId,
        actor_name: NOMBRE_DEL_SUPERADMIN,
      });
      expect(r.filas[0].created_at).toBeInstanceOf(Date);
    });

    it("R21 — si falla la escritura del historial, el estado no cambia", async () => {
      const r = await revertida(async (tx) => {
        const id = await sembrarReporte(tx);
        const actorId = await superadminSinEmpresa(tx);
        const error = await repoEn(tx, true)
          .cambiarEstado({ reporteId: id, destino: "resolved", nota: null, actorUsuarioId: actorId })
          .then(
            () => null,
            (e: unknown) => (e instanceof Error ? e.name : String(e)),
          );
        return { error, estado: await estadoDe(tx, id), cambios: await cambiosDe(tx, id) };
      });
      expect(r).toEqual({ error: "HistorialCaido", estado: "new", cambios: 0 });
    });

    it("R23 — UPDATE y DELETE directos de bug_report_status_change dan SL097, también como dueño, y borrar el bug_report se lleva su historial", async () => {
      const r = await revertida(async (tx) => {
        const id = await sembrarReporte(tx, { status: "in_review" });
        const cambio = await sembrarCambio(tx, id, { de: "new", a: "in_review", nota: "nota", creado: "2001-01-02T00:00:00.000Z" });
        const update = await intentar(tx, `UPDATE "bug_report_status_change" SET "note" = 'otra' WHERE "id" = $1`, cambio);
        const borrar = await intentar(tx, `DELETE FROM "bug_report_status_change" WHERE "id" = $1`, cambio);
        const intacta = await cambiosDe(tx, id);
        const cascada = await intentar(tx, `DELETE FROM "bug_report" WHERE "id" = $1`, id);
        return { update, borrar, intacta, cascada, despues: await cambiosDe(tx, id) };
      });
      expect(r).toEqual({ update: "SL097", borrar: "SL097", intacta: 1, cascada: null, despues: 0 });
    });
  });
});
