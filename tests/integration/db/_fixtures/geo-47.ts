import { randomUUID } from "node:crypto";

import { fijarEmpresa } from "@/tests/fabricas/organizaciones";
import type { TxDeTest } from "../_postgres-real";
import { insertarNodo } from "./geo-43";
import { crearEscenarioGeo65, DATOS_PERSONALES_GEO65, type EmpresaGeo65, type EscenarioGeo65 } from "./geo-65";
import { comoDueno } from "./pais-20";

// SLT-47 (T1.2; design §12) — el escenario de los filtros de lugar de N niveles, sobre `geo-65.ts`.
//
// Por empresa (Costa Rica y `XA`), ademas de lo de `geo-65` (cuya geografia dibuja `geo-44`), se
// siembran los HOMONIMOS de R13:
//
//   Provincia (geo-44) ─── Canton «Central» ─── Distrito «San Rafael»
//   Provincia «Central» ── Canton «Central» ─── Distrito «San Rafael»
//
// - dos cantones «Central» en provincias distintas, cada uno con un distrito «San Rafael»;
// - una provincia que se llama igual que los dos cantones (el «municipio y departamento» de R13);
// - por cada canton «Central», una orden en su «San Rafael» y otra sin distrito, todas en la zona
//   central y en `en_preparacion`.
//
// Solo en `XA` (el pais de 4 niveles), el caso de la zona con un descendiente de otra zona (R36):
//
//   Canton (geo-44) ─── Distrito «Con sector» → zona norte (`zona_distrito`)
//                         ├─ Sector «propio»  → zona sur   (`zona_nodo`, asignacion propia)
//                         └─ Sector «hereda»  → ninguna    (hereda la zona norte)
//
// mas el tipo `nivel_4` del pais. Las ordenes no pueden estar en profundidad 4 (las FK de `orden` son
// a `distrito`): los sectores solo estan en el catalogo.
//
// Los nombres llevan un sufijo aleatorio, comun a la empresa: dos «Central» de la misma empresa se
// llaman igual de verdad. Los datos personales son los de `geo-65` (`DATOS_PERSONALES_GEO65`).
//
// Se escribe como DUEÑO dentro del `tx` de un test que se revierte, y deja la transaccion como dueño.

export interface HomonimosGeo47 {
  /** El nombre comun de la provincia y los dos cantones. */
  nombreCentral: string;
  /** El nombre comun de los dos distritos. */
  nombreSanRafael: string;
  /** La provincia que se llama como los cantones. */
  provinciaCentralId: string;
  /** Canton «Central» de la provincia de `geo-44`. */
  cantonCentral1Id: string;
  /** Canton «Central» de la provincia «Central». */
  cantonCentral2Id: string;
  sanRafael1Id: string;
  sanRafael2Id: string;
}

export interface OrdenesGeo47 {
  enSanRafael1Id: string;
  enSanRafael2Id: string;
  sinDistritoCentral1Id: string;
  sinDistritoCentral2Id: string;
}

/** Solo en `XA`: la zona con un descendiente asignado a otra (R36). */
export interface CuartoNivelGeo47 {
  tipoNivel4Id: string;
  /** Distrito asignado a la zona norte en `zona_distrito`. */
  distritoConSectorId: string;
  /** Sector con asignacion propia a la zona sur (`zona_nodo`). */
  sectorPropioId: string;
  /** Sector sin asignacion: hereda la zona norte del distrito. */
  sectorHeredaId: string;
}

export interface EmpresaGeo47 {
  base: EmpresaGeo65;
  homonimos: HomonimosGeo47;
  ordenes: OrdenesGeo47;
}

export interface EscenarioGeo47 {
  geo65: EscenarioGeo65;
  cr: EmpresaGeo47;
  xa: EmpresaGeo47 & { cuarto: CuartoNivelGeo47 };
}

