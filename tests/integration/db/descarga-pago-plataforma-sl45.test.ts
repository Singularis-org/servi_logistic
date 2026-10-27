import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  COLUMNAS_DESCARGA_WALLET_CAJA,
  filaBaseCaja,
} from "@/app/(app)/wallet/_components/wallet-ledger-descarga-columnas";
import { filasKardex } from "@/components/shared/wallet/libro-kardex-descarga";
import { libroCajaKardexAction, registrarMovimientoManualAction, verResumenCajaAction } from "@/lib/actions/wallet";
import { anularMovimientoAction } from "@/lib/actions/wallet-anulacion";
import { registrarEgresoAdministrativoAction } from "@/lib/actions/wallet-egresos";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CobroPlataformaTarifaRepository } from "@/lib/repositories/CobroPlataformaTarifaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import type { DescargaFila } from "@/lib/types/descarga";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());


// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-45 R26 y R17 — el pago a la plataforma en la DESCARGA del libro de la caja, contra Postgres.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// La descarga «Solo los movimientos» de `/wallet` es `libroCajaKardexAction` (qué filas salen y con qué
// saldo lo decide el SQL del libro) más `filasKardex` con `filaBaseCaja` (cómo se escribe cada fila).
// Aquí se recorren las dos mitades como lo hace `descargaLibroCaja` en `WalletModule.tsx`, sin la
// autoría (que es de otra lectura y deja «—»): un doble del kardex no vería una categoría excluida en
// el `WHERE`, por eso la lectura va contra la base.
//
// R17 (no se edita ni se borra un pago): ningún camino de la app tiene la escritura (lo mide la guardia
// `pago-plataforma-inmutable-sl45.guardia.test.ts`); aquí se mide el que sí existe, «Anular…», y que no
// toca la fila del pago: su huella en la base es la misma antes y después.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
/** R26, escrito a mano: el nombre del pago en el libro y en el archivo. */
const NOMBRE_DEL_PAGO = "Pago a la plataforma";

let base: PrismaClient;
let app: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;
let p: Personas459;
let zonaId: string;
let pagoId: string;
let huellaDelPago: string;

const deps = (actor: Actor) => ({ getActor: async () => actor });
const org = () => p.organizacionId;

/** La hoja «Movimientos» del archivo, colocada como la coloca `descargaLibroCaja`. */
async function descargar(): Promise<DescargaFila[]> {
  const r = await conEmpresa(org(), () => libroCajaKardexAction({ sortBy: "fecha", sortDir: "asc" }, deps(p.maestro)));
  if (r.status !== "ok") throw new Error(`libroCajaKardexAction respondió ${JSON.stringify(r)}`);
  return filasKardex({
    movimientos: r.items,
    kardex: r.kardex,
    filaBase: (m, ordenes) => filaBaseCaja(m, undefined, ordenes),
    variante: "caja",
    fechaInicial: null,
  }).filas;
}

async function enCaja(): Promise<string> {
  const r = await conEmpresa(org(), () => verResumenCajaAction({ page: 1, pageSize: 10 }, deps(p.maestro)));
  if (r.status !== "ok") throw new Error(`verResumenCajaAction respondió ${JSON.stringify(r)}`);
  return r.resumen.enCaja;
}

/** md5 de la fila entera del pago, leída por el cliente dueño (sin RLS): lo que hay de verdad. */
async function huella(id: string): Promise<{ n: number; md5: string | null }> {
  const filas = await base.$queryRawUnsafe<{ n: number; md5: string | null }[]>(
    `SELECT count(*)::int AS n, md5(string_agg(w::text, ',')) AS md5 FROM "wallet_movimiento" w WHERE w."id" = $1`,
    id,
  );
  return filas[0];
}

const dec = (x: unknown) => new Prisma.Decimal(x === null || x === undefined ? "0" : String(x));

/**
 * Los saldos del archivo cuadran fila a fila: cada saldo es el anterior más «Entra» menos «Sale», y el
 * del «Total del periodo» es el de la última fila. Devuelve las filas de movimiento.
 */
function cuadrar(filas: DescargaFila[]): DescargaFila[] {
  const movimientos = filas.slice(1, -1);
  expect(movimientos.length, "control: el archivo tiene movimientos").toBeGreaterThanOrEqual(2);
  let saldo = dec(filas[0].saldo);
  for (const f of movimientos) {
    saldo = saldo.add(dec(f.entra)).sub(dec(f.sale)).sub(dec(f.cobradoATiendas));
    expect(dec(f.saldo).toFixed(2), `saldo de «${String(f.concepto)}»`).toBe(saldo.toFixed(2));
  }
  expect(dec(filas[filas.length - 1].saldo).toFixed(2), "saldo del «Total del periodo»").toBe(saldo.toFixed(2));
  return movimientos;
}

