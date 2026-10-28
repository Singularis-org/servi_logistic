import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { GeografiaDeOtroPais, traducirErrorDePais } from "@/lib/db/errores-pais";
import { CoberturaRepository } from "@/lib/repositories/CoberturaRepository";
import { DistritoZonaEspecialRepository } from "@/lib/repositories/DistritoZonaEspecialRepository";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { distinct, indexBy, normalize, resolveGeo } from "@/lib/services/geo-resolucion";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import {
  crearGeografiaDePrueba,
  crearOrganizacionEnPais,
  crearPaisDePrueba,
  type GeografiaDePrueba,
} from "@/tests/fabricas/paises";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { comoDueno, errorEnSavepoint, revertida, sqlstateDe } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SL-20 (T6.1; R12, R13, R14, R38, R39) — DOS EMPRESAS EN DOS PAÍSES, con los REPOSITORIOS REALES.
//
// La empresa A vive en `XA` y la B en `XB` (fábrica `tests/fabricas/paises.ts`); cada país tiene su
// geografía mínima y Costa Rica sigue ahí con la de la migración. Cada lectura y escritura corre como
// `servi_app` con la empresa fijada (`comoApp`): sin la bajada de rol la RLS no actúa y el test
// pasaría aunque la política no existiera (R39).
//
//   · R12: `GeoRepository` (árbol y listas lite), `OrdenRepository` (`findAllProvincias`,
//     `find{Cantones,Distritos}By*Ids`, `findDistritoParaCorreccion`) más `resolveGeo` sobre esas
//     lecturas, y `CoberturaRepository.listDistritos` solo devuelven geografía del país de la empresa.
//   · R13/R38: `ZonaRepository.create`, `DistritoZonaEspecialRepository.aplicarCambios` y
//     `OrdenRepository.corregirDatosCliente` con un nodo de otro país fallan con SL021, el error se
//     traduce a `GeografiaDeOtroPais` y no queda nada escrito.
//   · R14: una orden sin distrito entra en los dos países.
//
// Todo corre en transacciones del dueño que se revierten (`revertida`). Los repositorios reciben
// `clienteConSavepoint(tx)`: su `$transaction` abre un SAVEPOINT real, así que un rechazo deshace lo
// que el repositorio ya había escrito, como en producción.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Mundo {
  A: string;
  B: string;
  geoA: GeografiaDePrueba;
  geoB: GeografiaDePrueba;
  geoCR: GeografiaDePrueba;
}

/** Dos países de prueba, su geografía y una empresa en cada uno. Un nodo de CR para contrastar. */
async function sembrarMundo(tx: TxDeTest): Promise<Mundo> {
  await crearPaisDePrueba(tx, "XA");
  await crearPaisDePrueba(tx, "XB");
  const geoA = await crearGeografiaDePrueba(tx, "XA");
  const geoB = await crearGeografiaDePrueba(tx, "XB");
  const canton = await tx.canton.findFirst({
    where: { nombre: "Cartago", provincia: { nombre: "Cartago", paisId: "CR" } },
    select: { id: true, provinciaId: true, distritos: { select: { id: true }, take: 1, orderBy: { nombre: "asc" } } },
  });
  if (canton === null || canton.distritos.length === 0) throw new Error("falta Cartago/Cartago en la base migrada");
  const geoCR = { provinciaId: canton.provinciaId, cantonId: canton.id, distritoId: canton.distritos[0].id };
  const A = (await crearOrganizacionEnPais(tx, "XA", { nombre: `Empresa XA ${randomUUID().slice(0, 6)}` })).id;
  const B = (await crearOrganizacionEnPais(tx, "XB", { nombre: `Empresa XB ${randomUUID().slice(0, 6)}` })).id;
  return { A, B, geoA, geoB, geoCR };
}

/** Los países (como dueño) de un conjunto de ids de un nivel. Vacío si no hay ids. */
async function paisesDe(tx: TxDeTest, tabla: "provincia" | "canton" | "distrito", ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const filas = await tx.$queryRawUnsafe<{ pais_id: string }[]>(
    `SELECT DISTINCT pais_id FROM ${tabla} WHERE id = ANY($1::text[]) ORDER BY 1`,
    ids,
  );
  return filas.map((f) => f.pais_id);
}

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
    provincia_id, canton_id, distrito_id, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SL20 T6', '88880000', $4, $5, $6, $7, $8, 'caja', now(), now())`;

