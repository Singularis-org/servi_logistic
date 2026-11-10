import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { CoberturaRepository } from "@/lib/repositories/CoberturaRepository";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { BulkOrdenService } from "@/lib/services/BulkOrdenService";
import { CotizacionOrdenService } from "@/lib/services/CotizacionOrdenService";
import { distinct, indexBy, normalize, resolveGeo } from "@/lib/services/geo-resolucion";
import { esZonaEspecial, zonaQueCubre } from "@/lib/services/geografia-dominio";
import { MSG_PAIS_NO_HABILITADO, msgSinZona, resolverUbicacion } from "@/lib/services/geo-ubicacion";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import { insertarNodo } from "./_fixtures/geo-43";
import { crearEscenarioGeo44, type EmpresaGeo44, type EscenarioGeo44 } from "./_fixtures/geo-44";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

/**
 * SLT-89 · R6, R7, R8, R9 (T2.3; design §4.1) — UNA ASIGNACIÓN A UN CANTÓN O A UNA PROVINCIA LA
 * HEREDAN TODAS LAS LECTURAS, SIN TOCAR SU CÓDIGO.
 *
 * Contra Postgres real, con el escenario de `geo-44.ts` (Costa Rica, 3 niveles):
 *
 *   Provincia ─┬─ Cantón ─────────┬─ «central»      → zona central (propia) + marca
 *              │                  ├─ «dos zonas»    → zona norte   (propia)
 *              │                  ├─ «sin zona»     → ninguna propia
 *              │                  └─ «retirado»     → zona norte   (propia)
 *              └─ Cantón retirado ── «bajo retirado» → zona sur     (propia) + marca
 *
 * Cada caso añade, como dueño, una fila de `zona_nodo` (el cantón a la zona sur, o la provincia a
 * una zona nueva) y lee como la app (`servi_app`, RLS) con los repositorios y servicios reales:
 * «sin zona» pasa a la zona del ancestro asignado más cercano (R6, R7); los distritos con fila
 * propia en `zona_distrito` la conservan (la excepción); la marca no se hereda de una asignación
 * (R8). La regla de guardado de SLT-45 no cambia: un nodo de profundidad 1 cubierto por una zona
 * sigue sin poder ser el lugar de una orden (R7, R42). Todo se revierte.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const SQL_ZONA_NODO = `INSERT INTO zona_nodo (id, zona_id, nodo_geografico_id) VALUES ($1, $2, $3)`;

/** Asigna, como dueño y con la empresa fijada, el nodo a la zona en `zona_nodo`. */
async function asignar(tx: TxDeTest, empresa: EmpresaGeo44, zonaId: string, nodoId: string): Promise<void> {
  await comoDueno(tx);
  await fijarEmpresa(tx, empresa.empresaId);
  await tx.$executeRawUnsafe(SQL_ZONA_NODO, randomUUID(), zonaId, nodoId);
}