describeSiHayBase("SL-45 R26/R17 — el pago a la plataforma en la descarga del libro de la caja (Postgres)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);

    const estatus = await base.orderStatus.findUnique({ where: { value: "por_recolectar_en_tienda" }, select: { id: true } });
    if (estatus === null) throw new Error("falta el estatus «por_recolectar_en_tienda»: corre `pnpm run db:seed`");
    const distrito = await base.distrito.findFirst({
      where: { activo: true },
      select: { id: true, cantonId: true, canton: { select: { provinciaId: true } } },
      orderBy: { id: "asc" },
    });
    if (distrito === null) throw new Error("no hay distritos: aplica las migraciones");

    tarifaGlobal = await tomarTarifaGlobal();
    p = await sembrarPersonas459(base);
    const zona = await bajoLockDeEscrituraReal(() =>
      base.zona.create({
        data: { nombre: `Zona SL45-D ${RUN}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: p.organizacionId },
        select: { id: true },
      }),
    );
    zonaId = zona.id;
    await new CobroPlataformaTarifaRepository(base).fijarGlobal("500.00");

    const ajuste = await conEmpresa(org(), () =>
      registrarMovimientoManualAction(
        { claveIdempotencia: randomUUID(), tipo: "ingreso", categoria: "ingreso_ajuste", monto: "5000.00", descripcion: `Ajuste SL45-D ${RUN}` },
        deps(p.maestro),
      ),
    );
    if (ajuste.status !== "ok") throw new Error(`siembra: ajuste ${JSON.stringify(ajuste)}`);

    // Dos órdenes por el repositorio real: el trigger de SL-40 escribe 1.000,00 de deuda.
    const filas = [0, 1].map((i) => ({
      numRemision: `SL45D-${RUN}-${i}`,
      estatusId: estatus.id,
      destinatario: `Cliente SL45-D ${RUN}`,
      telefonoDest: "88887777",
      tiendaId: p.tiendaId,
      zonaId,
      provinciaId: distrito.canton.provinciaId,
      cantonId: distrito.cantonId,
      distritoId: distrito.id,
      producto: "Caja",
      peso: null,
      notas: null,
      direccion: null,
      montoCobrar: null,
    }));
    const r = await conEmpresa(org(), () =>
      new OrdenRepository(app).createManyOrdenes(
        filas,
        100,
        { actorUsuarioId: p.tiendaId, origenTipo: "carga_masiva" },
        { cargaId: null, usuarioCargaId: p.tiendaId, totalFiles: 2, name: null },
      ),
    );
    if (r.inserted !== 2) throw new Error(`siembra: órdenes ${JSON.stringify(r.omitidas)}`);

    const pago = await conEmpresa(org(), () =>
      registrarEgresoAdministrativoAction(
        { tipoEgreso: "pago_plataforma", monto: "600.00", descripcion: `Transferencia SL45-D ${RUN}`, claveIdempotencia: randomUUID() },
        deps(p.maestro),
      ),
    );
    if (pago.status !== "ok") throw new Error(`siembra: pago ${JSON.stringify(pago)}`);
    pagoId = pago.movimiento.id;
    const h = await huella(pagoId);
    expect(h.n).toBe(1);
    huellaDelPago = h.md5 as string;
  }, 180_000);

  afterAll(async () => {
    if (base === undefined) return;
    try {
      if (p !== undefined) {
        await bajoLockDeEscrituraReal(async () => {
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "carga", "zona"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = $1`, p.organizacionId);
          }
        });
      }
      await limpiar459(base, p ?? null);
    } finally {
      await tarifaGlobal?.soltar();
      await base.$disconnect();
    }
  }, 180_000);

  it("R26: la hoja tiene las columnas de antes de SL-45, escritas a mano", () => {
    // El contrato del archivo antes de esta ficha (468 / 458-E). SL-45 no añade ni quita ninguna.
    expect(COLUMNAS_DESCARGA_WALLET_CAJA.map((c) => c.clave)).toEqual([
      "fecha",
      "concepto",
      "detalle",
      "aQuien",
      "esDineroDe",
      "entra",
      "sale",
      "cobradoATiendas",
      "saldo",
      "registro",
    ]);
  });

  it("R26: el archivo trae el pago con su nombre, en «Sale», y sus saldos cuadran con la caja", async () => {
    const filas = await descargar();
    const movimientos = cuadrar(filas);
    const pagos = movimientos.filter((f) => f.concepto === NOMBRE_DEL_PAGO);
    expect(pagos, "una sola fila del pago, con su nombre").toHaveLength(1);
    const [fila] = pagos;
    expect(fila).toMatchObject({ entra: null, sale: "600.00", cobradoATiendas: null, esDineroDe: "La empresa" });
    // Ninguna celda fuera de las columnas declaradas.
    const claves = COLUMNAS_DESCARGA_WALLET_CAJA.map((c) => c.clave);
    for (const k of Object.keys(fila)) expect(claves, `columna «${k}»`).toContain(k);

    // El saldo final del archivo es el «Dinero en caja» de la pantalla: 5.000,00 − 600,00.
    expect(filas[filas.length - 1].saldo).toBe("4400.00");
    expect(await enCaja()).toBe("4400.00");
  });

  it("R26/R17: tras «Anular…», el archivo conserva el pago y su contra-asiento, cuadra con la caja, y la fila del pago no cambió", async () => {
    const r = await conEmpresa(org(), () =>
      anularMovimientoAction({ destino: { libro: "caja", movimientoId: pagoId }, motivo: `Pago mal registrado SL45-D ${RUN}` }, deps(p.maestro)),
    );
    expect(r.status, JSON.stringify(r)).toBe("ok");

    const filas = await descargar();
    const movimientos = cuadrar(filas);
    const pagos = movimientos.filter((f) => f.concepto === NOMBRE_DEL_PAGO);
    expect(pagos, "el pago sigue en el archivo: anular no lo borra").toHaveLength(1);
    expect(pagos[0]).toMatchObject({ entra: null, sale: "600.00" });
    const ultima = movimientos[movimientos.length - 1];
    expect(ultima.concepto, "el contra-asiento no se llama como el pago").not.toBe(NOMBRE_DEL_PAGO);
    expect(ultima).toMatchObject({ entra: "600.00", sale: null });
    expect(filas[filas.length - 1].saldo).toBe("5000.00");
    expect(await enCaja()).toBe("5000.00");

    // R17: la corrección no editó ni borró la fila del pago.
    expect(await huella(pagoId)).toEqual({ n: 1, md5: huellaDelPago });
  });
});
