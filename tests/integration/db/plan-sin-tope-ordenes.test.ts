import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { handleCargaMasivaChunk } from "@/app/api/ordenes/carga-masiva/chunk/route";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { RawRow } from "@/lib/parsers/spreadsheet";
import { TopeDelPlanAlcanzado, traducirErrorDeTope } from "@/lib/planes/tope-error";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { BulkOrdenService } from "@/lib/services/BulkOrdenService";

import { crearOrganizacion } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { asignarPlan, crearPlan, sqlstateDe, triggerActivo } from "./_fixtures/planes";

// SLT-86 (R8, R34) — ningún plan topa ya las órdenes, contra Postgres y por las vías REALES de la app.
//
// Una empresa con un plan que tope sus usuarios (2 admins de tienda, los que ya tiene) y nada más: el plan
// ya no puede guardar un tope de órdenes (la migración 20261106120000 borró la columna, el trigger y la
// función del cupo). Las órdenes entran por los tres caminos de hoy, cableados como en sus composition
// roots (los mismos de `cobro-plataforma-cargos.test.ts`):
//   · la pantalla de carga masiva, por su route handler (`handleCargaMasivaChunk`, tienda sin fulfillment);
//   · `BulkOrdenService.cargarMasiva` con una tienda con fulfillment (la otra rama del repositorio);
//   · la API por API key (`BulkOrdenService.cargarViaApi`).
// Antes, con un tope de 2, la tercera se rechazaba (SL024) o ni se intentaba (la lectura previa del cupo).
// Ahora entran todas, y el tope de admins de tienda sigue rechazando con SL024: los demás topes no cambian.
//
// Las filas se commitean (los repositorios abren su propia transacción) y se borran en el `afterAll`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);

let base: PrismaClient;
let app: PrismaClient;

interface Geo {
  provincia: string;
  canton: string;
  distrito: string;
  distritoId: string;
}

interface Empresa {
  id: string;
  planId: string;
  tienda: Actor;
  tiendaFulfillment: Actor;
  geo: Geo;
}

let E: Empresa;

