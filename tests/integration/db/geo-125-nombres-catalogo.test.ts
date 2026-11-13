import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { EmpresaNoResuelta, comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { GestionOrdenRepository } from "@/lib/repositories/GestionOrdenRepository";
import { OrdenEnvioReader } from "@/lib/repositories/OrdenEnvioReader";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo125, type EmpresaGeo125, type EscenarioGeo125 } from "./_fixtures/geo-125";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, clienteConSavepoint, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-125 T2.3 (design §4.2, §13; R16, R17, R18, R40, R41) — LOS NOMBRES DE LUGAR DE LAS LECTURAS SALEN
// DEL CATALOGO, sobre Postgres real y el fixture `geo-125` (CR y `XA`, que tiene un nivel 4 solo en el
// catalogo).
//
// Cada lectura corre como la app (`comoApp` + `conEmpresa`) sobre la transaccion revertida del test. Lo
// esperado se mide como dueño, sin RLS: en CR, frente a las tablas viejas `provincia`, `canton` y
// `distrito` (R17: deben dar los mismos nombres que hoy); en XA, frente a los nodos del catalogo.
//
// El fixture no asigna mensajero a sus ordenes; el test se las asigna al mensajero del fixture (como
// dueño, en la transaccion que se revierte) para poder leer mis-asignaciones y el envio de WhatsApp.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

interface Nombres {
  provincia: string | null;
  canton: string | null;
  distrito: string | null;
}

async function comoLaEmpresa<T>(tx: TxDeTest, e: EmpresaGeo125, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, e.empresaId);
  try {
    return await conEmpresa(e.empresaId, fn);
  } finally {
    await comoDueno(tx);
  }
}

const idsDe = (e: EmpresaGeo125) => Object.values(e.ordenes);

/** Asigna las tres ordenes al mensajero del fixture, como dueño. */
async function asignarAlMensajero(tx: TxDeTest, e: EmpresaGeo125): Promise<void> {
  await comoDueno(tx);
  await tx.orden.updateMany({ where: { id: { in: idsDe(e) } }, data: { mensajeroAsignadoId: e.mensajeroId } });
}

/** Los nombres de hoy: los de las tablas viejas, por las relaciones de la orden (como dueño). */
async function nombresDeLasTablasViejas(tx: TxDeTest, e: EmpresaGeo125): Promise<Map<string, Nombres>> {
  const filas = await tx.orden.findMany({
    where: { id: { in: idsDe(e) } },
    select: {
      id: true,
      provincia: { select: { nombre: true } },
      canton: { select: { nombre: true } },
      distrito: { select: { nombre: true } },
    },
  });
  return new Map(
    filas.map((f) => [f.id, { provincia: f.provincia.nombre, canton: f.canton.nombre, distrito: f.distrito?.nombre ?? null }]),
  );
}

