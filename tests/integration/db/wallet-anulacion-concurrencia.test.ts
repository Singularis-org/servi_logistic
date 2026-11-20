import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { anularMovimientoAction } from "@/lib/actions/wallet-anulacion";
import { RechazoTiendaCobroRepository } from "@/lib/repositories/RechazoTiendaCobroRepository";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import {
  clienteConEmpresa459,
  conCandado459,
  conEmpresa459,
  limpiar459,
  sembrarPersonas459,
  type Personas459,
} from "./_fixtures/escrituras-459";
import { contextoActual } from "@/lib/db/contexto-empresa";

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());


// ═════════════════════════════════════════════════════════════════════════════════════════════
// FICHA 458-B / TB.9 — R67: DOS ANULACIONES DEL MISMO MOVIMIENTO A LA VEZ, por la accion unica y SUS
// COMPOSITION ROOTS REALES (sin inyectar servicios), con filas COMMITEADAS.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Las dos llamadas son dos `anularMovimientoAction` en paralelo: dos transacciones reales, cada una
// por su conexion del pool. La barrera es la constancia (`createMany` con `skipDuplicates` sobre un
// UNIQUE): la segunda espera en el indice y, tras el commit de la primera, inserta 0 → `ya_anulado`
// sin escribir nada mas. Resultado: UN juego de contra-asientos.
//
// MUTACION 8 de design §8.2 (constancia sin `skipDuplicates`): la segunda choca con un P2002 que ya
// no se traduce → la action LANZA y este test cae en rojo por la respuesta, no por los libros.
//
// Tambien es el test del composition root: `anularMovimientoAction` se llama SOLO con `getActor`,
// asi que el enrutador, `EgresoCajaAnulacionService` y `RechazoTiendaCobroService` salen de sus
// `buildService()` de produccion (memoria «el composition root que no inyecta»).

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