/**
 * Una orden de la empresa con la geografía pedida, insertada como `servi_app`. Las FK (tienda, zona)
 * las crea el dueño con la empresa fijada. Devuelve el id, o el SQLSTATE si la base la rechaza.
 * Deja la transacción como dueño.
 */
async function ordenDe(
  tx: TxDeTest,
  empresaId: string,
  geo: { provinciaId: string; cantonId: string; distritoId: string | null },
): Promise<{ id: string; error: string | null }> {
  await comoDueno(tx);
  await fijarEmpresa(tx, empresaId);
  const fks = await crearFksDeOrden(tx);
  await comoApp(tx, empresaId);
  const id = randomUUID();
  const fallo = await errorEnSavepoint(tx, () =>
    tx.$executeRawUnsafe(
      INSERTAR_ORDEN,
      id,
      `SL20T6-${id.slice(0, 8)}`,
      fks.estatusId,
      fks.tiendaId,
      fks.zonaId,
      geo.provinciaId,
      geo.cantonId,
      geo.distritoId,
    ),
  );
  await comoDueno(tx);
  return { id, error: fallo === null ? null : sqlstateDe(fallo) };
}

/** Lo que una empresa ve de la geografía por cada lectura de R12, como ids. */
async function loQueVe(tx: TxDeTest, empresaId: string, m: Mundo) {
  const cliente = clienteConSavepoint(tx);
  const geo = new GeoRepository(cliente);
  const orden = new OrdenRepository(cliente);
  const cobertura = new CoberturaRepository(cliente);
  const todos = [m.geoA, m.geoB, m.geoCR];

  await comoApp(tx, empresaId);
  const arbol = await geo.listArbol();
  const provinciasLite = await geo.listProvinciasLite();
  const cantonesLite = await geo.listCantonesLite();
  const distritosLite = await geo.listDistritosLite();
  const provinciasOrden = await orden.findAllProvincias();
  // Se piden a propósito los ids de los TRES países: la RLS tiene que recortar los ajenos.
  const cantonesOrden = await orden.findCantonesByProvinciaIds(todos.map((g) => g.provinciaId));
  const distritosOrden = await orden.findDistritosByCantonIds(todos.map((g) => g.cantonId));
  const paraCorreccion = {
    A: (await orden.findDistritoParaCorreccion(m.geoA.distritoId))?.id ?? null,
    B: (await orden.findDistritoParaCorreccion(m.geoB.distritoId))?.id ?? null,
    CR: (await orden.findDistritoParaCorreccion(m.geoCR.distritoId))?.id ?? null,
  };
  // La resolución de la carga y la cotización: los mismos índices que `CotizacionOrdenService`.
  const provincias = await orden.findAllProvincias();
  const cantones = await orden.findCantonesByProvinciaIds(distinct(provincias.map((p) => p.id)));
  const distritos = await orden.findDistritosByCantonIds(distinct(cantones.map((c) => c.id)));
  const indices = [
    indexBy(provincias, (p) => normalize(p.nombre)),
    indexBy(cantones, (c) => `${c.provinciaId}::${normalize(c.nombre)}`),
    indexBy(distritos, (d) => `${d.cantonId}::${normalize(d.nombre)}`),
  ] as const;
  const filasCobertura = await cobertura.listDistritos();
  await comoDueno(tx);

  const arbolDistritos = arbol.flatMap((p) => p.cantones.flatMap((c) => c.distritos.map((d) => d.id)));
  return {
    arbolProvincias: arbol.map((p) => p.id),
    arbolDistritos,
    provinciasLite: provinciasLite.map((p) => p.id),
    cantonesLite: cantonesLite.map((c) => c.id),
    distritosLite: distritosLite.map((d) => d.id),
    provinciasOrden: provinciasOrden.map((p) => p.id),
    cantonesOrden: cantonesOrden.map((c) => c.id),
    distritosOrden: distritosOrden.map((d) => d.id),
    paraCorreccion,
    indices,
    distritosCobertura: filasCobertura.map((f) => `${f.provincia.nombre}/${f.canton.nombre}/${f.distrito.nombre}`),
  };
}

