import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  anularPagoAction,
  previsualizarRepartoMensajeroAction,
  registrarPagoMensajeroAction,
  registrarRepartoMensajeroAction,
} from "@/lib/actions/liquidacion";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import { conCandado459, limpiar459, sembrarPersonas459, type Personas459 } from "./_fixtures/escrituras-459";

// La zona del pais de la empresa es la de CR (molde `aislamiento-wallet.test.ts`): las reglas reales
// leen el pais con el cliente global, que fuera de `conEmpresa` no tiene empresa.
vi.mock("@/lib/services/ReglasPaisEmpresaService", async (importOriginal) => {
  const { reglasPaisFijas } = await import("@/tests/fabricas/reglas-pais");
  return {
    ...(await importOriginal<typeof import("@/lib/services/ReglasPaisEmpresaService")>()),
    construirReglasPaisEmpresa: () => reglasPaisFijas(),
  };
});

// La puerta de modulo con todo encendido: aqui no se prueba el modulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-122 «Pago al mensajero: solo la bodega duena del cierre» — T6, contra Postgres real.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Cada caso entra por las server actions de las pantallas (`/cierres-admin` y `/wallet/mensajeros`)
// con el COMPOSITION ROOT real: servicio, repositorios, extension de empresa y RLS de verdad. Solo se
// inyecta el actor; la empresa sale de `conEmpresa`, como en una peticion. Siembra commiteada bajo el
// candado 459 y limpieza en un `finally`.
//
// Escenario (dos empresas):
//   A: un mensajero con un cierre `aprobado` de la CENTRAL (P 30 000) y uno `aprobado` de SATELITE
//      (P 20 000), los dos con efectivo 0 (pendiente = P); un segundo mensajero con SOLO un cierre de
//      satelite (R10).
//   B: un mensajero con un cierre `aprobado` de la central.
//
// Lo que se afirma se mide con el cliente BASE (dueno, sin RLS): filas de `liquidacion_pago` y del
// libro del mensajero antes y despues.
//
// MUTACION (obligatoria, T6): quitar `...alcanceWhere(alcance)` del WHERE de
// `obtenerCierreParaPagoEnAlcance` y de `listarCierresImputablesEnAlcance` pone en ROJO R1 y R9 de
// este archivo. Resultado anotado en `progress/impl_SLT-122.md`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const P_CENTRAL_A = "30000.00";
const P_SATELITE_A = "20000.00";
const P_SOLO_SATELITE = "7000.00";
const P_CENTRAL_B = "9000.00";

interface Escenario {
  a: Personas459;
  b: Personas459;
  /** Segundo mensajero de A: solo tiene un cierre de satelite (R10). */
  soloSateliteA: string;
  cierreCentralA: string;
  cierreSateliteA: string;
  cierreSoloSatelite: string;
  cierreCentralB: string;
}

const deps = (actor: Actor) => ({ getActor: async () => actor });

