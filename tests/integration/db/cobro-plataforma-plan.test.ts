import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { CreateOrdenData } from "@/lib/interfaces/repositories/IOrdenRepository";
import { CobroPlataformaTarifaRepository } from "@/lib/repositories/CobroPlataformaTarifaRepository";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import { EliminarOrdenService } from "@/lib/services/EliminarOrdenService";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";
import { RecuperarOrdenService } from "@/lib/services/RecuperarOrdenService";
import type { CrearPlanInput, VersionPlan } from "@/lib/types/planes";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { movimientosDe, tomarTarifaGlobal, type MovimientoLeido, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import { limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-66 (design §3, §9.1; R12–R16) — el cargo de cada orden con el escalón del plan, contra Postgres.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Recorre el ejemplo de design §3.4 fila a fila: tras cada paso, los movimientos (`tipo`, `monto`,
// `fuente`, `secuencia`) de TODAS las órdenes creadas hasta ahí. Así R15 (los cargos ya registrados no
// cambian) se comprueba en cada fila y no solo en la que cambia el costo.
//
// Las órdenes nacen por el repositorio REAL, por sus dos ramas (`createManyOrdenesConGuia`, la de la
// pantalla y la API; `createManyOrdenes`, la de fulfillment), con la empresa fijada por `conEmpresa`
// sobre el cliente extendido, como en una petición. Se anulan y se recuperan con los servicios de la
// pantalla. Quien escribe el cargo es el trigger: aquí no hay ningún INSERT a mano en la tabla.
//
// El plan se crea, se edita, se archiva y se aplica su cambio programado con `PlanesRepository` real
// (como dueño, igual que el superadmin en `comoPlataforma`); el global y la excepción, con el
// repositorio del superadmin bajo el lock de `_fixtures/cobro-plataforma-40`. La asignación es la
// misma sentencia que usan los fixtures de SL-24 (`_fixtures/planes.ts > asignarPlan`).
//
// Todo se commitea (los repositorios abren su transacción) y se limpia en el `afterAll`, acotado a las
// empresas y los planes de esta ejecución.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
/** Ningún usuario real: el rastro y el historial lo firman como «Sistema» (`resolverActorCongelado`). */
const ACTOR = randomUUID();

let base: PrismaClient;
let app: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;
let estatusId: string;
let geo: { provinciaId: string; cantonId: string; distritoId: string };

interface Empresa {
  p: Personas459;
  zonaId: string;
}

let A: Empresa;
let B: Empresa;
let C: Empresa;
let D: Empresa;
const org = (e: Empresa) => e.p.organizacionId;

let P: string;
let Q: string;
const planes = () => new PlanesRepository(base);
const tarifas = () => new CobroPlataformaTarifaRepository(base);

/** id de cada orden por su nombre en design §3.4, y lo que se espera de sus movimientos. */
const orden: Record<string, string> = {};
const esperado: Record<string, MovimientoLeido[]> = {};
/** Qué rama del repositorio creó cada orden: el control de que se usaron las dos. */
const ramas = new Set<string>();

const cargo = (monto: string, fuente: string, secuencia = 1): MovimientoLeido => ({ tipo: "cargo", fuente, monto, secuencia });
const reverso = (monto: string, fuente: string, secuencia: number): MovimientoLeido => ({ tipo: "reverso", fuente, monto, secuencia });

async function sembrarEmpresa(): Promise<Empresa> {
  const p = await sembrarPersonas459(base);
  const zona = await bajoLockDeEscrituraReal(() =>
    base.zona.create({
      data: { nombre: `Zona SLT66 ${RUN} ${randomUUID().slice(0, 6)}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: p.organizacionId },
      select: { id: true },
    }),
  );
  return { p, zonaId: zona.id };
}

function filaDe(e: Empresa, numRemision: string): CreateOrdenData {
  return {
    numRemision,
    estatusId,
    destinatario: `Cliente SLT66 ${RUN}`,
    telefonoDest: "88887777",
    tiendaId: e.p.tiendaId,
    zonaId: e.zonaId,
    provinciaId: geo.provinciaId,
    cantonId: geo.cantonId,
    distritoId: geo.distritoId,
    producto: "Caja",
    peso: null,
  };
}

/** Crea una orden por la rama pedida del repositorio real y la anota con su nombre. */
async function crear(e: Empresa, nombre: string, rama: "conGuia" | "sinGuia"): Promise<string> {
  const numRemision = `SLT66-${nombre}-${RUN}`;
  const repo = new OrdenRepository(app);
  const historial = { actorUsuarioId: e.p.tiendaId, origenTipo: "carga_masiva" as const };
  const lote = { cargaId: null, usuarioCargaId: e.p.tiendaId, totalFiles: 1, name: null };
  await conEmpresa(org(e), async () => {
    if (rama === "conGuia") {
      const r = await repo.createManyOrdenesConGuia([filaDe(e, numRemision)], 500, historial, lote);
      expect(r.creadas, JSON.stringify(r.omitidas)).toHaveLength(1);
    } else {
      const r = await repo.createManyOrdenes([filaDe(e, numRemision)], 500, historial, lote);
      expect(r.inserted, JSON.stringify(r.omitidas)).toBe(1);
    }
  });
  ramas.add(rama);
  const { id } = await base.orden.findFirstOrThrow({ where: { numRemision, organizacionId: org(e) }, select: { id: true } });
  orden[nombre] = id;
  return id;
}

function eliminar(e: Empresa, ordenId: string) {
  const repo = new OrdenRepository(app);
  const historial = new OrdenHistorialService(
    repo,
    new OrdenHistorialRepository(app),
    new OrdenDiaRepartoCambioRepository(app),
    new OrdenTraspasoRepository(app),
  );
  return conEmpresa(org(e), () => new EliminarOrdenService(repo, historial).eliminar({ ordenIds: [ordenId] }, e.p.maestro));
}

function recuperar(e: Empresa, ordenId: string) {
  return conEmpresa(org(e), () => new RecuperarOrdenService(new OrdenRepository(app)).recuperar({ ordenIds: [ordenId] }, e.p.maestro));
}

async function asignar(e: Empresa, planId: string): Promise<void> {
  await base.$executeRawUnsafe(
    `UPDATE "organizacion" SET "plan_id" = $1, "plan_ciclo_ancla_at" = (now() AT TIME ZONE 'UTC') - interval '1 hour' WHERE "id" = $2`,
    planId,
    org(e),
  );
}

/** La entrada de un plan público sin topes ni módulos, con el costo base y el costo por orden pedidos. */
function entradaDePlan(nombre: string, costoPorOrden: string | null): CrearPlanInput {
  return {
    nombre: `SLT66 ${nombre} ${RUN}`,
    visibilidad: "publico",
    organizacionId: null,
    topes: { ordenesPorCiclo: null, porRol: {}, apiKeys: null },
    modulos: [],
    precio: { tipo: "monto", mensual: "50000.00", anual: null },
    costoPorOrden,
  };
}

/** La versión vigente de P con lo que se cambie: lo que el superadmin guarda al editar. */
async function versionDeP(cambio: Partial<VersionPlan>): Promise<VersionPlan> {
  const actual = await planes().plan(P);
  if (actual === null) throw new Error("P no existe");
  return { nombre: actual.nombre, topes: actual.topes, modulos: actual.modulos, precio: actual.precio, costoPorOrden: actual.costoPorOrden, ...cambio };
}

async function editarP(cambio: Partial<VersionPlan>): Promise<void> {
  const r = await planes().editar(P, await versionDeP(cambio), ACTOR);
  expect(r, JSON.stringify(r)).toMatchObject({ estado: "ok", cambio: true });
}

/** Lo que hay en la base para cada orden creada hasta ahora, contra lo esperado. */
async function todasComoSeEspera(): Promise<void> {
  const real: Record<string, MovimientoLeido[]> = {};
  for (const nombre of Object.keys(esperado)) real[nombre] = await movimientosDe(base, orden[nombre]);
  expect(real).toEqual(esperado);
}

describeSiHayBase("SLT-66 — el cargo de cada orden con el costo por orden del plan (Postgres, R12–R16)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    // Sin sesión: la empresa solo puede venir de `conEmpresa`.
    app = conAislamientoPorEmpresa(base, async () => null);

    const estatus = await base.orderStatus.findUnique({ where: { value: "por_recolectar_en_tienda" }, select: { id: true } });
    if (estatus === null) throw new Error("falta el estatus «por_recolectar_en_tienda»: corre `pnpm run db:seed`");
    estatusId = estatus.id;
    const distrito = await base.distrito.findFirst({
      where: { activo: true },
      select: { id: true, cantonId: true, canton: { select: { provinciaId: true } } },
      orderBy: { id: "asc" },
    });
    if (distrito === null) throw new Error("no hay distritos: aplica las migraciones");
    geo = { provinciaId: distrito.canton.provinciaId, cantonId: distrito.cantonId, distritoId: distrito.id };

    // Partida de §3.4: global 500,00; A con P (100,00); B con P y excepción de 80,00; C con Q (sin
    // costo por orden); D sin plan.
    tarifaGlobal = await tomarTarifaGlobal();
    await tarifas().fijarGlobal("500.00");
    A = await sembrarEmpresa();
    B = await sembrarEmpresa();
    C = await sembrarEmpresa();
    D = await sembrarEmpresa();
    P = await planes().crear(entradaDePlan("P", "100.00"), ACTOR);
    Q = await planes().crear(entradaDePlan("Q", null), ACTOR);
    await asignar(A, P);
    await asignar(B, P);
    await asignar(C, Q);
    expect(await tarifas().fijarDeEmpresa(org(B), "80.00")).toBe(true);
  }, 240_000);

  afterAll(async () => {
    if (base === undefined) return;
    const empresas = [A, B, C, D].filter((e): e is Empresa => e !== undefined);
    const orgs = empresas.map(org);
    try {
      if (orgs.length > 0) {
        // Los movimientos del cobro se van con su orden (ON DELETE CASCADE).
        await bajoLockDeEscrituraReal(async () => {
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "carga", "zona"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
        });
      }
      for (const e of empresas) await limpiar459(base, e.p);
      const ids = [P, Q].filter((x): x is string => typeof x === "string");
      if (ids.length > 0) {
        await base.$executeRawUnsafe(`DELETE FROM "plan_rastro" WHERE "plan_id" = ANY($1::text[])`, ids);
        await base.$executeRawUnsafe(`DELETE FROM "plan" WHERE "id" = ANY($1::text[])`, ids);
      }
    } finally {
      await tarifaGlobal?.soltar();
      await base.$disconnect();
    }
  }, 240_000);

  /* ------------------------- control de no vacuidad ------------------------ */

  it("control: la función de la tarifa y el trigger de alta existen, y la partida es la de §3.4", async () => {
    const funciones = await base.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
        WHERE s.nspname = 'public' AND p.proname = 'cobro_plataforma_tarifa_de'`,
    );
    expect(funciones[0].n).toBe(1);
    const triggers = await base.$queryRawUnsafe<{ tgname: string }[]>(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = '"orden"'::regclass AND NOT tgisinternal AND tgname = 'cobro_plataforma_al_crear_orden'`,
    );
    expect(triggers).toHaveLength(1);
    const partida = await base.organizacion.findMany({
      where: { id: { in: [A, B, C, D].map(org) } },
      select: { id: true, planId: true, cobroPlataformaPorOrden: true },
    });
    const de = (e: Empresa) => partida.find((x) => x.id === org(e));
    expect(de(A)?.planId).toBe(P);
    expect(de(B)?.planId).toBe(P);
    expect(de(B)?.cobroPlataformaPorOrden?.toFixed(2)).toBe("80.00");
    expect(de(C)?.planId).toBe(Q);
    expect(de(D)?.planId).toBeNull();
    expect((await planes().plan(Q))?.costoPorOrden).toBeNull();
  });

  /* --------------------------- §3.4, fila a fila --------------------------- */

  it("R12: A crea o1 → 100.00 «plan» (excepción no hay, el plan gana al global)", async () => {
    await crear(A, "o1", "conGuia");
    esperado.o1 = [cargo("100.00", "plan")];
    await todasComoSeEspera();
  });

  it("R12: B crea p1 → 80.00 «empresa» (la excepción gana al plan)", async () => {
    await crear(B, "p1", "sinGuia");
    esperado.p1 = [cargo("80.00", "empresa")];
    await todasComoSeEspera();
  });

  it("R12: C crea q1 → 500.00 «global» (su plan no tiene costo por orden)", async () => {
    await crear(C, "q1", "conGuia");
    esperado.q1 = [cargo("500.00", "global")];
    await todasComoSeEspera();
  });

  it("R12: D crea d1 → 500.00 «global» (sin plan)", async () => {
    await crear(D, "d1", "sinGuia");
    esperado.d1 = [cargo("500.00", "global")];
    await todasComoSeEspera();
  });

  it("R15: P pasa a 120.00 (edición inmediata) y A crea o2 → 120.00; o1 sigue en 100.00", async () => {
    await editarP({ costoPorOrden: "120.00" });
    await crear(A, "o2", "sinGuia");
    esperado.o2 = [cargo("120.00", "plan")];
    await todasComoSeEspera();
  });

  it("R16: A elimina o1 → reverso de 100.00 «plan» (no 120.00)", async () => {
    const r = await eliminar(A, orden.o1);
    expect(r.status, JSON.stringify(r)).toBe("ok");
    esperado.o1 = [cargo("100.00", "plan"), reverso("100.00", "plan", 2)];
    await todasComoSeEspera();
  });

  it("R16: A recupera o1 → cargo de 100.00 «plan» (no 120.00)", async () => {
    expect(await recuperar(A, orden.o1)).toEqual({ status: "ok", recuperadas: 1 });
    esperado.o1 = [cargo("100.00", "plan"), reverso("100.00", "plan", 2), cargo("100.00", "plan", 3)];
    await todasComoSeEspera();
  });

  it("R15: se asigna Q a A y A crea o3 → 500.00 «global»", async () => {
    await asignar(A, Q);
    await crear(A, "o3", "conGuia");
    esperado.o3 = [cargo("500.00", "global")];
    await todasComoSeEspera();
  });

  it("R12, R15: se borra el global y C crea q2 → 0.00 «sin_configurar»", async () => {
    await tarifaGlobal!.fijar(null);
    await crear(C, "q2", "sinGuia");
    esperado.q2 = [cargo("0.00", "sin_configurar")];
    await todasComoSeEspera();
  });

  it("R14: P con descuento anual del 20 %; B quita la excepción y crea p2 → 120.00 «plan», sin descuento", async () => {
    await editarP({ precio: { tipo: "monto", mensual: "50000.00", anual: { tipo: "descuento", porcentaje: "20" } } });
    expect(await tarifas().fijarDeEmpresa(org(B), null)).toBe(true);
    await crear(B, "p2", "conGuia");
    esperado.p2 = [cargo("120.00", "plan")];
    await todasComoSeEspera();
  });

  it("R14: P con base negociable; B crea p3 → 120.00 «plan» (la forma del costo base no cuenta)", async () => {
    await editarP({ precio: { tipo: "negociable" } });
    await crear(B, "p3", "sinGuia");
    esperado.p3 = [cargo("120.00", "plan")];
    await todasComoSeEspera();
  });

  /* ------------------------- más allá de la tabla -------------------------- */

  it("R15: un cambio programado que se aplica (aplicarCambioProgramado) pone P en 130.00; B crea p4 → 130.00", async () => {
    const cambioId = randomUUID();
    await base.$executeRawUnsafe(
      `INSERT INTO "plan_cambio_programado" ("id", "plan_id", "vigente_desde", "version", "avisos_al_programar",
         "actor_usuario_id", "actor_nombre")
       VALUES ($1, $2, (now() AT TIME ZONE 'UTC') - interval '1 minute', $3::jsonb, '[]'::jsonb, $4, 'Superadmin SLT66')`,
      cambioId,
      P,
      JSON.stringify(await versionDeP({ costoPorOrden: "130.00" })),
      ACTOR,
    );
    expect(await planes().aplicarCambioProgramado({ planId: P, cambioId }, new Date())).toEqual({ estado: "aplicado" });
    expect((await planes().plan(P))?.costoPorOrden).toBe("130.00");

    await crear(B, "p4", "conGuia");
    esperado.p4 = [cargo("130.00", "plan")];
    await todasComoSeEspera();
  });

  it("R13: P archivado; B, que lo conserva, crea p5 → 130.00 «plan»", async () => {
    expect(await planes().archivar(P, ACTOR)).toMatchObject({ estado: "ok", cambio: true });
    expect((await planes().plan(P))?.archivado).toBe(true);
    expect((await base.organizacion.findUniqueOrThrow({ where: { id: org(B) }, select: { planId: true } })).planId).toBe(P);

    await crear(B, "p5", "sinGuia");
    esperado.p5 = [cargo("130.00", "plan")];
    await todasComoSeEspera();
  });

  it("R12: D, sin plan y con excepción de 70.00, crea d2 → 70.00 «empresa» (sin plan no se pierde la excepción)", async () => {
    expect(await tarifas().fijarDeEmpresa(org(D), "70.00")).toBe(true);
    await crear(D, "d2", "conGuia");
    esperado.d2 = [cargo("70.00", "empresa")];
    await todasComoSeEspera();
  });

  it("control: las órdenes nacieron por las dos ramas del repositorio", () => {
    expect([...ramas].sort()).toEqual(["conGuia", "sinGuia"]);
  });
});
