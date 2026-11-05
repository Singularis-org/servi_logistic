import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CoberturaRepository } from "@/lib/repositories/CoberturaRepository";
import type { DistritoCoberturaRow } from "@/lib/interfaces/repositories/ICoberturaRepository";

import { comoApp, crearOrganizacion, fijarEmpresa, sembrarActivacion } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// FICHA 465 (T3) — LAS DOS LECTURAS DEL EXCEL DE COBERTURA, CONTRA POSTGRES REAL.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUE AQUI Y NO EN `unit`: el filtro de la tarifa general (`tienda_id IS NULL AND zona_id IS
// NOT NULL`) es un `WHERE`, y un test con dobles no ve el SQL —medido cuatro veces en este repo:
// una mutacion del `WHERE` pasa en verde contra dobles—. Aqui se siembran las cuatro formas de
// tarifa y se mira lo que Postgres devuelve de verdad.
//
// SIEMBRA PROPIA Y REVERTIDA: todo vive dentro de `enTransaccionRevertida`, asi que no queda ni
// una fila. Nada de `if (!x) return;`: si falta con que sembrar (una tienda), el test REVIENTA.
//
// MUTACIONES QUE ESTE ARCHIVO MATA (medidas al escribirlo, ver progress/impl_465.md):
//   - quitar `tiendaId: null` del `where` -> la zona Z2 (solo tarifa de tienda) aparece;
//   - quitar `zonaId: { not: null }`      -> aparece un `null` (filas (T,NULL) y (NULL,NULL)).
//
// SLT-54 (R30): la tarifa general ahora depende del modelo. Ese bloque va al final y lee como `servi_app`
// con dos empresas: el `WHERE` nuevo tampoco lo ve un doble.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `cob465-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;

function datosDeTarifa(zonaId: string | null, tiendaId: string | null) {
  return {
    valorFlete: new Prisma.Decimal("1.00"),
    valorFleteDevuelto: new Prisma.Decimal("1.00"),
    valorFleteGam: new Prisma.Decimal("1.00"),
    valorFleteDevueltoGam: new Prisma.Decimal("1.00"),
    comisionCod: new Prisma.Decimal("1.00"),
    ivaFlete: new Prisma.Decimal("1.00"),
    ivaComisionCod: new Prisma.Decimal("1.00"),
    zonaId,
    tiendaId,
  };
}

interface Semilla {
  z1: string; // con tarifa general (NULL, Z1)
  z2: string; // solo tarifa de tienda (T, Z2)
  z3: string; // sin tarifa
  centralId: string;
  centralNombre: string;
}

