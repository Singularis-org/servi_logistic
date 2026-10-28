import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { aprobarCierre } from "@/lib/actions/cierres-admin";
import { estadoBloqueoMensajero, solicitarCierre } from "@/lib/actions/cierre-dia";
import { registrarPagoMensajeroAction } from "@/lib/actions/liquidacion";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { modulosActivos } from "@/lib/modulos/exigir-modulo";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { CorteDiarioRepository } from "@/lib/repositories/CorteDiarioRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { CorteDiarioService } from "@/lib/services/CorteDiarioService";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, tomarLockDeEscrituraReal } from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// SL-23 · T10 (design §3, §5.4; R31) — EL NÚCLEO DE CIERRES CORRE EN UNA EMPRESA SIN NINGÚN MÓDULO.
//
// La empresa nace con `crearOrganizacion`, que no enciende nada: `organizacion_modulo` queda vacía
// para ella, y el primer caso lo comprueba con la misma lectura que usan las puertas. Después, por
// las Server Actions reales (cliente de la app, extensión y RLS, dentro de `conEmpresa`):
//
//   corte diario → cierre `vencido` → bloqueo del mensajero → «Cierre del día» lo re-solicita →
//   el admin de su zona satélite lo aprueba (movimientos de caja) → el maestro paga al mensajero.
//
// El corte se monta como lo monta su route (`app/api/cron/corte-diario`), con los repositorios reales
// sobre `getPrismaClient()`, pero sin el notificador real: su aviso no es lo que se mide aquí y
// escribiría en la base compartida. Que el cron no se salte empresas por módulo lo fija la guardia (d).
//
// Commitea, como `aislamiento-cierres`: las actions abren su propio cliente y una transacción revertida
// obligaría a sustituirlo. Se borra todo en el `afterAll`, por organización.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Siembra {
  organizacionId: string;
  maestro: Actor;
  /** Su zona es la del mensajero: los cierres de una zona satélite los resuelve su admin. */
  adminSatelite: Actor;
  mensajero: Actor;
  ordenEnReparto: string;
  gestionEntregada: string;
}

/** Las tablas con `organizacion_id`, para borrar todo lo de la empresa sin conocer cada escritura. */
async function tablasDeNegocio(base: PrismaClient): Promise<string[]> {
  const filas = await base.$queryRawUnsafe<{ t: string }[]>(
    `SELECT c.table_name AS t
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND c.column_name = 'organizacion_id'
        AND t.table_type = 'BASE TABLE'
      ORDER BY 1`,
  );
  return filas.map((f) => f.t);
}

