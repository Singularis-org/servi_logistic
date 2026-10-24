import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { ITopePagoPlataforma } from "@/lib/interfaces/services/ITopePagoPlataformaService";
import { CobroPlataformaMovimientoRepository } from "@/lib/repositories/CobroPlataformaMovimientoRepository";
import { CobroPlataformaTarifaRepository } from "@/lib/repositories/CobroPlataformaTarifaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PagoPlataformaRepository } from "@/lib/repositories/PagoPlataformaRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { DeudaPlataformaService } from "@/lib/services/DeudaPlataformaService";
import { TopePagoPlataformaService } from "@/lib/services/TopePagoPlataformaService";
import { WalletEgresoService } from "@/lib/services/WalletEgresoService";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { clienteConEmpresa459, limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-45 (design §12.2) — CONCURRENCIA DEL TOPE (R10, R11), contra Postgres, con filas COMMITEADAS.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Molde: `abono-tienda-457-concurrencia.test.ts`. Los servicios son los REALES sobre dos clientes
// Prisma distintos (dos conexiones, como dos peticiones), con la envoltura de `getPrismaClient`. Al
// primero se le mete una PAUSA dentro de su transacción, justo después de que el tope responda y
// antes del INSERT: tiene el candado tomado y todavía no ha escrito nada. Mientras dura, arranca el
// segundo:
//
//   · R10 — dos pagos de 400,00 sobre una deuda de 500,00. Con el candado, el segundo ESPERA y, al
//     entrar, lee la deuda ya rebajada (100,00) → `validation_error`. Sin el candado (la mutación de
//     T5) lee 500,00 mientras el primero está en pausa → `ok`, y la empresa queda con 300,00 a favor.
//   · R11 — la MISMA clave dos veces a la vez: el segundo espera, mira la clave después del candado y
//     responde `ya_registrado` con el pago original, aunque el tope ya lo rechazaría.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const MENSAJE_TOPE = "El pago no puede ser mayor que lo que la empresa debe a la plataforma.";

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Una señal de un solo uso. */
function senal() {
  let dar: () => void = () => undefined;
  const p = new Promise<void>((r) => {
    dar = r;
  });
  return { p, dar };
}

describeSiHayBase("SL-45 — concurrencia del pago a la plataforma (Postgres real, R10, R11)", () => {
  let base: PrismaClient;
  let clienteA: PrismaClient;
  let clienteB: PrismaClient;
  let tarifaGlobal: TarifaGlobalBajoLock | undefined;
  let p: Personas459 | null = null;
  let zonaId: string;
  let geo: { provinciaId: string; cantonId: string; distritoId: string };
  let estatusInicialId: string;

  const org = () => (p as Personas459).organizacionId;

  /** Una orden por el repositorio real de la carga masiva: el trigger de SL-40 escribe su cargo. */
  async function crearOrden(): Promise<void> {
    const personas = p as Personas459;
    const r = await conEmpresa(org(), () =>
      new OrdenRepository(clienteA).createManyOrdenes(
        [
          {
            numRemision: `SL45C-${RUN}-${randomUUID().slice(0, 8)}`,
            estatusId: estatusInicialId,
            destinatario: `Cliente SL45C ${RUN}`,
            telefonoDest: "88887777",
            tiendaId: personas.tiendaId,
            zonaId,
            provinciaId: geo.provinciaId,
            cantonId: geo.cantonId,
            distritoId: geo.distritoId,
            producto: "Caja",
            peso: null,
            notas: null,
            direccion: null,
            montoCobrar: null,
          },
        ],
        100,
        { actorUsuarioId: personas.tiendaId, origenTipo: "carga_masiva" },
        { cargaId: null, usuarioCargaId: personas.tiendaId, totalFiles: 1, name: null },
      ),
    );
    expect(r.inserted, JSON.stringify(r.omitidas)).toBe(1);
  }

  /** El servicio REAL sobre `cliente`; con `pausa`, el tope se detiene tras responder y antes del INSERT. */
  function egresos(cliente: PrismaClient, pausa?: { dentro: () => void; soltar: Promise<void> }) {
    const real = new TopePagoPlataformaService(
      new CobroPlataformaMovimientoRepository(cliente),
      new PagoPlataformaRepository(cliente),
    );
    const tope: ITopePagoPlataforma = pausa
      ? {
          comprobar: async (tx, i) => {
            const r = await real.comprobar(tx, i);
            pausa.dentro();
            await pausa.soltar; // PAUSA: candado tomado, tope respondido, nada escrito
            return r;
          },
        }
      : real;
    return new WalletEgresoService(new WalletMovimientoRepository(cliente), cliente, undefined, tope);
  }

  const pagoDe = (monto: string, clave: string = randomUUID()) => ({
    claveIdempotencia: clave,
    tipoEgreso: "pago_plataforma" as const,
    monto,
    descripcion: `Transferencia SL45C ${RUN} ${monto}`,
  });

  function pagar(cliente: PrismaClient, monto: string, opciones: { clave?: string; pausa?: Parameters<typeof egresos>[1] } = {}) {
    return conEmpresa(org(), () => egresos(cliente, opciones.pausa).registrarEgreso(pagoDe(monto, opciones.clave), (p as Personas459).maestro));
  }

  async function deuda() {
    const r = await conEmpresa(org(), () =>
      new DeudaPlataformaService(new CobroPlataformaMovimientoRepository(clienteA), new PagoPlataformaRepository(clienteA)).verDeuda(
        (p as Personas459).maestro,
      ),
    );
    if (r.status !== "ok") throw new Error(`verDeuda respondió ${JSON.stringify(r)}`);
    return r.deudaPlataforma;
  }

  const pagosEnLaBase = () =>
    base.walletMovimiento.count({ where: { organizacionId: org(), categoria: "egreso_pago_plataforma" } });

  /** Arranca un pago por `clienteA` y lo deja PAUSADO dentro de su transacción. */
  async function pagoPausado(monto: string, clave?: string) {
    const dentro = senal();
    const soltar = senal();
    const promesa = pagar(clienteA, monto, { clave, pausa: { dentro: dentro.dar, soltar: soltar.p } });
    await dentro.p;
    return { promesa, soltar: soltar.dar };
  }

  beforeAll(async () => {
    base = crearPrismaDeTest();
    clienteA = clienteConEmpresa459(crearPrismaDeTest());
    clienteB = clienteConEmpresa459(crearPrismaDeTest());

    const estatus = await base.orderStatus.findUnique({ where: { value: "por_recolectar_en_tienda" }, select: { id: true } });
    if (estatus === null) throw new Error("falta el estatus «por_recolectar_en_tienda»: corre `pnpm run db:seed`");
    estatusInicialId = estatus.id;
    const distrito = await base.distrito.findFirst({
      where: { activo: true },
      select: { id: true, cantonId: true, canton: { select: { provinciaId: true } } },
      orderBy: { id: "asc" },
    });
    if (distrito === null) throw new Error("no hay distritos: aplica las migraciones");
    geo = { provinciaId: distrito.canton.provinciaId, cantonId: distrito.cantonId, distritoId: distrito.id };

    tarifaGlobal = await tomarTarifaGlobal();
    await new CobroPlataformaTarifaRepository(base).fijarGlobal("500.00");
    p = await sembrarPersonas459(base);
    const personas = p;
    const zona = await bajoLockDeEscrituraReal(() =>
      base.zona.create({
        data: { nombre: `Zona SL45C ${RUN}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: personas.organizacionId },
        select: { id: true },
      }),
    );
    zonaId = zona.id;
    await crearOrden();
  }, 180_000);

  afterAll(async () => {
    if (base === undefined) return;
    try {
      if (p !== null) {
        const orgs = [p.organizacionId];
        await bajoLockDeEscrituraReal(async () => {
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "carga", "zona"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
        });
      }
      await limpiar459(base, p);
    } finally {
      await tarifaGlobal?.soltar();
      await Promise.all([base.$disconnect(), clienteA?.$disconnect(), clienteB?.$disconnect()]);
    }
  }, 180_000);

  it("control: la empresa debe 500,00 (un cargo real) y no tiene pagos", async () => {
    expect(await deuda()).toEqual({ deuda: "500.00", estado: "debe", importe: "500.00" });
    expect(await pagosEnLaBase()).toBe(0);
  });

  it("R10: dos pagos de 400,00 a la vez sobre 500,00 → el segundo espera, ve 100,00 y se rechaza; la deuda queda en 100,00", async () => {
    const a = await pagoPausado("400.00");

    let bTermino = false;
    const b = pagar(clienteB, "400.00").finally(() => {
      bTermino = true;
    });
    await dormir(1500);
    const terminoDuranteLaPausa = bTermino;
    a.soltar();
    const [rA, rB] = await Promise.all([a.promesa, b]);

    expect(terminoDuranteLaPausa, "el segundo pago NO debe poder evaluarse mientras el primero tiene el candado").toBe(false);
    expect(rA.status, JSON.stringify(rA)).toBe("ok");
    expect(rB).toEqual({ status: "validation_error", fieldErrors: { monto: [MENSAJE_TOPE] } });
    expect(await pagosEnLaBase()).toBe(1);
    expect(await deuda()).toEqual({ deuda: "100.00", estado: "debe", importe: "100.00" });
  }, 120_000);

  it("R10: sin pausa, dos pagos de 100,00 a la vez sobre 100,00 → exactamente uno entra y la empresa queda al día", async () => {
    const [r1, r2] = await Promise.all([pagar(clienteA, "100.00"), pagar(clienteB, "100.00")]);
    expect([r1.status, r2.status].sort()).toEqual(["ok", "validation_error"]);
    expect(await pagosEnLaBase()).toBe(2);
    expect(await deuda()).toEqual({ deuda: "0.00", estado: "al_dia", importe: "0.00" });
  }, 120_000);

  it("R11: la misma clave dos veces a la vez → el segundo espera y responde ya_registrado con el original, aunque el tope ya lo rechazaría", async () => {
    await crearOrden(); // la deuda vuelve a 500,00
    expect(await deuda()).toEqual({ deuda: "500.00", estado: "debe", importe: "500.00" });
    const clave = randomUUID();
    const a = await pagoPausado("400.00", clave);
    const b = pagar(clienteB, "400.00", { clave });
    await dormir(800);
    a.soltar();
    const [rA, rB] = await Promise.all([a.promesa, b]);

    expect(rA.status, JSON.stringify(rA)).toBe("ok");
    expect(rB.status, JSON.stringify(rB)).toBe("ya_registrado");
    if (rA.status === "ok" && rB.status === "ya_registrado") expect(rB.movimiento.id).toBe(rA.movimiento.id);
    expect(await pagosEnLaBase()).toBe(3);
    expect(await deuda()).toEqual({ deuda: "100.00", estado: "debe", importe: "100.00" });
  }, 120_000);
});
