import type { PrismaClient } from "@prisma/client";

import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { datosDeOrganizacionDePrueba, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import type { CodigoPaisDePrueba } from "@/tests/fabricas/paises";

import type { TxDeTest } from "../integration/db/_postgres-real";

// SLT-45 T5.8 (design §12; R5, R15, R22, R33) — los paises de prueba de 2 y de 4 niveles.
//
// Solo existen en los datos de test (R33): nada de esto lo carga una migracion ni la app. Hasta
// SLT-46 la app no escribe en `nodo_geografico` ni en `tipo_nivel_geografico` (SLT-43 R12: la base
// se lo niega a `servi_app`), asi que se siembra como lo haria el SQL de plataforma:
//   1. el `pais` (el trigger `pais_tipos_de_nivel` de SLT-43 le crea `nivel_1`..`nivel_3`);
//   2. los tipos que falten (`nivel_4` en el de 4 niveles);
//   3. los nodos, directamente en `nodo_geografico`, de la raiz hacia abajo (`nombre_normalizado`
//      lo pone el trigger `nodo_geografico_invariantes`);
//   4. una empresa de ese pais con los modulos de ordenes.
// Todo con el rol de la conexion de los tests (el dueño de las tablas, el de las migraciones),
// ANTES de bajar al rol de la app.
//
// LIMPIEZA. Se siembra dentro de la transaccion de `enTransaccionRevertida`, que siempre se
// revierte: el pais, sus tipos, sus nodos y la empresa se van con ella, tambien si el test revienta
// a mitad. `residuosDePaisesDePrueba` lo comprueba desde fuera de la transaccion (el `afterAll` de
// la suite lo exige en cero).
//
// Los codigos `XN` y `XP` son del rango que ISO 3166-1 reserva al usuario (`tests/fabricas/paises`)
// y no los usa ninguna otra suite.

export interface TipoDePrueba {
  clave: string;
  nombreSingular: string;
  nombrePlural: string;
}

export interface NodoDePrueba {
  /** Los nombres de la raiz al nodo; el padre es la ruta sin el ultimo. */
  ruta: string[];
  codigoOficial: string | null;
  /** El `activo` PROPIO de la fila; por defecto `true`. */
  activo?: boolean;
}

export interface PaisDePruebaGeo {
  id: CodigoPaisDePrueba;
  nombre: string;
  niveles: 2 | 4;
  /** Los tipos de `nivel_1` a `nivel_3` van en la fila `pais`; los demas se insertan aparte. */
  tipos: TipoDePrueba[];
  /** Cada padre antes que sus hijos. */
  nodos: NodoDePrueba[];
}

/**
 * 2 niveles. `pais` exige nombres para tres niveles: el trigger crea `nivel_3` («Aldea») y queda sin
 * nodos, como el de un pais real que aun no se cargo hasta abajo. `Tactic` esta retirado.
 */
export const PAIS_DOS_NIVELES: PaisDePruebaGeo = {
  id: "XN",
  nombre: "Pais de prueba de 2 niveles",
  niveles: 2,
  tipos: [
    { clave: "nivel_1", nombreSingular: "Departamento", nombrePlural: "Departamentos" },
    { clave: "nivel_2", nombreSingular: "Municipio", nombrePlural: "Municipios" },
    { clave: "nivel_3", nombreSingular: "Aldea", nombrePlural: "Aldeas" },
  ],
  nodos: [
    { ruta: ["Alta Verapaz"], codigoOficial: "16" },
    { ruta: ["Alta Verapaz", "Cobán"], codigoOficial: "1601" },
    { ruta: ["Alta Verapaz", "San Pedro Carchá"], codigoOficial: "1602" },
    { ruta: ["Alta Verapaz", "Tactic"], codigoOficial: "1603", activo: false },
    { ruta: ["Petén"], codigoOficial: "17" },
    { ruta: ["Petén", "Flores"], codigoOficial: null },
  ],
};

/**
 * 4 niveles. `Villa Alemana` esta retirada y su hijo `Peñablanca` no: activo en cascada, sale
 * `activo: false` (SLT-44 R5). `Centro` no tiene codigo oficial.
 */
export const PAIS_CUATRO_NIVELES: PaisDePruebaGeo = {
  id: "XP",
  nombre: "Pais de prueba de 4 niveles",
  niveles: 4,
  tipos: [
    { clave: "nivel_1", nombreSingular: "Región", nombrePlural: "Regiones" },
    { clave: "nivel_2", nombreSingular: "Provincia", nombrePlural: "Provincias" },
    { clave: "nivel_3", nombreSingular: "Comuna", nombrePlural: "Comunas" },
    { clave: "nivel_4", nombreSingular: "Sector", nombrePlural: "Sectores" },
  ],
  nodos: [
    { ruta: ["Valparaíso"], codigoOficial: "05" },
    { ruta: ["Valparaíso", "Marga Marga"], codigoOficial: "058" },
    { ruta: ["Valparaíso", "Marga Marga", "Quilpué"], codigoOficial: "05801" },
    { ruta: ["Valparaíso", "Marga Marga", "Quilpué", "El Belloto"], codigoOficial: "0580101" },
    { ruta: ["Valparaíso", "Marga Marga", "Villa Alemana"], codigoOficial: "05802", activo: false },
    { ruta: ["Valparaíso", "Marga Marga", "Villa Alemana", "Peñablanca"], codigoOficial: "0580201" },
    { ruta: ["Ñuble"], codigoOficial: "16" },
    { ruta: ["Ñuble", "Diguillín"], codigoOficial: "161" },
    { ruta: ["Ñuble", "Diguillín", "Chillán"], codigoOficial: "16101" },
    { ruta: ["Ñuble", "Diguillín", "Chillán", "Centro"], codigoOficial: null },
  ],
};

export const PAISES_DE_PRUEBA_GEO: readonly PaisDePruebaGeo[] = [PAIS_DOS_NIVELES, PAIS_CUATRO_NIVELES];

/** La clave de una ruta en `PaisSembrado.nodoPorRuta`. */
export const claveDeRuta = (ruta: readonly string[]): string => ruta.join(" / ");

export interface PaisSembrado {
  paisId: CodigoPaisDePrueba;
  organizacionId: string;
  /** Id de cada nodo sembrado, por `claveDeRuta`. */
  nodoPorRuta: Map<string, string>;
}

/**
 * Siembra `def` y una empresa de ese pais. Corre como dueño y deja la transaccion como dueño con la
 * empresa nueva fijada (los triggers de SL-17 ponen `organizacion_id` a lo que se cree despues).
 */
export async function sembrarPaisDePruebaGeo(tx: TxDeTest, def: PaisDePruebaGeo): Promise<PaisSembrado> {
  const [t1, t2, t3] = def.tipos;
  await tx.pais.create({
    data: {
      id: def.id,
      nombre: def.nombre,
      nivel1Singular: t1.nombreSingular,
      nivel1Plural: t1.nombrePlural,
      nivel2Singular: t2.nombreSingular,
      nivel2Plural: t2.nombrePlural,
      nivel3Singular: t3.nombreSingular,
      nivel3Plural: t3.nombrePlural,
    },
  });
  for (const t of def.tipos.slice(3)) {
    await tx.tipoNivelGeografico.create({
      data: { paisId: def.id, clave: t.clave, nombreSingular: t.nombreSingular, nombrePlural: t.nombrePlural },
    });
  }
  const tipos = await tx.tipoNivelGeografico.findMany({ where: { paisId: def.id }, select: { id: true, clave: true } });
  const tipoDe = (profundidad: number): string => {
    const tipo = tipos.find((t) => t.clave === `nivel_${profundidad}`);
    if (tipo === undefined) throw new Error(`${def.id} no tiene el tipo nivel_${profundidad}`);
    return tipo.id;
  };

  const nodoPorRuta = new Map<string, string>();
  for (const n of def.nodos) {
    const profundidad = n.ruta.length;
    const padreId = profundidad === 1 ? null : nodoPorRuta.get(claveDeRuta(n.ruta.slice(0, -1)));
    if (padreId === undefined) throw new Error(`el padre de ${claveDeRuta(n.ruta)} no se sembro antes`);
    const nodo = await tx.nodoGeografico.create({
      data: {
        paisId: def.id,
        tipoId: tipoDe(profundidad),
        padreId,
        profundidad,
        nombre: n.ruta[profundidad - 1],
        nombreNormalizado: "lo pisa el trigger",
        codigoOficial: n.codigoOficial,
        activo: n.activo ?? true,
      },
      select: { id: true },
    });
    nodoPorRuta.set(claveDeRuta(n.ruta), nodo.id);
  }

  const org = await tx.organizacion.create({
    data: { ...datosDeOrganizacionDePrueba(), paisId: def.id },
    select: { id: true },
  });
  await tx.organizacionModulo.createMany({
    data: ORDEN_MODULOS.map((modulo) => ({ organizacionId: org.id, modulo })),
  });
  await fijarEmpresa(tx, org.id);
  return { paisId: def.id, organizacionId: org.id, nodoPorRuta };
}

/** Activo en cascada de un nodo de `def`: el suyo y el de todos sus ancestros (SLT-44 R5). */
export function activoEnCascada(def: PaisDePruebaGeo, ruta: readonly string[]): boolean {
  return def.nodos
    .filter((n) => n.ruta.length <= ruta.length && claveDeRuta(n.ruta) === claveDeRuta(ruta.slice(0, n.ruta.length)))
    .every((n) => n.activo ?? true);
}

/**
 * Lo que quedo de los paises de prueba FUERA de cualquier transaccion: paises, tipos, nodos y
 * empresas. Tras la suite, todo en cero.
 */
export async function residuosDePaisesDePrueba(
  prisma: PrismaClient,
): Promise<{ paises: number; tipos: number; nodos: number; organizaciones: number }> {
  const ids = PAISES_DE_PRUEBA_GEO.map((p) => p.id);
  const [paises, tipos, nodos, organizaciones] = await Promise.all([
    prisma.pais.count({ where: { id: { in: ids } } }),
    prisma.tipoNivelGeografico.count({ where: { paisId: { in: ids } } }),
    prisma.nodoGeografico.count({ where: { paisId: { in: ids } } }),
    prisma.organizacion.count({ where: { paisId: { in: ids } } }),
  ]);
  return { paises, tipos, nodos, organizaciones };
}
