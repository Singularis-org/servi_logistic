import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { MoraEmpresaRepository } from "@/lib/repositories/MoraEmpresaRepository";
import { comoApp } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  RegistroCaido,
  clienteConSavepoint,
  crearPrismaDeTest,
  tomarLockDeEscrituraReal,
  type TxDeTest,
} from "../db/_postgres-real";
import { GRACIA_GLOBAL, aLas, cero, comoDueno, congelar, empresa, estadoDe, facturaCerrada } from "../db/_fixtures/mora-121";
import { capturar, revertida, superadminEnTx } from "../db/_fixtures/planes";
import { superadminDeLaBase, tomarLockDeSuperadmin } from "../db/_fixtures/superadmin-32";

// SLT-121 · T2.4 (design §5.1; R5, R7, R9, R22, R26, R30, R31, R32, R33) — `MoraEmpresaRepository` contra Postgres
// real, cada caso en una transacción del dueño que se revierte. El repositorio recibe la `tx` del caso con un
// `$transaction` que abre un SAVEPOINT de verdad (`clienteConSavepoint`): un fallo dentro deshace solo lo suyo,
// como haría su transacción en producción.
//
// La empresa de los casos tiene una factura cerrada de 1000 con `hasta` = 16 nov a las 00:00 de la plataforma:
// con la gracia global (7) paga hasta el 23 y está vencida desde las 00:00 del 24 (R1, R6).
//
// Las lecturas de la empresa (`moraDeLaEmpresa`, `estaCongelada`, `moraParaPlataforma`) corren como la
// extensión las dejaría: `servi_app` con la empresa fijada (`comoApp`).
//
// SLT-255 · T2.3 (design §3.1, §6; R2-R5, R8-R10, R15, R18, R21): `descongelarAMano` pasa a `darPlazo` (descongela o
// da prórroga) y se suma `quitarPlazo`; la corrida encola la víspera del plazo. Al final, los cruces en paralelo
// contra filas commiteadas (R10, sin 40P01).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let soltarSuperadmin: () => Promise<void> = async () => {};

const HASTA = cero("2026-11-16");
const MADRUGADA = new Date(aLas("2026-11-24", "00:30"));
const A_MEDIA_MANANA = new Date(aLas("2026-11-24", "10:00"));

const repoEn = (tx: TxDeTest, romperRegistro = false) =>
  new MoraEmpresaRepository(clienteConSavepoint(tx, romperRegistro));

async function empresaVencida(tx: TxDeTest): Promise<{ org: string; factura: string }> {
  const org = await empresa(tx);
  const factura = await facturaCerrada(tx, org, { numero: 1, hasta: HASTA, total: "1000.00" });
  return { org, factura };
}

interface FilaHistorial {
  accion: string;
  entidad_tipo: string;
  entidad_id: string;
  entidad_etiqueta: string;
  actor_usuario_id: string | null;
  actor_rol: string | null;
  monto: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
}

async function historialDe(tx: TxDeTest, org: string): Promise<FilaHistorial[]> {
  return tx.$queryRawUnsafe<FilaHistorial[]>(
    `SELECT "accion"::text AS accion, "entidad_tipo"::text AS entidad_tipo, "entidad_id", "entidad_etiqueta",
            "actor_usuario_id", "actor_rol"::text AS actor_rol, "monto"::text AS monto, "valor_anterior", "valor_nuevo"
       FROM "historial_accion" WHERE "organizacion_id" = $1 ORDER BY "created_at", "accion"::text`,
    org,
  );
}

interface FilaJob {
  payload: Record<string, unknown>;
  dedupe_key: string;
  organizacion_id: string | null;
  run_after: string;
}

async function avisosDe(tx: TxDeTest, org: string): Promise<FilaJob[]> {
  return tx.$queryRawUnsafe<FilaJob[]>(
    `SELECT "payload", "dedupe_key", "organizacion_id",
            to_char("run_after", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS run_after
       FROM "jobs" WHERE "tipo" = 'mora_aviso_correo' AND "dedupe_key" LIKE '%' || $1 || '%' ORDER BY "dedupe_key"`,
    org,
  );
}

/** Las facturas de la empresa tal como las dejó la siembra: para ver que «dar plazo» no las toca (R3). */
async function facturasDe(tx: TxDeTest, org: string): Promise<unknown[]> {
  return tx.$queryRawUnsafe(
    `SELECT "id", "estado"::text AS estado, "hasta_at"::text AS hasta_at, "total"::text AS total
       FROM "factura_plataforma" WHERE "organizacion_id" = $1 ORDER BY "id"`,
    org,
  );
}

async function graciaPropiaDe(tx: TxDeTest, org: string): Promise<number | null> {
  const [{ dias }] = await tx.$queryRawUnsafe<{ dias: number | null }[]>(
    `SELECT "factura_dias_gracia" AS dias FROM "organizacion" WHERE "id" = $1`,
    org,
  );
  return dias;
}