/** Los nombres de los nodos del catalogo con el id de cada FK de la orden (como dueño). */
async function nombresDeLosNodos(tx: TxDeTest, e: EmpresaGeo125): Promise<Map<string, Nombres>> {
  const ordenes = await tx.orden.findMany({
    where: { id: { in: idsDe(e) } },
    select: { id: true, provinciaId: true, cantonId: true, distritoId: true },
  });
  const ids = ordenes.flatMap((o) => [o.provinciaId, o.cantonId, ...(o.distritoId === null ? [] : [o.distritoId])]);
  const nodos = new Map(
    (await tx.nodoGeografico.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((n) => [
      n.id,
      n.nombre,
    ]),
  );
  return new Map(
    ordenes.map((o) => [
      o.id,
      {
        provincia: nodos.get(o.provinciaId) ?? null,
        canton: nodos.get(o.cantonId) ?? null,
        distrito: o.distritoId === null ? null : (nodos.get(o.distritoId) ?? null),
      },
    ]),
  );
}

/** Lo que devuelve cada superficie de design §4.2, por orden: los tres nombres y la ruta. */
interface Lectura {
  nombres: Nombres;
  ruta: string[];
}

type Lecturas = Record<string, Map<string, Lectura>>;

/** Las cinco lecturas de la empresa, como la app y con un repositorio nuevo cada una. */
async function leerComoLaApp(tx: TxDeTest, e: EmpresaGeo125, cliente: PrismaClient = clienteConSavepoint(tx)): Promise<Lecturas> {
  const tiendaId = e.geo47.base.base.tiendaId;
  return comoLaEmpresa(tx, e, async () => {
    const listado = await new OrdenRepository(cliente).list({
      where: { tiendaId },
      sortBy: "created_at",
      sortDir: "desc",
      skip: 0,
      take: 100,
    });
    const satelite = await new OrdenRepository(cliente).findRecepcionSateliteByZona(e.geo47.base.base.zonas.centralId, [
      "en_preparacion",
    ]);
    const etiquetas = await new OrdenRepository(cliente).findEtiquetasByIds(idsDe(e), null);
    const asignaciones = await new GestionOrdenRepository(cliente as never).findMisAsignaciones(e.mensajeroId, [
      "en_preparacion",
    ]);
    const cierreEnVivo = await new CierreDiaRepository(cliente, new TarifaVigenteRepository(cliente)).findGestionesPendientes(
      e.mensajeroId,
    );
    const envio = new OrdenEnvioReader(cliente);
    const envios = [];
    for (const id of idsDe(e)) envios.push(await envio.findParaEnvio(id, e.mensajeroId));

    const ruta = (r: readonly { nombre: string }[] | null | undefined) => (r ?? []).map((p) => p.nombre);
    return {
      listado: new Map(
        listado.items.map((o) => [
          o.id,
          {
            nombres: {
              provincia: o.relaciones?.provincia?.nombre ?? null,
              canton: o.relaciones?.canton?.nombre ?? null,
              distrito: o.relaciones?.distrito?.nombre ?? null,
            },
            ruta: ruta(o.lugarRuta),
          },
        ]),
      ),
      satelite: new Map(
        satelite.map((o) => [
          o.id,
          { nombres: { provincia: o.provinciaNombre, canton: o.cantonNombre, distrito: o.distritoNombre }, ruta: ruta(o.lugarRuta) },
        ]),
      ),
      etiqueta: new Map(
        etiquetas.map((o) => [
          o.id,
          { nombres: { provincia: o.provinciaNombre, canton: o.cantonNombre, distrito: o.distritoNombre }, ruta: ruta(o.lugarRuta) },
        ]),
      ),
      "detalle de gestion": new Map(
        asignaciones.map((o) => [
          o.id,
          { nombres: { provincia: o.provinciaNombre, canton: o.cantonNombre, distrito: o.distritoNombre }, ruta: ruta(o.lugarRuta) },
        ]),
      ),
      "cierre en vivo": new Map(
        cierreEnVivo.map((g) => [
          g.ordenId,
          { nombres: { provincia: g.provinciaNombre, canton: g.cantonNombre, distrito: g.distritoNombre }, ruta: ruta(g.lugarRuta) },
        ]),
      ),
      envio: new Map(
        envios.flatMap((d) =>
          d === null
            ? []
            : [
                [
                  d.orden.id,
                  {
                    nombres: { provincia: d.orden.provinciaNombre, canton: d.orden.cantonNombre, distrito: d.orden.distritoNombre },
                    ruta: ruta(d.orden.lugarRuta),
                  },
                ] as const,
              ],
        ),
      ),
    };
  });
}

/** La ruta esperada de unos nombres: del nivel 1 al lugar, sin el distrito si la orden no lo tiene. */
const rutaDe = (n: Nombres) => [n.provincia, n.canton, ...(n.distrito === null ? [] : [n.distrito])];

/**
 * El cliente con los nodos del catalogo filtrados. Envuelve tambien el cliente del `$transaction`, que es
 * el que lee la carga del catalogo. Un nodo fuera del catalogo no se puede escribir en la base (las FK de
 * la orden apuntan a las tablas viejas y la sincronia los crea juntos), asi que se cambia la ENTRADA.
 */
function sinNodos(cliente: PrismaClient, quitar: ReadonlySet<string>): PrismaClient {
  const envolver = (objetivo: object): PrismaClient => {
    const proxy: unknown = new Proxy(objetivo, {
      get(o, prop) {
        if (prop === "nodoGeografico") {
          const real = Reflect.get(o, prop) as { findMany: (a: unknown) => Promise<{ id: string }[]> };
          return { findMany: async (args: unknown) => (await real.findMany(args)).filter((n) => !quitar.has(n.id)) };
        }
        if (prop === "$transaction") {
          const real = Reflect.get(o, prop) as (fn: (t: object) => unknown, op?: unknown) => Promise<unknown>;
          return (fn: (t: unknown) => unknown, op?: unknown) => real.call(o, (t: object) => fn(envolver(t)), op);
        }
        const valor = Reflect.get(o, prop) as unknown;
        return typeof valor === "function" ? valor.bind(o) : valor;
      },
    });
    return proxy as PrismaClient;
  };
  return envolver(cliente as unknown as object);
}

describeSiHayBase("SLT-125 T2.3 — los nombres de lugar salen del catalogo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  function conEscenario<T>(fn: (tx: TxDeTest, e: EscenarioGeo125) => Promise<T>): Promise<T> {
    return revertida(base, async (tx) => {
      const e = await crearEscenarioGeo125(tx);
      await asignarAlMensajero(tx, e.cr);
      await asignarAlMensajero(tx, e.xa);
      return fn(tx, e);
    });
  }

  it("R16/R17: en CR, el listado, satelite, etiqueta, detalle de gestion, cierre en vivo y envio dan los nombres de las tablas viejas, y la ruta con ellos", async () => {
    const r = await conEscenario(async (tx, e) => ({
      leidas: await leerComoLaApp(tx, e.cr),
      deHoy: await nombresDeLasTablasViejas(tx, e.cr),
      ids: idsDe(e.cr),
    }));

    // Anti-vacuidad: las tres ordenes, con y sin distrito, en cada superficie.
    expect(r.deHoy.size).toBe(3);
    expect([...r.deHoy.values()].filter((n) => n.distrito === null)).toHaveLength(1);
    for (const [superficie, filas] of Object.entries(r.leidas)) {
      for (const id of r.ids) {
        const hoy = r.deHoy.get(id);
        const leida = filas.get(id);
        expect(leida, `${superficie} ${id}`).toBeDefined();
        expect(leida?.nombres, `${superficie} ${id}`).toEqual(hoy);
        expect(leida?.ruta, `${superficie} ${id}`).toEqual(rutaDe(hoy as Nombres));
      }
    }
  }, 120_000);

  it("R40: en XA cada lectura nombra con el catalogo de XA (sus nodos), con la ruta de 3 niveles como mucho (P1)", async () => {
    const r = await conEscenario(async (tx, e) => ({
      leidas: await leerComoLaApp(tx, e.xa),
      nodos: await nombresDeLosNodos(tx, e.xa),
      ids: idsDe(e.xa),
      idsCr: idsDe(e.cr),
    }));

    expect(r.nodos.size).toBe(3);
    for (const [superficie, filas] of Object.entries(r.leidas)) {
      // La empresa de XA no recibe ninguna orden de CR (la RLS y el `where` de cada lectura, sin cambios).
      for (const id of r.idsCr) expect(filas.has(id), `${superficie} ${id}`).toBe(false);
      for (const id of r.ids) {
        const nodo = r.nodos.get(id) as Nombres;
        expect(nodo.provincia, id).not.toBeNull();
        expect(filas.get(id)?.nombres, `${superficie} ${id}`).toEqual(nodo);
        expect(filas.get(id)?.ruta.length, `${superficie} ${id}`).toBeLessThanOrEqual(3);
      }
    }
  }, 120_000);

  it("R40: un lugar de otro pais no aporta nombres (una orden de CR leida con el catalogo de XA sale con la ruta vacia)", async () => {
    const r = await conEscenario(async (tx, e) => {
      // La fila de la orden de CR, tal como la seleccionaria el lector (como dueño, sin RLS).
      const filaCr = await tx.orden.findFirst({
        where: { id: e.cr.ordenes.conDistritoId },
        select: {
          id: true, numGuia: true, numRemision: true, destinatario: true, telefonoDest: true, direccion: true,
          producto: true, peso: true, notas: true, montoCobrar: true, cobraComision: true, prioridad: true,
          intentosContacto: true, fechaReparto: true, asignadoAt: true, createdAt: true, latitud: true,
          longitud: true, downloadUrl: true, cantonId: true, distritoId: true,
          estatus: { select: { value: true } },
          tienda: { select: { nombre: true } },
          zona: { select: { nombre: true, sinpeNumero: true, sinpeNombre: true } },
          mensajeroAsignado: { select: { id: true, nombre: true, primerApellido: true, segundoApellido: true, email: true,
            telefono: true, cedula: true, placa: true, estado: true, vehiculo: { select: { name: true } },
            zona: { select: { nombre: true, sinpeNumero: true, sinpeNombre: true } } } },
        },
      });
      // El lector, en el contexto de XA, recibe esa fila: el catalogo que carga es el de XA.
      const cliente = clienteConSavepoint(tx);
      const conFilaDeCr = new Proxy(cliente as unknown as object, {
        get(o, prop) {
          if (prop === "orden") return { findFirst: async () => filaCr };
          const valor = Reflect.get(o, prop) as unknown;
          return typeof valor === "function" ? valor.bind(o) : valor;
        },
      }) as unknown as PrismaClient;
      return comoLaEmpresa(tx, e.xa, () => new OrdenEnvioReader(conFilaDeCr).findParaEnvio("x", "y"));
    });

    expect(r?.orden.lugarRuta).toEqual([]);
    expect(r?.orden.provinciaNombre).toBe("");
    expect(r?.orden.cantonNombre).toBe("");
    expect(r?.orden.distritoNombre).toBeNull();
  }, 120_000);

  it("R40: en plataforma, las lecturas que nombran fallan con EmpresaNoResuelta", async () => {
    const r = await conEscenario(async (tx, e) => {
      const cliente = clienteConSavepoint(tx);
      const tiendaId = e.cr.geo47.base.base.tiendaId;
      // Como dueño (sin RLS) las filas existen: que fallen prueba que el corte es el de `deLaEmpresa`, no
      // que no hubiera nada que nombrar.
      const lecturas: [string, () => Promise<unknown>][] = [
        ["listado", () => new OrdenRepository(cliente).list({ where: { tiendaId }, sortBy: "created_at", sortDir: "desc", skip: 0, take: 10 })],
        ["etiqueta", () => new OrdenRepository(cliente).findEtiquetasByIds(idsDe(e.cr), null)],
        ["detalle de gestion", () => new GestionOrdenRepository(cliente as never).findMisAsignaciones(e.cr.mensajeroId, ["en_preparacion"])],
        ["cierre en vivo", () => new CierreDiaRepository(cliente, new TarifaVigenteRepository(cliente)).findGestionesPendientes(e.cr.mensajeroId)],
        ["envio", () => new OrdenEnvioReader(cliente).findParaEnvio(e.cr.ordenes.conDistritoId, e.cr.mensajeroId)],
      ];
      const errores: [string, unknown][] = [];
      for (const [nombre, leer] of lecturas) {
        errores.push([nombre, await comoPlataforma("SLT-125", "test de R40", leer).then(() => null, (err: unknown) => err)]);
      }
      return errores;
    });

    expect(r).toHaveLength(5);
    for (const [nombre, err] of r) expect(err, nombre).toBeInstanceOf(EmpresaNoResuelta);
  }, 120_000);

  it("R18: un lugar que no esta en el catalogo no hace fallar ninguna lectura: su ruta sale vacia y sus nombres vacios", async () => {
    const r = await conEscenario(async (tx, e) => {
      // El distrito de la orden `conDistrito` de CR deja de estar en el catalogo (solo en la lectura).
      const orden = await tx.orden.findUniqueOrThrow({ where: { id: e.cr.ordenes.conDistritoId }, select: { distritoId: true } });
      const cliente = sinNodos(clienteConSavepoint(tx), new Set([orden.distritoId as string]));
      return { leidas: await leerComoLaApp(tx, e.cr, cliente), e };
    });

    const fuera = r.e.cr.ordenes.conDistritoId;
    const delFixture = idsDe(r.e.cr);
    for (const [superficie, filas] of Object.entries(r.leidas)) {
      // Las tres filas del fixture siguen saliendo: ninguna lectura se cae.
      for (const id of delFixture) expect(filas.has(id), `${superficie} ${id}`).toBe(true);
      const fila = filas.get(fuera);
      expect(fila?.ruta, superficie).toEqual([]);
      const { provincia, canton, distrito } = fila?.nombres ?? {};
      // Vacios: `null` en `relaciones` del listado; `""` en los campos `string` de hoy (R37); el distrito, `null`.
      expect([null, ""], superficie).toContain(provincia);
      expect([null, ""], superficie).toContain(canton);
      expect(distrito, superficie).toBeNull();
      // Las otras dos ordenes siguen nombradas.
      for (const id of delFixture) {
        if (id !== fuera) expect(filas.get(id)?.ruta.length, `${superficie} ${id}`).toBeGreaterThan(1);
      }
    }
  }, 120_000);

  it("R41: adminTienda y adminSatelite reciben las mismas ordenes que hoy, y la ruta solo lleva ids y nombres de lugar", async () => {
    const r = await conEscenario(async (tx, e) => {
      const cliente = clienteConSavepoint(tx);
      const b = e.cr.geo47.base.base;
      return comoLaEmpresa(tx, e.cr, async () => {
        const repo = new OrdenRepository(cliente);
        // adminTienda: el `tiendaId` escalar del service acota el listado y la etiqueta a su tienda.
        const deLaTienda = await repo.list({ where: { tiendaId: b.tiendaId }, sortBy: "created_at", sortDir: "desc", skip: 0, take: 100 });
        const deOtraTienda = await repo.list({ where: { tiendaId: "tienda-que-no-existe" }, sortBy: "created_at", sortDir: "desc", skip: 0, take: 100 });
        const etiquetasAjenas = await repo.findEtiquetasByIds(idsDe(e.cr), "tienda-que-no-existe");
        // adminSatelite: su bodega es una zona; la de las ordenes del fixture (central) y otra.
        const deSuZona = await repo.findRecepcionSateliteByZona(b.zonas.centralId, ["en_preparacion"]);
        const deOtraZona = await repo.findRecepcionSateliteByZona(b.zonas.norteId, ["en_preparacion"]);
        return { deLaTienda, deOtraTienda, etiquetasAjenas, deSuZona, deOtraZona, ids: idsDe(e.cr) };
      });
    });

    const ids = (xs: { id: string }[]) => xs.map((x) => x.id).filter((id) => r.ids.includes(id)).sort();
    expect(ids(r.deLaTienda.items)).toEqual([...r.ids].sort());
    expect(r.deOtraTienda.items).toEqual([]);
    expect(r.etiquetasAjenas).toEqual([]);
    expect(ids(r.deSuZona)).toEqual([...r.ids].sort());
    expect(ids(r.deOtraZona)).toEqual([]);
    // El recorte por alcance de la bodega sigue igual: sin contacto ni tarifa de la tienda.
    for (const o of r.deSuZona) {
      expect(o.relaciones?.tienda).not.toHaveProperty("email");
      expect(o.relaciones?.tienda).not.toHaveProperty("telefono");
      expect(o).not.toHaveProperty("fleteConIva");
    }
    // La ruta solo lleva ids y nombres de lugar: ningun dato personal.
    for (const o of [...r.deLaTienda.items, ...r.deSuZona]) {
      expect(o.lugarRuta?.length, o.id).toBeGreaterThan(0);
      for (const paso of o.lugarRuta ?? []) expect(Object.keys(paso).sort(), o.id).toEqual(["id", "nombre"]);
    }
  }, 120_000);
});
