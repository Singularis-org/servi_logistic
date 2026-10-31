import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import type { TxDeTest } from "../_postgres-real";
import { crearEscenarioGeo43, type EscenarioGeo43 } from "./geo-43";
import { crearUsuarioDePrueba } from "./orden-minima";
import { comoDueno } from "./pais-20";

// SLT-44 (T1.2; design §10) — el escenario de la geografia jerarquica leida desde el catalogo: dos
// empresas, una en Costa Rica y otra en el pais de prueba `XA`, cada una con:
//
//   Provincia ─┬─ Canton activo ─┬─ distrito «central»      → zona central          + marca
//              │                 ├─ distrito «dos zonas»    → zonas norte y sur
//              │                 ├─ distrito «sin zona»     → ninguna
//              │                 └─ distrito «retirado»     → zona norte (activo = false)
//              └─ Canton retirado ── distrito «bajo retirado» → zona sur   + marca (activo; su canton no)
//
// mas una tienda con tarifa general (y una tarifa general de la zona norte) y dos ordenes, una con
// distrito y otra sin el. La de `XA` se monta sobre `crearEscenarioGeo43`, que aporta el pais, la
// empresa y su propia zona, marca y ordenes (`xa.geo43`).
//
// Se escribe como DUEÑO dentro del `tx` de un test que se revierte (`revertida` de `pais-20`): el
// rollback se lo lleva todo, tambien los nodos que crean los triggers de sincronia de SLT-43. Deja la
// transaccion como dueño. Para leer como la app: `comoApp(tx, empresa.empresaId)`.

export interface EmpresaGeo44 {
  empresaId: string;
  paisId: string;
  geo: {
    provinciaId: string;
    cantonId: string;
    cantonRetiradoId: string;
    distritoCentralId: string;
    distritoDosZonasId: string;
    distritoSinZonaId: string;
    distritoRetiradoId: string;
    distritoBajoCantonRetiradoId: string;
  };
  zonas: { centralId: string; norteId: string; surId: string };
  /** Los distritos con marca de zona especial de ESTA empresa, sembrados aqui. */
  marcas: string[];
  tiendaId: string;
  ordenConDistritoId: string;
  ordenSinDistritoId: string;
}

export interface EscenarioGeo44 {
  cr: EmpresaGeo44;
  xa: EmpresaGeo44 & { geo43: EscenarioGeo43 };
}

const INSERTAR_ORDEN = `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
    provincia_id, canton_id, distrito_id, monto_cobrar, producto, created_at, updated_at)
  VALUES ($1, $2, $3, 'Destinatario SLT-44', '88880000', $4, $5, $6, $7, $8, $9, 'caja', now(), now())`;

const DECIMAL = (v: string) => new Prisma.Decimal(v);

export async function crearEscenarioGeo44(tx: TxDeTest): Promise<EscenarioGeo44> {
  const geo43 = await crearEscenarioGeo43(tx);
  const xa = await sembrarEmpresaGeo44(tx, geo43.paisId, geo43.empresaId);
  await comoDueno(tx);
  const { id: empresaCr } = await crearOrganizacion(tx);
  const cr = await sembrarEmpresaGeo44(tx, "CR", empresaCr);
  return { cr, xa: { ...xa, geo43 } };
}

/**
 * La geografia, las zonas, las marcas, la tienda con tarifa y las ordenes de una empresa ya creada,
 * en `paisId`. Los nombres llevan un sufijo aleatorio: nunca chocan con los de la migracion.
 */
