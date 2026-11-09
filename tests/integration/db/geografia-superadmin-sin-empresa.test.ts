import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import {
  agregarNivelPaisAction,
  arbolDePaisAction,
  cambiarActivacionNodoAction,
  cambiarDisponibilidadPaisAction,
  cargarDivisionAction,
  contarOrdenesSinEntregarAction,
  crearNodoAction,
  crearPaisAction,
  renombrarNodoAction,
  renombrarTipoNivelAction,
  reordenarTiposAction,
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
import { exigirSinSuperadmin, idDeRol, insertarUsuario, tomarLockDeSuperadmin } from "./_fixtures/superadmin-32";
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
// Las actions abren sus propias transacciones, así que esta parte ESCRIBE de verdad en el país `BV`
// (bajo el lock de escrituras reales) y lo borra antes y después.
//
// Parte 2 (R31). El conteo suma las órdenes sin entregar de DOS empresas del mismo país. Va en una
// transacción del dueño que se revierte: el dueño es lo que es el contexto de plataforma (sin RLS),
// y la contraprueba baja a `servi_app` con una de las empresas para ver que ahí solo cuenta las suyas.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

// El alta de país solo acepta códigos del catálogo ISO 3166-1 (R41), así que la suite no puede usar
// `XA`–`XZ`: usa `BV` (Isla Bouvet, deshabitada, sin cobertura posible), que ningún entorno va a dar
// de alta de verdad. `limpiarPais` lo borra antes y después.
const PAIS = "BV";
// SLT-46 (T5.4; R40): un segundo país, de 4 niveles, para tipos y profundidad 4. `HM` (Islas Heard y
// McDonald, deshabitadas) por el mismo motivo que `BV`.
const PAIS_4 = "HM";
const CSV = [
  "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3",
  "Región Norte,N1,Comuna Alta,N1A,Barrio Uno,N1A1",
  "Región Norte,N1,Comuna Alta,N1A,Barrio Dos,N1A2",
  "",
].join("\n");

let base: PrismaClient;
let app: PrismaClient;
let superadminId: string | null = null;
// El índice `usuario_un_solo_superadmin` es GLOBAL: este archivo y `carga-division.test.ts` commitean
// cada uno su superadmin, y en paralelo el segundo moriría con 23505. Se sostiene el lock de SL-32
// desde antes de crearlo hasta después de borrarlo; el de la 227 va por dentro.
let soltarSuperadmin: () => Promise<void> = async () => {};

/**
 * Borra todo lo de los países de esta suite, en el orden de las FK. El historial primero: apunta al
 * país. SLT-46: los nodos, de la hoja a la raíz (la copia borra su fila vieja, R7); las tablas viejas
 * después, por si quedara algo; los tipos se van con el país (cascada).
 */
async function limpiarPais(): Promise<void> {
  await bajoLockDeEscrituraReal(async () => {
    for (const pais of [PAIS, PAIS_4]) {
      await base.$executeRawUnsafe(`DELETE FROM "historial_plataforma" WHERE "pais_id" = $1`, pais);
      for (let profundidad = 10; profundidad >= 1; profundidad--) {
        await base.$executeRawUnsafe(
          `DELETE FROM "nodo_geografico" WHERE "pais_id" = $1 AND "profundidad" = $2`,
          pais,
          profundidad,
        );
      }
      for (const tabla of ["distrito", "canton", "provincia"]) {
        await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "pais_id" = $1`, pais);
      }
      await base.$executeRawUnsafe(`DELETE FROM "pais" WHERE "id" = $1`, pais);
    }
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

function archivo(texto: string, paisId: string = PAIS): FormData {
  const fd = new FormData();
  fd.set("paisId", paisId);
  fd.set("archivo", new File([texto], "division.csv", { type: "text/csv" }));
  return fd;
}

describeSiHayBase("SL-20/R32 — el superadmin sin empresa gestiona un país entero por las actions reales", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    // Sin sesión de empresa: la del superadmin no resuelve ninguna.
    app = conAislamientoPorEmpresa(crearPrismaDeTest(), async () => null);
    soltarSuperadmin = await tomarLockDeSuperadmin();
    await exigirSinSuperadmin(base);
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
    try {
      if (base === undefined) return;
      await limpiarPais();
      if (superadminId !== null) {
        const id = superadminId;
        await bajoLockDeEscrituraReal(() => base.$executeRawUnsafe(`DELETE FROM "usuario" WHERE "id" = $1`, id));
      }
      await app?.$disconnect();
      await base.$disconnect();
    } finally {
      await soltarSuperadmin();
    }
  }, 60_000);

  it("control: el superadmin de la suite existe y no tiene empresa", async () => {
    const u = await base.usuario.findUnique({ where: { id: superadminId ?? "" }, select: { organizacionId: true } });
    expect(u).toEqual({ organizacionId: null });
  });

  it("crea el país, carga un CSV, da de alta, renombra, cuenta, retira, reactiva y apaga, sin EmpresaNoResuelta", async () => {
    const deps = depsDelSuperadmin();
    const r = await bajoLockDeEscrituraReal(async () => {
      // SLT-46 (§4.1): el alta lleva los tipos en lista (antes, seis campos `nivelN*`); los mismos nombres.
      const pais = await crearPaisAction(
        {
          id: PAIS,
          tipos: [
            { singular: "Región", plural: "Regiones" },
            { singular: "Comuna", plural: "Comunas" },
            { singular: "Barrio", plural: "Barrios" },
          ],
        },
        deps,
      );
      const carga = await cargarDivisionAction(archivo(CSV), deps);
      const arbol = await arbolDePaisAction({ paisId: PAIS }, deps);
      if (arbol.status !== "ok") throw new Error(`árbol: ${arbol.status}`);
      // SLT-46 (T4.1): el árbol llega en N niveles; la comuna es el primer hijo de la primera raíz.
      const comuna = arbol.raices[0].hijos[0];
      // SLT-46 (§4.1): entradas por nodo (`{padreId}`, `{id}`) y el «antes» del renombre (R61).
      const alta = await crearNodoAction({ nombre: "Barrio Tres", padreId: comuna.id, codigo: "N1A3" }, deps);
      if (alta.status !== "ok") throw new Error(`alta: ${alta.status}`);
      const renombrado = await renombrarNodoAction({ id: alta.id, nombre: "Barrio Tercero", nombreAnterior: "Barrio Tres" }, deps);
      const conteo = await contarOrdenesSinEntregarAction({ id: comuna.id }, deps);
      const retiro = await cambiarActivacionNodoAction({ id: alta.id, activo: false }, deps);
      const reactivacion = await cambiarActivacionNodoAction({ id: alta.id, activo: true }, deps);
      const apagado = await cambiarDisponibilidadPaisAction({ id: PAIS, disponible: false }, deps);
      return { pais: { status: pais.status, nombre: pais.status === "ok" ? pais.pais.nombre : null }, carga, comuna: comuna.nombre, alta, renombrado, conteo, retiro, reactivacion, apagado, distritoId: alta.id };
    });

    // R23: el nombre sale del catálogo, no de la entrada.
    expect(r.pais).toEqual({ status: "ok", nombre: "Isla Bouvet" });
    expect(r.carga).toEqual({
      status: "ok",
      // SLT-46 (R33): por profundidad; mismas cifras.
      creados: { 1: 1, 2: 1, 3: 2 },
      existentes: 0,
      codigosCompletados: 0,
      avisos: [],
    });
    expect(r.comuna).toBe("Comuna Alta");
    // SLT-46 (§4.1): el `ok` ya no repite el `nivel`, que dejó de viajar en la entrada.
    expect(r.renombrado).toEqual({ status: "ok", id: r.distritoId, nombre: "Barrio Tercero" });
    expect(r.conteo).toEqual({ status: "ok", ordenes: 0 });
    expect(r.retiro).toEqual({ status: "ok", id: r.distritoId, activo: false });
    expect(r.reactivacion).toEqual({ status: "ok", id: r.distritoId, activo: true });
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
        // SLT-46 (R37; §7): el alta del país registra también uno por tipo creado.
        "tipo_nivel_geografico_creado",
        "tipo_nivel_geografico_creado",
        "tipo_nivel_geografico_creado",
        "pais_disponibilidad_desactivada",
      ].sort(),
    );
    expect(new Set(historial.map((h) => h.actorUsuarioId))).toEqual(new Set([superadminId]));
    const distrito = await base.distrito.findUnique({ where: { id: r.distritoId }, select: { nombre: true, activo: true, paisId: true } });
    expect(distrito).toEqual({ nombre: "Barrio Tercero", activo: true, paisId: PAIS });
  }, 60_000);

  it("SLT-46 R40: tipos (editar, reordenar, agregar el 4.º) y nodos de profundidad 4 por las actions, sin EmpresaNoResuelta", async () => {
    const deps = depsDelSuperadmin();
    const r = await bajoLockDeEscrituraReal(async () => {
      const pais = await crearPaisAction(
        {
          id: PAIS_4,
          tipos: [
            { singular: "Región", plural: "Regiones" },
            { singular: "Comuna", plural: "Comunas" },
            { singular: "Barrio", plural: "Barrios" },
          ],
        },
        deps,
      );
      const arbol0 = await arbolDePaisAction({ paisId: PAIS_4 }, deps);
      if (arbol0.status !== "ok") throw new Error(`árbol: ${arbol0.status}`);
      const tipoId = (k: number): string => {
        const t = arbol0.tipos.find((x) => x.profundidad === k);
        if (t === undefined) throw new Error(`${PAIS_4} sin tipo ${k}`);
        return t.id;
      };
      const edicion = await renombrarTipoNivelAction(
        {
          tipoId: tipoId(2),
          nombreSingular: "Provincia",
          nombrePlural: "Provincias",
          anterior: { nombreSingular: "Comuna", nombrePlural: "Comunas" },
        },
        deps,
      );
      // Reordenar: «Barrio» sube a la profundidad 2 y «Provincia» baja a la 3 (R55).
      const reorden = await reordenarTiposAction(
        {
          paisId: PAIS_4,
          niveles: [
            { tipoId: tipoId(1), nombreSingular: "Región", nombrePlural: "Regiones" },
            { tipoId: tipoId(3), nombreSingular: "Barrio", nombrePlural: "Barrios" },
            { tipoId: tipoId(2), nombreSingular: "Provincia", nombrePlural: "Provincias" },
          ],
        },
        deps,
      );
      const nivel4 = await agregarNivelPaisAction(
        { paisId: PAIS_4, nombreSingular: "Sector", nombrePlural: "Sectores", profundidad: 4 },
        deps,
      );
      const csv4 = [
        "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3,nivel_4,codigo_nivel_4",
        "Región Sur,S1,Barrio Bajo,S1B,Provincia Este,S1BE,Sector Uno,S1BE1",
        "",
      ].join("\n");
      const carga = await cargarDivisionAction(archivo(csv4, PAIS_4), deps);
      const arbol = await arbolDePaisAction({ paisId: PAIS_4 }, deps);
      if (arbol.status !== "ok") throw new Error(`árbol: ${arbol.status}`);
      const provinciaEste = arbol.raices[0].hijos[0].hijos[0];
      const alta = await crearNodoAction({ padreId: provinciaEste.id, nombre: "Sector Dos", codigo: "S1BE2" }, deps);
      if (alta.status !== "ok") throw new Error(`alta: ${JSON.stringify(alta)}`);
      const renombrado = await renombrarNodoAction({ id: alta.id, nombre: "Sector Segundo", nombreAnterior: "Sector Dos" }, deps);
      const conteo = await contarOrdenesSinEntregarAction({ id: alta.id }, deps);
      const retiro = await cambiarActivacionNodoAction({ id: alta.id, activo: false }, deps);
      const reactivacion = await cambiarActivacionNodoAction({ id: alta.id, activo: true }, deps);
      return {
        pais: pais.status,
        edicion,
        reorden,
        nivel4: nivel4.status === "ok" ? { status: "ok", clave: nivel4.tipo.clave, profundidad: nivel4.tipo.profundidad } : nivel4,
        carga,
        renombrado,
        conteo,
        retiro,
        reactivacion,
        nodoId: alta.id,
        tipos: arbol.tipos.map((t) => [t.profundidad, t.nombreSingular]),
      };
    });

    expect(r).toMatchObject({
      pais: "ok",
      edicion: { status: "ok" },
      reorden: { status: "ok" },
      nivel4: { status: "ok", clave: "nivel_4", profundidad: 4 },
      renombrado: { status: "ok", id: r.nodoId, nombre: "Sector Segundo" },
      // R20: un nodo de profundidad 4 cuenta 0, sin llegar a `orden`.
      conteo: { status: "ok", ordenes: 0 },
      retiro: { status: "ok", id: r.nodoId, activo: false },
      reactivacion: { status: "ok", id: r.nodoId, activo: true },
    });
    expect(r.carga).toEqual({ status: "ok", creados: { 1: 1, 2: 1, 3: 1, 4: 1 }, existentes: 0, codigosCompletados: 0, avisos: [] });
    expect(r.tipos).toEqual([
      [1, "Región"],
      [2, "Barrio"],
      [3, "Provincia"],
      [4, "Sector"],
    ]);

    // Cada escritura dejó su fila en el historial de plataforma, con el superadmin como actor.
    const historial = await base.historialPlataforma.findMany({
      where: { paisId: PAIS_4 },
      select: { accion: true, actorUsuarioId: true, entidadTipo: true },
    });
    const cuenta = (accion: string) => historial.filter((h) => h.accion === accion).length;
    expect({
      pais_creado: cuenta("pais_creado"),
      tipo_nivel_geografico_creado: cuenta("tipo_nivel_geografico_creado"),
      tipo_nivel_geografico_renombrado: cuenta("tipo_nivel_geografico_renombrado"),
      division_cargada: cuenta("division_cargada"),
      nodo_geografico_creado: cuenta("nodo_geografico_creado"),
      nodo_geografico_renombrado: cuenta("nodo_geografico_renombrado"),
      nodo_geografico_desactivado: cuenta("nodo_geografico_desactivado"),
      nodo_geografico_activado: cuenta("nodo_geografico_activado"),
    }).toEqual({
      pais_creado: 1,
      // 3 del alta + 1 del nivel agregado.
      tipo_nivel_geografico_creado: 4,
      // 2 de la edición (singular y plural) + 4 del reordenar (dos tipos, dos nombres cada uno).
      tipo_nivel_geografico_renombrado: 6,
      division_cargada: 1,
      nodo_geografico_creado: 1,
      nodo_geografico_renombrado: 1,
      nodo_geografico_desactivado: 1,
      nodo_geografico_activado: 1,
    });
    expect(new Set(historial.map((h) => h.actorUsuarioId))).toEqual(new Set([superadminId]));
    const deNodo = historial.filter((h) => h.accion.startsWith("nodo_geografico_"));
    expect(deNodo.every((h) => h.entidadTipo === "nodo_geografico")).toBe(true);
    const nodo = await base.nodoGeografico.findUnique({
      where: { id: r.nodoId },
      select: { nombre: true, activo: true, profundidad: true, paisId: true },
    });
    expect(nodo).toEqual({ nombre: "Sector Segundo", activo: true, profundidad: 4, paisId: PAIS_4 });
  }, 60_000);

  it("CONTRAPRUEBA: el mismo conteo FUERA de `comoPlataforma` cae en EmpresaNoResuelta (el contexto es lo que lo salva)", async () => {
    const servicio = new GeografiaService(new GeoRepository(app), new OrdenRepository(app));
    // Un distrito QUE EXISTE: desde SLT-65 (R10) un id inexistente devuelve 0 antes de llegar a
    // `orden`, y la contraprueba no mediria nada. Con un nodo real el conteo llega al modelo de
    // negocio, que es donde se exige la empresa.
    const distrito = await base.nodoGeografico.findFirst({ where: { profundidad: 3 }, select: { id: true } });
    if (distrito === null) throw new Error("la base no tiene ningun distrito para la contraprueba");
    await expect(
      servicio.contarOrdenesSinEntregar({ id: distrito.id }, { usuarioId: superadminId ?? "", rol: "superadmin" }),
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
      // SLT-46 (§4.1): el conteo nombra el nodo por su id, sin `nivel`.
      const distrito = await contarOrdenesSinEntregarAction({ id: geo.distritoId }, deps);
      const provincia = await contarOrdenesSinEntregarAction({ id: geo.provinciaId }, deps);

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
