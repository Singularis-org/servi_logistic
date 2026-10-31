import { randomUUID } from "node:crypto";

import { fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearOrganizacionEnPais, crearPaisDePrueba, type CodigoPaisDePrueba } from "@/tests/fabricas/paises";
import type { TxDeTest } from "../_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./orden-minima";
import { comoDueno } from "./pais-20";

// SLT-43 (T2.3; design §7) — lo que comparten los tests de la geografía jerárquica: los tipos de
// nivel de un país, un nodo insertado a mano (como el SQL que SLT-46 escribirá) y un escenario
// completo en el país de prueba `XA`.
//
// `XA` tiene códigos libres (sin dígitos, R17 de SL-20): una provincia «1» y un cantón «1» conviven,
// que es el caso que el único por país y tipo de R9 tiene que dejar pasar. El escenario trae lo que
// tocan la sincronía (T3), las columnas nuevas (T4), el script (T5) y la ida y vuelta (T6): órdenes con
// y sin distrito, una zona con su distrito, una marca de zona especial y filas de `cierre_detail` con
// y sin `distrito_nombre`.
//
// Todo se escribe como DUEÑO con la empresa fijada (los triggers de SL-17 ponen `organizacion_id`) y
// dentro del `tx` de un test que se revierte. Deja la transacción como dueño y con la empresa fijada.

/** Ids de los tres tipos `nivel_N` de un país, que crea el trigger `pais_tipos_de_nivel`. */
export interface TiposDeNivel {
  nivel1: string;
  nivel2: string;
  nivel3: string;
}

export async function tiposDeNivel(tx: TxDeTest, paisId: string): Promise<TiposDeNivel> {
  const filas = await tx.$queryRawUnsafe<{ clave: string; id: string }[]>(
    `SELECT clave, id FROM tipo_nivel_geografico WHERE pais_id = $1 AND clave IN ('nivel_1', 'nivel_2', 'nivel_3')`,
    paisId,
  );
  const id = (clave: string) => {
    const fila = filas.find((f) => f.clave === clave);
    if (fila === undefined) throw new Error(`el pais ${paisId} no tiene el tipo ${clave}: ¿falta 20261031120100?`);
    return fila.id;
  };
  return { nivel1: id("nivel_1"), nivel2: id("nivel_2"), nivel3: id("nivel_3") };
}

/** Un nodo para insertar a mano. Sin `id`, uno nuevo. `nombre_normalizado` lo pone el trigger. */
export interface NodoNuevo {
  id?: string;
  paisId: string;
  tipoId: string;
  padreId: string | null;
  profundidad: number;
  nombre: string;
  codigoOficial?: string | null;
}

export const SQL_INSERTAR_NODO = `INSERT INTO nodo_geografico
    (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, codigo_oficial)
  VALUES ($1, $2, $3, $4, $5, $6, 'lo pisa el trigger', $7)`;

/** Los argumentos de `SQL_INSERTAR_NODO`, para pasarlos también a `intentar` (SAVEPOINT). */
export function argumentosDeNodo(n: NodoNuevo & { id: string }): unknown[] {
  return [n.id, n.paisId, n.tipoId, n.padreId, n.profundidad, n.nombre, n.codigoOficial ?? null];
}

/** Inserta el nodo como dueño (la tabla no tiene escritura para `servi_app`). Devuelve su id. */
export async function insertarNodo(tx: TxDeTest, n: NodoNuevo): Promise<string> {
  const id = n.id ?? randomUUID();
  await tx.$executeRawUnsafe(SQL_INSERTAR_NODO, ...argumentosDeNodo({ ...n, id }));
  return id;
}

/** El escenario sin lo que solo existe tras migrar (los tipos de nivel), en cualquier país de prueba. */
export interface EscenarioGeo43SinTipos {
  paisId: CodigoPaisDePrueba;
  empresaId: string;
  /** Provincia «1», cantón «1» (mismo código, otro tipo) y dos distritos del cantón. */
  geo: { provinciaId: string; cantonId: string; distritoId: string; otroDistritoId: string };
  zonaId: string;
  tiendaId: string;
  ordenConDistritoId: string;
  ordenSinDistritoId: string;
  /** Fila de `zona_distrito` de la zona con `geo.distritoId`. */
  zonaDistritoId: string;
  /** Fila de `distrito_zona_especial` de la empresa con `geo.otroDistritoId`. */
  distritoZonaEspecialId: string;
  cierreId: string;
  /** Filas de `cierre_detail`: la de la orden con distrito lleva `distrito_nombre`; la otra, NULL. */
  cierreDetailConDistritoId: string;
  cierreDetailSinDistritoId: string;
}