/** Los nombres de un nodo de prueba, para resolverlo por nombre como la carga masiva. */
async function nombresDe(tx: TxDeTest, g: GeografiaDePrueba) {
  const d = await tx.distrito.findUniqueOrThrow({
    where: { id: g.distritoId },
    select: { nombre: true, canton: { select: { nombre: true, provincia: { select: { nombre: true } } } } },
  });
  return { provincia: d.canton.provincia.nombre, canton: d.canton.nombre, distrito: d.nombre };
}

/** Una zona de la empresa con el distrito, por el repositorio real, como `servi_app`. */
function datosDeZona(distritoIds: string[]) {
  return {
    nombre: `Zona SL20 T6 ${randomUUID().slice(0, 8)}`,
    cobroVehiculo: false,
    esCentral: false,
    distritoIds,
    tarifas: [],
    sinpeNumero: "80000000",
    sinpeNombre: "Titular de Prueba",
  };
}

describeSiHayBase("SL-20 T6.1 — dos empresas en dos países, con los repositorios reales (R12, R13, R14, R38, R39)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R12/R39: cada empresa solo ve la geografía de su país en el árbol, las listas, la carga, la corrección y la cobertura", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrarMundo(tx);
      // Una zona de cada empresa con su distrito: sin zona, `resolveGeo` no resolvería el distrito.
      for (const [empresa, g] of [
        [m.A, m.geoA],
        [m.B, m.geoB],
      ] as const) {
        await comoApp(tx, empresa);
        await new ZonaRepository(clienteConSavepoint(tx)).create(datosDeZona([g.distritoId]), null);
        await comoDueno(tx);
      }
      const nombres = { A: await nombresDe(tx, m.geoA), B: await nombresDe(tx, m.geoB), CR: await nombresDe(tx, m.geoCR) };

      const resumen = async (empresaId: string, propio: GeografiaDePrueba) => {
        const v = await loQueVe(tx, empresaId, m);
        const resolver = (n: { provincia: string; canton: string; distrito: string }) => {
          const res = resolveGeo(n, ...v.indices);
          return res.ok ? res.geo.distritoId : Object.values(res.fieldErrors).flat()[0];
        };
        const clave = (n: { provincia: string; canton: string; distrito: string }) => `${n.provincia}/${n.canton}/${n.distrito}`;
        return {
          // El país de TODO lo que devolvió cada lectura, medido como dueño.
          paises: {
            arbolProvincias: await paisesDe(tx, "provincia", v.arbolProvincias),
            arbolDistritos: await paisesDe(tx, "distrito", v.arbolDistritos),
            provinciasLite: await paisesDe(tx, "provincia", v.provinciasLite),
            cantonesLite: await paisesDe(tx, "canton", v.cantonesLite),
            distritosLite: await paisesDe(tx, "distrito", v.distritosLite),
            provinciasOrden: await paisesDe(tx, "provincia", v.provinciasOrden),
            cantonesOrden: await paisesDe(tx, "canton", v.cantonesOrden),
            distritosOrden: await paisesDe(tx, "distrito", v.distritosOrden),
          },
          // Lo propio está (un vacío no pasa) y lo ajeno no.
          veSuDistrito: v.arbolDistritos.includes(propio.distritoId) && v.distritosLite.includes(propio.distritoId),
          cantonesPedidos: v.cantonesOrden,
          distritosPedidos: v.distritosOrden,
          paraCorreccion: v.paraCorreccion,
          resuelve: { A: resolver(nombres.A), B: resolver(nombres.B), CR: resolver(nombres.CR) },
          cobertura: {
            A: v.distritosCobertura.includes(clave(nombres.A)),
            B: v.distritosCobertura.includes(clave(nombres.B)),
            CR: v.distritosCobertura.includes(clave(nombres.CR)),
            filas: v.distritosCobertura.length,
          },
        };
      };
      return { m, A: await resumen(m.A, m.geoA), B: await resumen(m.B, m.geoB) };
    });

    const soloDe = (pais: string) => ({
      arbolProvincias: [pais],
      arbolDistritos: [pais],
      provinciasLite: [pais],
      cantonesLite: [pais],
      distritosLite: [pais],
      provinciasOrden: [pais],
      cantonesOrden: [pais],
      distritosOrden: [pais],
    });
    expect(r.A.paises).toEqual(soloDe("XA"));
    expect(r.B.paises).toEqual(soloDe("XB"));
    expect([r.A.veSuDistrito, r.B.veSuDistrito]).toEqual([true, true]);
    // `find*ByIds` con los ids de los tres países devuelve solo el suyo.
    expect(r.A.cantonesPedidos).toEqual([r.m.geoA.cantonId]);
    expect(r.B.cantonesPedidos).toEqual([r.m.geoB.cantonId]);
    expect(r.A.distritosPedidos).toEqual([r.m.geoA.distritoId]);
    expect(r.B.distritosPedidos).toEqual([r.m.geoB.distritoId]);
    expect(r.A.paraCorreccion).toEqual({ A: r.m.geoA.distritoId, B: null, CR: null });
    expect(r.B.paraCorreccion).toEqual({ A: null, B: r.m.geoB.distritoId, CR: null });
    // `resolveGeo`: lo propio resuelve; lo de otro país es «provincia no encontrada».
    expect(r.A.resuelve).toEqual({ A: r.m.geoA.distritoId, B: "provincia no encontrada", CR: "provincia no encontrada" });
    expect(r.B.resuelve).toEqual({ A: "provincia no encontrada", B: r.m.geoB.distritoId, CR: "provincia no encontrada" });
    expect(r.A.cobertura).toEqual({ A: true, B: false, CR: false, filas: 1 });
    expect(r.B.cobertura).toEqual({ A: false, B: true, CR: false, filas: 1 });
  }, 60_000);

  it("R13/R39: ZonaRepository.create con un distrito de otro país da SL021 → GeografiaDeOtroPais y no crea la zona", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrarMundo(tx);
      const intento = async (distritoIds: string[]) => {
        const datos = datosDeZona(distritoIds);
        await comoApp(tx, m.A);
        const error = await errorEnSavepoint(tx, () => new ZonaRepository(clienteConSavepoint(tx)).create(datos, null));
        await comoDueno(tx);
        const quedo = await tx.zona.count({ where: { nombre: datos.nombre } });
        return { sqlstate: error === null ? null : sqlstateDe(error), traducido: traducirErrorDePais(error), quedo };
      };
      return { xb: await intento([m.geoB.distritoId]), cr: await intento([m.geoCR.distritoId]), propio: await intento([m.geoA.distritoId]) };
    });

    for (const ajeno of [r.xb, r.cr]) {
      expect(ajeno.sqlstate).toBe("SL021");
      expect(ajeno.traducido).toBeInstanceOf(GeografiaDeOtroPais);
      expect(ajeno.quedo).toBe(0);
    }
    expect(r.propio).toEqual({ sqlstate: null, traducido: null, quedo: 1 });
  }, 60_000);

  it("R38/R13/R39: aplicarCambios con un distrito de otro país da SL021 → GeografiaDeOtroPais y la desmarca del lote se deshace", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrarMundo(tx);
      const repo = new DistritoZonaEspecialRepository(clienteConSavepoint(tx));
      const marcasDeA = async () =>
        (
          await tx.distritoZonaEspecial.findMany({
            where: { organizacionId: m.A },
            select: { distritoId: true },
          })
        ).map((f) => f.distritoId);

      await comoApp(tx, m.A);
      const marcaPropia = await repo.aplicarCambios({ marcar: [m.geoA.distritoId], desmarcar: [] });
      // El lote desmarca lo propio y marca lo ajeno: si la marca falla, la desmarca no debe quedar.
      const errorXB = await errorEnSavepoint(tx, () => repo.aplicarCambios({ marcar: [m.geoB.distritoId], desmarcar: [m.geoA.distritoId] }));
      const errorCR = await errorEnSavepoint(tx, () => repo.aplicarCambios({ marcar: [m.geoCR.distritoId], desmarcar: [] }));
      await comoDueno(tx);
      return {
        propio: m.geoA.distritoId,
        marcaPropia,
        xb: { sqlstate: sqlstateDe(errorXB), traducido: traducirErrorDePais(errorXB) },
        cr: { sqlstate: sqlstateDe(errorCR), traducido: traducirErrorDePais(errorCR) },
        marcasTras: await marcasDeA(),
      };
    });

    expect(r.marcaPropia).toEqual({ estado: "ok", creadas: 1, borradas: 0 });
    expect(r.xb.sqlstate).toBe("SL021");
    expect(r.xb.traducido).toBeInstanceOf(GeografiaDeOtroPais);
    expect(r.cr.sqlstate).toBe("SL021");
    expect(r.cr.traducido).toBeInstanceOf(GeografiaDeOtroPais);
    // La marca propia sigue: la desmarca del lote fallido se revirtió con él, y no entró ninguna ajena.
    expect(r.marcasTras).toEqual([r.propio]);
  }, 60_000);

  it("R13/R39: corregirDatosCliente hacia geografía de otro país da SL021 → GeografiaDeOtroPais y la orden queda como estaba", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrarMundo(tx);
      const orden = await ordenDe(tx, m.A, m.geoA);
      if (orden.error !== null) throw new Error(`la orden propia no entró: ${orden.error}`);
      const repo = new OrdenRepository(clienteConSavepoint(tx));
      const rastro = { actorUsuarioId: null, ubicacionCorregida: false };

      const corregir = async (g: GeografiaDePrueba) => {
        await comoApp(tx, m.A);
        let salida: unknown = null;
        const error = await errorEnSavepoint(tx, async () => {
          salida = await repo.corregirDatosCliente(
            orden.id,
            { provinciaId: g.provinciaId, cantonId: g.cantonId, distritoId: g.distritoId },
            [],
            rastro,
          );
        });
        await comoDueno(tx);
        return { salida, sqlstate: error === null ? null : sqlstateDe(error), traducido: traducirErrorDePais(error) };
      };

      const xb = await corregir(m.geoB);
      const cr = await corregir(m.geoCR);
      const tras = await tx.orden.findUniqueOrThrow({
        where: { id: orden.id },
        select: { provinciaId: true, cantonId: true, distritoId: true },
      });
      // Control: la misma corrección con la geografía propia sí pasa.
      const propia = await corregir(m.geoA);
      return { xb, cr, tras, propia, geoA: m.geoA };
    });

    for (const ajeno of [r.xb, r.cr]) {
      expect(ajeno.sqlstate).toBe("SL021");
      expect(ajeno.traducido).toBeInstanceOf(GeografiaDeOtroPais);
      expect(ajeno.salida).toBeNull();
    }
    expect(r.propia).toEqual({ salida: "ok", sqlstate: null, traducido: null });
    // Tras los dos rechazos, la orden sigue en la geografía con la que nació.
    expect(r.tras).toEqual(r.geoA);
  }, 60_000);

  it("R14/R39: una orden sin distrito entra en los dos países; con distrito de otro país, no", async () => {
    const r = await revertida(base, async (tx) => {
      const m = await sembrarMundo(tx);
      return {
        aSinDistrito: (await ordenDe(tx, m.A, { ...m.geoA, distritoId: null })).error,
        bSinDistrito: (await ordenDe(tx, m.B, { ...m.geoB, distritoId: null })).error,
        aConDistritoDeB: (await ordenDe(tx, m.A, { ...m.geoA, distritoId: m.geoB.distritoId })).error,
        bConProvinciaDeA: (await ordenDe(tx, m.B, { ...m.geoB, distritoId: null, provinciaId: m.geoA.provinciaId })).error,
      };
    });
    expect(r).toEqual({ aSinDistrito: null, bSinDistrito: null, aConDistritoDeB: "SL021", bConProvinciaDeA: "SL021" });
  }, 60_000);
});