/** Borra por pasadas, cada borrado en su SAVEPOINT: no hay un orden de FKs fijo que este test conozca. */
async function limpiar(base: PrismaClient, tablas: string[], organizacionId: string): Promise<void> {
  await base.$transaction(
    async (tx) => {
      let pendientes = [...tablas];
      while (pendientes.length > 0) {
        const fallidas: string[] = [];
        for (const t of pendientes) {
          await tx.$executeRawUnsafe(`SAVEPOINT limpiar_r31`);
          try {
            await tx.$executeRawUnsafe(`DELETE FROM "${t}" WHERE organizacion_id = $1`, organizacionId);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT limpiar_r31`);
          } catch {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT limpiar_r31`);
            fallidas.push(t);
          }
        }
        if (fallidas.length === pendientes.length) throw new Error(`R31: no se pudo limpiar ${fallidas.join(", ")}`);
        pendientes = fallidas;
      }
      await tx.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE id = $1`, organizacionId);
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

/**
 * Un mensajero de una zona con tarifa 1500/164, una orden suya en `en_reparto` (la que barre el corte)
 * y una entrega de hoy aún sin cierre, cobrada en efectivo (la que da dinero a la aprobación y al pago).
 */
async function sembrar(base: PrismaClient): Promise<Siembra> {
  const organizacionId = (await crearOrganizacion(base, { nombre: "Empresa SL-23 núcleo sin módulos" })).id;
  return base.$transaction(
    async (tx) => {
      await fijarEmpresa(tx, organizacionId);
      const fks = await crearFksDeOrden(tx);
      await tx.tarifaZonaMensajero.create({
        data: { zonaId: fks.zonaId, vehiculoId: null, cobroEntregado: "1500.00", cobroRechazado: "164.00" },
      });
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
      const adminSatelite = await crearUsuarioDePrueba(tx, "adminSatelite");
      await tx.usuario.updateMany({
        where: { id: { in: [mensajero.id, adminSatelite.id] } },
        data: { zonaId: fks.zonaId },
      });

      const estatus = async (value: string) =>
        (await tx.orderStatus.findUniqueOrThrow({ where: { value }, select: { id: true } })).id;
      const orden = (n: number, estatusId: string) =>
        tx.orden.create({
          data: {
            numRemision: `R31-${n}-${organizacionId.slice(0, 8)}`,
            destinatario: "Destinatario R31",
            telefonoDest: "88880000",
            producto: "Producto",
            estatusId,
            mensajeroAsignadoId: mensajero.id,
            asignadoAt: new Date(),
            montoCobrar: 1000,
            tiendaId: fks.tiendaId,
            zonaId: fks.zonaId,
            provinciaId: fks.provinciaId,
            cantonId: fks.cantonId,
          },
          select: { id: true },
        });
      const enReparto = await orden(1, await estatus("en_reparto"));
      const entregada = await orden(2, await estatus("entregado"));
      const gestion = await tx.gestionOrden.create({
        data: {
          ordenId: entregada.id,
          mensajeroId: mensajero.id,
          resultado: "entregado",
          montoRecibido: "1000.00",
          metodoPago: "efectivo",
        },
        select: { id: true },
      });
      await tx.gestionOrdenPago.create({ data: { gestionId: gestion.id, metodo: "efectivo", monto: "1000.00" } });

      return {
        organizacionId,
        maestro: { usuarioId: maestro.id, rol: "maestro", organizacionId },
        adminSatelite: { usuarioId: adminSatelite.id, rol: "adminSatelite", zonaId: fks.zonaId, organizacionId },
        mensajero: { usuarioId: mensajero.id, rol: "mensajero", zonaId: fks.zonaId, organizacionId },
        ordenEnReparto: enReparto.id,
        gestionEntregada: gestion.id,
      };
    },
    { timeout: 30_000, maxWait: 15_000 },
  );
}

/** El corte tal como lo arma su route, con el cliente de la app (sin el aviso real). */
function corteDiario(): CorteDiarioService {
  const prisma = getPrismaClient();
  return new CorteDiarioService(
    new CorteDiarioRepository(prisma),
    new CierreDiaRepository(prisma, new TarifaVigenteRepository(prisma)),
    new ZonaRepository(prisma),
    new OrdenRepository(prisma),
    new TarifaZonaMensajeroRepository(prisma),
    { warn: () => {} },
  );
}

describeSiHayBase("SL-23 R31 — el núcleo de cierres en una empresa sin ningún módulo", () => {
  let base: PrismaClient;
  let tablas: string[] = [];
  let s: Siembra | undefined;
  let soltarLock: (() => Promise<void>) | undefined;
  let vencidoId: string;

  beforeAll(async () => {
    // El lock se sostiene de la siembra a la limpieza, como en `aislamiento-cierres`: la aprobación
    // commitea filas que un `down.sql` histórico de otra suite no debe ver.
    soltarLock = await tomarLockDeEscrituraReal();
    base = crearPrismaDeTest();
    tablas = await tablasDeNegocio(base);
    s = await sembrar(base);
  }, 120_000);

  afterAll(async () => {
    try {
      if (s) await limpiar(base, tablas, s.organizacionId);
    } finally {
      await base?.$disconnect();
      await soltarLock?.();
    }
  }, 120_000);

  const comoEmpresa = <T>(fn: () => Promise<T>): Promise<T> => conEmpresa(s!.organizacionId, fn);
  const como = (actor: Actor) => ({ getActor: async () => actor });

  it("precondición: la empresa no tiene ningún módulo encendido", async () => {
    expect(await base.organizacionModulo.count({ where: { organizacionId: s!.organizacionId } })).toBe(0);
    // La misma lectura que hacen las puertas, en el contexto de la empresa.
    expect([...((await comoEmpresa(() => modulosActivos())) ?? ["sin empresa"])]).toEqual([]);
  });

  it("el corte diario crea el cierre `vencido` y barre la orden en reparto", async () => {
    const resumen = await comoEmpresa(() => corteDiario().ejecutarCorte(new Date()));
    expect(resumen.vencidosCreados).toBe(1);

    const vencido = await base.cierreDia.findFirstOrThrow({
      where: { organizacionId: s!.organizacionId, mensajeroId: s!.mensajero.usuarioId, estado: "vencido" },
      select: { id: true, sinGestion: { select: { ordenId: true } } },
    });
    vencidoId = vencido.id;
    expect(vencido.sinGestion.map((x) => x.ordenId)).toEqual([s!.ordenEnReparto]);
    const gestion = await base.gestionOrden.findUniqueOrThrow({
      where: { id: s!.gestionEntregada },
      select: { cierreId: true },
    });
    expect(gestion.cierreId).toBe(vencidoId);
  });

  it("el bloqueo por cierre pendiente aplica al mensajero", async () => {
    const r = await comoEmpresa(() => estadoBloqueoMensajero(como(s!.mensajero)));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.bloqueo).toMatchObject({ bloqueado: true, cierresAbiertos: 1, cierresPorReenviar: 1 });
  });

  it("«Cierre del día»: la action re-solicita el vencido y el bloqueo se levanta", async () => {
    const r = await comoEmpresa(() => solicitarCierre(como(s!.mensajero)));
    expect(r).toMatchObject({ status: "ok", via: "resolicitado" });
    expect(
      (await base.cierreDia.findUniqueOrThrow({ where: { id: vencidoId }, select: { estado: true } })).estado,
    ).toBe("solicitado");

    const bloqueo = await comoEmpresa(() => estadoBloqueoMensajero(como(s!.mensajero)));
    expect(bloqueo).toMatchObject({ status: "ok", bloqueo: { bloqueado: false } });
  });

  it("«Cierres del día»: aprobar escribe sus movimientos de caja, con todos los módulos apagados", async () => {
    const r = await comoEmpresa(() => aprobarCierre({ cierreId: vencidoId }, como(s!.adminSatelite)));
    expect(r.status).toBe("ok");

    const caja = await base.walletMovimiento.findMany({
      where: { organizacionId: s!.organizacionId, origenId: vencidoId },
      select: { tipo: true, categoria: true, monto: true },
    });
    expect(caja.map((m) => `${m.tipo}|${m.categoria}|${m.monto.toFixed(2)}`)).toContain(
      "ingreso|ingreso_cod_recaudado|1000.00",
    );
  });

  it("«Cierres del día»: registrarPagoMensajeroAction registra el pago al mensajero", async () => {
    const r = await comoEmpresa(() =>
      registrarPagoMensajeroAction(
        {
          claveIdempotencia: randomUUID(),
          cierreId: vencidoId,
          monto: "100.00",
          metodo: "efectivo",
          fechaPago: fechaCalendarioCR(new Date()),
        },
        como(s!.maestro),
      ),
    );
    expect(r.status).toBe("ok");
    expect(
      await base.liquidacionPago.count({ where: { organizacionId: s!.organizacionId, cierreId: vencidoId } }),
    ).toBe(1);
  });
});
