import { randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { ResultadoAsignar } from "@/lib/interfaces/repositories/IPlanesRepository";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import { asignarPlan, crearPlan, sqlstateDe } from "./_fixtures/planes";

// SL-24 / T3 (design §4.4) — sin carrera (R24), contra Postgres, con filas COMMITEADAS y dos conexiones
// de verdad (dos `PrismaClient`), como dos peticiones.
//
// La técnica es la de `pago-plataforma-sl45-concurrencia.test.ts`: la primera transacción se PAUSA
// después de su alta, con el trigger ya pasado y los cerrojos tomados, y sin confirmar. Mientras dura,
// arranca la segunda y se mira si termina:
//
//   · dos altas con cupo 1: la segunda ESPERA al cerrojo consultivo y, al entrar, cuenta la primera ya
//     confirmada → `SL024`. Sin el consultivo (mutación 3 de design §11) la segunda no ve la orden sin
//     confirmar de la primera, termina durante la pausa y las dos confirman: 2 órdenes con tope 1;
//   · un alta y una bajada de plan, en los dos órdenes: el `FOR SHARE` del trigger y el `FOR UPDATE`
//     de la asignación se esperan, y el estado final nunca pasa el tope.
//
// La bajada de plan es `PlanesRepository.asignar` REAL (T4), con sus cerrojos de design §4.4 y §5.2
// (empresa FOR UPDATE → plan FOR SHARE → contar → escribir). Para pausarla entre la escritura y el
// COMMIT, su cliente envuelve `$transaction`: la pausa va después de todo lo que hace el repositorio.
//
// Las altas son INSERT a mano con `servi_app`, en transacciones interactivas: es la única forma de
// pausar entre el alta y el COMMIT sin tocar un repositorio. El trigger no distingue la vía (R18).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const PAUSA_MS = 1500;

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function senal() {
  let dar: () => void = () => undefined;
  const p = new Promise<void>((r) => {
    dar = r;
  });
  return { p, dar };
}

interface Empresa {
  id: string;
  tiendaId: string;
  zonaId: string;
}

let base: PrismaClient;
let cliente1: PrismaClient;
let cliente2: PrismaClient;
let app: PrismaClient;
const empresas: Empresa[] = [];
const planes: string[] = [];
let geo: { estatusId: string; provinciaId: string; cantonId: string };

async function sembrarEmpresa(): Promise<Empresa> {
  const { id } = await crearOrganizacion(base, { nombre: `SL24 concurrencia ${RUN} ${empresas.length}` });
  const rol = await base.rol.findUniqueOrThrow({ where: { value: "adminTienda" }, select: { id: true } });
  const tipo = await base.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 12);
  const tienda = await base.usuario.create({
    data: {
      nombre: `Tienda SL24 ${sufijo}`,
      email: `tienda-sl24c-${sufijo}@example.test`,
      telefono: "88880000",
      passwordHash: "x",
      cedula: `sl24c-${sufijo}`,
      tipoIdentificacionId: tipo.id,
      rolId: rol.id,
      estado: "activo",
      organizacionId: id,
    },
    select: { id: true },
  });
  const zona = await base.zona.create({
    data: { nombre: `Zona SL24 ${sufijo}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba", organizacionId: id },
    select: { id: true },
  });
  const e = { id, tiendaId: tienda.id, zonaId: zona.id };
  empresas.push(e);
  return e;
}

/**
 * Un alta de una orden por SQL a mano con `servi_app`, dentro de `tx`. `created_at` en UTC explícito,
 * como lo escribe Prisma: el DEFAULT `CURRENT_TIMESTAMP` es la hora local de la sesión.
 */
async function insertar(tx: TxDeTest, e: Empresa): Promise<void> {
  await comoApp(tx, e.id);
  await tx.$executeRawUnsafe(
    `INSERT INTO "orden" ("id", "num_remision", "estatus_id", "destinatario", "telefono_dest", "tienda_id", "zona_id",
                          "provincia_id", "canton_id", "producto", "updated_at", "created_at")
     VALUES ($1, $2, $3, 'Destinatario SL-24', '88880000', $4, $5, $6, $7, 'Caja', now(), now() AT TIME ZONE 'UTC')`,
    randomUUID(),
    `SL24C-${RUN}-${randomUUID().slice(0, 8)}`,
    geo.estatusId,
    e.tiendaId,
    e.zonaId,
    geo.provinciaId,
    geo.cantonId,
  );
}

/** Lo que de verdad quedó, leído como dueño. */
async function estado(e: Empresa) {
  const org = await base.organizacion.findUniqueOrThrow({ where: { id: e.id }, select: { planId: true } });
  const ordenes = await base.orden.count({ where: { organizacionId: e.id, deletedAt: null } });
  const tope = org.planId
    ? (await base.plan.findUniqueOrThrow({ where: { id: org.planId }, select: { topeOrdenesCiclo: true } })).topeOrdenesCiclo
    : null;
  return { planId: org.planId, ordenes, tope };
}

/** El superadmin que baja el plan: el rastro lo congela como sistema (no es lo que se mide aquí). */
const ACTOR = randomUUID();

/**
 * Bajar el plan con `PlanesRepository.asignar` real. `pausa` se dispara con todo escrito (plan,
 * módulos e historial) y sin confirmar.
 */
function asignar(
  cliente: PrismaClient,
  e: Empresa,
  planId: string,
  pausa?: { dentro: () => void; soltar: Promise<void> },
): Promise<ResultadoAsignar> {
  const conPausa = new Proxy(cliente, {
    get(objetivo, prop) {
      if (prop === "$transaction") {
        return (fn: (tx: TxDeTest) => Promise<unknown>) =>
          objetivo.$transaction(
            async (tx) => {
              const r = await fn(tx);
              if (pausa) {
                pausa.dentro();
                await pausa.soltar;
              }
              return r;
            },
            { timeout: 60_000, maxWait: 30_000 },
          );
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? valor.bind(objetivo) : valor;
    },
  });
  return new PlanesRepository(conPausa).asignar(e.id, planId, ACTOR);
}

/** Un alta por `cliente`; con `pausa`, se detiene tras el INSERT (trigger pasado) y antes del COMMIT. */
function alta(
  cliente: PrismaClient,
  e: Empresa,
  pausa?: { dentro: () => void; soltar: Promise<void> },
): Promise<{ aislamiento: string }> {
  return cliente.$transaction(
    async (tx) => {
      const [{ aislamiento }] = await tx.$queryRawUnsafe<{ aislamiento: string }[]>(
        `SELECT current_setting('transaction_isolation') AS aislamiento`,
      );
      await insertar(tx, e);
      if (pausa) {
        pausa.dentro();
        await pausa.soltar;
      }
      return { aislamiento };
    },
    { timeout: 60_000, maxWait: 30_000 },
  );
}

/** Corre `primera` pausada, lanza `segunda` y mide si termina durante la pausa. */
async function enCarrera<A, B>(
  primera: (pausa: { dentro: () => void; soltar: Promise<void> }) => Promise<A>,
  segunda: () => Promise<B>,
): Promise<{ a: A | { error: unknown }; b: B | { error: unknown }; segundaTerminoDuranteLaPausa: boolean }> {
  const dentro = senal();
  const soltar = senal();
  const a = primera({ dentro: dentro.dar, soltar: soltar.p }).catch((error: unknown) => ({ error }));
  await dentro.p;
  let termino = false;
  const b = segunda()
    .catch((error: unknown) => ({ error }))
    .finally(() => {
      termino = true;
    });
  await dormir(PAUSA_MS);
  const durante = termino;
  soltar.dar();
  const [ra, rb] = await Promise.all([a, b]);
  return { a: ra, b: rb, segundaTerminoDuranteLaPausa: durante };
}

describeSiHayBase("SL-24 — el tope sin carrera (R24), dos conexiones contra Postgres", () => {
  let cupoUno: Empresa;
  let bajadaTrasAlta: Empresa;
  let altaTrasBajada: Empresa;
  let planGrande: string;
  let planChico: string;

  beforeAll(async () => {
    base = crearPrismaDeTest();
    cliente1 = crearPrismaDeTest();
    cliente2 = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(crearPrismaDeTest(), async () => null);
    const estatus = await base.orderStatus.findUniqueOrThrow({ where: { value: "en_preparacion" }, select: { id: true } });
    const canton = await base.canton.findFirstOrThrow({
      where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
      select: { id: true, provinciaId: true },
    });
    geo = { estatusId: estatus.id, provinciaId: canton.provinciaId, cantonId: canton.id };

    await bajoLockDeEscrituraReal(async () => {
      cupoUno = await sembrarEmpresa();
      bajadaTrasAlta = await sembrarEmpresa();
      altaTrasBajada = await sembrarEmpresa();
      const uno = await crearPlan(base, { ordenes: 1 });
      planGrande = await crearPlan(base, { ordenes: 10 });
      planChico = await crearPlan(base, { ordenes: 1 });
      planes.push(uno, planGrande, planChico);
      await asignarPlan(base, cupoUno.id, uno);
      await asignarPlan(base, bajadaTrasAlta.id, planGrande);
      await asignarPlan(base, altaTrasBajada.id, planGrande);
      // Una orden ya confirmada en las dos que van a bajar de plan: con el plan chico (tope 1) caben
      // justas, y cualquier alta más lo pasaría.
      for (const e of [bajadaTrasAlta, altaTrasBajada]) {
        await base.$transaction(async (tx) => insertar(tx, e));
      }
    });
    expect(await estado(cupoUno)).toMatchObject({ ordenes: 0, tope: 1 });
    expect(await estado(bajadaTrasAlta)).toMatchObject({ planId: planGrande, ordenes: 1 });
    expect(await estado(altaTrasBajada)).toMatchObject({ planId: planGrande, ordenes: 1 });
  }, 120_000);

  afterAll(async () => {
    if (base === undefined) return;
    try {
      const orgs = empresas.map((e) => e.id);
      if (orgs.length > 0) {
        await bajoLockDeEscrituraReal(async () => {
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "carga", "zona"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
          await base.usuario.deleteMany({ where: { organizacionId: { in: orgs } } });
          await base.organizacion.updateMany({ where: { id: { in: orgs } }, data: { planId: null, planCicloAnclaAt: null } });
          await base.plan.deleteMany({ where: { id: { in: planes } } });
          await base.organizacion.deleteMany({ where: { id: { in: orgs } } });
        });
      }
    } finally {
      await Promise.all([base.$disconnect(), cliente1?.$disconnect(), cliente2?.$disconnect(), app?.$disconnect()]);
    }
  }, 120_000);

  it("las transacciones de la app van en READ COMMITTED (el conteo del trigger depende de ello)", async () => {
    const porLaApp = await conEmpresa(cupoUno.id, () =>
      app.$queryRawUnsafe<{ aislamiento: string }[]>(`SELECT current_setting('transaction_isolation') AS aislamiento`),
    );
    expect(porLaApp).toEqual([{ aislamiento: "read committed" }]);
  });

  it("R24: dos altas a la vez con cupo 1 → la segunda espera, cuenta la primera y se rechaza; queda 1", async () => {
    await bajoLockDeEscrituraReal(async () => {
      const r = await enCarrera(
        (pausa) => alta(cliente1, cupoUno, pausa),
        () => alta(cliente2, cupoUno),
      );
      expect(r.segundaTerminoDuranteLaPausa, "la segunda alta NO debe poder contar mientras la primera no confirma").toBe(false);
      expect(r.a).toEqual({ aislamiento: "read committed" });
      expect("error" in r.b ? sqlstateDe(r.b.error) : "confirmó").toBe("SL024");
      expect(await estado(cupoUno)).toMatchObject({ ordenes: 1, tope: 1 });
    });
  });

  it("R24: un alta en vuelo y una bajada de plan → la bajada espera, cuenta el alta y no se aplica", async () => {
    await bajoLockDeEscrituraReal(async () => {
      const r = await enCarrera(
        (pausa) => alta(cliente1, bajadaTrasAlta, pausa),
        () => asignar(cliente2, bajadaTrasAlta, planChico),
      );
      expect(r.segundaTerminoDuranteLaPausa, "la asignación debe esperar al alta en vuelo").toBe(false);
      expect(r.a).toEqual({ aislamiento: "read committed" });
      expect(r.b).toMatchObject({
        estado: "tope_excedido",
        excedidos: [{ organizacionId: bajadaTrasAlta.id, tope: "ordenes", usados: 2, maximo: 1 }],
      });
      const final = await estado(bajadaTrasAlta);
      expect(final).toEqual({ planId: planGrande, ordenes: 2, tope: 10 });
      expect(final.ordenes).toBeLessThanOrEqual(final.tope as number);
    });
  });

  it("R24: una bajada de plan en vuelo y un alta → el alta espera, lee el plan nuevo y se rechaza", async () => {
    await bajoLockDeEscrituraReal(async () => {
      const r = await enCarrera(
        (pausa) => asignar(cliente2, altaTrasBajada, planChico, pausa),
        () => alta(cliente1, altaTrasBajada),
      );
      expect(r.segundaTerminoDuranteLaPausa, "el alta debe esperar a la asignación en vuelo").toBe(false);
      expect(r.a).toEqual({ estado: "ok", cambio: true });
      expect("error" in r.b ? sqlstateDe(r.b.error) : "confirmó").toBe("SL024");
      const final = await estado(altaTrasBajada);
      expect(final).toEqual({ planId: planChico, ordenes: 1, tope: 1 });
    });
  });
});
