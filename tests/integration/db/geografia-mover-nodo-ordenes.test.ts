import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { gruposDeDistritos } from "@/lib/repositories/_shared/resolver-tarifas";
import { rutaDelLugar } from "@/lib/repositories/_shared/ruta-del-lugar";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { resolverUbicacion } from "@/lib/services/geo-ubicacion";
import { crearOrganizacionEnPais } from "@/tests/fabricas/paises";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { PAIS_CUATRO_NIVELES, claveDeRuta, sembrarPaisDePruebaGeo } from "@/tests/fixtures/paises-de-prueba-geo";
import { crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-48 (T3.3; design §7.2; R39–R41, P1) — LAS ORDENES YA CREADAS AL MOVER UN NODO, contra Postgres.
//
// El pais `XP` de 4 niveles (Valparaíso › Marga Marga › Quilpué › El Belloto; Ñuble › Diguillín) con
// DOS empresas de ese pais. Se mueve Quilpué de Marga Marga a Diguillín y se mira:
//  - R39: ninguna fila de `orden` cambia, la ruta que muestran es la nueva y conservan su zona;
//  - R40: el precio y la marca de las abiertas no cambian; si cambiarian (grupo o marca heredados del
//    padre viejo), el movimiento se bloquea con cuantas y de que empresas (P1). Una orden ya en un
//    cierre no cuenta: su precio esta congelado;
//  - R41: una orden nueva en el nodo toma la zona, el grupo y la marca de la posicion nueva.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, nodo_geografico_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SLT-48', '70704848', 'Direccion SLT-48', $4, $5, $6, 12000, 'caja', now(), now())`;

interface Empresa {
  id: string;
  nombre: string;
  tiendaId: string;
  mensajeroId: string;
  /** Zona asignada a Marga Marga (el padre de hoy). */
  zonaViejaId: string;
}

interface Escenario {
  tx: TxDeTest;
  geo: GeoRepository;
  actorId: string;
  nodo: (...ruta: string[]) => string;
  e1: Empresa;
  e2: Empresa;
  orden: (e: Empresa, nodoId: string, zonaId?: string) => Promise<string>;
  cerrar: (e: Empresa, ordenId: string) => Promise<void>;
}

const RUTA_BELLOTO = ["Valparaíso", "Marga Marga", "Quilpué", "El Belloto"];

async function empresaDe(tx: TxDeTest, id: string, margaMarga: string): Promise<Empresa> {
  await comoDueno(tx);
  await fijarEmpresa(tx, id);
  const tienda = await crearUsuarioDePrueba(tx, "adminTienda");
  const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
  const zona = await tx.zona.create({
    data: { nombre: `Zona vieja ${randomUUID().slice(0, 8)}`, esCentral: false, sinpeNumero: "80000000", sinpeNombre: "Titular" },
    select: { id: true },
  });
  await tx.zonaNodo.create({ data: { zonaId: zona.id, nodoGeograficoId: margaMarga } });
  const { nombre } = await tx.organizacion.findUniqueOrThrow({ where: { id }, select: { nombre: true } });
  return { id, nombre, tiendaId: tienda.id, mensajeroId: mensajero.id, zonaViejaId: zona.id };
}

async function conEscenario<T>(fn: (e: Escenario) => Promise<T>): Promise<T> {
  return revertida(base, async (tx) => {
    const pais = await sembrarPaisDePruebaGeo(tx, PAIS_CUATRO_NIVELES);
    const nodo = (...ruta: string[]) => {
      const id = pais.nodoPorRuta.get(claveDeRuta(ruta));
      if (id === undefined) throw new Error(`el fixture no tiene ${claveDeRuta(ruta)}`);
      return id;
    };
    const actor = await insertarUsuario(tx, await idDeRol(tx, "superadmin"), null);
    if (!actor.desenlace.ok) throw new Error("no se sembro el superadmin");
    const margaMarga = nodo("Valparaíso", "Marga Marga");
    const e1 = await empresaDe(tx, pais.organizacionId, margaMarga);
    const e2 = await empresaDe(tx, (await crearOrganizacionEnPais(tx, "XP")).id, margaMarga);
    const estatus = await tx.orderStatus.findUniqueOrThrow({ where: { value: "en_preparacion" }, select: { id: true } });

    const orden = async (e: Empresa, nodoId: string, zonaId = e.zonaViejaId) => {
      await comoDueno(tx);
      await fijarEmpresa(tx, e.id);
      const id = randomUUID();
      await tx.$executeRawUnsafe(INSERTAR_ORDEN, id, `SLT48-${id.slice(0, 8)}`, estatus.id, e.tiendaId, zonaId, nodoId);
      return id;
    };
    // Una orden que ya entro en un cierre: su precio esta congelado en `cierre_detail`.
    const cerrar = async (e: Empresa, ordenId: string) => {
      await comoDueno(tx);
      await fijarEmpresa(tx, e.id);
      const cierre = await tx.cierreDia.create({
        data: { mensajeroId: e.mensajeroId, destinoTipo: "bodega_central", destinoZonaId: e.zonaViejaId },
        select: { id: true },
      });
      await tx.cierreDetail.create({
        data: {
          cierreId: cierre.id,
          ordenId,
          cobraComision: true,
          zonaId: e.zonaViejaId,
          tiendaId: e.tiendaId,
          esCentral: false,
          numRemision: `SLT48-${ordenId.slice(0, 8)}`,
          destinatario: "Destinatario SLT-48",
          producto: "caja",
          tiendaNombre: "Tienda",
          zonaNombre: "Zona vieja",
          provinciaNombre: "Valparaíso",
          cantonNombre: "Marga Marga",
          distritoNombre: "Quilpué",
        },
      });
    };
    await comoDueno(tx);
    return fn({ tx, geo: new GeoRepository(clienteConSavepoint(tx)), actorId: actor.id, nodo, e1, e2, orden, cerrar });
  });
}

/** Las filas de esas ordenes tal cual estan en la base: si no cambia, el movimiento no las escribio. */
async function huellaDeOrdenes(tx: TxDeTest, ids: readonly string[]): Promise<string> {
  const [f] = await tx.$queryRawUnsafe<{ h: string }[]>(
    `SELECT md5(string_agg(to_jsonb(o)::text, ',' ORDER BY o.id)) AS h FROM orden o WHERE o.id = ANY($1::text[])`,
    [...ids],
  );
  return f.h;
}

/** Lo que el cobro y la API leen de las ordenes de la empresa: zona, lugar de tarifa, marca y ruta. */
async function lecturasDe(tx: TxDeTest, e: Empresa, ids: readonly string[]) {
  await comoApp(tx, e.id);
  try {
    return await conEmpresa(e.id, async () => {
      const cli = clienteConSavepoint(tx);
      const repo = new OrdenRepository(cli);
      const cobro = [];
      for (const id of ids) cobro.push(await repo.findBaseCobroDevolucion(id));
      const api = await repo.listByOwner({ ownerId: e.tiendaId, skip: 0, take: 50 });
      const { catalogo } = await new CatalogoGeograficoRepository(cli).deLaEmpresa();
      const filas = await tx.orden.findMany({ where: { id: { in: [...ids] } }, select: { id: true, nodoGeograficoId: true } });
      return {
        cobro,
        // Solo las ordenes pedidas: P1 y R40 hablan de las abiertas; una cerrada tiene el precio en su cierre.
        costeo: new Map(
          api.items.filter((i) => ids.some((id) => i.numRemision === `SLT48-${id.slice(0, 8)}`)).map((i) => [i.numRemision, i.costeo]),
        ),
        rutas: new Map(filas.map((f) => [f.id, rutaDelLugar(catalogo, f).map((p) => p.nombre)])),
      };
    });
  } finally {
    await comoDueno(tx);
  }
}

describeSiHayBase("SLT-48 R39–R41, P1 — las ordenes al mover un nodo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R39, R40: sin grupo ni marca heredados, se mueve; ninguna orden se escribe, muestran la ruta nueva y conservan zona y precio", async () => {
    const r = await conEscenario(async (s) => {
      const belloto = s.nodo(...RUTA_BELLOTO);
      const o1 = await s.orden(s.e1, belloto);
      const o2 = await s.orden(s.e2, belloto);
      const ids = [o1, o2];
      const previa = await s.geo.vistaPreviaMover(s.nodo("Valparaíso", "Marga Marga", "Quilpué"), s.nodo("Ñuble", "Diguillín"));
      const antes = { huella: await huellaDeOrdenes(s.tx, ids), e1: await lecturasDe(s.tx, s.e1, [o1]), e2: await lecturasDe(s.tx, s.e2, [o2]) };
      const desenlace = await s.geo.mover(
        { id: s.nodo("Valparaíso", "Marga Marga", "Quilpué"), padreIdNuevo: s.nodo("Ñuble", "Diguillín"), padreIdAnterior: s.nodo("Valparaíso", "Marga Marga") },
        s.actorId,
      );
      const despues = { huella: await huellaDeOrdenes(s.tx, ids), e1: await lecturasDe(s.tx, s.e1, [o1]), e2: await lecturasDe(s.tx, s.e2, [o2]) };
      const zonas = await s.tx.orden.findMany({ where: { id: { in: ids } }, select: { id: true, zonaId: true } });
      return { previa, desenlace, antes, despues, o1, o2, zonas, e1: s.e1, e2: s.e2 };
    });

    // R36: las dos ordenes, de las dos empresas, cambian el nombre de lugar que muestran; nada bloquea.
    expect(r.previa).toMatchObject({ estado: "ok", vista: { ordenesQueCambianDeNombre: 2, bloqueo: null } });
    expect(r.desenlace).toEqual({ estado: "movido" });
    // R39: ninguna fila de `orden` cambio (ni `updated_at`), y la zona es la de siempre.
    expect(r.despues.huella).toBe(r.antes.huella);
    expect(new Map(r.zonas.map((z) => [z.id, z.zonaId]))).toEqual(
      new Map([
        [r.o1, r.e1.zonaViejaId],
        [r.o2, r.e2.zonaViejaId],
      ]),
    );
    // R39: la ruta que muestran es la nueva, la del arbol.
    expect(r.antes.e1.rutas.get(r.o1)).toEqual(RUTA_BELLOTO);
    expect(r.despues.e1.rutas.get(r.o1)).toEqual(["Ñuble", "Diguillín", "Quilpué", "El Belloto"]);
    expect(r.despues.e2.rutas.get(r.o2)).toEqual(["Ñuble", "Diguillín", "Quilpué", "El Belloto"]);
    // R40: el precio (zona, lugar de tarifa, marca y costeo de la API) de cada orden abierta es el mismo.
    expect(r.antes.e1.cobro[0]).not.toBeNull();
    expect([r.antes.e1.costeo.size, r.antes.e2.costeo.size]).toEqual([1, 1]);
    expect(r.despues.e1.cobro).toEqual(r.antes.e1.cobro);
    expect(r.despues.e2.cobro).toEqual(r.antes.e2.cobro);
    expect(r.despues.e1.costeo).toEqual(r.antes.e1.costeo);
    expect(r.despues.e2.costeo).toEqual(r.antes.e2.costeo);
  });

  it("P1: un grupo y una marca heredados del padre viejo bloquean, con cuantas ordenes y de que empresas; la cerrada no cuenta", async () => {
    const r = await conEscenario(async (s) => {
      const belloto = s.nodo(...RUTA_BELLOTO);
      // Empresa 1: un grupo de tarifas en Marga Marga (heredado por El Belloto en su zona).
      await fijarEmpresa(s.tx, s.e1.id);
      const grupo = await s.tx.grupoDistritos.create({ data: { zonaId: s.e1.zonaViejaId, nombre: "Grupo viejo" }, select: { id: true } });
      await s.tx.grupoDistritosNodo.create({
        data: { grupoId: grupo.id, zonaId: s.e1.zonaViejaId, nodoGeograficoId: s.nodo("Valparaíso", "Marga Marga") },
      });
      // Empresa 2: la marca de zona especial en Valparaíso (heredada por todo lo de debajo).
      await fijarEmpresa(s.tx, s.e2.id);
      await s.tx.distritoZonaEspecial.create({ data: { distritoId: s.nodo("Valparaíso") } });

      const abierta1 = await s.orden(s.e1, belloto);
      const abierta2a = await s.orden(s.e2, belloto);
      const abierta2b = await s.orden(s.e2, s.nodo("Valparaíso", "Marga Marga", "Quilpué"));
      const cerrada = await s.orden(s.e2, belloto);
      await s.cerrar(s.e2, cerrada);
      // Fuera del subarbol: no se mira.
      await s.orden(s.e1, s.nodo("Valparaíso", "Marga Marga", "Villa Alemana", "Peñablanca"));
      await comoDueno(s.tx);

      const ids = [abierta1, abierta2a, abierta2b, cerrada];
      const datos = {
        id: s.nodo("Valparaíso", "Marga Marga", "Quilpué"),
        padreIdNuevo: s.nodo("Ñuble", "Diguillín"),
        padreIdAnterior: s.nodo("Valparaíso", "Marga Marga"),
      };
      const huellaOrdenes = await huellaDeOrdenes(s.tx, ids);
      const padreAntes = await s.tx.nodoGeografico.findUniqueOrThrow({ where: { id: datos.id }, select: { padreId: true } });
      const historialAntes = await s.tx.historialPlataforma.count({ where: { paisId: "XP" } });
      const previa = await s.geo.vistaPreviaMover(datos.id, datos.padreIdNuevo);
      const mover = await s.geo.mover(datos, s.actorId);
      return {
        previa,
        mover,
        e1: s.e1,
        e2: s.e2,
        igual:
          (await huellaDeOrdenes(s.tx, ids)) === huellaOrdenes &&
          (await s.tx.nodoGeografico.findUniqueOrThrow({ where: { id: datos.id }, select: { padreId: true } })).padreId ===
            padreAntes.padreId &&
          (await s.tx.historialPlataforma.count({ where: { paisId: "XP" } })) === historialAntes,
      };
    });

    const bloqueo = {
      ordenes: 3,
      empresas: [
        { id: r.e2.id, nombre: r.e2.nombre, ordenes: 2 },
        { id: r.e1.id, nombre: r.e1.nombre, ordenes: 1 },
      ],
    };
    // 4 ordenes en el subarbol (la cerrada tambien cambia de nombre); bloquean las 3 abiertas.
    expect(r.previa).toMatchObject({ estado: "ok", vista: { ordenesQueCambianDeNombre: 4, bloqueo } });
    expect(r.mover).toEqual({ estado: "bloqueado", bloqueo });
    expect(r.igual).toBe(true);
  });

  it("R40: un grupo y una marca PROPIOS del nodo no bloquean; R41: una orden nueva usa la zona, el grupo y la marca de la posicion nueva", async () => {
    const r = await conEscenario(async (s) => {
      const belloto = s.nodo(...RUTA_BELLOTO);
      const diguillin = s.nodo("Ñuble", "Diguillín");
      await fijarEmpresa(s.tx, s.e1.id);
      // La posicion nueva: Diguillín tiene su zona, un grupo en esa zona y la marca.
      const zonaNueva = await s.tx.zona.create({
        data: { nombre: `Zona nueva ${randomUUID().slice(0, 8)}`, esCentral: true, sinpeNumero: "80000000", sinpeNombre: "Titular" },
        select: { id: true },
      });
      await s.tx.zonaNodo.create({ data: { zonaId: zonaNueva.id, nodoGeograficoId: diguillin } });
      const grupoNuevo = await s.tx.grupoDistritos.create({ data: { zonaId: zonaNueva.id, nombre: "Grupo nuevo" }, select: { id: true } });
      await s.tx.grupoDistritosNodo.create({ data: { grupoId: grupoNuevo.id, zonaId: zonaNueva.id, nodoGeograficoId: diguillin } });
      await s.tx.distritoZonaEspecial.create({ data: { distritoId: diguillin } });
      // Una orden abierta con grupo y marca PROPIOS de su nodo: mover no los cambia, asi que no bloquea.
      const grupoPropio = await s.tx.grupoDistritos.create({ data: { zonaId: s.e1.zonaViejaId, nombre: "Grupo propio" }, select: { id: true } });
      await s.tx.grupoDistritosNodo.create({ data: { grupoId: grupoPropio.id, zonaId: s.e1.zonaViejaId, nodoGeograficoId: belloto } });
      await s.tx.distritoZonaEspecial.create({ data: { distritoId: belloto } });
      const abierta = await s.orden(s.e1, belloto);
      // Una orden cerrada en Quilpué: con la marca de Diguillín cambiaria, pero su precio esta congelado.
      const cerrada = await s.orden(s.e1, s.nodo("Valparaíso", "Marga Marga", "Quilpué"));
      await s.cerrar(s.e1, cerrada);
      await comoDueno(s.tx);

      const nueva = async () => {
        await comoApp(s.tx, s.e1.id);
        try {
          return await conEmpresa(s.e1.id, async () => {
            const cli = clienteConSavepoint(s.tx);
            const { catalogo, asignaciones } = await new CatalogoGeograficoRepository(cli).deLaEmpresa();
            const u = resolverUbicacion({ tipo: "codigo", codigo: "0580101" }, catalogo, asignaciones);
            if (!u.ok) throw new Error(`El Belloto no resolvio: ${JSON.stringify(u.fieldErrors)}`);
            const grupos = await gruposDeDistritos(cli, [{ zonaId: u.u.zona.id, distritoId: belloto }]);
            return {
              zonaId: u.u.zona.id,
              marca: u.u.esZonaEspecial,
              ruta: u.u.ruta.map((n) => n.nombre),
              grupo: grupos.get(`${u.u.zona.id}|${belloto}`) ?? null,
            };
          });
        } finally {
          await comoDueno(s.tx);
        }
      };

      // Lo que tendria una orden nueva en El Belloto antes de mover, para ver que cambia despues.
      const antesHuella = await huellaDeOrdenes(s.tx, [abierta, cerrada]);
      const cobroAntes = await lecturasDe(s.tx, s.e1, [abierta]);
      const antes = await nueva();
      const desenlace = await s.geo.mover(
        { id: s.nodo("Valparaíso", "Marga Marga", "Quilpué"), padreIdNuevo: diguillin, padreIdAnterior: s.nodo("Valparaíso", "Marga Marga") },
        s.actorId,
      );
      const despues = await nueva();
      return {
        desenlace,
        antes,
        despues,
        igual: (await huellaDeOrdenes(s.tx, [abierta, cerrada])) === antesHuella,
        cobroAntes,
        cobroDespues: await lecturasDe(s.tx, s.e1, [abierta]),
        zonaVieja: s.e1.zonaViejaId,
        zonaNueva: zonaNueva.id,
        grupoPropio: grupoPropio.id,
        grupoNuevo: grupoNuevo.id,
      };
    });

    expect(r.desenlace).toEqual({ estado: "movido" });
    expect(r.igual).toBe(true);
    // R40: la abierta conserva zona, lugar de tarifa y marca (propios).
    expect(r.cobroDespues.cobro).toEqual(r.cobroAntes.cobro);
    expect(r.cobroDespues.costeo).toEqual(r.cobroAntes.costeo);
    // R41: en El Belloto la zona era la vieja (heredada de Marga Marga) y pasa a la de Diguillín; el
    // grupo propio del nodo sigue mandando en su zona vieja, y en la zona nueva manda el de Diguillín.
    expect(r.antes).toMatchObject({ zonaId: r.zonaVieja, grupo: r.grupoPropio, ruta: RUTA_BELLOTO });
    expect(r.despues).toEqual({
      zonaId: r.zonaNueva,
      marca: true,
      ruta: ["Ñuble", "Diguillín", "Quilpué", "El Belloto"],
      grupo: r.grupoNuevo,
    });
  });
});