export async function sembrarEmpresaGeo44(tx: TxDeTest, paisId: string, empresaId: string): Promise<EmpresaGeo44> {
  await comoDueno(tx);
  await fijarEmpresa(tx, empresaId);
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  const id = { select: { id: true } } as const;

  const provincia = await tx.provincia.create({ data: { nombre: `Provincia SLT44 ${sufijo}`, paisId }, ...id });
  const canton = await tx.canton.create({
    data: { nombre: `Canton SLT44 ${sufijo}`, provinciaId: provincia.id },
    ...id,
  });
  const cantonRetirado = await tx.canton.create({
    data: { nombre: `Canton retirado SLT44 ${sufijo}`, provinciaId: provincia.id, activo: false },
    ...id,
  });
  const distrito = (nombre: string, cantonId: string, activo = true) =>
    tx.distrito.create({ data: { nombre: `${nombre} SLT44 ${sufijo}`, cantonId, activo }, ...id });
  const dCentral = await distrito("Central", canton.id);
  const dDosZonas = await distrito("Dos zonas", canton.id);
  const dSinZona = await distrito("Sin zona", canton.id);
  const dRetirado = await distrito("Retirado", canton.id, false);
  const dBajoRetirado = await distrito("Bajo retirado", cantonRetirado.id);

  const zona = (nombre: string, esCentral: boolean) =>
    tx.zona.create({
      data: { nombre: `Zona ${nombre} SLT44 ${sufijo}`, esCentral, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
      ...id,
    });
  const central = await zona("central", true);
  const norte = await zona("norte", false);
  const sur = await zona("sur", false);

  await tx.zonaDistrito.createMany({
    data: [
      { zonaId: central.id, distritoId: dCentral.id },
      { zonaId: norte.id, distritoId: dDosZonas.id },
      { zonaId: sur.id, distritoId: dDosZonas.id },
      { zonaId: norte.id, distritoId: dRetirado.id },
      { zonaId: sur.id, distritoId: dBajoRetirado.id },
    ],
  });
  const marcas = [dCentral.id, dBajoRetirado.id];
  await tx.distritoZonaEspecial.createMany({ data: marcas.map((distritoId) => ({ distritoId })) });

  const tienda = await crearUsuarioDePrueba(tx, "adminTienda");
  const importes = {
    valorFlete: DECIMAL("2000.00"),
    valorFleteGam: DECIMAL("2500.00"),
    valorFleteDevuelto: DECIMAL("1500.00"),
    valorFleteDevueltoGam: DECIMAL("1800.00"),
    fulfillment: DECIMAL("0.00"),
    comisionCod: DECIMAL("3.00"),
    ivaFlete: DECIMAL("13.00"),
    ivaComisionCod: DECIMAL("13.00"),
  };
  await tx.tarifa.create({ data: { ...importes, tiendaId: tienda.id, zonaId: null, isDefault: true }, ...id });
  await tx.tarifa.create({ data: { ...importes, valorFlete: DECIMAL("2200.00"), tiendaId: null, zonaId: norte.id }, ...id });

  const estatus = await tx.orderStatus.findUnique({ where: { value: "en_preparacion" }, ...id });
  if (estatus === null) throw new Error("falta el estado «en_preparacion»: aplica las migraciones");
  const orden = async (distritoId: string | null, monto: string): Promise<string> => {
    const ordenId = randomUUID();
    await tx.$executeRawUnsafe(
      INSERTAR_ORDEN,
      ordenId,
      `SLT44-${ordenId.slice(0, 8)}`,
      estatus.id,
      tienda.id,
      central.id,
      provincia.id,
      canton.id,
      distritoId,
      monto,
    );
    return ordenId;
  };

  return {
    empresaId,
    paisId,
    geo: {
      provinciaId: provincia.id,
      cantonId: canton.id,
      cantonRetiradoId: cantonRetirado.id,
      distritoCentralId: dCentral.id,
      distritoDosZonasId: dDosZonas.id,
      distritoSinZonaId: dSinZona.id,
      distritoRetiradoId: dRetirado.id,
      distritoBajoCantonRetiradoId: dBajoRetirado.id,
    },
    zonas: { centralId: central.id, norteId: norte.id, surId: sur.id },
    marcas,
    tiendaId: tienda.id,
    ordenConDistritoId: await orden(dCentral.id, "15000"),
    ordenSinDistritoId: await orden(null, "8000"),
  };
}