describeSiHayBase("SLT-122 — solo la bodega duena del cierre paga al mensajero (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const hoy = () => fechaCalendarioCR(new Date());

  async function zona(organizacionId: string, nombre: string, zonas: string[]): Promise<string> {
    const z = await prisma.zona.create({
      data: { organizacionId, nombre: `${nombre} SLT-122 ${randomUUID().slice(0, 8)}`, sinpeNumero: "80000122", sinpeNombre: "Titular SLT-122" },
      select: { id: true },
    });
    zonas.push(z.id);
    return z.id;
  }

  async function cierre(
    organizacionId: string,
    mensajeroId: string,
    destino: { tipo: "bodega_central" | "bodega_satelite"; zonaId: string },
    p: string,
    resueltoPor: string,
    dia: string,
  ): Promise<string> {
    const c = await prisma.cierreDia.create({
      data: {
        organizacionId,
        mensajeroId,
        estado: "aprobado",
        destinoTipo: destino.tipo,
        destinoZonaId: destino.zonaId,
        totalEfectivo: new Prisma.Decimal("0.00"),
        totalGeneral: new Prisma.Decimal(p),
        totalPagoMensajero: new Prisma.Decimal(p),
        solicitadoAt: new Date(`${dia}T23:00:00.000Z`),
        resueltoPor,
        resueltoAt: new Date(),
      },
      select: { id: true },
    });
    return c.id;
  }

  async function mensajeroExtra(p: Personas459): Promise<string> {
    const rol = await prisma.rol.findFirstOrThrow({ where: { value: "mensajero" }, select: { id: true } });
    const tipo = await prisma.tipoIdentificacion.findUniqueOrThrow({ where: { value: "cedula" }, select: { id: true } });
    const clave = randomUUID().slice(0, 8);
    const u = await prisma.usuario.create({
      data: {
        nombre: `Mensajero satelite SLT-122 ${clave}`,
        email: `mensajero-sat-slt122-${clave}@example.test`,
        telefono: "88880122",
        passwordHash: "x",
        cedula: `SLT122-${clave}`,
        tipoIdentificacionId: tipo.id,
        rolId: rol.id,
        estado: "activo",
        organizacionId: p.organizacionId,
      },
      select: { id: true },
    });
    p.usuarios.push(u.id); // `limpiar459` lo borra con los demas
    return u.id;
  }

  async function limpiar(personas: Personas459[], zonas: string[]): Promise<void> {
    const usuarios = personas.flatMap((p) => p.usuarios);
    try {
      const pagos = await prisma.liquidacionPago.findMany({ where: { mensajeroId: { in: usuarios } }, select: { id: true } });
      const ids = pagos.map((x) => x.id);
      await prisma.historialAccion.deleteMany({ where: { entidadId: { in: ids } } });
      await prisma.liquidacionAnulacion.deleteMany({ where: { pagoId: { in: ids } } });
      await prisma.liquidacionPago.deleteMany({ where: { id: { in: ids } } });
      await prisma.liquidacionReparto.deleteMany({ where: { mensajeroId: { in: usuarios } } });
      await prisma.pagoMensajeroMovimiento.deleteMany({ where: { mensajeroId: { in: usuarios } } });
      await prisma.cierreDia.deleteMany({ where: { mensajeroId: { in: usuarios } } });
      await prisma.zona.deleteMany({ where: { id: { in: zonas } } });
    } finally {
      for (const p of personas) await limpiar459(prisma, p);
    }
  }

  async function conEscenario(cuerpo: (e: Escenario) => Promise<void>): Promise<void> {
    await conCandado459(prisma, async () => {
      const personas: Personas459[] = [];
      const zonas: string[] = [];
      try {
        const a = await sembrarPersonas459(prisma);
        personas.push(a);
        const b = await sembrarPersonas459(prisma);
        personas.push(b);

        const centralA = await zona(a.organizacionId, "Central A", zonas);
        const sateliteA = await zona(a.organizacionId, "Satelite A", zonas);
        const centralB = await zona(b.organizacionId, "Central B", zonas);
        const soloSateliteA = await mensajeroExtra(a);

        const e: Escenario = {
          a,
          b,
          soloSateliteA,
          // El de satelite es el MAS ANTIGUO: si el reparto lo viera, seria el primero en la ventana.
          cierreSateliteA: await cierre(a.organizacionId, a.mensajero.usuarioId, { tipo: "bodega_satelite", zonaId: sateliteA }, P_SATELITE_A, a.maestro.usuarioId, "2026-10-01"),
          cierreCentralA: await cierre(a.organizacionId, a.mensajero.usuarioId, { tipo: "bodega_central", zonaId: centralA }, P_CENTRAL_A, a.maestro.usuarioId, "2026-10-02"),
          cierreSoloSatelite: await cierre(a.organizacionId, soloSateliteA, { tipo: "bodega_satelite", zonaId: sateliteA }, P_SOLO_SATELITE, a.maestro.usuarioId, "2026-10-03"),
          cierreCentralB: await cierre(b.organizacionId, b.mensajero.usuarioId, { tipo: "bodega_central", zonaId: centralB }, P_CENTRAL_B, b.maestro.usuarioId, "2026-10-04"),
        };
        await cuerpo(e);
      } finally {
        await limpiar(personas, zonas);
      }
    });
  }

  /** Lo sembrado existe y es lo que el caso cree que es. Sin esto, un `no_encontrado` no prueba nada. */
  async function afirmarSembrado(e: Escenario): Promise<void> {
    const filas = await prisma.cierreDia.findMany({
      where: { id: { in: [e.cierreCentralA, e.cierreSateliteA, e.cierreSoloSatelite, e.cierreCentralB] } },
      select: { id: true, organizacionId: true, estado: true, destinoTipo: true, mensajeroId: true },
    });
    const de = (id: string) => filas.find((f) => f.id === id);
    expect(de(e.cierreCentralA)).toMatchObject({ organizacionId: e.a.organizacionId, estado: "aprobado", destinoTipo: "bodega_central", mensajeroId: e.a.mensajero.usuarioId });
    expect(de(e.cierreSateliteA)).toMatchObject({ organizacionId: e.a.organizacionId, estado: "aprobado", destinoTipo: "bodega_satelite", mensajeroId: e.a.mensajero.usuarioId });
    expect(de(e.cierreSoloSatelite)).toMatchObject({ organizacionId: e.a.organizacionId, estado: "aprobado", destinoTipo: "bodega_satelite", mensajeroId: e.soloSateliteA });
    expect(de(e.cierreCentralB)).toMatchObject({ organizacionId: e.b.organizacionId, estado: "aprobado", destinoTipo: "bodega_central", mensajeroId: e.b.mensajero.usuarioId });
  }

  /** Las filas de dinero del mensajero: documentos de pago y libro. */
  async function dineroDe(mensajeroId: string) {
    const [pagos, libro] = await Promise.all([
      prisma.liquidacionPago.count({ where: { mensajeroId } }),
      prisma.pagoMensajeroMovimiento.count({ where: { mensajeroId } }),
    ]);
    return { pagos, libro };
  }

  const pagar = (e: Personas459, actor: Actor, cierreId: string, monto: string) =>
    conEmpresa(e.organizacionId, () =>
      registrarPagoMensajeroAction(
        { claveIdempotencia: randomUUID(), cierreId, monto, metodo: "efectivo", fechaPago: hoy() },
        deps(actor),
      ),
    );

  it("R1/R2: maestro y admin contra el cierre de SATELITE de su empresa -> no_encontrado, cero filas nuevas", async () => {
    await conEscenario(async (e) => {
      await afirmarSembrado(e);
      const antes = await dineroDe(e.a.mensajero.usuarioId);

      for (const actor of [e.a.maestro, e.a.admin]) {
        // Monto dentro del pendiente (R1) y por encima de el (R2: nunca `excede`).
        for (const monto of ["100.00", "999999.00"]) {
          expect(await pagar(e.a, actor, e.cierreSateliteA, monto)).toEqual({ status: "no_encontrado" });
        }
      }

      expect(await dineroDe(e.a.mensajero.usuarioId)).toEqual(antes);
      expect(await prisma.liquidacionPago.count({ where: { cierreId: e.cierreSateliteA } })).toBe(0);
    });
  }, 180_000);

  it("R3: maestro y admin contra el cierre de la CENTRAL de su empresa -> ok, documento y libro", async () => {
    await conEscenario(async (e) => {
      await afirmarSembrado(e);
      const antes = await dineroDe(e.a.mensajero.usuarioId);

      const rMaestro = await pagar(e.a, e.a.maestro, e.cierreCentralA, "1000.00");
      expect(rMaestro).toMatchObject({ status: "ok", restante: "29000.00" });
      const rAdmin = await pagar(e.a, e.a.admin, e.cierreCentralA, "500.00");
      expect(rAdmin).toMatchObject({ status: "ok", restante: "28500.00" });

      expect(await dineroDe(e.a.mensajero.usuarioId)).toEqual({ pagos: antes.pagos + 2, libro: antes.libro + 2 });
      expect(await prisma.liquidacionPago.count({ where: { cierreId: e.cierreCentralA } })).toBe(2);
    });
  }, 180_000);

  it("R4: el maestro de A contra el cierre central de B -> no_encontrado; B intacta. Control: B si lo paga", async () => {
    await conEscenario(async (e) => {
      await afirmarSembrado(e);
      const antesB = await dineroDe(e.b.mensajero.usuarioId);

      expect(await pagar(e.a, e.a.maestro, e.cierreCentralB, "100.00")).toEqual({ status: "no_encontrado" });
      expect(await pagar(e.a, e.a.admin, e.cierreCentralB, "100.00")).toEqual({ status: "no_encontrado" });
      expect(await dineroDe(e.b.mensajero.usuarioId)).toEqual(antesB);

      // Control: el «no encontrado» no es tuberia rota.
      expect(await pagar(e.b, e.b.maestro, e.cierreCentralB, "100.00")).toMatchObject({ status: "ok" });
    });
  }, 180_000);

  it("R5: el adminSatelite no paga ni el cierre de satelite de su zona -> forbidden, cero filas", async () => {
    await conEscenario(async (e) => {
      await afirmarSembrado(e);
      const sat = await prisma.cierreDia.findUniqueOrThrow({ where: { id: e.cierreSateliteA }, select: { destinoZonaId: true } });
      const adminSatelite: Actor = { usuarioId: e.a.admin.usuarioId, rol: "adminSatelite", zonaId: sat.destinoZonaId, organizacionId: e.a.organizacionId };
      const antes = await dineroDe(e.a.mensajero.usuarioId);

      expect(await pagar(e.a, adminSatelite, e.cierreSateliteA, "100.00")).toEqual({ status: "forbidden" });
      expect(await pagar(e.a, adminSatelite, e.cierreCentralA, "100.00")).toEqual({ status: "forbidden" });
      expect(await dineroDe(e.a.mensajero.usuarioId)).toEqual(antes);
    });
  }, 180_000);

  it("R8: anular un pago YA registrado contra un cierre de satelite sigue funcionando", async () => {
    await conEscenario(async (e) => {
      await afirmarSembrado(e);
      // Un pago de antes de SLT-122: se registra con el escritor real mientras el cierre es central y
      // despues el cierre pasa a satelite (lo que en prod seria un pago viejo; T0.2 midio 0).
      await prisma.cierreDia.update({ where: { id: e.cierreSateliteA }, data: { destinoTipo: "bodega_central" } });
      const r = await pagar(e.a, e.a.maestro, e.cierreSateliteA, "1500.00");
      expect(r).toMatchObject({ status: "ok" });
      await prisma.cierreDia.update({ where: { id: e.cierreSateliteA }, data: { destinoTipo: "bodega_satelite" } });
      const pago = await prisma.liquidacionPago.findFirstOrThrow({ where: { cierreId: e.cierreSateliteA }, select: { id: true } });
      expect((await prisma.cierreDia.findUniqueOrThrow({ where: { id: e.cierreSateliteA }, select: { destinoTipo: true } })).destinoTipo).toBe("bodega_satelite");

      const anulado = await conEmpresa(e.a.organizacionId, () =>
        anularPagoAction({ pagoId: pago.id, motivo: "Pago de satelite SLT-122" }, deps(e.a.maestro)),
      );

      expect(anulado).toMatchObject({ status: "ok" });
      expect(await prisma.liquidacionAnulacion.count({ where: { pagoId: pago.id } })).toBe(1);
    });
  }, 180_000);

  it("R9: el reparto de maestro y admin solo imputa al cierre central; el de satelite ni entra", async () => {
    await conEscenario(async (e) => {
      await afirmarSembrado(e);
      const mensajeroId = e.a.mensajero.usuarioId;

      const previa = await conEmpresa(e.a.organizacionId, () =>
        previsualizarRepartoMensajeroAction({ mensajeroId, monto: "35000.00" }, deps(e.a.admin)),
      );
      expect(previa.status).toBe("ok");
      if (previa.status !== "ok") throw new Error(JSON.stringify(previa));
      expect(previa.previsualizacion.imputableTotal).toBe(P_CENTRAL_A);
      expect(previa.previsualizacion.imputaciones.map((i) => i.cierreId)).toEqual([e.cierreCentralA]);
      expect(previa.previsualizacion.sobrante).toBe("5000.00");

      const reparto = await conEmpresa(e.a.organizacionId, () =>
        registrarRepartoMensajeroAction(
          { claveIdempotencia: randomUUID(), mensajeroId, monto: "4000.00", metodo: "efectivo", fechaPago: hoy() },
          deps(e.a.maestro),
        ),
      );
      expect(reparto).toMatchObject({ status: "ok" });
      const pagos = await prisma.liquidacionPago.findMany({ where: { mensajeroId }, select: { cierreId: true, monto: true } });
      expect(pagos.map((x) => [x.cierreId, x.monto.toFixed(2)])).toEqual([[e.cierreCentralA, "4000.00"]]);
      expect(await prisma.liquidacionPago.count({ where: { cierreId: e.cierreSateliteA } })).toBe(0);
    });
  }, 180_000);

  it("R10: un mensajero con SOLO cierres de satelite -> previsualizacion 0.00 y registrar sin_saldo, sin filas", async () => {
    await conEscenario(async (e) => {
      await afirmarSembrado(e);
      const mensajeroId = e.soloSateliteA;
      const antes = await dineroDe(mensajeroId);

      const previa = await conEmpresa(e.a.organizacionId, () =>
        previsualizarRepartoMensajeroAction({ mensajeroId }, deps(e.a.maestro)),
      );
      expect(previa.status).toBe("ok");
      if (previa.status !== "ok") throw new Error(JSON.stringify(previa));
      expect(previa.previsualizacion.imputable).toBe("0.00");
      expect(previa.previsualizacion.imputableTotal).toBe("0.00");

      const reparto = await conEmpresa(e.a.organizacionId, () =>
        registrarRepartoMensajeroAction(
          { claveIdempotencia: randomUUID(), mensajeroId, monto: "100.00", metodo: "efectivo", fechaPago: hoy() },
          deps(e.a.admin),
        ),
      );
      expect(reparto).toEqual({ status: "sin_saldo" });
      expect(await dineroDe(mensajeroId)).toEqual(antes);
    });
  }, 180_000);
});