describeSiHayBase("458-B/TB.9 — R67: dos anulaciones a la vez dejan UN solo juego de contra-asientos (Postgres real)", () => {
  let prisma: PrismaClient;
  /** SLT-181 — solo catalogo y geografia, por clave: la zona la siembra el caso que la usa. */
  let catalogo: { estatusId: string; provinciaId: string; cantonId: string };

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    const estatus = await prisma.orderStatus.findUnique({ where: { value: "en_preparacion" }, select: { id: true } });
    if (estatus === null) throw new Error("falta el estado «en_preparacion»: corre `pnpm run db:seed`");
    const canton = await prisma.canton.findFirst({
      where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
      select: { id: true, provinciaId: true },
    });
    if (canton === null) throw new Error("falta la geografia Cartago/Cartago: aplica las migraciones");
    catalogo = { estatusId: estatus.id, provinciaId: canton.provinciaId, cantonId: canton.id };
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function conPersonas(cuerpo: (p: Personas459) => Promise<void>): Promise<void> {
    await conCandado459(prisma, async () => {
      let p: Personas459 | null = null;
      try {
        p = await sembrarPersonas459(prisma);
        const sembradas = p;
        // SLT-185 (R1141/R1146): las actions corren con la empresa sembrada en contexto, como en una
        // peticion; sin ella el cliente global falla cerrado o escribe con `organizacion_id` NULL (SL017).
        expect(await prisma.organizacion.count({ where: { id: sembradas.organizacionId } }), "SLT-185: empresa sembrada").toBe(1);
        await conEmpresa459(sembradas, async () => {
          const ctx = contextoActual();
          expect(ctx?.tipo === "empresa" ? ctx.organizacionId : null, "SLT-185: empresa en contexto").toBe(sembradas.organizacionId);
          await cuerpo(sembradas);
        });
      } finally {
        await limpiar459(prisma, p);
      }
    });
  }

  it("R67: un sueldo anulado dos veces a la vez → `ok` + `ya_anulado`, UNA constancia, UN contra-asiento, UN historial", async () => {
    await conPersonas(async (p) => {
      const sueldo = await prisma.walletMovimiento.create({
        data: {
          tipo: "egreso",
          categoria: "egreso_sueldo",
          monto: new Prisma.Decimal("45000.00"),
          origenTipo: "gasto",
          origenId: null,
          descripcion: "Sueldo 458 concurrencia",
          registradoPor: p.maestro.usuarioId,
          // SLT-185: la escritura directa (sin la envoltura) lleva la empresa explicita (SL-17).
          organizacionId: p.organizacionId,
        },
        select: { id: true },
      });
      const deps = { getActor: async () => p.maestro };
      const respuestas = await Promise.all([
        anularMovimientoAction({ destino: { libro: "caja", movimientoId: sueldo.id }, motivo: "uno" }, deps),
        anularMovimientoAction({ destino: { libro: "caja", movimientoId: sueldo.id }, motivo: "dos" }, deps),
      ]);
      expect(respuestas.map((r) => r.status).sort()).toEqual(["ok", "ya_anulado"]);
      expect(await prisma.ajusteCajaAnulacion.count({ where: { movimientoId: sueldo.id } })).toBe(1);
      const reversos = await prisma.walletMovimiento.findMany({ where: { origenTipo: "gasto", origenId: sueldo.id } });
      expect(reversos.map((r) => `${r.categoria}|${r.monto.toFixed(2)}`)).toEqual(["ingreso_ajuste|45000.00"]);
      expect(await prisma.historialAccion.count({ where: { accion: "egreso_caja_anulado", entidadId: sueldo.id } })).toBe(1);
    });
  }, 120_000);

  it("R67: un cobro por devolución a origen anulado dos veces a la vez → UNA constancia, DOS reversos y DOS creditos (no cuatro)", async () => {
    await conPersonas(async (p) => {
      let ordenId: string | null = null;
      let gestionId: string | null = null;
      let cobroId: string | null = null;
      let zonaId: string | null = null;
      try {
        // SLT-181 (R1063) — la zona del caso, COMMITEADA en la empresa de las personas, con clave
        // unica; se borra en el `finally`, antes de que `limpiar459` borre la empresa.
        const zona = await prisma.zona.create({
          data: {
            nombre: `Zona 458C ${randomUUID()}`,
            sinpeNumero: "80000000",
            sinpeNombre: "Titular de Prueba",
            organizacionId: p.organizacionId,
          },
          select: { id: true },
        });
        zonaId = zona.id;
        expect(
          await prisma.zona.count({ where: { id: zonaId, organizacionId: p.organizacionId } }),
          "SLT-181: la zona commiteada no esta en la base",
        ).toBe(1);
        const fks = { ...catalogo, zonaId };
        const orden = await prisma.orden.create({
          data: {
            numRemision: `R458C-${Date.now().toString(36)}`,
            organizacionId: p.organizacionId,
            destinatario: "Dest",
            telefonoDest: "88880000",
            producto: "Prod",
            estatusId: fks.estatusId,
            tiendaId: p.tiendaId,
            zonaId: fks.zonaId,
            provinciaId: fks.provinciaId,
            cantonId: fks.cantonId,
          },
          select: { id: true },
        });
        ordenId = orden.id;
        const gestion = await prisma.gestionOrden.create({
          data: {
            ordenId,
            mensajeroId: p.mensajero.usuarioId,
            resultado: "devolucion_a_origen_por_rechazo",
            cierreId: null,
            organizacionId: p.organizacionId,
          },
          select: { id: true },
        });
        gestionId = gestion.id;
        // SLT-185: el cobro pendiente se escribe por la envoltura de produccion, con la empresa del contexto.
        const deLaApp = clienteConEmpresa459(prisma);
        await new RechazoTiendaCobroRepository(deLaApp).crearPendiente(deLaApp, {
          gestionId,
          ordenId,
          tiendaId: p.tiendaId,
          montoFlete: "800.00",
          montoIva: "104.00",
          tarifaId: null,
          tarifaValorId: null, // SLT-52: cobro del modelo viejo, sin traza al nuevo
          generadoEl: "2026-09-20",
        });
        const cobro = await prisma.rechazoTiendaCobro.findUniqueOrThrow({ where: { gestionId }, select: { id: true } });
        cobroId = cobro.id;
        const { aprobarCobroRechazoTiendaAction } = await import("@/lib/actions/rechazo-tienda-cobro");
        const aprobado = await aprobarCobroRechazoTiendaAction({ id: cobroId }, { getActor: async () => p.maestro });
        expect(aprobado.status).toBe("ok");

        const deps = { getActor: async () => p.admin };
        const respuestas = await Promise.all([
          anularMovimientoAction({ destino: { documento: "rechazo_tienda_cobro", id: cobroId }, motivo: "uno" }, deps),
          anularMovimientoAction({ destino: { documento: "rechazo_tienda_cobro", id: cobroId }, motivo: "dos" }, deps),
        ]);
        expect(respuestas.map((r) => r.status).sort()).toEqual(["ok", "ya_anulado"]);
        expect(await prisma.rechazoTiendaCobroAnulacion.count({ where: { cobroId } })).toBe(1);
        const caja = await prisma.walletMovimiento.findMany({
          where: { origenTipo: "gestion_orden", origenId: gestionId, tipo: "egreso" },
          orderBy: { categoria: "asc" },
        });
        expect(caja.map((r) => `${r.categoria}|${r.monto.toFixed(2)}`)).toEqual([
          "egreso_reverso_flete_devolucion|800.00",
          "egreso_reverso_iva_flete_devolucion|104.00",
        ]);
        const creditos = await prisma.walletTiendaMovimiento.findMany({
          where: { origenTipo: "gestion_orden", origenId: gestionId, tipo: "credito" },
          orderBy: { categoria: "asc" },
        });
        expect(creditos.map((r) => `${r.categoria}|${r.monto.toFixed(2)}`)).toEqual([
          "flete_devolucion_anulado|800.00",
          "iva_flete_devolucion_anulado|104.00",
        ]);
        // R73: el cobro sigue `aprobado`.
        expect((await prisma.rechazoTiendaCobro.findUniqueOrThrow({ where: { id: cobroId } })).estado).toBe("aprobado");
      } finally {
        // Lo que esta ficha y la 337 escribieron para ESTE cobro, en el orden de las FK (RESTRICT).
        if (cobroId !== null) {
          await prisma.historialAccion.deleteMany({ where: { entidadId: cobroId } });
          await prisma.rechazoTiendaCobroAnulacion.deleteMany({ where: { cobroId } });
        }
        if (gestionId !== null) {
          await prisma.walletMovimiento.deleteMany({ where: { origenTipo: "gestion_orden", origenId: gestionId } });
          await prisma.walletTiendaMovimiento.deleteMany({ where: { origenTipo: "gestion_orden", origenId: gestionId } });
          await prisma.rechazoTiendaCobro.deleteMany({ where: { gestionId } });
          await prisma.gestionOrden.deleteMany({ where: { id: gestionId } });
        }
        if (ordenId !== null) await prisma.orden.deleteMany({ where: { id: ordenId } });
        if (zonaId !== null) await prisma.zona.deleteMany({ where: { id: zonaId } });
      }
    });
  }, 120_000);
});
