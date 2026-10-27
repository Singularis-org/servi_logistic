import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ModuloApagable, PrismaClient } from "@prisma/client";

import { listarPremiosDelDiaAction, registrarPremioAction } from "@/lib/actions/premio-ranking-devengo";
import { editarPremioAction, obtenerRankingAction } from "@/lib/actions/ranking";
import { registrarMovimientoManualAction, verResumenCajaAction } from "@/lib/actions/wallet";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ModuloInactivoError } from "@/lib/modulos/modulo-inactivo-error";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { crearOrganizacion } from "@/tests/fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, tomarLockDeEscrituraReal } from "./_postgres-real";

// SL-23 · T10 (design §5.1, §5.3, §3.7; R17, R33, R34) — las actions de un módulo contra Postgres
// real, con la puerta REAL: la lectura de `organizacion_modulo` va por el cliente de la app
// (`getPrismaClient()`, con la extensión y la RLS) dentro de `conEmpresa`, igual que en una petición.
//
// La empresa del archivo se commitea como dueño y sus módulos se cambian como dueño entre casos (la
// escritura real es del superadmin, T6). Cada caso comprueba lo que la empresa tiene encendido antes
// de llamar: ninguno pasa «porque no había nada».
//
// LO QUE ESTE ARCHIVO AFIRMA DE LA FORMA DEL RECHAZO (ver progress/impl_SL-23.md, Tanda 4): las
// actions de ranking no tienen `withErrorHandler` y la puerta LANZA `ModuloInactivoError` (403); las
// de wallet y `premio-ranking-devengo` sí lo tienen, pero su traductor local no conoce `FORBIDDEN` y
// relanza. En los dos casos la action se rechaza antes de leer o escribir, que es lo que se mide aquí.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;
let soltar: () => Promise<void> = async () => {};
let empresa: string;
let maestro: Actor;

async function encender(...modulos: ModuloApagable[]): Promise<void> {
  await base.organizacionModulo.deleteMany({ where: { organizacionId: empresa } });
  if (modulos.length > 0) {
    await base.organizacionModulo.createMany({ data: modulos.map((modulo) => ({ organizacionId: empresa, modulo })) });
  }
  const filas = await base.organizacionModulo.findMany({ where: { organizacionId: empresa }, select: { modulo: true } });
  expect(filas.map((f) => f.modulo).sort()).toEqual([...modulos].sort());
}

async function cuentaDeNegocio(): Promise<{ premios: number; movimientos: number }> {
  return {
    premios: await base.premioRanking.count({ where: { organizacionId: empresa } }),
    movimientos: await base.walletMovimiento.count({ where: { organizacionId: empresa } }),
  };
}

const enEmpresa = <T>(fn: () => Promise<T>) => conEmpresa(empresa, fn);

describeSiHayBase("SL-23 — una action de un módulo apagado se rechaza antes de tocar la base (R17, R33, R34)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    soltar = await tomarLockDeEscrituraReal();
    empresa = (await crearOrganizacion(base, { nombre: "Empresa SL-23 actions" })).id;
    maestro = { usuarioId: "u-maestro-sl23", rol: "maestro", organizacionId: empresa };
  }, 60_000);

  afterAll(async () => {
    try {
      if (base && empresa) await base.organizacion.deleteMany({ where: { id: empresa } });
    } finally {
      await soltar();
      await base?.$disconnect();
    }
  }, 60_000);

  it("R17 — con Ranking apagado, las actions de ranking se rechazan (403 modulo_inactivo) y la base no cambia", async () => {
    await encender("wallet");
    const antes = await cuentaDeNegocio();
    const getActor = async () => maestro;

    await expect(enEmpresa(() => obtenerRankingAction({ getActor }))).rejects.toMatchObject({
      code: "FORBIDDEN",
      details: { codigo: "modulo_inactivo", modulo: "ranking" },
    });
    const e = await enEmpresa(() => editarPremioAction({ posicion: 1, monto: "1000" }, { getActor })).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ModuloInactivoError);
    expect(await cuentaDeNegocio()).toEqual(antes);
  });

  it("R17 — con Wallet apagado, una action de wallet se rechaza antes de leer o escribir y la base no cambia", async () => {
    await encender("ranking");
    const antes = await cuentaDeNegocio();
    const entrada = {
      tipo: "ingreso",
      categoria: "ingreso_ajuste",
      monto: "100.00",
      descripcion: "ajuste de prueba",
      claveIdempotencia: "sl23-ajuste-1",
    };
    await expect(enEmpresa(() => registrarMovimientoManualAction(entrada, { getActor: async () => maestro }))).rejects.toThrow(
      /FORBIDDEN/,
    );
    expect(await cuentaDeNegocio()).toEqual(antes);
  });

  it("R33 — con Ranking apagado y Wallet encendido, premio-ranking-devengo se rechaza", async () => {
    await encender("wallet");
    const antes = await cuentaDeNegocio();
    await expect(
      enEmpresa(() => registrarPremioAction({ filaId: "fila-inexistente" }, { getActor: async () => maestro })),
    ).rejects.toThrow(/FORBIDDEN/);
    expect(await cuentaDeNegocio()).toEqual(antes);
  });

  it("R33 — con los dos encendidos, premio-ranking-devengo funciona", async () => {
    await encender("wallet", "ranking");
    const r = await enEmpresa(() =>
      listarPremiosDelDiaAction({ fecha: fechaCalendarioCR() }, { getActor: async () => maestro }),
    );
    expect(r).toMatchObject({ status: "ok" });
  });

  it("R17 — encendido, la misma action de ranking pasa la puerta", async () => {
    await encender("ranking");
    const r = await enEmpresa(() => obtenerRankingAction({ getActor: async () => maestro })).catch((x: unknown) => x);
    expect(r).not.toBeInstanceOf(ModuloInactivoError);
  });

  describe("R34 — sin empresa la puerta no aplica: responde lo de siempre, nunca un error interno", () => {
    it("una action de wallet sin sesión → unauthenticated", async () => {
      await encender();
      const r = await verResumenCajaAction({}, { getActor: async () => null });
      expect(r).toEqual({ status: "unauthenticated" });
    });

    it("con el superadmin (sin empresa) → forbidden del rol", async () => {
      await encender();
      const superadmin: Actor = { usuarioId: "u-sa", rol: "superadmin", organizacionId: null };
      const r = await verResumenCajaAction({}, { getActor: async () => superadmin });
      expect(r).toEqual({ status: "forbidden" });
    });
  });
});