/** Una zona nueva de la empresa, sin asignaciones. */
async function zonaNueva(tx: TxDeTest, empresa: EmpresaGeo44, nombre: string): Promise<string> {
  await comoDueno(tx);
  await fijarEmpresa(tx, empresa.empresaId);
  const z = await tx.zona.create({
    data: { nombre: `${nombre} SLT-89 ${randomUUID().slice(0, 8)}`, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
    select: { id: true },
  });
  return z.id;
}

/** Corre `fn` como la app: `servi_app` con la empresa en la transaccion y en el contexto. */
async function comoLaEmpresa<T>(tx: TxDeTest, empresa: EmpresaGeo44, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, empresa.empresaId);
  try {
    return await conEmpresa(empresa.empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

/** Los nombres de la ruta provincia → cantón → distrito, para las entradas por nombre. */
async function nombres(tx: TxDeTest, ids: string[]): Promise<string[]> {
  const filas = await tx.$queryRawUnsafe<{ id: string; nombre: string }[]>(
    `SELECT id, nombre FROM nodo_geografico WHERE id = ANY($1::text[])`,
    ids,
  );
  return ids.map((id) => {
    const f = filas.find((x) => x.id === id);
    if (f === undefined) throw new Error(`el nodo ${id} no esta en el catalogo`);
    return f.nombre;
  });
}

/** La zona v1 de cada distrito del cantón: `findDistritosByCantonIds` + `resolveGeo`, como la carga y la cotización v1. */
async function zonasV1(tx: TxDeTest, empresa: EmpresaGeo44): Promise<Record<string, string | null>> {
  const g = empresa.geo;
  const [provincia, canton] = await nombres(tx, [g.provinciaId, g.cantonId]);
  return comoLaEmpresa(tx, empresa, async () => {
    const repo = new OrdenRepository(clienteConSavepoint(tx));
    const provincias = await repo.findAllProvincias();
    const cantones = await repo.findCantonesByProvinciaIds(distinct(provincias.map((p) => p.id)));
    const distritos = await repo.findDistritosByCantonIds(distinct(cantones.map((c) => c.id)));
    const pi = indexBy(provincias, (p) => normalize(p.nombre));
    const ci = indexBy(cantones, (c) => `${c.provinciaId}::${normalize(c.nombre)}`);
    const di = indexBy(distritos, (d) => `${d.cantonId}::${normalize(d.nombre)}`);
    const salida: Record<string, string | null> = {};
    for (const id of [g.distritoCentralId, g.distritoDosZonasId, g.distritoSinZonaId]) {
      const [distrito] = await nombres(tx, [id]);
      const r = resolveGeo({ provincia, canton, distrito }, pi, ci, di);
      salida[id] = r.ok ? r.geo.zonaId : null;
    }
    return salida;
  });
}

describeSiHayBase("SLT-89 · R6/R7/R8/R9 — las lecturas heredan la zona de un cantón o una provincia", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  async function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo44) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => fn(tx, await crearEscenarioGeo44(tx)));
  }

  it("v1 (carga y cotización): sin asignación, «sin zona» no resuelve; con el cantón asignado hereda y las excepciones conservan la suya", async () => {
    const r = await conEscenario(async (tx, e) => {
      const antes = await zonasV1(tx, e.cr);
      await asignar(tx, e.cr, e.cr.zonas.surId, e.cr.geo.cantonId);
      return { antes, despues: await zonasV1(tx, e.cr), e };
    });
    const g = r.e.cr.geo;
    const z = r.e.cr.zonas;
    expect(r.antes).toEqual({ [g.distritoCentralId]: z.centralId, [g.distritoDosZonasId]: z.norteId, [g.distritoSinZonaId]: null });
    expect(r.despues).toEqual({ [g.distritoCentralId]: z.centralId, [g.distritoDosZonasId]: z.norteId, [g.distritoSinZonaId]: z.surId });
  });

  it("una provincia asignada llega a sus distritos a dos saltos; el cantón asignado, más cercano, gana", async () => {
    const r = await conEscenario(async (tx, e) => {
      const zp = await zonaNueva(tx, e.cr, "Provincia");
      await asignar(tx, e.cr, zp, e.cr.geo.provinciaId);
      const soloProvincia = await zonasV1(tx, e.cr);
      await asignar(tx, e.cr, e.cr.zonas.surId, e.cr.geo.cantonId);
      return { zp, soloProvincia, conCanton: await zonasV1(tx, e.cr), e };
    });
    const g = r.e.cr.geo;
    expect(r.soloProvincia[g.distritoSinZonaId]).toBe(r.zp);
    expect(r.soloProvincia[g.distritoCentralId]).toBe(r.e.cr.zonas.centralId);
    expect(r.conCanton[g.distritoSinZonaId]).toBe(r.e.cr.zonas.surId);
  });

  it("v2: el distrito y el cantón como lugar heredan; la provincia cubierta sigue sin admitir guardado (SLT-45)", async () => {
    const r = await conEscenario(async (tx, e) => {
      const g = e.cr.geo;
      const [provincia, canton, sinZona] = await nombres(tx, [g.provinciaId, g.cantonId, g.distritoSinZonaId]);
      const resolver = (nombresRuta: string[]) =>
        comoLaEmpresa(tx, e.cr, async () => {
          const { catalogo, asignaciones } = await new CatalogoGeograficoRepository(clienteConSavepoint(tx)).deLaEmpresa();
          return resolverUbicacion({ tipo: "ruta", nombres: nombresRuta }, catalogo, asignaciones);
        });
      const cantonAntes = await resolver([provincia, canton]);
      await asignar(tx, e.cr, e.cr.zonas.surId, g.cantonId);
      const zp = await zonaNueva(tx, e.cr, "Provincia");
      await asignar(tx, e.cr, zp, g.provinciaId);
      return {
        canton,
        cantonAntes,
        distrito: await resolver([provincia, canton, sinZona]),
        cantonDespues: await resolver([provincia, canton]),
        provincia: await resolver([provincia]),
        e,
      };
    });
    const g = r.e.cr.geo;
    // R7: sin zona que cubra el lugar, el error de siempre.
    expect(r.cantonAntes).toEqual({ ok: false, fieldErrors: { ubicacion: [msgSinZona(r.canton)] } });
    expect(r.distrito.ok && r.distrito.u.zona.id).toBe(r.e.cr.zonas.surId);
    expect(r.distrito.ok && r.distrito.u.fks).toEqual({ provinciaId: g.provinciaId, cantonId: g.cantonId, distritoId: g.distritoSinZonaId });
    expect(r.cantonDespues.ok && r.cantonDespues.u.zona.id).toBe(r.e.cr.zonas.surId);
    expect(r.cantonDespues.ok && r.cantonDespues.u.fks).toEqual({ provinciaId: g.provinciaId, cantonId: g.cantonId, distritoId: null });
    expect(r.provincia).toEqual({ ok: false, fieldErrors: { ubicacion: [MSG_PAIS_NO_HABILITADO] } });
  });

  it("carga masiva v1: la orden del distrito heredado se crea con la zona del cantón", async () => {
    const r = await conEscenario(async (tx, e) => {
      const g = e.cr.geo;
      const [provincia, canton, sinZona] = await nombres(tx, [g.provinciaId, g.cantonId, g.distritoSinZonaId]);
      const numRemision = `SLT89-${randomUUID().slice(0, 8)}`;
      const fila = {
        num_remision: numRemision,
        destinatario: "Destinatario SLT-89",
        telefono: "88887777",
        provincia,
        canton_distrito: `${canton} (${sinZona})`,
        direccion: "",
        producto: "Caja",
        notas: "",
        monto_cobrar: "",
      };
      const actor: Actor = { usuarioId: e.cr.tiendaId, rol: "adminTienda" };
      const cargar = () =>
        comoLaEmpresa(tx, e.cr, () => {
          const cli = clienteConSavepoint(tx);
          return new BulkOrdenService(new OrdenRepository(cli), new TarifaVigenteRepository(cli)).cargarMasiva([fila], actor);
        });
      const sinAsignar = await cargar();
      await asignar(tx, e.cr, e.cr.zonas.surId, g.cantonId);
      const asignado = await cargar();
      const orden = await tx.orden.findFirst({ where: { numRemision }, select: { zonaId: true, distritoId: true } });
      return { sinAsignar, asignado, orden, sinZona, e };
    });
    expect(r.sinAsignar.status === "ok" && r.sinAsignar.summary.filas[0]).toMatchObject({ resultado: "error" });
    expect(r.asignado.status === "ok" && r.asignado.summary.filas[0]).toMatchObject({ resultado: "creada" });
    expect(r.orden).toEqual({ zonaId: r.e.cr.zonas.surId, distritoId: r.e.cr.geo.distritoSinZonaId });
  });

  it("cotización v1 y v2: el distrito heredado deja de ser «sin zona» y se cotiza", async () => {
    const r = await conEscenario(async (tx, e) => {
      const g = e.cr.geo;
      const [provincia, canton, distrito] = await nombres(tx, [g.provinciaId, g.cantonId, g.distritoSinZonaId]);
      const actor: Actor = { usuarioId: e.cr.tiendaId, rol: "apiKey" };
      const servicio = () => {
        const cli = clienteConSavepoint(tx);
        return new CotizacionOrdenService(new OrdenRepository(cli), new TarifaVigenteRepository(cli), new CatalogoGeograficoRepository(cli));
      };
      const v1 = () => comoLaEmpresa(tx, e.cr, () => servicio().cotizar([{ provincia, canton, distrito }], actor));
      const v2 = () =>
        comoLaEmpresa(tx, e.cr, () =>
          servicio().cotizarV2([{ campos: {}, ubicacion: { tipo: "ruta", nombres: [provincia, canton, distrito] } }], actor),
        );
      const antes = { v1: await v1(), v2: await v2() };
      await asignar(tx, e.cr, e.cr.zonas.surId, g.cantonId);
      return { antes, despues: { v1: await v1(), v2: await v2() } };
    });
    for (const v of ["v1", "v2"] as const) {
      expect(r.antes[v].status === "ok" && r.antes[v].resumen.cotizadas, v).toBe(0);
      expect(r.despues[v].status === "ok" && r.despues[v].resumen, v).toMatchObject({ cotizadas: 1, conError: 0 });
    }
  });

  it("Excel de cobertura y árbol de zonas: el heredado sale con la zona del cantón y sin marca; las excepciones y las marcas, como estaban", async () => {
    const r = await conEscenario(async (tx, e) => {
      await asignar(tx, e.cr, e.cr.zonas.surId, e.cr.geo.cantonId);
      const leido = await comoLaEmpresa(tx, e.cr, async () => {
        const cli = clienteConSavepoint(tx);
        return { cobertura: await new CoberturaRepository(cli).listDistritos(), arbol: await new GeoRepository(cli).listArbol() };
      });
      const [sinZona, central] = await nombres(tx, [e.cr.geo.distritoSinZonaId, e.cr.geo.distritoCentralId]);
      return { ...leido, sinZona, central, e };
    });
    const z = r.e.cr.zonas;
    const fila = (nombre: string) => r.cobertura.find((d) => d.distrito.nombre === nombre);
    expect(fila(r.sinZona)?.zonas.map((x) => x.id)).toEqual([z.surId]);
    expect(fila(r.sinZona)?.distrito.zonaEspecial).toBe(false);
    expect(fila(r.central)?.zonas.map((x) => x.id)).toEqual([z.centralId]);
    expect(fila(r.central)?.distrito.zonaEspecial).toBe(true);

    const distritos = r.arbol.flatMap((p) => p.cantones.flatMap((c) => c.distritos));
    const sinZona = distritos.find((d) => d.id === r.e.cr.geo.distritoSinZonaId);
    expect(sinZona).toMatchObject({ zonaId: z.surId, zonaEspecial: false });
    // `zonas` son las asignaciones DIRECTAS del distrito (SLT-75 R14): la heredada no es una.
    expect(sinZona?.zonas).toEqual([]);
    expect(distritos.find((d) => d.id === r.e.cr.geo.distritoCentralId)).toMatchObject({ zonaId: z.centralId, zonaEspecial: true });
  });

  it("árbol de zonas de N niveles (T2.4, R24): asignada, heredada con su nodo, y la excepción con las dos", async () => {
    const r = await conEscenario(async (tx, e) => {
      await asignar(tx, e.cr, e.cr.zonas.surId, e.cr.geo.cantonId);
      const arbol = await comoLaEmpresa(tx, e.cr, () => new GeoRepository(clienteConSavepoint(tx)).arbolDeZonas());
      const [canton, sur, central] = await Promise.all([
        nombres(tx, [e.cr.geo.cantonId]),
        tx.zona.findUniqueOrThrow({ where: { id: e.cr.zonas.surId }, select: { nombre: true } }),
        tx.zona.findUniqueOrThrow({ where: { id: e.cr.zonas.centralId }, select: { nombre: true } }),
      ]);
      return { arbol, canton: canton[0], sur: sur.nombre, central: central.nombre, e };
    });
    const g = r.e.cr.geo;
    const z = r.e.cr.zonas;
    expect(r.arbol.tipos.map((t) => t.profundidad)).toEqual([1, 2, 3]);
    const provincia = r.arbol.raices.find((p) => p.id === g.provinciaId);
    const canton = provincia?.hijos.find((c) => c.id === g.cantonId);
    const hijo = (id: string) => canton?.hijos.find((d) => d.id === id);
    expect(provincia).toMatchObject({ profundidad: 1, asignadaA: null, heredaDe: null });
    expect(canton).toMatchObject({ profundidad: 2, asignadaA: { id: z.surId, nombre: r.sur }, heredaDe: null });
    const hereda = { zonaId: z.surId, zonaNombre: r.sur, nodoId: g.cantonId, nodoNombre: r.canton };
    expect(hijo(g.distritoSinZonaId)).toMatchObject({ profundidad: 3, asignadaA: null, heredaDe: hereda, hijos: [] });
    expect(hijo(g.distritoCentralId)).toMatchObject({ asignadaA: { id: z.centralId, nombre: r.central }, heredaDe: hereda });
    // El cantón retirado no hereda de nadie: la provincia no tiene asignación.
    expect(provincia?.hijos.find((c) => c.id === g.cantonRetiradoId)).toMatchObject({ heredaDe: null, activo: false });
  });

  it("geografía de los filtros por zona: entran lo heredado y sus ancestros; una excepción que cubre otra zona, no", async () => {
    const r = await conEscenario(async (tx, e) => {
      await asignar(tx, e.cr, e.cr.zonas.surId, e.cr.geo.cantonId);
      const leido = await comoLaEmpresa(tx, e.cr, () =>
        new GeoRepository(clienteConSavepoint(tx)).listGeografiaLitePorZona(e.cr.zonas.surId),
      );
      return { leido, e };
    });
    const g = r.e.cr.geo;
    expect(r.leido.provincias.map((p) => p.id)).toEqual([g.provinciaId]);
    expect(new Set(r.leido.cantones.map((c) => c.id))).toEqual(new Set([g.cantonId, g.cantonRetiradoId]));
    // «sin zona» hereda del cantón; «bajo retirado» es de sur por su fila propia. «central», «dos
    // zonas» y «retirado» cuelgan del cantón pero los cubre su propia asignación (R6).
    expect(new Set(r.leido.distritos.map((d) => d.id))).toEqual(new Set([g.distritoSinZonaId, g.distritoBajoCantonRetiradoId]));
  });

  it("R8: la marca de un distrito la hereda su nodo de profundidad 4; asignar un cantón no marca a nadie", async () => {
    const r = await conEscenario(async (tx, e) => {
      const xa = e.xa;
      await comoDueno(tx);
      const tipo4 = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural) VALUES ($1, $2, 'nivel_4', 'Sector', 'Sectores')`,
        tipo4,
        xa.paisId,
      );
      const sector = (padreId: string) =>
        insertarNodo(tx, { paisId: xa.paisId, tipoId: tipo4, padreId, profundidad: 4, nombre: `Sector ${randomUUID().slice(0, 8)}` });
      const bajoMarca = await sector(xa.geo.distritoCentralId);
      const bajoSinZona = await sector(xa.geo.distritoSinZonaId);
      const marcasAntes = await tx.distritoZonaEspecial.count();
      await asignar(tx, xa, xa.zonas.surId, xa.geo.cantonId);
      const { catalogo, asignaciones } = await comoLaEmpresa(tx, xa, () =>
        new CatalogoGeograficoRepository(clienteConSavepoint(tx)).deLaEmpresa(),
      );
      return {
        marcaBajoMarca: esZonaEspecial(catalogo, asignaciones, bajoMarca),
        marcaBajoSinZona: esZonaEspecial(catalogo, asignaciones, bajoSinZona),
        marcaCanton: esZonaEspecial(catalogo, asignaciones, xa.geo.cantonId),
        zonaBajoMarca: zonaQueCubre(catalogo, asignaciones, bajoMarca)?.id,
        zonaBajoSinZona: zonaQueCubre(catalogo, asignaciones, bajoSinZona)?.id,
        marcasAntes,
        marcasDespues: await tx.distritoZonaEspecial.count(),
        xa,
      };
    });
    expect(r.marcaBajoMarca).toBe(true);
    expect(r.marcaBajoSinZona).toBe(false);
    expect(r.marcaCanton).toBe(false);
    expect(r.zonaBajoMarca).toBe(r.xa.zonas.centralId);
    expect(r.zonaBajoSinZona).toBe(r.xa.zonas.surId);
    // Ninguna escritura de marcas.
    expect(r.marcasDespues).toBe(r.marcasAntes);
  });
});