export { DATOS_PERSONALES_GEO65 as DATOS_PERSONALES_GEO47 };

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, direccion, tienda_id,
    zona_id, provincia_id, canton_id, distrito_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'caja', now(), now())`;

async function idDeEstado(tx: TxDeTest, value: string): Promise<string> {
  const fila = await tx.orderStatus.findUnique({ where: { value }, select: { id: true } });
  if (fila === null) throw new Error(`falta el estado «${value}»: aplica las migraciones`);
  return fila.id;
}

/** Siembra lo de SLT-47 sobre una empresa de `geo-65` ya creada. */
export async function sembrarEmpresaGeo47(tx: TxDeTest, e: EmpresaGeo65): Promise<EmpresaGeo47> {
  await comoDueno(tx);
  await fijarEmpresa(tx, e.base.empresaId);
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  const nombreCentral = `Central SLT47 ${sufijo}`;
  const nombreSanRafael = `San Rafael SLT47 ${sufijo}`;
  const id = { select: { id: true } } as const;

  const provinciaCentral = await tx.provincia.create({ data: { nombre: nombreCentral, paisId: e.base.paisId }, ...id });
  const cantonCentral1 = await tx.canton.create({
    data: { nombre: nombreCentral, provinciaId: e.base.geo.provinciaId },
    ...id,
  });
  const cantonCentral2 = await tx.canton.create({ data: { nombre: nombreCentral, provinciaId: provinciaCentral.id }, ...id });
  const sanRafael1 = await tx.distrito.create({ data: { nombre: nombreSanRafael, cantonId: cantonCentral1.id }, ...id });
  const sanRafael2 = await tx.distrito.create({ data: { nombre: nombreSanRafael, cantonId: cantonCentral2.id }, ...id });

  const estado = await idDeEstado(tx, "en_preparacion");
  const [destinatario, telefono, direccion] = DATOS_PERSONALES_GEO65;
  const orden = async (provinciaId: string, cantonId: string, distritoId: string | null, monto: string) => {
    const ordenId = randomUUID();
    await tx.$executeRawUnsafe(
      INSERTAR_ORDEN,
      ordenId,
      `SLT47-${ordenId.slice(0, 8)}`,
      estado,
      destinatario,
      telefono,
      direccion,
      e.base.tiendaId,
      e.base.zonas.centralId,
      provinciaId,
      cantonId,
      distritoId,
      monto,
    );
    return ordenId;
  };

  const p1 = e.base.geo.provinciaId;
  const p2 = provinciaCentral.id;
  return {
    base: e,
    homonimos: {
      nombreCentral,
      nombreSanRafael,
      provinciaCentralId: p2,
      cantonCentral1Id: cantonCentral1.id,
      cantonCentral2Id: cantonCentral2.id,
      sanRafael1Id: sanRafael1.id,
      sanRafael2Id: sanRafael2.id,
    },
    ordenes: {
      enSanRafael1Id: await orden(p1, cantonCentral1.id, sanRafael1.id, "4700"),
      enSanRafael2Id: await orden(p2, cantonCentral2.id, sanRafael2.id, "4710"),
      sinDistritoCentral1Id: await orden(p1, cantonCentral1.id, null, "4720"),
      sinDistritoCentral2Id: await orden(p2, cantonCentral2.id, null, "4730"),
    },
  };
}

/** El cuarto nivel de `XA` y la zona con un descendiente de otra zona (R36). */
async function sembrarCuartoNivel(tx: TxDeTest, e: EmpresaGeo65): Promise<CuartoNivelGeo47> {
  await comoDueno(tx);
  await fijarEmpresa(tx, e.base.empresaId);
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  const { paisId, geo, zonas } = e.base;

  // Si otro fixture del mismo test ya creo el tipo, se reutiliza: hay uno por pais y clave.
  const existente = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM tipo_nivel_geografico WHERE pais_id = $1 AND clave = 'nivel_4'`,
    paisId,
  );
  let tipoNivel4Id = existente[0]?.id;
  if (tipoNivel4Id === undefined) {
    tipoNivel4Id = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural)
       VALUES ($1, $2, 'nivel_4', 'Sector', 'Sectores')`,
      tipoNivel4Id,
      paisId,
    );
  }

  const distrito = await tx.distrito.create({
    data: { nombre: `Con sector SLT47 ${sufijo}`, cantonId: geo.cantonId },
    select: { id: true },
  });
  await tx.zonaDistrito.create({ data: { zonaId: zonas.norteId, distritoId: distrito.id } });
  const sector = (nombre: string) =>
    insertarNodo(tx, { paisId, tipoId: tipoNivel4Id, padreId: distrito.id, profundidad: 4, nombre: `${nombre} SLT47 ${sufijo}` });
  const sectorPropioId = await sector("Sector propio");
  const sectorHeredaId = await sector("Sector hereda");
  await tx.zonaNodo.create({ data: { zonaId: zonas.surId, nodoGeograficoId: sectorPropioId } });

  return { tipoNivel4Id, distritoConSectorId: distrito.id, sectorPropioId, sectorHeredaId };
}

export async function crearEscenarioGeo47(tx: TxDeTest): Promise<EscenarioGeo47> {
  const geo65 = await crearEscenarioGeo65(tx);
  const cr = await sembrarEmpresaGeo47(tx, geo65.cr);
  const xa = await sembrarEmpresaGeo47(tx, geo65.xa);
  const cuarto = await sembrarCuartoNivel(tx, geo65.xa);
  await comoDueno(tx);
  return { geo65, cr, xa: { ...xa, cuarto } };
}