describeSiHayBase("SLT-121 — MoraEmpresaRepository (R5, R7, R9, R22, R26, R30-R33)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    soltarSuperadmin = await tomarLockDeSuperadmin();
  });
  afterAll(async () => {
    await soltarSuperadmin();
    await base?.$disconnect();
  });

  describe("congelarSiVencida", () => {
    it("R7, R27, R30: congela y, en la misma transacción, deja la fila «congelada» del sistema y el correo", async () => {
      const r = await revertida(base, async (tx) => {
        const { org, factura } = await empresaVencida(tx);
        await facturaCerrada(tx, org, { numero: 2, hasta: cero("2026-10-31"), total: "250.50" });
        const resultado = await repoEn(tx).congelarSiVencida(org, MADRUGADA, GRACIA_GLOBAL);
        return { org, factura, resultado, estado: await estadoDe(tx, org), historial: await historialDe(tx, org), avisos: await avisosDe(tx, org) };
      });
      expect(r.resultado).toMatchObject({ resultado: "congelada", saldoVencido: "1250.50" });
      expect(r.resultado.resultado === "congelada" && r.resultado.facturas.map((f) => f.numero)).toEqual([1, 2]);
      expect(r.estado.congeladaAt).toBe(MADRUGADA.toISOString());
      expect(r.historial).toEqual([
        {
          accion: "empresa_congelada",
          entidad_tipo: "organizacion",
          entidad_id: r.org,
          entidad_etiqueta: "Plazo de pago y mora",
          actor_usuario_id: null,
          actor_rol: null,
          monto: "1250.50",
          valor_anterior: null,
          valor_nuevo: "N.º 1, N.º 2",
        },
      ]);
      expect(r.avisos).toEqual([
        {
          payload: { tipo: "congelada", congeladaAt: MADRUGADA.toISOString() },
          dedupe_key: `mora_aviso:congelada:${r.org}:${MADRUGADA.toISOString()}`,
          organizacion_id: r.org,
          run_after: expect.any(String) as unknown as string,
        },
      ]);
    });

    it("R9: repetir la corrida en la misma madrugada no duplica la fila ni el correo", async () => {
      const r = await revertida(base, async (tx) => {
        const { org } = await empresaVencida(tx);
        const repo = repoEn(tx);
        const primera = await repo.congelarSiVencida(org, MADRUGADA, GRACIA_GLOBAL);
        const segunda = await repo.congelarSiVencida(org, new Date(aLas("2026-11-24", "01:30")), GRACIA_GLOBAL);
        return { primera: primera.resultado, segunda, historial: await historialDe(tx, org), avisos: await avisosDe(tx, org) };
      });
      expect(r.primera).toBe("congelada");
      expect(r.segunda).toEqual({ resultado: "ya_congelada" });
      expect(r.historial).toHaveLength(1);
      expect(r.avisos).toHaveLength(1);
    });

    it("R8: fuera de la franja, y sin vencidas, no escribe nada", async () => {
      const r = await revertida(base, async (tx) => {
        const { org } = await empresaVencida(tx);
        const alDia = await empresa(tx);
        const repo = repoEn(tx);
        return {
          fuera: await repo.congelarSiVencida(org, A_MEDIA_MANANA, GRACIA_GLOBAL),
          alDia: await repo.congelarSiVencida(alDia, MADRUGADA, GRACIA_GLOBAL),
          filas: (await historialDe(tx, org)).length + (await historialDe(tx, alDia)).length,
          avisos: (await avisosDe(tx, org)).length + (await avisosDe(tx, alDia)).length,
          estado: await estadoDe(tx, org),
        };
      });
      expect(r.fuera).toEqual({ resultado: "fuera_de_franja" });
      expect(r.alDia).toEqual({ resultado: "al_dia" });
      expect(r.filas + r.avisos).toBe(0);
      expect(r.estado.congeladaAt).toBeNull();
    });

    it("R30: si el registro falla, la empresa no queda congelada (misma transacción)", async () => {
      const r = await revertida(base, async (tx) => {
        const { org } = await empresaVencida(tx);
        const error = await capturar(tx, () => repoEn(tx, true).congelarSiVencida(org, MADRUGADA, GRACIA_GLOBAL));
        return { error, estado: await estadoDe(tx, org), avisos: await avisosDe(tx, org) };
      });
      expect(r.error).toBeInstanceOf(RegistroCaido);
      expect(r.estado.congeladaAt).toBeNull();
      expect(r.avisos).toEqual([]);
    });
  });

  describe("fijarGracia", () => {
    it("R3, R30: de la global a 15 y de vuelta, con quién y los dos valores; un valor igual no escribe", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        const repo = repoEn(tx);
        const a15 = await repo.fijarGracia(org, 15, actor, A_MEDIA_MANANA, GRACIA_GLOBAL);
        const otraVez = await repo.fijarGracia(org, 15, actor, A_MEDIA_MANANA, GRACIA_GLOBAL);
        const aGlobal = await repo.fijarGracia(org, null, actor, A_MEDIA_MANANA, GRACIA_GLOBAL);
        const [{ dias }] = await tx.$queryRawUnsafe<{ dias: number | null }[]>(
          `SELECT "factura_dias_gracia" AS dias FROM "organizacion" WHERE "id" = $1`,
          org,
        );
        return { actor, a15, otraVez, aGlobal, dias, historial: await historialDe(tx, org) };
      });
      expect([r.a15, r.otraVez, r.aGlobal]).toEqual(["ok", "sin_cambio", "ok"]);
      expect(r.dias).toBeNull();
      // Sin orden: dos filas del mismo milisegundo empatan en `created_at`.
      const filas = r.historial.map((h) => [h.accion, h.valor_anterior, h.valor_nuevo, h.actor_usuario_id, h.actor_rol]);
      expect(filas).toHaveLength(2);
      expect(filas).toEqual(
        expect.arrayContaining([
          ["factura_dias_gracia_cambiada", "7 (global)", "15", r.actor, "superadmin"],
          ["factura_dias_gracia_cambiada", "15", "7 (global)", r.actor, "superadmin"],
        ]),
      );
    });

    it("R5, R28, R30: con la empresa congelada, una gracia que deja la factura en plazo la descongela en el acto", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        await congelar(tx, org, MADRUGADA.toISOString());
        const resultado = await repoEn(tx).fijarGracia(org, 15, actor, A_MEDIA_MANANA, GRACIA_GLOBAL);
        return { org, actor, resultado, estado: await estadoDe(tx, org), historial: await historialDe(tx, org), avisos: await avisosDe(tx, org) };
      });
      expect(r.resultado).toBe("ok");
      expect(r.estado.congeladaAt).toBeNull();
      // Sin orden: las dos filas pueden caer en el mismo milisegundo.
      expect(r.historial.map((h) => [h.accion, h.actor_usuario_id]).sort()).toEqual([
        ["empresa_descongelada_por_gracia", r.actor],
        ["factura_dias_gracia_cambiada", r.actor],
      ]);
      expect(r.avisos.map((a) => [a.payload, a.dedupe_key])).toEqual([
        [{ tipo: "descongelada", motivo: "gracia" }, `mora_aviso:descongelada:${r.org}:${A_MEDIA_MANANA.toISOString()}`],
      ]);
    });

    it("R5: subir la gracia sin dejar la factura en plazo no descongela; bajarla nunca congela", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const congelada = await empresaVencida(tx);
        await congelar(tx, congelada.org, MADRUGADA.toISOString());
        const enPlazo = await empresa(tx);
        await facturaCerrada(tx, enPlazo, { numero: 1, hasta: cero("2026-11-20"), total: "500.00" });
        const repo = repoEn(tx);
        // Con 8 días paga hasta el 24: el 26 sigue vencida.
        await repo.fijarGracia(congelada.org, 8, actor, new Date(aLas("2026-11-26", "10:00")), GRACIA_GLOBAL);
        await repo.fijarGracia(enPlazo, 1, actor, A_MEDIA_MANANA, GRACIA_GLOBAL);
        return {
          congelada: await estadoDe(tx, congelada.org),
          enPlazo: await estadoDe(tx, enPlazo),
          acciones: [...(await historialDe(tx, congelada.org)), ...(await historialDe(tx, enPlazo))].map((h) => h.accion),
        };
      });
      expect(r.congelada.congeladaAt).toBe(MADRUGADA.toISOString());
      expect(r.enPlazo.congeladaAt).toBeNull();
      expect(r.acciones).toEqual(["factura_dias_gracia_cambiada", "factura_dias_gracia_cambiada"]);
    });
  });

  describe("SLT-255 darPlazo", () => {
    it("R2, R15, R21: con la empresa congelada, la descongela hasta la fecha, deja la fila del descongelamiento y el correo de SLT-121", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        await congelar(tx, org, MADRUGADA.toISOString());
        const resultado = await repoEn(tx).darPlazo(org, "2026-11-30", "  Acuerdo de pago  ", actor, A_MEDIA_MANANA);
        return { org, actor, resultado, estado: await estadoDe(tx, org), historial: await historialDe(tx, org), avisos: await avisosDe(tx, org) };
      });
      expect(r.resultado).toBe("descongelada");
      expect(r.estado).toEqual({ congeladaAt: null, descongeladaHasta: "2026-11-30" });
      expect(r.historial.map((h) => [h.accion, h.actor_usuario_id, h.actor_rol, h.valor_anterior, h.valor_nuevo])).toEqual([
        ["empresa_descongelada_a_mano", r.actor, "superadmin", null, "hasta 2026-11-30 — Acuerdo de pago"],
      ]);
      // R21: el de operación activa de nuevo, no el de la prórroga.
      expect(r.avisos.map((a) => [a.payload, a.dedupe_key])).toEqual([
        [
          { tipo: "descongelada", motivo: "a_mano", hasta: "2026-11-30" },
          `mora_aviso:descongelada:${r.org}:${A_MEDIA_MANANA.toISOString()}`,
        ],
      ]);
    });

    it("R3, R15, R16: sin congelar, deja la prórroga sin tocar la gracia, las facturas ni el congelamiento, con su fila y su correo «dada»", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        const facturasAntes = await facturasDe(tx, org);
        const resultado = await repoEn(tx).darPlazo(org, "2026-11-30", "  Acuerdo de pago  ", actor, A_MEDIA_MANANA);
        return {
          org,
          actor,
          resultado,
          facturasAntes,
          facturasDespues: await facturasDe(tx, org),
          gracia: await graciaPropiaDe(tx, org),
          estado: await estadoDe(tx, org),
          historial: await historialDe(tx, org),
          avisos: await avisosDe(tx, org),
        };
      });
      expect(r.resultado).toBe("prorroga");
      expect(r.estado).toEqual({ congeladaAt: null, descongeladaHasta: "2026-11-30" });
      expect(r.gracia).toBeNull();
      expect(r.facturasDespues).toEqual(r.facturasAntes);
      expect(r.historial).toEqual([
        {
          accion: "empresa_prorroga_fijada",
          entidad_tipo: "organizacion",
          entidad_id: r.org,
          entidad_etiqueta: "Plazo de pago y mora",
          actor_usuario_id: r.actor,
          actor_rol: "superadmin",
          monto: null,
          valor_anterior: null,
          valor_nuevo: "hasta 2026-11-30 — Acuerdo de pago",
        },
      ]);
      expect(r.avisos).toEqual([
        {
          payload: { tipo: "prorroga", cambio: "dada", hasta: "2026-11-30" },
          dedupe_key: `mora_aviso:prorroga:${r.org}:${A_MEDIA_MANANA.toISOString()}`,
          organizacion_id: r.org,
          run_after: expect.any(String) as unknown as string,
        },
      ]);
    });

    it("R3: también a una empresa sin facturas", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const org = await empresa(tx);
        const resultado = await repoEn(tx).darPlazo(org, "2026-11-30", "Acuerdo", actor, A_MEDIA_MANANA);
        return { resultado, estado: await estadoDe(tx, org), filas: (await historialDe(tx, org)).length };
      });
      expect(r).toEqual({ resultado: "prorroga", estado: { congeladaAt: null, descongeladaHasta: "2026-11-30" }, filas: 1 });
    });

    it("R4, R15, R16: alargar y acortar dejan la fecha anterior y la nueva, y el correo dice cuál de las dos fue", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        const repo = repoEn(tx);
        const resultados = [
          await repo.darPlazo(org, "2026-11-30", "Primera", actor, new Date(aLas("2026-11-24", "10:00"))),
          await repo.darPlazo(org, "2026-12-05", "Alarga", actor, new Date(aLas("2026-11-24", "10:05"))),
          await repo.darPlazo(org, "2026-11-28", "Acorta", actor, new Date(aLas("2026-11-24", "10:10"))),
        ];
        return { resultados, estado: await estadoDe(tx, org), historial: await historialDe(tx, org), avisos: await avisosDe(tx, org) };
      });
      expect(r.resultados).toEqual(["prorroga", "prorroga", "prorroga"]);
      expect(r.estado.descongeladaHasta).toBe("2026-11-28");
      // Sin orden: las tres filas pueden caer en el mismo milisegundo.
      expect(r.historial.map((h) => [h.accion, h.valor_anterior, h.valor_nuevo]).sort()).toEqual(
        [
          ["empresa_prorroga_fijada", null, "hasta 2026-11-30 — Primera"],
          ["empresa_prorroga_fijada", "hasta 2026-11-30", "hasta 2026-12-05 — Alarga"],
          ["empresa_prorroga_fijada", "hasta 2026-12-05", "hasta 2026-11-28 — Acorta"],
        ].sort(),
      );
      // `avisosDe` ordena por la dedupe, que lleva el instante: 10:00, 10:05, 10:10.
      expect(r.avisos.map((a) => a.payload)).toEqual([
        { tipo: "prorroga", cambio: "dada", hasta: "2026-11-30" },
        { tipo: "prorroga", cambio: "alargada", hasta: "2026-12-05" },
        { tipo: "prorroga", cambio: "acortada", hasta: "2026-11-28" },
      ]);
    });

    it("R4: la misma fecha vigente responde sin_cambio, sin fila ni correo, aunque el motivo sea otro", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        const repo = repoEn(tx);
        await repo.darPlazo(org, "2026-11-30", "Acuerdo", actor, A_MEDIA_MANANA);
        const otraVez = await repo.darPlazo(org, "2026-11-30", "Otro motivo", actor, new Date(aLas("2026-11-24", "11:00")));
        return { otraVez, filas: (await historialDe(tx, org)).length, avisos: (await avisosDe(tx, org)).length };
      });
      expect(r).toEqual({ otraVez: "sin_cambio", filas: 1, avisos: 1 });
    });

    it("R1: un plazo ya vencido no cuenta como anterior: darlo otra vez es una prórroga «dada»", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "descongelada_hasta" = '2026-11-23' WHERE "id" = $1`, org);
        const resultado = await repoEn(tx).darPlazo(org, "2026-11-23", "Otra vez", actor, A_MEDIA_MANANA);
        return { resultado, historial: await historialDe(tx, org), avisos: await avisosDe(tx, org) };
      });
      expect(r.resultado).toBe("prorroga");
      expect(r.historial.map((h) => [h.valor_anterior, h.valor_nuevo])).toEqual([[null, "hasta 2026-11-23 — Otra vez"]]);
      expect(r.avisos.map((a) => a.payload)).toEqual([{ tipo: "prorroga", cambio: "dada", hasta: "2026-11-23" }]);
    });

    it("SLT-121 P5 extendida: el motivo entra recortado a 200 caracteres, en la prórroga y en el descongelamiento", async () => {
      const largo = "m".repeat(250);
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const congelada = await empresaVencida(tx);
        await congelar(tx, congelada.org, MADRUGADA.toISOString());
        const libre = await empresaVencida(tx);
        const repo = repoEn(tx);
        await repo.darPlazo(congelada.org, "2026-11-30", largo, actor, A_MEDIA_MANANA);
        await repo.darPlazo(libre.org, "2026-11-30", largo, actor, A_MEDIA_MANANA);
        await repo.quitarPlazo(libre.org, largo, actor, new Date(aLas("2026-11-24", "11:00")));
        return [...(await historialDe(tx, congelada.org)), ...(await historialDe(tx, libre.org))].map((h) => [h.accion, h.valor_nuevo]);
      });
      expect(r.sort()).toEqual(
        [
          ["empresa_descongelada_a_mano", `hasta 2026-11-30 — ${"m".repeat(200)}`],
          ["empresa_prorroga_fijada", `hasta 2026-11-30 — ${"m".repeat(200)}`],
          ["empresa_prorroga_quitada", `sin prórroga — ${"m".repeat(200)}`],
        ].sort(),
      );
    });

    it("R15: si el registro falla, la prórroga no queda ni el correo (misma transacción)", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        const error = await capturar(tx, () => repoEn(tx, true).darPlazo(org, "2026-11-30", "Acuerdo", actor, A_MEDIA_MANANA));
        return { error, estado: await estadoDe(tx, org), avisos: await avisosDe(tx, org) };
      });
      expect(r.error).toBeInstanceOf(RegistroCaido);
      expect(r.estado).toEqual({ congeladaAt: null, descongeladaHasta: null });
      expect(r.avisos).toEqual([]);
    });
  });

  describe("SLT-255 quitarPlazo", () => {
    it("R5, R15, R17: quita el plazo vigente, deja la fecha que tenía en la fila y encola el correo", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        const repo = repoEn(tx);
        await repo.darPlazo(org, "2026-11-30", "Acuerdo", actor, A_MEDIA_MANANA);
        const quitar = new Date(aLas("2026-11-24", "11:00"));
        const resultado = await repo.quitarPlazo(org, "  Ya no hay acuerdo  ", actor, quitar);
        return { org, actor, quitar, resultado, estado: await estadoDe(tx, org), historial: await historialDe(tx, org), avisos: await avisosDe(tx, org) };
      });
      expect(r.resultado).toBe("ok");
      expect(r.estado).toEqual({ congeladaAt: null, descongeladaHasta: null });
      expect(
        r.historial
          .filter((h) => h.accion === "empresa_prorroga_quitada")
          .map((h) => [h.actor_usuario_id, h.actor_rol, h.entidad_etiqueta, h.valor_anterior, h.valor_nuevo]),
      ).toEqual([[r.actor, "superadmin", "Plazo de pago y mora", "hasta 2026-11-30", "sin prórroga — Ya no hay acuerdo"]]);
      expect(r.avisos.filter((a) => a.payload.tipo === "prorroga_quitada").map((a) => [a.payload, a.dedupe_key])).toEqual([
        [{ tipo: "prorroga_quitada", hasta: "2026-11-30" }, `mora_aviso:prorroga_quitada:${r.org}:${r.quitar.toISOString()}`],
      ]);
    });

    it("R5: sin plazo vigente (nunca dado o ya vencido) responde sin_plazo y no cambia nada", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const nunca = await empresaVencida(tx);
        const vencido = await empresaVencida(tx);
        await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "descongelada_hasta" = '2026-11-23' WHERE "id" = $1`, vencido.org);
        const repo = repoEn(tx);
        return {
          nunca: await repo.quitarPlazo(nunca.org, "m", actor, A_MEDIA_MANANA),
          vencido: await repo.quitarPlazo(vencido.org, "m", actor, A_MEDIA_MANANA),
          estadoVencido: await estadoDe(tx, vencido.org),
          filas: (await historialDe(tx, nunca.org)).length + (await historialDe(tx, vencido.org)).length,
          avisos: (await avisosDe(tx, nunca.org)).length + (await avisosDe(tx, vencido.org)).length,
        };
      });
      expect(r).toEqual({
        nunca: "sin_plazo",
        vencido: "sin_plazo",
        estadoVencido: { congeladaAt: null, descongeladaHasta: "2026-11-23" },
        filas: 0,
        avisos: 0,
      });
    });

    it("R5: con la empresa congelada responde sin_plazo y no cambia nada", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        await congelar(tx, org, MADRUGADA.toISOString());
        // Una fecha que no pasó todavía: aun así, congelada no tiene plazo vigente.
        await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "descongelada_hasta" = '2026-11-30' WHERE "id" = $1`, org);
        const resultado = await repoEn(tx).quitarPlazo(org, "m", actor, A_MEDIA_MANANA);
        return { resultado, estado: await estadoDe(tx, org), filas: (await historialDe(tx, org)).length, avisos: (await avisosDe(tx, org)).length };
      });
      expect(r).toEqual({
        resultado: "sin_plazo",
        estado: { congeladaAt: MADRUGADA.toISOString(), descongeladaHasta: "2026-11-30" },
        filas: 0,
        avisos: 0,
      });
    });
  });

  describe("SLT-255 la corrida con el plazo", () => {
    it("R8, R9: con la prórroga vigente no congela; la madrugada siguiente a la fecha hasta, sí", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        const repo = repoEn(tx);
        await repo.darPlazo(org, "2026-11-25", "Acuerdo", actor, A_MEDIA_MANANA);
        const elDiaHasta = await repo.congelarSiVencida(org, new Date(aLas("2026-11-25", "00:30")), GRACIA_GLOBAL);
        const alDiaSiguiente = await repo.congelarSiVencida(org, new Date(aLas("2026-11-26", "00:30")), GRACIA_GLOBAL);
        return { elDiaHasta, alDiaSiguiente, estado: await estadoDe(tx, org) };
      });
      expect(r.elDiaHasta).toEqual({ resultado: "descongelada_a_mano" });
      expect(r.alDiaSiguiente.resultado).toBe("congelada");
      expect(r.estado.congeladaAt).toBe(aLas("2026-11-26", "00:30"));
    });

    it("R9: la primera madrugada después de quitar la prórroga, la congela", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        const repo = repoEn(tx);
        await repo.darPlazo(org, "2026-11-30", "Acuerdo", actor, A_MEDIA_MANANA);
        await repo.quitarPlazo(org, "Sin acuerdo", actor, new Date(aLas("2026-11-24", "11:00")));
        return repo.congelarSiVencida(org, new Date(aLas("2026-11-25", "00:30")), GRACIA_GLOBAL);
      });
      expect(r.resultado).toBe("congelada");
    });

    it("R10: si la corrida congeló primero, «dar plazo» la trata como congelada y la descongela", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        const repo = repoEn(tx);
        await repo.congelarSiVencida(org, MADRUGADA, GRACIA_GLOBAL);
        const resultado = await repo.darPlazo(org, "2026-11-30", "Acuerdo", actor, new Date(aLas("2026-11-24", "00:40")));
        return { resultado, estado: await estadoDe(tx, org) };
      });
      expect(r).toEqual({ resultado: "descongelada", estado: { congeladaAt: null, descongeladaHasta: "2026-11-30" } });
    });

    it("R18: la víspera del plazo, con vencidas, encola un solo aviso a las 08:00 por empresa y fecha", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        const repo = repoEn(tx);
        await repo.darPlazo(org, "2026-11-26", "Acuerdo", actor, A_MEDIA_MANANA);
        const laVispera = new Date(aLas("2026-11-25", "00:30"));
        const primera = await repo.encolarRecordatorios(org, laVispera, GRACIA_GLOBAL);
        const repetida = await repo.encolarRecordatorios(org, new Date(aLas("2026-11-25", "01:30")), GRACIA_GLOBAL);
        const otroDia = await repo.encolarRecordatorios(org, new Date(aLas("2026-11-24", "00:30")), GRACIA_GLOBAL);
        return { org, primera, repetida, otroDia, avisos: (await avisosDe(tx, org)).filter((a) => a.payload.tipo === "prorroga_vence") };
      });
      expect([r.primera, r.repetida, r.otroDia]).toEqual([1, 0, 0]);
      expect(r.avisos).toEqual([
        {
          payload: { tipo: "prorroga_vence", hasta: "2026-11-26" },
          dedupe_key: `mora_aviso:prorroga_vence:${r.org}:2026-11-26`,
          organizacion_id: r.org,
          run_after: aLas("2026-11-25", "08:00"),
        },
      ]);
    });

    it("R18: sin vencidas, o con la empresa congelada, la víspera no encola nada", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        // Factura del 20: paga hasta el 27, no está vencida el 25.
        const sinVencidas = await empresa(tx);
        await facturaCerrada(tx, sinVencidas, { numero: 1, hasta: cero("2026-11-20"), total: "500.00" });
        const congelada = await empresaVencida(tx);
        const repo = repoEn(tx);
        await repo.darPlazo(sinVencidas, "2026-11-26", "Acuerdo", actor, A_MEDIA_MANANA);
        await congelar(tx, congelada.org, MADRUGADA.toISOString());
        await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "descongelada_hasta" = '2026-11-26' WHERE "id" = $1`, congelada.org);
        const laVispera = new Date(aLas("2026-11-25", "00:30"));
        return [
          await repo.encolarRecordatorios(sinVencidas, laVispera, GRACIA_GLOBAL),
          await repo.encolarRecordatorios(congelada.org, laVispera, GRACIA_GLOBAL),
          [...(await avisosDe(tx, sinVencidas)), ...(await avisosDe(tx, congelada.org))].filter((a) => a.payload.tipo === "prorroga_vence")
            .length,
        ];
      });
      expect(r).toEqual([0, 0, 0]);
    });
  });

  describe("lecturas", () => {
    it("R32, R31: el superadmin ve la gracia propia, las facturas con su fecha límite y el historial de la mora", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org, factura } = await empresaVencida(tx);
        const repo = repoEn(tx);
        await repo.congelarSiVencida(org, MADRUGADA, GRACIA_GLOBAL);
        await repo.darPlazo(org, "2026-11-30", "Acuerdo", actor, A_MEDIA_MANANA);
        await repo.fijarGracia(org, 10, actor, A_MEDIA_MANANA, GRACIA_GLOBAL);
        // Una fila de otra categoría no entra en el historial de la mora.
        await tx.$executeRawUnsafe(
          `INSERT INTO "historial_accion" ("id", "accion", "entidad_tipo", "entidad_id", "entidad_etiqueta", "lote_id", "organizacion_id")
           VALUES (gen_random_uuid()::text, 'tope_intentos_cambiado', 'organizacion', $1, 'Intentos de entrega', gen_random_uuid()::text, $1)`,
          org,
        );
        await comoApp(tx, org);
        const leida = await repo.moraParaPlataforma(org, A_MEDIA_MANANA, GRACIA_GLOBAL);
        await comoDueno(tx);
        return { factura, leida };
      });
      expect(r.leida.graciaPropia).toBe(10);
      expect(r.leida.congeladaAt).toBeNull();
      expect(r.leida.descongeladaHasta).toBe("2026-11-30");
      expect(r.leida.facturas).toEqual([
        {
          facturaId: r.factura,
          numero: 1,
          hastaAt: new Date(HASTA),
          saldo: "1000.00",
          fechaLimite: "2026-11-26",
          venceAt: new Date(cero("2026-11-27")),
          vencida: false,
        },
      ]);
      // Sin orden: las tres se escriben en el mismo milisegundo a veces, y ahí desempata el id (aleatorio).
      expect(r.leida.historial.map((h) => h.accion).sort()).toEqual([
        "empresa_congelada",
        "empresa_descongelada_a_mano",
        "factura_dias_gracia_cambiada",
      ]);
      expect(r.leida.historial.find((h) => h.accion === "empresa_congelada")?.monto).toBe("1000.00");
    });

    it("R24, §6.2: la empresa lee su mora y si está congelada, con servi_app y su empresa fijada", async () => {
      const r = await revertida(base, async (tx) => {
        const { org } = await empresaVencida(tx);
        const otra = await empresaVencida(tx);
        await congelar(tx, org, MADRUGADA.toISOString());
        const repo = repoEn(tx);
        await comoApp(tx, org);
        const propia = { mora: await repo.moraDeLaEmpresa(A_MEDIA_MANANA, GRACIA_GLOBAL), congelada: await repo.estaCongelada() };
        await comoApp(tx, otra.org);
        const deLaOtra = await repo.estaCongelada();
        await comoDueno(tx);
        return { propia, deLaOtra };
      });
      expect(r.propia.congelada).toBe(true);
      expect(r.propia.mora.congeladaAt?.toISOString()).toBe(MADRUGADA.toISOString());
      expect(r.propia.mora.facturas.map((f) => [f.numero, f.fechaLimite, f.vencida])).toEqual([[1, "2026-11-23", true]]);
      // R18: congelar una empresa no cambia lo que lee la otra.
      expect(r.deLaOtra).toBe(false);
    });

    it("R25: la gracia de la empresa del contexto es la propia, o la global si no tiene; la otra empresa no cuenta", async () => {
      const r = await revertida(base, async (tx) => {
        const conPropia = await empresa(tx);
        const sinPropia = await empresa(tx);
        await tx.$executeRawUnsafe(`UPDATE "organizacion" SET "factura_dias_gracia" = 15 WHERE "id" = $1`, conPropia);
        const repo = repoEn(tx);
        await comoApp(tx, conPropia);
        const propia = await repo.graciaDeLaEmpresa(GRACIA_GLOBAL);
        await comoApp(tx, sinPropia);
        const global = await repo.graciaDeLaEmpresa(GRACIA_GLOBAL);
        await comoApp(tx, "");
        const sinEmpresa = await capturar(tx, () => repo.graciaDeLaEmpresa(GRACIA_GLOBAL));
        await comoDueno(tx);
        return { propia, global, sinEmpresa };
      });
      expect(r.propia).toBe(15);
      expect(r.global).toBe(GRACIA_GLOBAL);
      expect(r.sinEmpresa).toBeInstanceOf(EmpresaNoResuelta);
    });

    it("R33: sin empresa en el contexto, las lecturas de la empresa fallan sin devolver datos", async () => {
      const r = await revertida(base, async (tx) => {
        await empresaVencida(tx);
        const repo = repoEn(tx);
        await comoApp(tx, "");
        const errores = [
          await capturar(tx, () => repo.estaCongelada()),
          await capturar(tx, () => repo.moraDeLaEmpresa(A_MEDIA_MANANA, GRACIA_GLOBAL)),
        ];
        await comoDueno(tx);
        return errores;
      });
      expect(r[0]).toBeInstanceOf(EmpresaNoResuelta);
      expect(r[1]).toBeInstanceOf(EmpresaNoResuelta);
    });

    it("R32: existeEmpresa dice true de una empresa que existe y false de un id que no", async () => {
      const r = await revertida(base, async (tx) => {
        const org = await empresa(tx);
        const repo = repoEn(tx);
        return [await repo.existeEmpresa(org), await repo.existeEmpresa("00000000-0000-4000-8000-000000000121")];
      });
      expect(r).toEqual([true, false]);
    });
  });

  describe("la corrida", () => {
    it("§4.1: empresasConMora trae las que tienen saldo o están congeladas, y no las que están al día", async () => {
      const r = await revertida(base, async (tx) => {
        const conSaldo = await empresaVencida(tx);
        const alDia = await empresa(tx);
        const repo = repoEn(tx);
        const lista = await repo.empresasConMora();
        return { conSaldo: lista.includes(conSaldo.org), alDia: lista.includes(alDia) };
      });
      expect(r).toEqual({ conSaldo: true, alDia: false });
    });

    it("R26: encola el recordatorio de la factura que vence mañana, a las 08:00 de la plataforma, una sola vez", async () => {
      const r = await revertida(base, async (tx) => {
        const { org, factura } = await empresaVencida(tx);
        const repo = repoEn(tx);
        const elDiaAntes = new Date(aLas("2026-11-22", "00:30"));
        const primera = await repo.encolarRecordatorios(org, elDiaAntes, GRACIA_GLOBAL);
        const repetida = await repo.encolarRecordatorios(org, elDiaAntes, GRACIA_GLOBAL);
        const otroDia = await repo.encolarRecordatorios(org, new Date(aLas("2026-11-21", "00:30")), GRACIA_GLOBAL);
        return { org, factura, primera, repetida, otroDia, avisos: await avisosDe(tx, factura) };
      });
      expect([r.primera, r.repetida, r.otroDia]).toEqual([1, 0, 0]);
      expect(r.avisos).toEqual([
        {
          payload: { tipo: "recordatorio", facturaId: r.factura },
          dedupe_key: `mora_aviso:recordatorio:${r.factura}:2026-11-23`,
          organizacion_id: r.org,
          run_after: aLas("2026-11-22", "08:00"),
        },
      ]);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-255 (design §6; R10): LOS CRUCES EN PARALELO, con filas COMMITEADAS y dos conexiones de verdad. Dentro de una
// transacción revertida no hay dos sesiones que se crucen: aquí cada llamada va por su cliente.
//   · dos `darPlazo` sobre la misma empresa: se serializan sobre la fila (`FOR NO KEY UPDATE`), terminan los dos
//     sin 40P01 y el segundo ve la fecha que dejó el primero, así que el historial dice la verdad;
//   · `darPlazo` contra la corrida (`congelarSiVencida`) en la madrugada: gane quien gane, la empresa termina
//     sin congelar y con el plazo (R2, R10).
// Las filas viven mientras dura el bloque con el candado de la 227 tomado (`tomarLockDeEscrituraReal`): un
// `down.sql` del enum del historial que corriera a la vez abortaría al verlas. El candado del superadmin ya lo tiene
// el archivo (`beforeAll` de arriba), y va antes, como pide `superadmin-32`.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const RONDAS = 5;

/** El desenlace de una promesa sin que un rechazo corte el caso: se compara entero. */
const desenlace = <T>(p: Promise<T>) =>
  p.then(
    (ok) => ({ ok }),
    (e: unknown) => ({ error: String(e) }),
  );

describeSiHayBase("SLT-255 — R10: darPlazo en paralelo no da 40P01", () => {
  let cliente1: PrismaClient;
  let cliente2: PrismaClient;
  let soltarSuperadmin2: () => Promise<void> = async () => {};
  let soltarEscritura: () => Promise<void> = async () => {};
  let superadmin: { id: string; propio: boolean } | null = null;
  const empresas: string[] = [];

  /** Una empresa commiteada con su factura vencida de 1000 (la de los casos de arriba). */
  async function empresaCommiteada(): Promise<string> {
    const org = await cliente1.$transaction(async (tx) => {
      const id = await empresa(tx);
      await facturaCerrada(tx, id, { numero: 1, hasta: HASTA, total: "1000.00" });
      return id;
    });
    empresas.push(org);
    return org;
  }

  beforeAll(async () => {
    cliente1 = crearPrismaDeTest();
    cliente2 = crearPrismaDeTest();
    // Este bloque no comparte el `beforeAll` de arriba: toma su candado del superadmin y, después, el de la 227.
    soltarSuperadmin2 = await tomarLockDeSuperadmin();
    soltarEscritura = await tomarLockDeEscrituraReal();
    const existente = await superadminDeLaBase(cliente1);
    superadmin =
      existente !== null
        ? { id: existente, propio: false }
        : { id: await cliente1.$transaction((tx) => superadminEnTx(tx)), propio: true };
  }, 120_000);

  afterAll(async () => {
    try {
      for (const org of empresas) {
        // Las facturas se van con la empresa (ON DELETE CASCADE).
        for (const tabla of ["jobs", "historial_accion"]) {
          await cliente1.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = $1`, org);
        }
        await cliente1.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE "id" = $1`, org);
      }
      if (superadmin?.propio) await cliente1.$executeRawUnsafe(`DELETE FROM "usuario" WHERE "id" = $1`, superadmin.id);
    } finally {
      await soltarEscritura();
      await soltarSuperadmin2();
      await Promise.all([cliente1?.$disconnect(), cliente2?.$disconnect()]);
    }
  }, 120_000);

  it(`${RONDAS} rondas: dos darPlazo a la vez terminan los dos, y el segundo deja como anterior la fecha del primero`, async () => {
    const actor = (superadmin as { id: string }).id;
    for (let ronda = 1; ronda <= RONDAS; ronda++) {
      const org = await empresaCommiteada();
      const [a, b] = await Promise.all([
        desenlace(new MoraEmpresaRepository(cliente1).darPlazo(org, "2026-11-30", "Uno", actor, A_MEDIA_MANANA)),
        desenlace(new MoraEmpresaRepository(cliente2).darPlazo(org, "2026-12-05", "Dos", actor, new Date(aLas("2026-11-24", "10:01")))),
      ]);
      expect({ a, b }, `ronda ${ronda}`).toEqual({ a: { ok: "prorroga" }, b: { ok: "prorroga" } });

      const filas = await cliente1.$queryRawUnsafe<{ anterior: string | null; nuevo: string }[]>(
        `SELECT "valor_anterior" AS anterior, "valor_nuevo" AS nuevo FROM "historial_accion" WHERE "organizacion_id" = $1`,
        org,
      );
      const [{ hasta }] = await cliente1.$queryRawUnsafe<{ hasta: string }[]>(
        `SELECT "descongelada_hasta"::text AS hasta FROM "organizacion" WHERE "id" = $1`,
        org,
      );
      // El primero en tomar la fila no tenía anterior; el segundo vio la fecha del primero, y la suya es la que queda.
      const primero = filas.find((f) => f.anterior === null);
      const segundo = filas.find((f) => f.anterior !== null);
      expect(filas, `ronda ${ronda}`).toHaveLength(2);
      expect(segundo?.anterior, `ronda ${ronda}`).toBe(`hasta ${primero?.nuevo.slice(6, 16)}`);
      expect(`hasta ${hasta}`, `ronda ${ronda}`).toBe(segundo?.nuevo.slice(0, 16));
    }
  }, 180_000);

  it(`${RONDAS} rondas: darPlazo contra la corrida de madrugada; gane quien gane, la empresa queda sin congelar y con el plazo`, async () => {
    const actor = (superadmin as { id: string }).id;
    const madrugada = new Date(aLas("2026-11-24", "00:30"));
    for (let ronda = 1; ronda <= RONDAS; ronda++) {
      const org = await empresaCommiteada();
      const [corrida, plazo] = await Promise.all([
        desenlace(new MoraEmpresaRepository(cliente1).congelarSiVencida(org, madrugada, GRACIA_GLOBAL)),
        desenlace(new MoraEmpresaRepository(cliente2).darPlazo(org, "2026-11-30", "Acuerdo", actor, madrugada)),
      ]);
      // Si la corrida va primero congela y «dar plazo» descongela; si no, la corrida ve el plazo y no congela.
      expect([
        { corrida: { ok: { resultado: "congelada" } }, plazo: { ok: "descongelada" } },
        { corrida: { ok: { resultado: "descongelada_a_mano" } }, plazo: { ok: "prorroga" } },
      ]).toContainEqual({
        corrida: "ok" in corrida ? { ok: { resultado: corrida.ok.resultado } } : corrida,
        plazo,
      });
      const estado = await cliente1.$transaction((tx) => estadoDe(tx, org));
      expect(estado, `ronda ${ronda}`).toEqual({ congeladaAt: null, descongeladaHasta: "2026-11-30" });
    }
  }, 180_000);
});
