import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { RolValue, type PrismaClient } from "@prisma/client";

import { listarEmpresasPlataforma } from "@/lib/actions/_shared/empresas-plataforma";
import { confirmarPagoPlataformaAction } from "@/lib/actions/pagos-plataforma";
import { anularMovimientoAction } from "@/lib/actions/wallet-anulacion";
import { registrarEgresoAdministrativoAction } from "@/lib/actions/wallet-egresos";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CobroPlataformaTarifaRepository } from "@/lib/repositories/CobroPlataformaTarifaRepository";
import { EmpresasPlataformaRepository } from "@/lib/repositories/EmpresasPlataformaRepository";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { EliminarOrdenService } from "@/lib/services/EliminarOrdenService";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";

import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "./_postgres-real";
import { limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";
import { asignarPlan, crearPlan } from "./_fixtures/planes";
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";
import { cerrarFacturaEnCurso } from "./_fixtures/factura-cerrada";
import { exigirSinSuperadmin, idDeRol, insertarUsuario, tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";

// SLT-42 (T5.4): la zona del pais de la empresa es la de CR, como antes. Las reglas reales leen el pais
// de la empresa en curso con el cliente global, que no ve la empresa de una transaccion revertida ni
// tiene empresa fuera de `conEmpresa`; la zona por pais la miden `hora-por-pais-wallet` y `demo-qa`.
vi.mock("@/lib/services/ReglasPaisEmpresaService", async (importOriginal) => {
  const { reglasPaisFijas } = await import("@/tests/fabricas/reglas-pais");
  return {
    ...(await importOriginal<typeof import("@/lib/services/ReglasPaisEmpresaService")>()),
    construirReglasPaisEmpresa: () => reglasPaisFijas(),
  };
});

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());


// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-45 (design §9, R28) — LA DEUDA Y LO PAGADO DE CADA EMPRESA, EN «EMPRESAS» DEL SUPERADMIN.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Dos empresas con datos reales: las órdenes nacen por el repositorio de la carga masiva (el trigger
// de SL-40 escribe el cargo), los pagos y la anulación van por las server actions de la wallet, sin
// servicio inyectado. El listado se lee como lo lee la página: `listarEmpresasPlataforma` con el
// superadmin, por su composition root y `getPrismaClient`, en contexto de plataforma.
//
//   · A: dos órdenes a 500 (1.000,00), paga 300,00 y paga 200,00 que luego anula → debe 700,00 y ha
//     pagado 300,00 (el anulado no cuenta).
//   · B: una orden con su plan fijo de 300 (SLT-126: antes, una excepción del mismo importe), la paga entera → al día y ha pagado 300,00. Luego elimina
//     la orden (reverso) → a favor 300,00, y lo pagado no cambia.
//
// Lo que se mide es la fila de cada empresa: el `WHERE` y el reparto por `organizacion_id` (dinero de
// una empresa que no puede salir en la fila de otra).
//
// SLT-60 (design §4.7, §8.1; R7, R8, R27): solo se paga lo facturado en facturas CERRADAS, así que cada empresa
// cierra la suya (fixture de T3.5) antes de pagar. Un pago queda por confirmar: la deuda y «Pagado» solo cuentan
// los CONFIRMADOS, que confirma el superadmin (commiteado: quien confirma es una FK a `usuario`) por su action. Y
// cada fila trae cuántos pagos tiene por confirmar.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const SUPERADMIN = { rol: RolValue.superadmin };
let soltarSuperadmin: () => Promise<void> = async () => {};
let superadminId: string | null = null;
/** Las facturas cerradas de cada empresa (SLT-60: lo único que se puede pagar). */
const facturaDe: Record<"A" | "B", string> = { A: "", B: "" };
/** Los pagos por su monto. */
const pagos: Record<string, string> = {};

let base: PrismaClient;
let app: PrismaClient;
let tarifaGlobal: TarifaGlobalBajoLock | undefined;
let geo: { provinciaId: string; cantonId: string; distritoId: string };
let estatusInicialId: string;

interface Empresa {
  p: Personas459;
  zonaId: string;
  ordenes: string[];
}
let A: Empresa;
let B: Empresa;

const org = (e: Empresa) => e.p.organizacionId;
const deps = (actor: Actor) => ({ getActor: async () => actor });

async function sembrarEmpresa(): Promise<Empresa> {
  const p = await sembrarPersonas459(base);
  const zona = await bajoLockDeEscrituraReal(() =>
    base.zona.create({
      data: { nombre: `Zona SL45E ${RUN} ${randomUUID().slice(0, 6)}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba", organizacionId: p.organizacionId },
      select: { id: true },
    }),
  );
  return { p, zonaId: zona.id, ordenes: [] };
}

async function crearOrdenes(e: Empresa, n: number): Promise<void> {
  const filas = Array.from({ length: n }, (_, i) => ({
    numRemision: `SL45E-${RUN}-${randomUUID().slice(0, 6)}-${i}`,
    estatusId: estatusInicialId,
    destinatario: `Cliente SL45E ${RUN}`,
    telefonoDest: "88887777",
    tiendaId: e.p.tiendaId,
    zonaId: e.zonaId,
    provinciaId: geo.provinciaId,
    cantonId: geo.cantonId,
    distritoId: geo.distritoId,
    producto: "Caja",
    peso: null,
    notas: null,
    direccion: null,
    montoCobrar: null,
  }));
  const r = await conEmpresa(org(e), () =>
    new OrdenRepository(app).createManyOrdenes(
      filas,
      100,
      { actorUsuarioId: e.p.tiendaId, origenTipo: "carga_masiva" },
      { cargaId: null, usuarioCargaId: e.p.tiendaId, totalFiles: n, name: null },
    ),
  );
  expect(r.inserted, JSON.stringify(r.omitidas)).toBe(n);
  const creadas = await base.orden.findMany({
    where: { organizacionId: org(e), numRemision: { in: filas.map((f) => f.numRemision) } },
    select: { id: true },
  });
  e.ordenes.push(...creadas.map((o) => o.id));
}

async function pagar(e: Empresa, monto: string): Promise<string> {
  const r = await conEmpresa(org(e), () =>
    registrarEgresoAdministrativoAction(
      { tipoEgreso: "pago_plataforma", monto, descripcion: `Transferencia SL45E ${RUN}`, claveIdempotencia: randomUUID() },
      deps(e.p.maestro),
    ),
  );
  if (r.status !== "ok") throw new Error(`el pago de ${monto} respondió ${JSON.stringify(r)}`);
  return r.movimiento.id;
}

/** SLT-60 (R16): el superadmin confirma un pago entero contra la factura cerrada de la empresa. */
async function confirmar(e: Empresa, factura: string, pagoId: string, monto: string): Promise<void> {
  const r = await confirmarPagoPlataformaAction(
    { organizacionId: org(e), pagoId, aplicaciones: [{ facturaId: factura, monto }] },
    deps({ usuarioId: superadminId as string, rol: RolValue.superadmin, organizacionId: null }),
  );
  expect(r, `confirmar ${monto}`).toEqual({ estado: "ok" });
}

/** Las filas de A y de B del listado del superadmin, por la misma puerta que la página. */
async function filasDelListado() {
  const r = await listarEmpresasPlataforma(SUPERADMIN);
  if (r.status !== "ok") throw new Error(`listarEmpresasPlataforma respondió ${JSON.stringify(r)}`);
  const de = (e: Empresa) => {
    const fila = r.empresas.find((x) => x.id === org(e));
    if (fila === undefined) throw new Error(`la empresa ${org(e)} no salió en el listado`);
    return { deudaPlataforma: fila.deudaPlataforma, pagadoPlataforma: fila.pagadoPlataforma, pagosPorConfirmar: fila.pagosPorConfirmar };
  };
  return { a: de(A), b: de(B) };
}

describeSiHayBase("SL-45 — la columna «Plataforma» de «Empresas»: deuda y pagado por empresa (R28)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);

    // SL-32: el superadmin es único en la base; este archivo commitea el suyo con el lock tomado.
    soltarSuperadmin = await tomarLockDeSuperadmin();
    await exigirSinSuperadmin(base);
    superadminId = await bajoLockDeEscrituraReal(() =>
      base.$transaction(async (tx) => {
        const u = await insertarUsuario(tx, await idDeRol(tx, "superadmin"), null);
        if (!u.desenlace.ok) throw new Error(`no se sembró el superadmin: ${JSON.stringify(u.desenlace)}`);
        return u.id;
      }),
    );

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
    A = await sembrarEmpresa();
    B = await sembrarEmpresa();
    const tarifas = new CobroPlataformaTarifaRepository(base);
    await tarifas.fijarGlobal("500.00");
    // SLT-126: sin valor propio de la empresa, el importe sale de un plan custom fijo (se va con la empresa).
    const planB = await crearPlan(base, { custom: org(B) });
    await base.$executeRawUnsafe(`UPDATE "plan" SET "costo_por_orden" = 300.00 WHERE "id" = $1`, planB);
    await asignarPlan(base, org(B), planB);
    await crearOrdenes(A, 2);
    await crearOrdenes(B, 1);
    // SLT-60 (R3): sin factura cerrada no se puede pagar nada.
    facturaDe.A = (await cerrarFacturaEnCurso(base, org(A))).id;
    facturaDe.B = (await cerrarFacturaEnCurso(base, org(B))).id;
  }, 180_000);

  afterAll(async () => {
    if (base === undefined) return;
    const orgs = [A?.p.organizacionId, B?.p.organizacionId].filter((x): x is string => typeof x === "string");
    try {
      if (orgs.length > 0) {
        await bajoLockDeEscrituraReal(async () => {
          // SLT-60: la FK del pago a su confirmación no tiene acción; las confirmaciones se van antes que el libro.
          for (const tabla of ["pago_plataforma_aplicacion", "pago_plataforma_confirmacion"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "carga", "zona"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
        });
      }
      await limpiar459(base, A?.p ?? null);
      await limpiar459(base, B?.p ?? null);
      if (superadminId !== null) {
        const id = superadminId;
        await bajoLockDeEscrituraReal(() => base.$executeRawUnsafe(`DELETE FROM "usuario" WHERE "id" = $1`, id));
      }
    } finally {
      await tarifaGlobal?.soltar();
      await soltarSuperadmin();
      await base.$disconnect();
    }
  }, 180_000);

  it("control: los cargos están en la base (1.000 de A, 300 de B), sus facturas cerradas y ninguna ha pagado", async () => {
    const cargos = await base.cobroPlataformaMovimiento.groupBy({
      by: ["organizacionId"],
      where: { organizacionId: { in: [org(A), org(B)] } },
      _sum: { monto: true },
    });
    expect(Object.fromEntries(cargos.map((c) => [c.organizacionId, c._sum.monto?.toFixed(2)]))).toEqual({
      [org(A)]: "1000.00",
      [org(B)]: "300.00",
    });
    const cerradas = await base.facturaPlataforma.findMany({
      where: { id: { in: [facturaDe.A, facturaDe.B] } },
      select: { organizacionId: true, estado: true, total: true },
    });
    expect(Object.fromEntries(cerradas.map((f) => [f.organizacionId, `${f.estado} ${f.total?.toFixed(2)}`]))).toEqual({
      [org(A)]: "cerrada 1000.00",
      [org(B)]: "cerrada 300.00",
    });
    expect(await filasDelListado()).toEqual({
      a: { deudaPlataforma: { deuda: "1000.00", estado: "debe", importe: "1000.00" }, pagadoPlataforma: "0.00", pagosPorConfirmar: 0 },
      b: { deudaPlataforma: { deuda: "300.00", estado: "debe", importe: "300.00" }, pagadoPlataforma: "0.00", pagosPorConfirmar: 0 },
    });
  });

  it("SLT-60 R7, R8, R27: A paga 300 y paga 200 que anula; B paga sus 300 → nada confirmado: la deuda y «Pagado» no cambian, y cada una tiene 1 por confirmar", async () => {
    pagos.a300 = await pagar(A, "300.00");
    const mal = await pagar(A, "200.00");
    const anulado = await conEmpresa(org(A), () =>
      anularMovimientoAction({ destino: { libro: "caja", movimientoId: mal }, motivo: `Mal registrado SL45E ${RUN}` }, deps(A.p.maestro)),
    );
    expect(anulado).toEqual({ status: "ok", camino: "egreso_caja" });
    pagos.b300 = await pagar(B, "300.00");

    // El anulado no cuenta como por confirmar.
    expect(await filasDelListado()).toEqual({
      a: { deudaPlataforma: { deuda: "1000.00", estado: "debe", importe: "1000.00" }, pagadoPlataforma: "0.00", pagosPorConfirmar: 1 },
      b: { deudaPlataforma: { deuda: "300.00", estado: "debe", importe: "300.00" }, pagadoPlataforma: "0.00", pagosPorConfirmar: 1 },
    });
  });

  it("SLT-60 R7, R8, R27: el superadmin confirma el de A y el de B → A debe 700,00 con 300,00 pagado, B al día con 300,00, y el contador vuelve a 0", async () => {
    await confirmar(A, facturaDe.A, pagos.a300, "300.00");
    await confirmar(B, facturaDe.B, pagos.b300, "300.00");

    expect(await filasDelListado()).toEqual({
      a: { deudaPlataforma: { deuda: "700.00", estado: "debe", importe: "700.00" }, pagadoPlataforma: "300.00", pagosPorConfirmar: 0 },
      b: { deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" }, pagadoPlataforma: "300.00", pagosPorConfirmar: 0 },
    });
  });

  it("B elimina su orden ya pagada → a favor 300,00; lo pagado no cambia y A sigue igual", async () => {
    const repo = new OrdenRepository(app);
    const historial = new OrdenHistorialService(
      repo,
      new OrdenHistorialRepository(app),
      new OrdenDiaRepartoCambioRepository(app),
      new OrdenTraspasoRepository(app),
    );
    const r = await conEmpresa(org(B), () => new EliminarOrdenService(repo, historial).eliminar({ ordenIds: [B.ordenes[0]] }, B.p.maestro));
    expect(r.status, JSON.stringify(r)).toBe("ok");

    expect(await filasDelListado()).toEqual({
      a: { deudaPlataforma: { deuda: "700.00", estado: "debe", importe: "700.00" }, pagadoPlataforma: "300.00", pagosPorConfirmar: 0 },
      b: { deudaPlataforma: { deuda: "-300.00", estado: "a_favor", importe: "300.00" }, pagadoPlataforma: "300.00", pagosPorConfirmar: 0 },
    });
  });

  it("SLT-60 R27: A paga dos más sin confirmar → su fila cuenta 2 por confirmar; ni su deuda, ni lo pagado, ni la fila de B cambian", async () => {
    await pagar(A, "100.00");
    await pagar(A, "50.00");
    expect(await filasDelListado()).toEqual({
      a: { deudaPlataforma: { deuda: "700.00", estado: "debe", importe: "700.00" }, pagadoPlataforma: "300.00", pagosPorConfirmar: 2 },
      b: { deudaPlataforma: { deuda: "-300.00", estado: "a_favor", importe: "300.00" }, pagadoPlataforma: "300.00", pagosPorConfirmar: 0 },
    });
  });

  it("el repositorio con el cliente dueño (sin extensión ni RLS) reparte igual: el dinero de A no sale en la fila de B", async () => {
    const filas = await new EmpresasPlataformaRepository(base).listar();
    const de = (e: Empresa) => filas.find((f) => f.id === org(e));
    expect(de(A)?.pagadoPlataforma).toBe("300.00");
    expect(de(A)?.deudaPlataforma.deuda).toBe("700.00");
    expect(de(B)?.pagadoPlataforma).toBe("300.00");
    expect(de(B)?.deudaPlataforma.deuda).toBe("-300.00");
    expect([de(A)?.pagosPorConfirmar, de(B)?.pagosPorConfirmar]).toEqual([2, 0]);
  });

  it("un rol de empresa no lee el listado: forbidden", async () => {
    expect(await listarEmpresasPlataforma({ rol: RolValue.maestro })).toEqual({ status: "forbidden" });
  });
});
