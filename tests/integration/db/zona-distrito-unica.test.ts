import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ZonaRepository, esViolacionDistritoUnico } from "@/lib/repositories/ZonaRepository";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { ZonaService } from "@/lib/services/ZonaService";
import { actualizarZonaSchema, crearZonaSchema } from "@/lib/types/zona";
import { comoApp, crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ SLT-75 / T5 — UN DISTRITO, A LO SUMO UNA ZONA POR EMPRESA, CONTRA POSTGRES REAL.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// Dos empresas (A y B) y distritos SINTETICOS sembrados por el test. El guardado corre con el
// repositorio y el servicio REALES, en contexto de empresa: la transaccion baja al rol `servi_app`
// (sin `BYPASSRLS`) con `comoApp`, asi que la RLS de `zona_distrito` actua como en produccion. Sin
// ese cambio de rol, el usuario de la conexion es dueno de las tablas y R5/R14 pasarian aunque la
// politica no existiera.
//
// Cada caso abre su propia transaccion, que SIEMPRE se revierte (`enTransaccionRevertida`). El
// repositorio abre su `$transaction` sobre un SAVEPOINT real (`clienteConSavepoint`): un fallo dentro
// del guardado revierte de verdad, igual que en produccion.
//
// El escenario:
//   A: A1 (central) con `dOcupado` y `dAntes`; A2 con `dPropio`, una tarifa y una orden en `dPropio`
//      estampada con A1 (desalineada: un guardado de A2 que pasara la reconciliaria a A2).
//   B: B1 con `dOcupado` y `dDeB` (el mismo distrito en otra empresa no es conflicto, R5/R7).
//   `dLibre`: sin zona en ninguna empresa.
//
// ⚠️ NADA DE `if (!datos) return;`: sin geografia la siembra REVIENTA con un mensaje. Sin base
// alcanzable, `describe.skip` VISIBLE.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `SLT75-${Date.now().toString(36)}`;
const unico = (): string => `${SUFIJO}-${randomUUID().slice(0, 6)}`;
const SINPE = { sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" };

interface Zona {
  id: string;
  nombre: string;
}

interface Escenario {
  tx: TxDeTest;
  A: string;
  B: string;
  maestroA: string;
  A1: Zona;
  A2: Zona;
  B1: Zona;
  dOcupado: Zona;
  /** Tambien en A1; su nombre ordena ANTES que el de `dOcupado` (R3). */
  dAntes: Zona;
  dPropio: Zona;
  dLibre: Zona;
  dDeB: Zona;
  ordenA2: string;
  /** Pone la transaccion en el contexto de la empresa, con el rol de la app. */
  como: (empresa: "A" | "B") => Promise<void>;
  repo: () => ZonaRepository;
  service: () => ZonaService;
}

describeSiHayBase("SLT-75 — un distrito, a lo sumo una zona por empresa (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function conEscenario<T>(fn: (e: Escenario) => Promise<T>): Promise<T> {
    return enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);

      // ── La siembra, como DUENO de las tablas. ──────────────────────────────────────────────
      const A = (await crearOrganizacion(tx, { nombre: `Empresa A ${unico()}` })).id;
      const B = (await crearOrganizacion(tx, { nombre: `Empresa B ${unico()}` })).id;

      const canton = await tx.canton.findFirst({
        where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
        select: { id: true },
      });
      if (canton === null) throw new Error("falta la geografia Cartago/Cartago: aplica las migraciones");
      const crearDistrito = async (etiqueta: string): Promise<Zona> => {
        const nombre = `Distrito Sintetico ${etiqueta} ${unico()}`;
        const d = await tx.distrito.create({ data: { nombre, cantonId: canton.id }, select: { id: true } });
        return { id: d.id, nombre };
      };
      const dOcupado = await crearDistrito("Ocupado");
      const dAntes = await crearDistrito("Antes");
      const dPropio = await crearDistrito("Propio");
      const dLibre = await crearDistrito("Libre");
      const dDeB = await crearDistrito("DeB");

      const crearZona = async (etiqueta: string, esCentral = false): Promise<Zona> => {
        const nombre = `Zona ${etiqueta} ${unico()}`;
        const z = await tx.zona.create({ data: { ...SINPE, nombre, esCentral }, select: { id: true } });
        return { id: z.id, nombre };
      };

      await fijarEmpresa(tx, A);
      const fksA = await crearFksDeOrden(tx);
      const maestroA = (await crearUsuarioDePrueba(tx, "maestro")).id;
      const A1 = await crearZona("A1", true);
      const A2 = await crearZona("A2");
      await tx.zonaDistrito.create({ data: { zonaId: A1.id, distritoId: dOcupado.id } });
      await tx.zonaDistrito.create({ data: { zonaId: A1.id, distritoId: dAntes.id } });
      await tx.zonaDistrito.create({ data: { zonaId: A2.id, distritoId: dPropio.id } });
      await tx.tarifaZonaMensajero.create({
        data: { zonaId: A2.id, cobroEntregado: "1000.00", cobroRechazado: "500.00" },
      });
      const ordenA2 = (
        await tx.orden.create({
          data: {
            numRemision: `R-${unico()}`,
            destinatario: "Destinataria Sintetica",
            telefonoDest: "8888-0000",
            producto: "caja",
            estatusId: fksA.estatusId,
            tiendaId: fksA.tiendaId,
            zonaId: A1.id, // desalineada a proposito: un guardado de A2 que pasara la moveria
            provinciaId: fksA.provinciaId,
            cantonId: fksA.cantonId,
            distritoId: dPropio.id,
            direccion: "direccion sintetica",
            montoCobrar: 1000,
          },
          select: { id: true },
        })
      ).id;

      await fijarEmpresa(tx, B);
      const B1 = await crearZona("B1");
      await tx.zonaDistrito.create({ data: { zonaId: B1.id, distritoId: dOcupado.id } });
      await tx.zonaDistrito.create({ data: { zonaId: B1.id, distritoId: dDeB.id } });

      const empresas = { A, B };
      const como = async (empresa: "A" | "B") => comoApp(tx, empresas[empresa]);

      // ── A partir de aqui, la app: rol `servi_app` y empresa A. ─────────────────────────────
      await como("A");
      const [{ rol }] = await tx.$queryRawUnsafe<{ rol: string }[]>(`SELECT current_user AS rol`);
      if (rol !== "servi_app") throw new Error(`el escenario no bajo al rol de la app: ${rol}`);

      const repo = () => new ZonaRepository(clienteConSavepoint(tx));
      return fn({
        tx,
        A,
        B,
        maestroA,
        A1,
        A2,
        B1,
        dOcupado,
        dAntes,
        dPropio,
        dLibre,
        dDeB,
        ordenA2,
        como,
        repo,
        service: () => new ZonaService(repo()),
      });
    });
  }

  /** Lo que la empresa en curso ve de una zona: columnas, N:M y tarifas. */
  async function fotoDeZona(tx: TxDeTest, zonaId: string) {
    const zona = await tx.zona.findUnique({
      where: { id: zonaId },
      select: { nombre: true, cobroVehiculo: true, esCentral: true },
    });
    const distritos = (
      await tx.zonaDistrito.findMany({ where: { zonaId }, select: { distritoId: true } })
    ).map((f) => f.distritoId);
    const tarifas = (
      await tx.tarifaZonaMensajero.findMany({
        where: { zonaId },
        select: { cobroEntregado: true, cobroRechazado: true, vehiculoId: true },
      })
    ).map((t) => ({ ...t, cobroEntregado: t.cobroEntregado.toFixed(2), cobroRechazado: t.cobroRechazado.toFixed(2) }));
    return { zona, distritos: distritos.sort(), tarifas };
  }

  /** Corre `fn` en un SAVEPOINT y devuelve el error que lance (o `null`), sin abortar la tx. */
  async function capturarError(tx: TxDeTest, fn: () => Promise<unknown>): Promise<unknown> {
    const punto = `sp_${randomUUID().replace(/-/g, "")}`;
    await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
    try {
      await fn();
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
      return null;
    } catch (error) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
      return error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R1 / R3 / R6 — crear
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("⭑ R1: crear con un distrito de otra zona: no existe la zona, ni N:M, ni tarifas, ni historial; la central previa sigue central", async () => {
    const medido = await conEscenario(async (e) => {
      const historialAntes = await e.tx.historialAccion.count();
      const nombre = `Zona Nueva ${unico()}`;

      const res = await e.service().crear(
        crearZonaSchema.parse({
          ...SINPE,
          nombre,
          cobroVehiculo: false,
          esCentral: true,
          distritoIds: [e.dLibre.id, e.dOcupado.id],
          tarifas: [{ cobroEntregado: 1200, cobroRechazado: 600 }],
        }),
        { usuarioId: e.maestroA, rol: "maestro" },
      );

      return {
        res,
        esperado: `${e.dOcupado.nombre} ya está en la zona ${e.A1.nombre}.`,
        zonasConEseNombre: await e.tx.zona.count({ where: { nombre } }),
        filasDeLibre: await e.tx.zonaDistrito.count({ where: { distritoId: e.dLibre.id } }),
        tarifasHuerfanas: await e.tx.tarifaZonaMensajero.count({
          where: { cobroEntregado: "1200.00", cobroRechazado: "600.00" },
        }),
        historialDespues: await e.tx.historialAccion.count(),
        historialAntes,
        a1: await e.tx.zona.findUnique({ where: { id: e.A1.id }, select: { esCentral: true } }),
      };
    });

    // R3 (con nombres reales): un mensaje, con la forma del contrato.
    expect(medido.res).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: [medido.esperado] },
    });
    expect(medido.zonasConEseNombre).toBe(0);
    expect(medido.filasDeLibre).toBe(0);
    expect(medido.tarifasHuerfanas).toBe(0);
    expect(medido.historialDespues).toBe(medido.historialAntes);
    expect(medido.a1).toEqual({ esCentral: true });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R2 / R3 / R6 — actualizar
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("⭑ R2: actualizar con un distrito de otra zona: nombre, marca, N:M, tarifas, `orden.zona_id` e historial iguales", async () => {
    const medido = await conEscenario(async (e) => {
      const antes = await fotoDeZona(e.tx, e.A2.id);
      const historialAntes = await e.tx.historialAccion.count();

      const res = await e.service().actualizar(
        e.A2.id,
        actualizarZonaSchema.parse({
          nombre: `Zona Renombrada ${unico()}`,
          cobroVehiculo: false,
          esCentral: true,
          distritoIds: [e.dPropio.id, e.dOcupado.id],
          tarifas: [],
        }),
        { usuarioId: e.maestroA, rol: "maestro" },
      );

      return {
        res,
        esperado: `${e.dOcupado.nombre} ya está en la zona ${e.A1.nombre}.`,
        antes,
        despues: await fotoDeZona(e.tx, e.A2.id),
        zonaDeLaOrden: (
          await e.tx.orden.findUnique({ where: { id: e.ordenA2 }, select: { zonaId: true } })
        )?.zonaId,
        a1: e.A1.id,
        a2: e.A2.id,
        dPropio: e.dPropio.id,
        historialAntes,
        historialDespues: await e.tx.historialAccion.count(),
        a1Central: await e.tx.zona.findUnique({ where: { id: e.A1.id }, select: { esCentral: true } }),
      };
    });

    expect(medido.res).toEqual({
      status: "validation_error",
      fieldErrors: { distritoIds: [medido.esperado] },
    });
    // Anti-vacuidad: la foto de antes tiene lo sembrado.
    expect(medido.antes.distritos).toEqual([medido.dPropio]);
    expect(medido.antes.tarifas).toHaveLength(1);
    expect(medido.despues).toEqual(medido.antes);
    expect(medido.despues.zona?.esCentral).toBe(false);
    expect(medido.zonaDeLaOrden).toBe(medido.a1);
    expect(medido.historialDespues).toBe(medido.historialAntes);
    expect(medido.a1Central).toEqual({ esCentral: true });
  });

  it("R3: con varios distritos en conflicto, un mensaje por distrito ordenado por nombre", async () => {
    const medido = await conEscenario(async (e) => {
      const res = await e.service().crear(
        crearZonaSchema.parse({
          ...SINPE,
          nombre: `Zona Nueva ${unico()}`,
          cobroVehiculo: false,
          distritoIds: [e.dOcupado.id, e.dAntes.id, e.dLibre.id],
          tarifas: [],
        }),
        { usuarioId: e.maestroA, rol: "maestro" },
      );
      return { res, dAntes: e.dAntes.nombre, dOcupado: e.dOcupado.nombre, a1: e.A1.nombre };
    });

    // «Distrito Sintetico Antes …» ordena antes que «Distrito Sintetico Ocupado …».
    expect(medido.res).toEqual({
      status: "validation_error",
      fieldErrors: {
        distritoIds: [
          `${medido.dAntes} ya está en la zona ${medido.a1}.`,
          `${medido.dOcupado} ya está en la zona ${medido.a1}.`,
        ],
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R4 — la propia zona no es conflicto
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("⭑ R4: guardar la zona con sus mismos distritos → ok", async () => {
    const medido = await conEscenario(async (e) => {
      const res = await e.repo().update(
        e.A2.id,
        {
          nombre: e.A2.nombre,
          cobroVehiculo: false,
          distritoIds: [e.dPropio.id],
          tarifas: [{ cobroEntregado: 1000, cobroRechazado: 500, vehiculoId: null }],
        },
        e.maestroA,
      );
      return { estado: res.estado, despues: await fotoDeZona(e.tx, e.A2.id), dPropio: e.dPropio.id };
    });

    expect(medido.estado).toBe("ok");
    expect(medido.despues.distritos).toEqual([medido.dPropio]);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R5 — otra empresa no cuenta
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("⭑ R5: el mismo distrito en una zona de la empresa B no bloquea a la empresa A, y la fila de B no cambia", async () => {
    const medido = await conEscenario(async (e) => {
      await e.como("B");
      const filasDeBAntes = await e.tx.zonaDistrito.findMany({
        where: { distritoId: e.dDeB.id },
        select: { id: true, zonaId: true },
      });

      await e.como("A");
      const creado = await e.repo().create(
        { ...SINPE, nombre: `Zona A3 ${unico()}`, cobroVehiculo: false, esCentral: false, distritoIds: [e.dDeB.id], tarifas: [] },
        e.maestroA,
      );
      // Y el conflicto de verdad (dOcupado esta en A1 Y en B1) nombra SOLO la zona de A.
      const conflicto = await e.repo().create(
        { ...SINPE, nombre: `Zona A4 ${unico()}`, cobroVehiculo: false, esCentral: false, distritoIds: [e.dOcupado.id], tarifas: [] },
        e.maestroA,
      );

      await e.como("B");
      const filasDeBDespues = await e.tx.zonaDistrito.findMany({
        where: { distritoId: e.dDeB.id },
        select: { id: true, zonaId: true },
      });
      return {
        creado: creado.estado,
        conflicto,
        filasDeBAntes,
        filasDeBDespues,
        b1: e.B1.id,
        dOcupado: e.dOcupado.nombre,
        a1: e.A1.nombre,
      };
    });

    expect(medido.creado).toBe("ok");
    expect(medido.conflicto).toEqual({
      estado: "distrito_en_otra_zona",
      conflictos: [{ distritoNombre: medido.dOcupado, zonaNombre: medido.a1 }],
    });
    expect(medido.filasDeBAntes.map((f) => f.zonaId)).toEqual([medido.b1]);
    expect(medido.filasDeBDespues).toEqual(medido.filasDeBAntes);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R7 / R8 — el indice unico, y el error REAL que levanta
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("⭑ R7: insertar directo una segunda fila (misma empresa, mismo distrito, otra zona) falla; en otra empresa se acepta", async () => {
    const medido = await conEscenario(async (e) => {
      const enA = await capturarError(e.tx, () =>
        e.tx.zonaDistrito.create({ data: { zonaId: e.A2.id, distritoId: e.dOcupado.id } }),
      );
      await e.como("B");
      const enB = await capturarError(e.tx, () =>
        e.tx.zonaDistrito.create({ data: { zonaId: e.B1.id, distritoId: e.dPropio.id } }),
      );
      const filasEnB = await e.tx.zonaDistrito.count({ where: { distritoId: e.dPropio.id } });
      return { enA, enB, filasEnB };
    });

    expect(medido.enA, "la base acepto el mismo distrito en dos zonas de la misma empresa").not.toBeNull();
    expect(String((medido.enA as Error).message) + JSON.stringify(medido.enA)).toContain(
      "zona_distrito_organizacion_id_distrito_id_key",
    );
    expect(medido.enB).toBeNull();
    expect(medido.filasEnB).toBe(1);
  });

  it("⭑ R8: el error REAL del indice lo reconoce `esViolacionDistritoUnico`", async () => {
    const error = await conEscenario(async (e) =>
      capturarError(e.tx, () =>
        e.tx.zonaDistrito.create({ data: { zonaId: e.A2.id, distritoId: e.dOcupado.id } }),
      ),
    );

    expect(error).not.toBeNull();
    expect(esViolacionDistritoUnico(error)).toBe(true);
  });

  it("⭑ R8: la carrera (la lectura no vio el conflicto y el indice lo paro) → `conflictos: null` y nada escrito", async () => {
    const medido = await conEscenario(async (e) => {
      // Simula el otro guardado simultaneo: la lectura de conflictos (la unica que pide
      // `select.zona`) llega vacia, y el `createMany` real choca con el indice real.
      const delegado = e.tx.zonaDistrito;
      const zonaDistritoCiego = new Proxy(delegado as object, {
        get(objetivo, prop) {
          if (prop === "findMany") {
            return async (args: { select?: { zona?: unknown } }) =>
              args?.select?.zona !== undefined ? [] : delegado.findMany(args as never);
          }
          const valor = Reflect.get(objetivo, prop) as unknown;
          return typeof valor === "function" ? valor.bind(objetivo) : valor;
        },
      });
      const txCiego = new Proxy(e.tx as object, {
        get(objetivo, prop) {
          if (prop === "zonaDistrito") return zonaDistritoCiego;
          const valor = Reflect.get(objetivo, prop) as unknown;
          return typeof valor === "function" ? valor.bind(objetivo) : valor;
        },
      }) as TxDeTest;
      const repoCiego = new ZonaRepository(clienteConSavepoint(txCiego));

      const antes = await fotoDeZona(e.tx, e.A2.id);
      const actualizado = await repoCiego.update(
        e.A2.id,
        { nombre: `Zona Renombrada ${unico()}`, cobroVehiculo: false, distritoIds: [e.dPropio.id, e.dOcupado.id], tarifas: [] },
        e.maestroA,
      );
      const nombreNueva = `Zona Nueva ${unico()}`;
      const creado = await repoCiego.create(
        { ...SINPE, nombre: nombreNueva, cobroVehiculo: false, esCentral: false, distritoIds: [e.dOcupado.id], tarifas: [] },
        e.maestroA,
      );
      return {
        actualizado,
        creado,
        antes,
        despues: await fotoDeZona(e.tx, e.A2.id),
        zonasNuevas: await e.tx.zona.count({ where: { nombre: nombreNueva } }),
      };
    });

    expect(medido.actualizado).toEqual({ estado: "distrito_en_otra_zona", conflictos: null });
    expect(medido.creado).toEqual({ estado: "distrito_en_otra_zona", conflictos: null });
    expect(medido.despues).toEqual(medido.antes);
    expect(medido.zonasNuevas).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────────
  // R14 — el arbol de A no trae la zona de B
  // ─────────────────────────────────────────────────────────────────────────────────────────────

  it("⭑ R14: `listArbol` de la empresa A no trae la zona de B", async () => {
    const medido = await conEscenario(async (e) => {
      const arbol = await new GeoRepository(e.tx as unknown as PrismaClient).listArbol();
      const distritos = arbol.flatMap((p) => p.cantones.flatMap((c) => c.distritos));
      const porId = new Map(distritos.map((d) => [d.id, d]));
      return {
        ocupado: porId.get(e.dOcupado.id),
        deB: porId.get(e.dDeB.id),
        a1: e.A1,
      };
    });

    // dOcupado esta en A1 y en B1: A solo ve A1.
    expect(medido.ocupado?.zonas).toEqual([{ id: medido.a1.id, nombre: medido.a1.nombre }]);
    expect(medido.ocupado?.zonaId).toBe(medido.a1.id);
    // dDeB solo esta en B1: para A, sin zona.
    expect(medido.deB, "el distrito de B no esta en el arbol").toBeDefined();
    expect(medido.deB?.zonas).toEqual([]);
  });
});