describeSiHayBase("465 — CoberturaRepository contra Postgres real", () => {
  let prisma: PrismaClient;
  let tiendaId: string;

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    const tienda = await prisma.usuario.findFirst({
      where: { rol: { value: "adminTienda" } },
      select: { id: true },
    });
    // SIN `if (!tienda) return;`: sin tienda no hay tarifa (T, ·) que sembrar y el test no probaria
    // el filtro de tienda. Mejor rojo que verde vacio.
    if (tienda === null) {
      throw new Error("no hay ningun usuario adminTienda en esta base: corre `pnpm run db:seed`");
    }
    tiendaId = tienda.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function sembrar(tx: TxDeTest): Promise<Semilla> {
    await serializarEscriturasReales(tx);

    const zona = async (marca: string) =>
      (
        await tx.zona.create({
          data: { nombre: `${SUFIJO}-${marca}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
          select: { id: true },
        })
      ).id;
    const z1 = await zona("Z1");
    const z2 = await zona("Z2");
    const z3 = await zona("Z3");

    // A lo sumo UNA zona central (indice unico parcial): se usa la que haya o se crea.
    let central = await tx.zona.findFirst({ where: { esCentral: true }, select: { id: true, nombre: true } });
    if (central === null) {
      central = await tx.zona.create({
        data: { nombre: `${SUFIJO}-central`, esCentral: true, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
        select: { id: true, nombre: true },
      });
    }

    // Las cuatro formas de tarifa. (T, NULL) y (NULL, NULL) caen bajo el UNIQUE NULLS NOT
    // DISTINCT: si la base ya trae una, se reutiliza (lo que se mide es que EXISTA).
    await tx.tarifa.create({ data: datosDeTarifa(z1, null) });
    await tx.tarifa.create({ data: datosDeTarifa(z2, tiendaId) });
    if ((await tx.tarifa.count({ where: { zonaId: null, tiendaId } })) === 0) {
      await tx.tarifa.create({ data: datosDeTarifa(null, tiendaId) });
    }
    if ((await tx.tarifa.count({ where: { zonaId: null, tiendaId: null } })) === 0) {
      await tx.tarifa.create({ data: datosDeTarifa(null, null) });
    }

    // Catalogo: provincia activa con un canton activo y otro retirado.
    const provincia = await tx.provincia.create({ data: { nombre: `${SUFIJO}-Provincia` }, select: { id: true } });
    const cantonVivo = await tx.canton.create({
      data: { nombre: "Cantón Vivo", provinciaId: provincia.id },
      select: { id: true },
    });
    const cantonRetirado = await tx.canton.create({
      data: { nombre: "Cantón Retirado", provinciaId: provincia.id, activo: false },
      select: { id: true },
    });
    const distrito = async (nombre: string, cantonId: string, extra: Partial<{ activo: boolean }> = {}) =>
      (await tx.distrito.create({ data: { nombre, cantonId, ...extra }, select: { id: true } })).id;

    const dCero = await distrito("Cero Zonas", cantonVivo.id);
    const dUna = await distrito("Una Zona", cantonVivo.id);
    // SL-38 (R15): la marca es de la EMPRESA. `enTransaccionRevertida` ya fijo una, y el `DEFAULT`
    // de `organizacion_id` la toma de ahi. «Cero Zonas» se queda sin marca: «No», nunca «Sin definir».
    await tx.distritoZonaEspecial.create({ data: { distritoId: dUna } });
    const dOtraZonaUno = await distrito("Otra Zona Uno", cantonVivo.id);
    const dCentral = await distrito("En La Central", cantonVivo.id);
    const dRetirado = await distrito("Retirado Propio", cantonVivo.id, { activo: false });
    const dBajoCanton = await distrito("Bajo Cantón Retirado", cantonRetirado.id);

    await tx.zonaDistrito.createMany({
      data: [
        { zonaId: z1, distritoId: dUna },
        { zonaId: z1, distritoId: dOtraZonaUno },
        { zonaId: central.id, distritoId: dCentral },
        { zonaId: z3, distritoId: dRetirado },
        { zonaId: z1, distritoId: dBajoCanton },
      ],
    });
    void dCero;

    return { z1, z2, z3, centralId: central.id, centralNombre: central.nombre };
  }

  it("listZonaIdsConTarifaGeneral: solo la zona con tarifa (NULL, Z); sin tiendas y sin null (R14)", async () => {
    const { semilla, ids } = await enTransaccionRevertida(prisma, async (tx) => {
      const semilla = await sembrar(tx);
      const repo = new CoberturaRepository(tx as unknown as PrismaClient);
      return { semilla, ids: await repo.listZonaIdsConTarifaGeneral() };
    });

    expect(ids).toContain(semilla.z1);
    expect(ids).not.toContain(semilla.z2); // (T, Z2): tarifa de TIENDA, no general
    expect(ids).not.toContain(semilla.z3); // sin tarifa
    expect(ids).not.toContain(null); // (T, NULL) y (NULL, NULL) sembradas: ninguna cuenta
    expect(new Set(ids).size).toBe(ids.length); // DISTINCT
  });

  it("listDistritos: activos e inactivos, zonas SIN colapsar y disponibilidad por cadena (R4, R7)", async () => {
    const { semilla, rows } = await enTransaccionRevertida(prisma, async (tx) => {
      const semilla = await sembrar(tx);
      const repo = new CoberturaRepository(tx as unknown as PrismaClient);
      return { semilla, rows: await repo.listDistritos() };
    });

    const mias = new Map<string, DistritoCoberturaRow>(
      rows.filter((r) => r.provincia.nombre === `${SUFIJO}-Provincia`).map((r) => [r.distrito.nombre, r]),
    );
    // Anti-vacuidad: los SEIS distritos sembrados, incluidos los dos no disponibles.
    expect([...mias.keys()].sort()).toEqual(
      ["Bajo Cantón Retirado", "Cero Zonas", "En La Central", "Otra Zona Uno", "Retirado Propio", "Una Zona"].sort(),
    );

    const nombresZona = (r: DistritoCoberturaRow | undefined) => (r?.zonas ?? []).map((z) => z.id).sort();

    expect(mias.get("Cero Zonas")).toMatchObject({ disponible: true, zonas: [] });
    expect(mias.get("Cero Zonas")!.distrito.zonaEspecial).toBe(false);

    expect(mias.get("Una Zona")).toMatchObject({
      disponible: true,
      distrito: { activo: true, zonaEspecial: true },
      zonas: [{ id: semilla.z1, nombre: `${SUFIJO}-Z1`, esCentral: false }],
    });

    // SLT-75: con el indice `(organizacion_id, distrito_id)` un distrito ya no puede estar en dos
    // zonas de la empresa; «Otra Zona Uno» llega con la suya como array sin colapsar.
    expect(nombresZona(mias.get("Otra Zona Uno"))).toEqual([semilla.z1]);

    expect(mias.get("En La Central")!.zonas).toEqual([
      { id: semilla.centralId, nombre: semilla.centralNombre, esCentral: true },
    ]);

    expect(mias.get("Retirado Propio")).toMatchObject({ disponible: false, distrito: { activo: false } });

    // Distrito ACTIVO bajo canton retirado: el flag propio es true, la disponibilidad es false.
    expect(mias.get("Bajo Cantón Retirado")).toMatchObject({
      disponible: false,
      distrito: { activo: true },
      canton: { nombre: "Cantón Retirado", activo: false },
      provincia: { activo: true },
    });
  });
});

describeSiHayBase("SLT-54 R30 — el Excel de cobertura por modelo, leyendo como `servi_app`", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  interface EscenarioR30 {
    A: string;
    B: string;
    /** Tarifa general del viejo y nada en el nuevo. */
    zVieja: string;
    /** Flete por entregado de nivel zona. */
    zNueva: string;
    /** Con un 0 escrito: `tarifa general` no mira el importe. */
    zCero: string;
    /** Solo de grupo, de tienda, otro concepto: no son el flete propio de la zona. */
    zGrupo: string;
    zTienda: string;
    zOtroConcepto: string;
    zB: string;
    distritoMarcado: { id: string; nombre: string };
  }

  const FLETE = { concepto: "tienda_flete_entregado", modo: "monto", valor: "1500.00", ivaPct: "13.00" } as const;

  async function sembrarR30(tx: TxDeTest): Promise<EscenarioR30> {
    await serializarEscriturasReales(tx);
    const A = (await crearOrganizacion(tx)).id;
    const B = (await crearOrganizacion(tx)).id;

    const zona = async (marca: string) =>
      (
        await tx.zona.create({
          data: { nombre: `${SUFIJO}-${marca}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
          select: { id: true },
        })
      ).id;

    await fijarEmpresa(tx, B);
    const zB = await zona("B");
    await tx.tarifaValor.create({ data: { ...FLETE, zonaId: zB } });
    await tx.tarifa.create({ data: datosDeTarifa(zB, null) });

    await fijarEmpresa(tx, A);
    const { tiendaId, cantonId } = await crearFksDeOrden(tx);
    const zVieja = await zona("vieja");
    const zNueva = await zona("nueva");
    const zCero = await zona("cero");
    const zGrupo = await zona("grupo");
    const zTienda = await zona("tienda");
    const zOtroConcepto = await zona("otro");
    await tx.tarifa.create({ data: datosDeTarifa(zVieja, null) });
    await tx.tarifaValor.create({ data: { ...FLETE, zonaId: zNueva } });
    await tx.tarifaValor.create({ data: { ...FLETE, valor: "0.00", zonaId: zCero } });
    const grupo = await tx.grupoDistritos.create({ data: { zonaId: zGrupo, nombre: "G" }, select: { id: true } });
    await tx.tarifaValor.create({ data: { ...FLETE, zonaId: zGrupo, grupoId: grupo.id } });
    await tx.tarifaValor.create({ data: { ...FLETE, zonaId: zTienda, tiendaId } });
    await tx.tarifaValor.create({ data: { ...FLETE, concepto: "tienda_flete_rechazo", zonaId: zOtroConcepto } });
    // Una fila de tienda sin zona: con el `zonaId: { not: null }` quitado, saldria un `null`.
    await tx.tarifaValor.create({ data: { ...FLETE, tiendaId } });

    const distritoMarcado = await tx.distrito.findFirstOrThrow({
      where: { cantonId },
      select: { id: true, nombre: true },
    });
    await tx.distritoZonaEspecial.create({ data: { distritoId: distritoMarcado.id } });

    return { A, B, zVieja, zNueva, zCero, zGrupo, zTienda, zOtroConcepto, zB, distritoMarcado };
  }

  async function zonasComo(tx: TxDeTest, org: string): Promise<string[]> {
    await comoApp(tx, org);
    const ids = await new CoberturaRepository(tx as unknown as PrismaClient).listZonaIdsConTarifaGeneral();
    await tx.$executeRawUnsafe("RESET ROLE");
    return ids.sort();
  }

  it("tarifa general por modelo: sin activar la de `tarifas`, activada el flete propio de la zona", async () => {
    await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrarR30(tx);
      expect(await zonasComo(tx, e.A)).toEqual([e.zVieja]);

      await sembrarActivacion(tx, e.A);
      expect(await zonasComo(tx, e.A)).toEqual([e.zNueva, e.zCero].sort());
    });
  });

  it("dos empresas: activar A no cambia lo que B ve, y ninguna ve las zonas de la otra", async () => {
    await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrarR30(tx);
      await sembrarActivacion(tx, e.A);
      // B sin activar sigue en `tarifas`, aunque tambien tenga un flete de zona en el modelo nuevo.
      expect(await zonasComo(tx, e.B)).toEqual([e.zB]);
      expect(await zonasComo(tx, e.A)).not.toContain(e.zB);

      await sembrarActivacion(tx, e.B);
      expect(await zonasComo(tx, e.B)).toEqual([e.zB]);
      expect(await zonasComo(tx, e.A)).toEqual([e.zNueva, e.zCero].sort());
    });
  });

  it("la marca sigue en el Excel tras activar, y es la de la empresa", async () => {
    await enTransaccionRevertida(prisma, async (tx) => {
      const e = await sembrarR30(tx);
      const marcaComo = async (org: string) => {
        await comoApp(tx, org);
        const filas = await new CoberturaRepository(tx as unknown as PrismaClient).listDistritos();
        await tx.$executeRawUnsafe("RESET ROLE");
        const fila = filas.find((r) => r.canton.nombre === "Cartago" && r.distrito.nombre === e.distritoMarcado.nombre);
        if (fila === undefined) throw new Error("el distrito sembrado no aparece en el Excel");
        return fila.distrito.zonaEspecial;
      };

      expect(await marcaComo(e.A)).toBe(true);
      await sembrarActivacion(tx, e.A);
      expect(await marcaComo(e.A)).toBe(true);
      expect(await marcaComo(e.B)).toBe(false);
    });
  });
});
