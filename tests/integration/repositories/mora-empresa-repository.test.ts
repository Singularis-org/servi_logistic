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
  type TxDeTest,
} from "../db/_postgres-real";
import { GRACIA_GLOBAL, aLas, cero, comoDueno, congelar, empresa, estadoDe, facturaCerrada } from "../db/_fixtures/mora-121";
import { capturar, revertida, superadminEnTx } from "../db/_fixtures/planes";
import { tomarLockDeSuperadmin } from "../db/_fixtures/superadmin-32";

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

  describe("descongelarAMano", () => {
    it("R22, R28, R30: descongela hasta la fecha, con quién y el motivo en la fila, y encola el correo", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        await congelar(tx, org, MADRUGADA.toISOString());
        const resultado = await repoEn(tx).descongelarAMano(org, "2026-11-30", "  Acuerdo de pago  ", actor, A_MEDIA_MANANA);
        return { org, actor, resultado, estado: await estadoDe(tx, org), historial: await historialDe(tx, org), avisos: await avisosDe(tx, org) };
      });
      expect(r.resultado).toBe("ok");
      expect(r.estado).toEqual({ congeladaAt: null, descongeladaHasta: "2026-11-30" });
      expect(r.historial.map((h) => [h.accion, h.actor_usuario_id, h.valor_nuevo])).toEqual([
        ["empresa_descongelada_a_mano", r.actor, "hasta 2026-11-30 — Acuerdo de pago"],
      ]);
      expect(r.avisos.map((a) => a.payload)).toEqual([{ tipo: "descongelada", motivo: "a_mano", hasta: "2026-11-30" }]);
    });

    it("decisión P5: el motivo entra recortado a 200 caracteres", async () => {
      const largo = "m".repeat(250);
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        await congelar(tx, org, MADRUGADA.toISOString());
        await repoEn(tx).descongelarAMano(org, "2026-11-30", largo, actor, A_MEDIA_MANANA);
        return (await historialDe(tx, org))[0]?.valor_nuevo;
      });
      expect(r).toBe(`hasta 2026-11-30 — ${"m".repeat(200)}`);
    });

    it("R22: una empresa no congelada responde no_congelada y no cambia nada", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org } = await empresaVencida(tx);
        const resultado = await repoEn(tx).descongelarAMano(org, "2026-11-30", "Acuerdo", actor, A_MEDIA_MANANA);
        return { resultado, estado: await estadoDe(tx, org), filas: (await historialDe(tx, org)).length, avisos: (await avisosDe(tx, org)).length };
      });
      expect(r).toEqual({ resultado: "no_congelada", estado: { congeladaAt: null, descongeladaHasta: null }, filas: 0, avisos: 0 });
    });
  });

  describe("lecturas", () => {
    it("R32, R31: el superadmin ve la gracia propia, las facturas con su fecha límite y el historial de la mora", async () => {
      const r = await revertida(base, async (tx) => {
        const actor = await superadminEnTx(tx);
        const { org, factura } = await empresaVencida(tx);
        const repo = repoEn(tx);
        await repo.congelarSiVencida(org, MADRUGADA, GRACIA_GLOBAL);
        await repo.descongelarAMano(org, "2026-11-30", "Acuerdo", actor, A_MEDIA_MANANA);
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
