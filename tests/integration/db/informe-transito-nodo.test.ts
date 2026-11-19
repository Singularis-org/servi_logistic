import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { InformeTransitoRepository } from "@/lib/repositories/InformeTransitoRepository";
import { estadosIncluidos, PARAMETROS_POR_DEFECTO } from "@/lib/whatsapp-envios/informes/transito/parametros";
import type { ConsultaTransito } from "@/lib/whatsapp-envios/informes/transito/tipos";
import { tiposDeDosMasHondos } from "@/lib/utils/ubicacion-presentacion";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo71, type EmpresaGeo71, revertidaLarga } from "./_fixtures/geo-71";
import { DATOS_PERSONALES_GEO65 } from "./_fixtures/geo-65";
import { comoDueno } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-48 (T2.5; design §5; R25) — EL INFORME DE TRANSITO LEE EL LUGAR DEL NODO.
//
// Sobre el fixture `geo-71`, a cada empresa se le suma una orden en transito vencida «nueva» (nodo puesto
// y las 3 FK en NULL): en CR en su distrito central; en XA en un sector de nivel 4 bajo ese distrito. El
// informe la nombra con los dos niveles mas hondos del pais (D = P) y el titulo usa sus tipos: en CR
// «Cantón · Distrito», como hoy; en XA, los niveles 3 y 4. Que las ordenes viejas den lo de hoy lo prueba
// `geo-transito-nombres`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

function consultaDe(e: EmpresaGeo71): ConsultaTransito {
  const z = e.base.base.zonas;
  const corte = new Date();
  return {
    hito: PARAMETROS_POR_DEFECTO.hito,
    estados: estadosIncluidos(PARAMETROS_POR_DEFECTO),
    cortes: [z.centralId, z.norteId, z.surId].map((zonaId) => ({ zonaId, corte })),
  };
}

/** Una orden en transito vencida con el nodo puesto y las 3 FK en NULL. */
async function enTransitoSoloNodo(tx: TxDeTest, e: EmpresaGeo71, nodoId: string): Promise<string> {
  await comoDueno(tx);
  await tx.$executeRawUnsafe(`SELECT set_config('app.organizacion_id', $1, true)`, e.base.base.empresaId);
  const estado = await tx.orderStatus.findUniqueOrThrow({ where: { value: "en_bodega_central" }, select: { id: true } });
  const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);
  const [destinatario, telefono, direccion] = DATOS_PERSONALES_GEO65;
  const o = await tx.orden.create({
    data: {
      numRemision: `SLT48-T-${randomUUID().slice(0, 8)}`,
      destinatario,
      telefonoDest: telefono,
      direccion,
      producto: "caja",
      estatusId: estado.id,
      tiendaId: e.base.base.tiendaId,
      zonaId: e.base.base.zonas.norteId,
      nodoGeograficoId: nodoId,
      montoCobrar: "1000",
      createdAt: hace(40),
    },
    select: { id: true },
  });
  await tx.ordenHistorialEstado.create({
    data: { ordenId: o.id, estatusDestinoId: estado.id, origenTipo: "creacion_manual", createdAt: hace(30) },
  });
  return o.id;
}

async function sector(tx: TxDeTest, distritoId: string): Promise<string> {
  await comoDueno(tx);
  const id = randomUUID();
  const tipo = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT t.id FROM tipo_nivel_geografico t JOIN nodo_geografico n ON n.pais_id = t.pais_id
      WHERE n.id = $1 AND t.clave = 'nivel_4'`,
    distritoId,
  );
  let tipoId = tipo[0]?.id;
  if (tipoId === undefined) {
    tipoId = randomUUID();
    await tx.$executeRawUnsafe(
      `INSERT INTO tipo_nivel_geografico (id, pais_id, clave, nombre_singular, nombre_plural)
       SELECT $1, pais_id, 'nivel_4', 'Sector', 'Sectores' FROM nodo_geografico WHERE id = $2`,
      tipoId,
      distritoId,
    );
  }
  await tx.$executeRawUnsafe(
    `INSERT INTO nodo_geografico (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, activo)
     SELECT $1, pais_id, $2, id, 4, 'Sector SLT48', '', true FROM nodo_geografico WHERE id = $3`,
    id,
    tipoId,
    distritoId,
  );
  return id;
}

async function filas(tx: TxDeTest, e: EmpresaGeo71) {
  await comoApp(tx, e.base.base.empresaId);
  try {
    return await conEmpresa(e.base.base.empresaId, () =>
      new InformeTransitoRepository(tx as unknown as PrismaClient).filasEnAlerta(consultaDe(e)),
    );
  } finally {
    await comoDueno(tx);
  }
}

describeSiHayBase("SLT-48 R25 — transito nombra la orden nueva desde su nodo (Postgres real)", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it("CR: canton y distrito de la ruta del nodo; XA: los niveles 3 y 4, y el titulo con sus tipos", async () => {
    const r = await revertidaLarga(base, async (tx) => {
      const e = await crearEscenarioGeo71(tx);
      const g = e.cr.base.base.geo;
      const enCr = await enTransitoSoloNodo(tx, e.cr, g.distritoCentralId);
      const sectorXa = await sector(tx, e.xa.base.base.geo.distritoCentralId);
      const enXa = await enTransitoSoloNodo(tx, e.xa, sectorXa);
      const nombres = await tx.nodoGeografico.findMany({
        where: { id: { in: [g.cantonId, g.distritoCentralId, e.xa.base.base.geo.distritoCentralId, sectorXa] } },
        select: { id: true, nombre: true },
      });
      return {
        enCr,
        enXa,
        nombreDe: new Map(nombres.map((n) => [n.id, n.nombre])),
        g,
        gXa: e.xa.base.base.geo,
        sectorXa,
        cr: await filas(tx, e.cr),
        xa: await filas(tx, e.xa),
      };
    });

    const filaCr = r.cr.find((f) => f.ordenId === r.enCr);
    expect(filaCr, "la orden nueva de CR no salio en el informe").toBeDefined();
    expect(filaCr).toMatchObject({ canton: r.nombreDe.get(r.g.cantonId), distrito: r.nombreDe.get(r.g.distritoCentralId) });
    expect(filaCr?.ruta).toHaveLength(3);
    expect(tiposDeDosMasHondos(filaCr?.niveles ?? [])).toEqual(["Cantón", "Distrito"]);

    const filaXa = r.xa.find((f) => f.ordenId === r.enXa);
    expect(filaXa, "la orden nueva de XA no salio en el informe").toBeDefined();
    expect(filaXa).toMatchObject({
      canton: r.nombreDe.get(r.gXa.distritoCentralId),
      distrito: r.nombreDe.get(r.sectorXa),
    });
    expect(filaXa?.ruta).toHaveLength(4);
    expect(tiposDeDosMasHondos(filaXa?.niveles ?? [])[1]).toBe("Sector");
  }, 300_000);
});
