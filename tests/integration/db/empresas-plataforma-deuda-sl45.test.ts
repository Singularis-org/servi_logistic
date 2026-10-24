import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { RolValue, type PrismaClient } from "@prisma/client";

import { listarEmpresasPlataforma } from "@/lib/actions/_shared/empresas-plataforma";
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
import { tomarTarifaGlobal, type TarifaGlobalBajoLock } from "./_fixtures/cobro-plataforma-40";

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
//   · B: una orden con su excepción de 300, la paga entera → al día y ha pagado 300,00. Luego elimina
//     la orden (reverso) → a favor 300,00, y lo pagado no cambia.
//
// Lo que se mide es la fila de cada empresa: el `WHERE` y el reparto por `organizacion_id` (dinero de
// una empresa que no puede salir en la fila de otra).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const SUPERADMIN = { rol: RolValue.superadmin };

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

/** Las filas de A y de B del listado del superadmin, por la misma puerta que la página. */
async function filasDelListado() {
  const r = await listarEmpresasPlataforma(SUPERADMIN);
  if (r.status !== "ok") throw new Error(`listarEmpresasPlataforma respondió ${JSON.stringify(r)}`);
  const de = (e: Empresa) => {
    const fila = r.empresas.find((x) => x.id === org(e));
    if (fila === undefined) throw new Error(`la empresa ${org(e)} no salió en el listado`);
    return { deudaPlataforma: fila.deudaPlataforma, pagadoPlataforma: fila.pagadoPlataforma };
  };
  return { a: de(A), b: de(B) };
}

describeSiHayBase("SL-45 — la columna «Plataforma» de «Empresas»: deuda y pagado por empresa (R28)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);

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
    if (!(await tarifas.fijarDeEmpresa(org(B), "300.00"))) throw new Error("siembra: la excepción de B no se fijó");
    await crearOrdenes(A, 2);
    await crearOrdenes(B, 1);
  }, 180_000);

  afterAll(async () => {
    if (base === undefined) return;
    const orgs = [A?.p.organizacionId, B?.p.organizacionId].filter((x): x is string => typeof x === "string");
    try {
      if (orgs.length > 0) {
        await bajoLockDeEscrituraReal(async () => {
          for (const tabla of ["historial_accion", "orden_historial_estado", "jobs", "orden", "carga", "zona"]) {
            await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "organizacion_id" = ANY($1::text[])`, orgs);
          }
        });
      }
      await limpiar459(base, A?.p ?? null);
      await limpiar459(base, B?.p ?? null);
    } finally {
      await tarifaGlobal?.soltar();
      await base.$disconnect();
    }
  }, 180_000);

  it("control: los cargos están en la base (1.000 de A, 300 de B) y ninguna ha pagado", async () => {
    const cargos = await base.cobroPlataformaMovimiento.groupBy({
      by: ["organizacionId"],
      where: { organizacionId: { in: [org(A), org(B)] } },
      _sum: { monto: true },
    });
    expect(Object.fromEntries(cargos.map((c) => [c.organizacionId, c._sum.monto?.toFixed(2)]))).toEqual({
      [org(A)]: "1000.00",
      [org(B)]: "300.00",
    });
    expect(await filasDelListado()).toEqual({
      a: { deudaPlataforma: { deuda: "1000.00", estado: "debe", importe: "1000.00" }, pagadoPlataforma: "0.00" },
      b: { deudaPlataforma: { deuda: "300.00", estado: "debe", importe: "300.00" }, pagadoPlataforma: "0.00" },
    });
  });

  it("A paga 300 y paga 200 que anula; B paga sus 300 → A debe 700,00 con 300,00 pagado, B al día con 300,00", async () => {
    await pagar(A, "300.00");
    const mal = await pagar(A, "200.00");
    const anulado = await conEmpresa(org(A), () =>
      anularMovimientoAction({ destino: { libro: "caja", movimientoId: mal }, motivo: `Mal registrado SL45E ${RUN}` }, deps(A.p.maestro)),
    );
    expect(anulado).toEqual({ status: "ok", camino: "egreso_caja" });
    await pagar(B, "300.00");

    expect(await filasDelListado()).toEqual({
      a: { deudaPlataforma: { deuda: "700.00", estado: "debe", importe: "700.00" }, pagadoPlataforma: "300.00" },
      b: { deudaPlataforma: { deuda: "0.00", estado: "al_dia", importe: "0.00" }, pagadoPlataforma: "300.00" },
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
      a: { deudaPlataforma: { deuda: "700.00", estado: "debe", importe: "700.00" }, pagadoPlataforma: "300.00" },
      b: { deudaPlataforma: { deuda: "-300.00", estado: "a_favor", importe: "300.00" }, pagadoPlataforma: "300.00" },
    });
  });

  it("el repositorio con el cliente dueño (sin extensión ni RLS) reparte igual: el dinero de A no sale en la fila de B", async () => {
    const filas = await new EmpresasPlataformaRepository(base).listar();
    const de = (e: Empresa) => filas.find((f) => f.id === org(e));
    expect(de(A)?.pagadoPlataforma).toBe("300.00");
    expect(de(A)?.deudaPlataforma.deuda).toBe("700.00");
    expect(de(B)?.pagadoPlataforma).toBe("300.00");
    expect(de(B)?.deudaPlataforma.deuda).toBe("-300.00");
  });

  it("un rol de empresa no lee el listado: forbidden", async () => {
    expect(await listarEmpresasPlataforma({ rol: RolValue.maestro })).toEqual({ status: "forbidden" });
  });
});