export interface EscenarioGeo43 extends Omit<EscenarioGeo43SinTipos, "paisId"> {
  paisId: "XA";
  tipos: TiposDeNivel;
}

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
    provincia_id, canton_id, distrito_id, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SLT-43', '88880000', $4, $5, $6, $7, $8, 'caja', now(), now())`;

/**
 * El escenario completo en `XA`. Los nombres llevan un sufijo aleatorio; los códigos son «1» en la
 * provincia y en el cantón, y «1-1»/«1-2» en los distritos.
 */
export async function crearEscenarioGeo43(tx: TxDeTest): Promise<EscenarioGeo43> {
  const e = await sembrarEscenarioGeo43(tx, "XA");
  return { ...e, paisId: "XA", tipos: await tiposDeNivel(tx, e.paisId) };
}

/**
 * Lo mismo que `crearEscenarioGeo43`, en `codigo` y sin leer `tipo_nivel_geografico`: siembra también
 * en una base sin las migraciones de SLT-43 (la ida y vuelta, T6.1) o tras sus `down.sql` (R35).
 */
export async function sembrarEscenarioGeo43(
  tx: TxDeTest,
  codigo: CodigoPaisDePrueba,
): Promise<EscenarioGeo43SinTipos> {
  await comoDueno(tx);
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  const { id: paisId } = await crearPaisDePrueba(tx, codigo);
  const { id: empresaId } = await crearOrganizacionEnPais(tx, paisId);

  const provincia = await tx.provincia.create({
    data: { nombre: `Región ${sufijo}`, paisId, codigoDta: "1" },
    select: { id: true },
  });
  const canton = await tx.canton.create({
    data: { nombre: `Comuna ${sufijo}`, provinciaId: provincia.id, codigoDta: "1" },
    select: { id: true },
  });
  const distrito = await tx.distrito.create({
    data: { nombre: `Barrio ${sufijo}`, cantonId: canton.id, codigoDta: "1-1" },
    select: { id: true },
  });
  const otroDistrito = await tx.distrito.create({
    data: { nombre: `Barrio otro ${sufijo}`, cantonId: canton.id, codigoDta: "1-2" },
    select: { id: true },
  });

  await fijarEmpresa(tx, empresaId);
  // Solo se usan estatus, tienda y zona: la provincia y el cantón que trae son de Costa Rica.
  const fks = await crearFksDeOrden(tx);

  const orden = async (distritoId: string | null): Promise<string> => {
    const id = randomUUID();
    await tx.$executeRawUnsafe(
      INSERTAR_ORDEN,
      id,
      `SLT43-${id.slice(0, 8)}`,
      fks.estatusId,
      fks.tiendaId,
      fks.zonaId,
      provincia.id,
      canton.id,
      distritoId,
    );
    return id;
  };
  const ordenConDistritoId = await orden(distrito.id);
  const ordenSinDistritoId = await orden(null);

  const zonaDistrito = await tx.zonaDistrito.create({
    data: { zonaId: fks.zonaId, distritoId: distrito.id },
    select: { id: true },
  });
  const especial = await tx.distritoZonaEspecial.create({
    data: { distritoId: otroDistrito.id },
    select: { id: true },
  });

  const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
  const cierre = await tx.cierreDia.create({
    data: { mensajeroId: mensajero.id, estado: "aprobado", destinoTipo: "bodega_central", destinoZonaId: fks.zonaId },
    select: { id: true },
  });
  const detalle = async (ordenId: string, distritoNombre: string | null): Promise<string> => {
    const fila = await tx.cierreDetail.create({
      data: {
        cierreId: cierre.id,
        ordenId,
        montoCobrar: null,
        cobraComision: false,
        zonaId: fks.zonaId,
        tiendaId: fks.tiendaId,
        esCentral: true,
        numGuia: null,
        numRemision: `SLT43-${ordenId.slice(0, 8)}`,
        destinatario: "Destinatario SLT-43",
        direccion: null,
        producto: "caja",
        tiendaNombre: "Tienda congelada",
        zonaNombre: "Zona congelada",
        provinciaNombre: `Región congelada ${sufijo}`,
        cantonNombre: `Comuna congelada ${sufijo}`,
        distritoNombre,
      },
      select: { id: true },
    });
    return fila.id;
  };
  const cierreDetailConDistritoId = await detalle(ordenConDistritoId, `Barrio congelado ${sufijo}`);
  const cierreDetailSinDistritoId = await detalle(ordenSinDistritoId, null);

  return {
    paisId: codigo,
    empresaId,
    geo: {
      provinciaId: provincia.id,
      cantonId: canton.id,
      distritoId: distrito.id,
      otroDistritoId: otroDistrito.id,
    },
    zonaId: fks.zonaId,
    tiendaId: fks.tiendaId,
    ordenConDistritoId,
    ordenSinDistritoId,
    zonaDistritoId: zonaDistrito.id,
    distritoZonaEspecialId: especial.id,
    cierreId: cierre.id,
    cierreDetailConDistritoId,
    cierreDetailSinDistritoId,
  };
}

