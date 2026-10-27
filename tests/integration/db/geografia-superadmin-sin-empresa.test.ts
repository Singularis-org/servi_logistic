import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  arbolDePaisAction,
  cambiarActivacionNodoAction,
  cambiarDisponibilidadPaisAction,
  cargarDivisionAction,
  contarOrdenesSinEntregarAction,
  crearNodoAction,
  crearPaisAction,
  renombrarNodoAction,
  type GeografiaPlataformaDeps,
} from "@/lib/actions/geografia-plataforma";
import { EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { PaisRepository } from "@/lib/repositories/PaisRepository";
import { CargaDivisionService } from "@/lib/services/CargaDivisionService";
import { GeografiaService } from "@/lib/services/GeografiaService";
import { PaisService } from "@/lib/services/PaisService";
import { comoApp, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearGeografiaDePrueba, crearOrganizacionEnPais, crearPaisDePrueba } from "@/tests/fabricas/paises";
import { crearFksDeOrden } from "./_fixtures/orden-minima";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { idDeRol, insertarUsuario } from "./_fixtures/superadmin-32";
import {
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  clienteConSavepoint,
  crearPrismaDeTest,
  type TxDeTest,
} from "./_postgres-real";

// SL-20 (T4.4; design §4; R31, R32; D15) — el superadmin, que no pertenece a ninguna empresa, gestiona
// países y geografía de punta a punta por las actions REALES de `geografia-plataforma.ts`.
//
// Parte 1 (R32). Los servicios van sobre el cliente de la app CON la extensión de aislamiento y un
// resolutor de sesión que devuelve `null` (el superadmin no tiene empresa): es el mismo camino que en
// producción. Un modelo de negocio (`orden`, en el conteo) sin contexto cae en `EmpresaNoResuelta`;
// por eso la cadena tiene que correr dentro de `comoPlataforma`, y la contraprueba lo demuestra.
// Las actions abren sus propias transacciones, así que esta parte ESCRIBE de verdad en el país `XS`
// (bajo el lock de escrituras reales) y lo borra antes y después.
//
// Parte 2 (R31). El conteo suma las órdenes sin entregar de DOS empresas del mismo país. Va en una
// transacción del dueño que se revierte: el dueño es lo que es el contexto de plataforma (sin RLS),
// y la contraprueba baja a `servi_app` con una de las empresas para ver que ahí solo cuenta las suyas.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const PAIS = "XS";
const CSV = [
  "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3",
  "Región Norte,N1,Comuna Alta,N1A,Barrio Uno,N1A1",
  "Región Norte,N1,Comuna Alta,N1A,Barrio Dos,N1A2",
  "",
].join("\n");

let base: PrismaClient;
let app: PrismaClient;
let superadminId: string | null = null;

/** Borra todo lo del país de esta suite, en el orden de las FK. El historial primero: apunta al país. */
async function limpiarPais(): Promise<void> {
  await bajoLockDeEscrituraReal(async () => {
    for (const tabla of ["historial_plataforma", "distrito", "canton", "provincia"]) {
      await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "pais_id" = $1`, PAIS);
    }
    await base.$executeRawUnsafe(`DELETE FROM "pais" WHERE "id" = $1`, PAIS);
  });
}

function depsDelSuperadmin(): GeografiaPlataformaDeps {
  if (superadminId === null) throw new Error("falta el superadmin de la suite");
  const actor: Actor = { usuarioId: superadminId, rol: "superadmin" };
  return {
    getActor: async () => actor,
    geografiaService: new GeografiaService(new GeoRepository(app), new OrdenRepository(app)),
    cargaDivisionService: new CargaDivisionService(new GeoRepository(app)),
    paisService: new PaisService(new PaisRepository(app)),
  };
}

function archivo(texto: string): FormData {
  const fd = new FormData();
  fd.set("paisId", PAIS);
  fd.set("archivo", new File([texto], "division.csv", { type: "text/csv" }));
  return fd;
}

describeSiHayBase("SL-20/R32 — el superadmin sin empresa gestiona un país entero por las actions reales", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    // Sin sesión de empresa: la del superadmin no resuelve ninguna.
    app = conAislamientoPorEmpresa(crearPrismaDeTest(), async () => null);
    await limpiarPais();
    superadminId = await bajoLockDeEscrituraReal(() =>
      base.$transaction(async (tx) => {
        const u = await insertarUsuario(tx, await idDeRol(tx, "superadmin"), null);
        if (!u.desenlace.ok) throw new Error(`no se sembró el superadmin: ${JSON.stringify(u.desenlace)}`);
        return u.id;
      }),
    );
  }, 60_000);

  afterAll(async () => {
    if (base === undefined) return;
    await limpiarPais();
    if (superadminId !== null) {
      const id = superadminId;
      await bajoLockDeEscrituraReal(() => base.$executeRawUnsafe(`DELETE FROM "usuario" WHERE "id" = $1`, id));
    }
    await app?.$disconnect();
    await base.$disconnect();
  }, 60_000);

  it("control: el superadmin de la suite existe y no tiene empresa", async () => {
    const u = await base.usuario.findUnique({ where: { id: superadminId ?? "" }, select: { organizacionId: true } });
    expect(u).toEqual({ organizacionId: null });
  });

  it("crea el país, carga un CSV, da de alta, renombra, cuenta, retira, reactiva y apaga, sin EmpresaNoResuelta", async () => {
    const deps = depsDelSuperadmin();
    const r = await bajoLockDeEscrituraReal(async () => {
      const pais = await crearPaisAction(
        {
          id: PAIS,
          nombre: "País de prueba XS superadmin",
          nivel1Singular: "Región",
          nivel1Plural: "Regiones",
          nivel2Singular: "Comuna",
          nivel2Plural: "Comunas",
          nivel3Singular: "Barrio",
          nivel3Plural: "Barrios",
        },
        deps,
      );
      const carga = await cargarDivisionAction(archivo(CSV), deps);
      const arbol = await arbolDePaisAction({ paisId: PAIS }, deps);
      if (arbol.status !== "ok") throw new Error(`árbol: ${arbol.status}`);
      const comuna = arbol.provincias[0].cantones[0];
      const alta = await crearNodoAction({ nivel: "distrito", nombre: "Barrio Tres", cantonId: comuna.id, codigo: "N1A3" }, deps);
      if (alta.status !== "ok") throw new Error(`alta: ${alta.status}`);
      const renombrado = await renombrarNodoAction({ nivel: "distrito", id: alta.id, nombre: "Barrio Tercero" }, deps);
      const conteo = await contarOrdenesSinEntregarAction({ nivel: "canton", id: comuna.id }, deps);
      const retiro = await cambiarActivacionNodoAction({ nivel: "distrito", id: alta.id, activo: false }, deps);
      const reactivacion = await cambiarActivacionNodoAction({ nivel: "distrito", id: alta.id, activo: true }, deps);
      const apagado = await cambiarDisponibilidadPaisAction({ id: PAIS, disponible: false }, deps);
      return { pais: pais.status, carga, comuna: comuna.nombre, alta, renombrado, conteo, retiro, reactivacion, apagado, distritoId: alta.id };
    });

    expect(r.pais).toBe("ok");
    expect(r.carga).toEqual({
      status: "ok",
      creados: { provincia: 1, canton: 1, distrito: 2 },
      existentes: 0,
      codigosCompletados: 0,
      avisos: [],
    });
    expect(r.comuna).toBe("Comuna Alta");
    expect(r.renombrado).toEqual({ status: "ok", nivel: "distrito", id: r.distritoId, nombre: "Barrio Tercero" });
    expect(r.conteo).toEqual({ status: "ok", ordenes: 0 });
    expect(r.retiro).toEqual({ status: "ok", nivel: "distrito", id: r.distritoId, activo: false });
    expect(r.reactivacion).toEqual({ status: "ok", nivel: "distrito", id: r.distritoId, activo: true });
    expect(r.apagado).toEqual({ status: "ok", id: PAIS, disponible: false });

    // R33/R47: cada cambio dejó su fila en el historial de plataforma, con el superadmin como actor.
    const historial = await base.historialPlataforma.findMany({
      where: { paisId: PAIS },
      select: { accion: true, actorUsuarioId: true },
    });
    expect(historial.map((h) => h.accion).sort()).toEqual(
      [
        "division_cargada",
        "nodo_geografico_activado",
        "nodo_geografico_creado",
        "nodo_geografico_desactivado",
        "nodo_geografico_renombrado",
        "pais_creado",
        "pais_disponibilidad_desactivada",
      ].sort(),
    );
    expect(new Set(historial.map((h) => h.actorUsuarioId))).toEqual(new Set([superadminId]));
    const distrito = await base.distrito.findUnique({ where: { id: r.distritoId }, select: { nombre: true, activo: true, paisId: true } });
    expect(distrito).toEqual({ nombre: "Barrio Tercero", activo: true, paisId: PAIS });
  }, 60_000);

  it("CONTRAPRUEBA: el mismo conteo FUERA de `comoPlataforma` cae en EmpresaNoResuelta (el contexto es lo que lo salva)", async () => {
    const servicio = new GeografiaService(new GeoRepository(app), new OrdenRepository(app));
    await expect(
      servicio.contarOrdenesSinEntregar({ nivel: "distrito", id: randomUUID() }, { usuarioId: superadminId ?? "", rol: "superadmin" }),
    ).rejects.toBeInstanceOf(EmpresaNoResuelta);
  });
});

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
    provincia_id, canton_id, distrito_id, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SL20', '88880000', $4, $5, $6, $7, $8, 'caja', now(), now())`;

describeSiHayBase("SL-20/R31 — el conteo de la confirmación suma las órdenes sin entregar de todas las empresas del país", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  /** `n` órdenes vivas de la empresa en el distrito, creadas como `servi_app` con su empresa. */
  async function ordenesDe(tx: TxDeTest, empresaId: string, geo: { provinciaId: string; cantonId: string; distritoId: string }, n: number) {
    // Las FK (tienda, zona) las crea el dueño con la empresa fijada; la orden, ya como `servi_app`.
    await comoDueno(tx);
    await fijarEmpresa(tx, empresaId);
    const fks = await crearFksDeOrden(tx);
    await comoApp(tx, empresaId);
    for (let i = 0; i < n; i++) {
      const id = randomUUID();
      await tx.$executeRawUnsafe(
        INSERTAR_ORDEN,
        id,
        `SL20-${id.slice(0, 8)}`,
        fks.estatusId,
        fks.tiendaId,
        fks.zonaId,
        geo.provinciaId,
        geo.cantonId,
        geo.distritoId,
      );
    }
    await comoDueno(tx);
  }

  it("dos empresas en XA: el superadmin ve 2 + 1 = 3 en el distrito y en la provincia; una empresa sola ve las suyas", async () => {
    const r = await revertida(base, async (tx) => {
      await crearPaisDePrueba(tx, "XA");
      const geo = await crearGeografiaDePrueba(tx, "XA");
      const a = await crearOrganizacionEnPais(tx, "XA", { nombre: `Empresa A ${randomUUID().slice(0, 6)}` });
      const b = await crearOrganizacionEnPais(tx, "XA", { nombre: `Empresa B ${randomUUID().slice(0, 6)}` });
      await ordenesDe(tx, a.id, geo, 2);
      await ordenesDe(tx, b.id, geo, 1);

      const cliente = clienteConSavepoint(tx);
      const deps: GeografiaPlataformaDeps = {
        getActor: async () => ({ usuarioId: randomUUID(), rol: "superadmin" }),
        geografiaService: new GeografiaService(new GeoRepository(cliente), new OrdenRepository(cliente)),
      };
      const distrito = await contarOrdenesSinEntregarAction({ nivel: "distrito", id: geo.distritoId }, deps);
      const provincia = await contarOrdenesSinEntregarAction({ nivel: "provincia", id: geo.provinciaId }, deps);

      // Contraprueba: el mismo repositorio, con la RLS de la empresa A, solo ve sus dos.
      await comoApp(tx, a.id);
      const soloA = await new OrdenRepository(cliente).contarSinEntregarPorNodoGeografico("distrito", geo.distritoId);
      await comoDueno(tx);
      return { distrito, provincia, soloA };
    });

    expect(r.distrito).toEqual({ status: "ok", ordenes: 3 });
    expect(r.provincia).toEqual({ status: "ok", ordenes: 3 });
    expect(r.soloA).toBe(2);
  }, 60_000);
});