async function sembrar(geo: Geo): Promise<Empresa> {
  const organizacionId = (await crearOrganizacion(base, { nombre: `SLT86 sin tope ${RUN}` })).id;
  const roles = await base.rol.findMany({ select: { id: true, value: true } });
  const rolDe = (v: string) => {
    const r = roles.find((x) => x.value === v);
    if (r === undefined) throw new Error(`falta el rol «${v}»: corre \`pnpm run db:seed\``);
    return r.id;
  };
  const tipo = await base.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const tienda = async (prefijo: string, fulfillment: boolean) =>
    (
      await base.usuario.create({
        data: {
          nombre: `${prefijo} ${RUN}`,
          email: `slt86-${prefijo.toLowerCase()}-${RUN}@example.test`,
          telefono: "88880000",
          passwordHash: "x",
          cedula: `SLT86-${prefijo}-${RUN}`,
          tipoIdentificacionId: tipo.id,
          rolId: rolDe("adminTienda"),
          estado: "activo",
          fulfillment,
          organizacionId,
        },
        select: { id: true },
      })
    ).id;
  const sinFulfillment = await tienda("Tienda", false);
  const conFulfillment = await tienda("Bodega", true);
  const zona = await base.zona.create({
    data: { nombre: `Zona SLT86 ${RUN}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId },
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
      tiendaId: sinFulfillment,
      zonaId: zona.id,
      organizacionId,
    },
  });
  // Tope de 2 admins de tienda: justo los dos que hay. Ningún tope de órdenes, porque ya no existe.
  const planId = await crearPlan(base, { porRol: { adminTienda: 2 } });
  await asignarPlan(base, organizacionId, planId);
  return {
    id: organizacionId,
    planId,
    tienda: { usuarioId: sinFulfillment, rol: "adminTienda", organizacionId },
    tiendaFulfillment: { usuarioId: conFulfillment, rol: "adminTienda", organizacionId },
    geo,
  };
}

function bulk(): BulkOrdenService {
  return new BulkOrdenService(new OrdenRepository(app), new TarifaVigenteRepository(app));
}

function filaPantalla(numRemision: string): RawRow {
  return {
    num_remision: numRemision,
    destinatario: `Cliente SLT86 ${RUN}`,
    telefono: "88887777",
    provincia: E.geo.provincia,
    canton_distrito: `${E.geo.canton} (${E.geo.distrito})`,
    direccion: "",
    producto: "Caja",
    notas: "",
    monto_cobrar: "",
  };
}

const remision = (nombre: string) => `SLT86-${nombre}-${RUN}`;

/** Vía 1: la pantalla de carga masiva, por su route handler. Devuelve el cuerpo de la respuesta. */
async function porPantalla(nombres: string[]) {
  const req = new Request("http://localhost/api/ordenes/carga-masiva/chunk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rows: nombres.map((n) => filaPantalla(remision(n))) }),
  });
  const res = await conEmpresa(E.id, () => handleCargaMasivaChunk(req, { getActor: async () => E.tienda, bulkService: bulk() }));
  return { status: res.status, cuerpo: (await res.json()) as { creadas?: number; conError?: number; filas?: unknown } };
}

/** Vía 2: `cargarMasiva` con la tienda con fulfillment. */
async function porCargaMasiva(nombre: string) {
  const r = await conEmpresa(E.id, () => bulk().cargarMasiva([filaPantalla(remision(nombre))], E.tiendaFulfillment));
  if (r.status !== "ok") throw new Error(`cargarMasiva devolvió ${r.status}`);
  return r.summary;
}

/** Vía 3: la API por API key; el actor es la tienda a la que apunta la key (ficha 302). */
async function porApi(nombre: string) {
  const fila = {
    num_remision: remision(nombre),
    destinatario: `Cliente SLT86 ${RUN}`,
    telefono: "88887777",
    producto: "Caja",
    provincia: E.geo.provincia,
    canton: E.geo.canton,
    distrito: E.geo.distrito,
  };
  const actor: Actor = { usuarioId: E.tienda.usuarioId, rol: "apiKey", organizacionId: E.id };
  const r = await conEmpresa(E.id, () => bulk().cargarViaApi([fila] as unknown as RawRow[], actor));
  if (r.status !== "ok") throw new Error(`cargarViaApi devolvió ${r.status}`);
  return r.summary;
}

const vivas = () => base.orden.count({ where: { organizacionId: E.id, deletedAt: null } });

describeSiHayBase("SLT-86 — sin tope de órdenes, por las vías reales (R8, R34)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    // Sin sesión: la empresa solo puede venir de `conEmpresa`.
    app = conAislamientoPorEmpresa(base, async () => null);
    // Un distrito sin zona de NADIE (otra zona en él cambiaría la resolución de la carga) y sin
    // paréntesis (la plantilla los usa de separador).
    const [d] = await base.distrito.findMany({
      where: {
        activo: true,
        zonas: { none: {} },
        NOT: [{ nombre: { contains: "(" } }, { canton: { nombre: { contains: "(" } } }],
        canton: { activo: true, provincia: { activo: true } },
      },
      select: { id: true, nombre: true, canton: { select: { nombre: true, provincia: { select: { nombre: true } } } } },
      orderBy: { id: "asc" },
      take: 1,
    });
    if (d === undefined) throw new Error("faltan distritos libres en la base: aplica las migraciones");
    await bajoLockDeEscrituraReal(async () => {
      E = await sembrar({ provincia: d.canton.provincia.nombre, canton: d.canton.nombre, distrito: d.nombre, distritoId: d.id });
    });
  }, 120_000);

  afterAll(async () => {
    if (base === undefined) return;
    if (E !== undefined) {
      await bajoLockDeEscrituraReal(async () => {
        // En el orden que piden las FK. Los movimientos del cobro se van con su orden (ON DELETE CASCADE).
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
          await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "${columna}" = $1`, E.id);
        }
        await base.$executeRawUnsafe(`DELETE FROM "plan" WHERE "id" = $1`, E.planId);
      });
    }
    await base.$disconnect();
  }, 120_000);

  it("R34: la base ya no tiene la columna, el trigger ni la función del cupo de órdenes; los de usuarios siguen", async () => {
    const [col] = await base.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'plan' AND column_name = 'tope_ordenes_ciclo'`,
    );
    const [fns] = await base.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
        WHERE s.nspname = 'public' AND p.proname IN ('plan_cupo_ordenes', 'plan_tope_ordenes')`,
    );
    expect({ columna: col.n, funciones: fns.n }).toEqual({ columna: 0, funciones: 0 });
    expect(await triggerActivo(base, "plan_tope_ordenes", "orden")).toBe(false);
    // Control de no vacuidad: el trigger del tope de usuarios sí está, y la empresa tiene el plan.
    expect(await triggerActivo(base, "plan_tope_usuario_alta", "usuario")).toBe(true);
    const org = await base.organizacion.findUniqueOrThrow({ where: { id: E.id }, select: { planId: true } });
    expect(org.planId).toBe(E.planId);
  });

  it("R8: pasadas las 2 órdenes que topaba antes, la 3.ª y siguientes entran por pantalla, carga masiva y API key", async () => {
    const dos = await porPantalla(["o1", "o2"]);
    expect(dos.status, JSON.stringify(dos.cuerpo)).toBe(200);
    expect(dos.cuerpo).toMatchObject({ creadas: 2, conError: 0 });

    const tercera = await porPantalla(["o3"]);
    expect(tercera.status, JSON.stringify(tercera.cuerpo)).toBe(200);
    expect(tercera.cuerpo).toMatchObject({ creadas: 1, conError: 0 });

    const masiva = await porCargaMasiva("o4");
    expect({ creadas: masiva.creadas, conError: masiva.conError }).toEqual({ creadas: 1, conError: 0 });

    const api = await porApi("o5");
    expect({ creadas: api.creadas, conError: api.conError }).toEqual({ creadas: 1, conError: 0 });

    // Ninguna fila lleva el error del plan que ponía la lectura previa del cupo (SL-24 R22).
    expect(JSON.stringify([dos.cuerpo, tercera.cuerpo, masiva, api])).not.toContain('"plan"');
    expect(await vivas()).toBe(5);
  });

  it("R8: la vista previa de la carga (dryRun) tampoco rechaza por órdenes", async () => {
    const r = await conEmpresa(E.id, () => bulk().cargarMasiva([filaPantalla(remision("dry"))], E.tienda, { dryRun: true }));
    if (r.status !== "ok") throw new Error(`cargarMasiva devolvió ${r.status}`);
    expect({ creadas: r.summary.creadas, conError: r.summary.conError }).toEqual({ creadas: 1, conError: 0 });
  });

  it("R8: el tope de admins de tienda sigue igual: el 3.º activo se rechaza con SL024", async () => {
    const roles = await base.rol.findMany({ where: { value: "adminTienda" }, select: { id: true } });
    const tipo = await base.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
    const error = await bajoLockDeEscrituraReal(() =>
      base.usuario
        .create({
          data: {
            nombre: `Tercera tienda ${RUN}`,
            email: `slt86-tercera-${RUN}@example.test`,
            telefono: "88880000",
            passwordHash: "x",
            cedula: `SLT86-tercera-${RUN}`,
            tipoIdentificacionId: tipo.id,
            rolId: roles[0].id,
            estado: "activo",
            organizacionId: E.id,
          },
        })
        .then(
          () => null,
          (e: unknown) => e,
        ),
    );
    expect(sqlstateDe(error)).toBe("SL024");
    const t = traducirErrorDeTope(error);
    expect(t).toBeInstanceOf(TopeDelPlanAlcanzado);
    expect((t as TopeDelPlanAlcanzado).details).toEqual({
      codigo: "tope_plan",
      tope: "rol",
      rol: "adminTienda",
      maximo: 2,
      usados: 2,
      pedidas: 1,
    });
  });
});