/**
 * Una orden más del escenario (misma tienda, zona y estatus que las del escenario), con su provincia,
 * cantón y distrito explícitos: así se arma también una orden con la jerarquía rota (R26).
 */
export async function crearOrdenGeo43(
  tx: TxDeTest,
  e: EscenarioGeo43SinTipos,
  geo: { provinciaId?: string; cantonId?: string; distritoId: string | null },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
         provincia_id, canton_id, distrito_id, producto, created_at, updated_at)
       SELECT $1, $2, estatus_id, destinatario, telefono_dest, tienda_id, zona_id, $3, $4, $5, producto,
              created_at, updated_at
         FROM orden WHERE id = $6`,
    id,
    `SLT43-${id.slice(0, 8)}`,
    geo.provinciaId ?? e.geo.provinciaId,
    geo.cantonId ?? e.geo.cantonId,
    geo.distritoId,
    e.ordenConDistritoId,
  );
  return id;
}

/** Los triggers `BEFORE` de SLT-43 que llenan las columnas nuevas al escribir (design §2.4). */
export const TRIGGERS_DE_COLUMNAS_NUEVAS = [
  { tabla: "orden", trigger: "orden_nodo_geografico" },
  { tabla: "zona_distrito", trigger: "zona_distrito_nodo_geografico" },
  { tabla: "distrito_zona_especial", trigger: "distrito_zona_especial_nodo_geografico" },
] as const;

/**
 * Deja las filas dadas como estaban antes de migrar: columnas nuevas en NULL. Apaga los triggers que
 * las llenan solo mientras las vacía y los vuelve a encender, dentro de la transacción del test (que
 * se revierte): el script corre después con los triggers activos, como en producción.
 */
export async function vaciarColumnasNuevas(
  tx: TxDeTest,
  filas: { orden?: string[]; zonaDistrito?: string[]; distritoZonaEspecial?: string[]; cierreDetail?: string[] },
): Promise<void> {
  for (const { tabla, trigger } of TRIGGERS_DE_COLUMNAS_NUEVAS) {
    await tx.$executeRawUnsafe(`ALTER TABLE ${tabla} DISABLE TRIGGER ${trigger}`);
  }
  const vaciar = async (tabla: string, columna: string, ids: string[] | undefined) => {
    if (ids && ids.length > 0) {
      await tx.$executeRawUnsafe(`UPDATE ${tabla} SET ${columna} = NULL WHERE id = ANY($1::text[])`, ids);
    }
  };
  await vaciar("orden", "nodo_geografico_id", filas.orden);
  await vaciar("zona_distrito", "nodo_geografico_id", filas.zonaDistrito);
  await vaciar("distrito_zona_especial", "nodo_geografico_id", filas.distritoZonaEspecial);
  await vaciar("cierre_detail", "ubicacion_snapshot", filas.cierreDetail);
  for (const { tabla, trigger } of TRIGGERS_DE_COLUMNAS_NUEVAS) {
    await tx.$executeRawUnsafe(`ALTER TABLE ${tabla} ENABLE TRIGGER ${trigger}`);
  }
}
