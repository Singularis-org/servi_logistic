import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { llevaSqlstate } from "@/lib/db/sqlstate";
import { BugReportRepository } from "@/lib/repositories/BugReportRepository";
import type { NuevoBugReport } from "@/lib/types/reporte-bug";
import { comoApp, datosDeOrganizacionDePrueba } from "@/tests/fabricas/organizaciones";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SLT-87 (design §2, §6; R11, R12, R13, R14, R19) — `bug_report` contra Postgres real.
//
// El repositorio va con el cliente EXTENDIDO (el de la app) y un resolutor nulo: fuera de un contexto
// explícito toda operación de negocio fallaría, así que si escribe es porque abre su `comoPlataforma`.
// Lo que queda en la base se mide con el cliente BASE (dueño), que no filtra.
//
// SIEMBRA OBLIGATORIA. Dos empresas, un usuario en cada una y un reporte de A, commiteados en
// `beforeAll` y COMPROBADOS: «servi_app no lee la fila de su propia empresa» necesita que la fila exista.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);

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

describeSiHayBase("SLT-87 — bug_report en Postgres (R11–R14, R19)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    repo = new BugReportRepository(conAislamientoPorEmpresa(base, async () => null));

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
    if (!base) return;
    await bajoLockDeEscrituraReal(async () => {
      // Los reportes caen con su usuario (CASCADE); el usuario, antes que su empresa (RESTRICT).
      const orgs = [A, B].filter(Boolean);
      await base.usuario.deleteMany({ where: { organizacionId: { in: orgs } } });
      await base.organizacion.deleteMany({ where: { id: { in: orgs } } });
    });
    await base.$disconnect();
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
});
