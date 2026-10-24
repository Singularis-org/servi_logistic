import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";
import {
  enTransaccionRevertida459,
  leerCajaEntera,
  menos,
  montarServicios459,
  type LecturaCaja459,
} from "./_fixtures/caja-459";
import { comoApp, crearOrganizacion } from "../../fabricas/organizaciones";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SL-39 / T0 — EL IVA NO ES GANANCIA (R1, R2, R4, R5, R16), contra Postgres.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// El ejemplo de design §1: una entrega con contra-entrega de 20 000,00, flete 2 500,00 y su IVA
// 325,00, comision COD 700,00 y su IVA 91,00, y 1 500,00 pagados al mensajero. Hoy la ganancia suma
// el IVA (2 116,00); con la ficha, la ganancia es 3 200 − 1 500 = 1 700,00 y el IVA va aparte
// (325 + 91 = 416,00). La caja y «De la empresa» no se mueven: el IVA sigue estando en la caja y
// sigue sin ser de las tiendas.
//
// El contra-entrega va sembrado A PROPOSITO. Desde la 459 el flete, la comision y sus IVA son
// CARGOS A LA TIENDA (`LIQUIDEZ_POR_CATEGORIA`): no son efectivo que entre, son la parte de la
// empresa que se descuenta del contra-entrega. Sembrados solos, «Entro» no se mueve y «De las
// tiendas» queda en −3 616,00, una tienda que debe sin haber cobrado nada: no es el ejemplo de §1, y
// las afirmaciones de R5 sobre «Entro» y la cifra principal medirian otra cosa.
//
// Molde de la 459 (`_fixtures/caja-459.ts`): `WalletService` y `WalletMovimientoRepository` REALES
// sobre una transaccion en REPEATABLE READ que siempre se revierte. La caja se mide POR DIFERENCIA
// (antes/despues en la misma foto), porque la tx del test es la del dueno de las tablas y
// `verResumenCaja` agrega todo lo que ve: el contexto de empresa que fija el fixture (`conEmpresa`
// + `app.organizacion_id`) pone la empresa en las filas nuevas, pero no filtra las lecturas.
//
// Por eso el caso de dos empresas (R16) no puede medirse igual: con el dueno, las filas de B
// entrarian en la lectura de A. Ahi cada lectura baja a `servi_app` con la empresa fijada
// (`comoApp`), dentro de un SAVEPOINT que se deshace al terminar, para que la RLS real —la misma
// que actua en produccion— decida que filas ve cada empresa.
//
// Todos los importes esperados son LITERALES con la cuenta a mano al lado: comparar contra la
// derivacion que se prueba estaria siempre en verde.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** `verResumenCaja` solo mira el rol (acceso total) y no busca al usuario: basta un maestro sintetico. */
const MAESTRO: Actor = { usuarioId: randomUUID(), rol: "maestro" };

type FilaDeCaja = {
  tipo: "ingreso" | "egreso";
  categoria:
    | "ingreso_cod_recaudado"
    | "ingreso_flete"
    | "ingreso_iva_flete"
    | "ingreso_comision_cod"
    | "ingreso_iva_comision_cod"
    | "egreso_pago_mensajero";
  monto: string;
};

/** El ejemplo de design §1, fila a fila. */
const EJEMPLO_A: readonly FilaDeCaja[] = [
  { tipo: "ingreso", categoria: "ingreso_cod_recaudado", monto: "20000.00" },
  { tipo: "ingreso", categoria: "ingreso_flete", monto: "2500.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_flete", monto: "325.00" },
  { tipo: "ingreso", categoria: "ingreso_comision_cod", monto: "700.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_comision_cod", monto: "91.00" },
  { tipo: "egreso", categoria: "egreso_pago_mensajero", monto: "1500.00" },
];

// Importes de B pequenos y distintos de los de A: si una fila de B se colara en la lectura de A, la
// cifra de A cambiaria en centimos reconocibles (y viceversa).
const EJEMPLO_B: readonly FilaDeCaja[] = [
  { tipo: "ingreso", categoria: "ingreso_cod_recaudado", monto: "500.00" },
  { tipo: "ingreso", categoria: "ingreso_flete", monto: "40.00" },
  { tipo: "ingreso", categoria: "ingreso_iva_flete", monto: "5.20" },
  { tipo: "ingreso", categoria: "ingreso_iva_comision_cod", monto: "1.30" },
];

/**
 * El campo `iva` (y `totalIva` en la composicion) lo anade T1 a los DTO (design §6). Hasta entonces
 * no existe en el tipo; se lee por esta vista minima para que el archivo compile ya, y la asercion
 * de su tipo hace que su ausencia falle con nombre propio y no como un `undefined` en una resta.
 */
type ConIva = { iva?: unknown };
type ConTotalIva = { totalIva?: unknown };

function ivaDe(l: LecturaCaja459): string {
  const iva = (l.resumen as unknown as ConIva).iva;
  expect(typeof iva, "el resumen de la caja no trae el campo `iva`").toBe("string");
  return iva as string;
}

function totalIvaDe(l: LecturaCaja459): unknown {
  return (l.composicion as unknown as ConTotalIva).totalIva;
}

/**
 * Escribe las filas como las escribe el feed del cierre al aprobar: una por concepto, todas con el
 * MISMO origen (`cierre_dia`, un id de cierre), que es lo que permite el unico
 * `(origen_tipo, origen_id, categoria)`. La empresa va explicita: la tx es la del dueno, sin la
 * extension que la pondria sola.
 */
async function sembrar(
  tx: TxDeTest,
  organizacionId: string,
  filas: readonly FilaDeCaja[],
): Promise<string[]> {
  const origenId = randomUUID();
  const ids: string[] = [];
  for (const f of filas) {
    const { id } = await tx.walletMovimiento.create({
      data: {
        organizacionId,
        tipo: f.tipo,
        categoria: f.categoria,
        monto: new Prisma.Decimal(f.monto),
        origenTipo: "cierre_dia",
        origenId,
        descripcion: "SL-39: ejemplo de IVA aparte",
      },
      select: { id: true },
    });
    ids.push(id);
  }
  return ids;
}

/**
 * Control de no vacuidad: las filas sembradas existen, con su empresa y su importe, leidas con el
 * cliente base (la tx del dueno, sin RLS). Sin esto, una siembra que no escribiera dejaria las
 * diferencias a cero y los «no se mueve» pasarian en verde sin medir nada.
 */
async function afirmarSembradas(
  tx: TxDeTest,
  ids: readonly string[],
  organizacionId: string,
  filas: readonly FilaDeCaja[],
): Promise<void> {
  const leidas = await tx.walletMovimiento.findMany({
    where: { id: { in: [...ids] } },
    select: { organizacionId: true, tipo: true, categoria: true, monto: true },
  });
  expect(
    leidas.map((f) => `${f.organizacionId}|${f.tipo}|${f.categoria}|${f.monto.toFixed(2)}`).sort(),
  ).toEqual(filas.map((f) => `${organizacionId}|${f.tipo}|${f.categoria}|${f.monto}`).sort());
}

/** La empresa que `enTransaccionRevertida459` creo y fijo para esta transaccion. */
async function empresaDelFixture(tx: TxDeTest): Promise<string> {
  const [fila] = await tx.$queryRawUnsafe<{ id: string | null }[]>(
    `SELECT current_setting('app.organizacion_id', true) AS id`,
  );
  if (fila?.id === undefined || fila.id === null || fila.id === "") {
    throw new Error("el fixture 459 no fijo `app.organizacion_id`");
  }
  return fila.id;
}

/**
 * Lee la caja como la ve UNA empresa: rol `servi_app` (sin BYPASSRLS) con la empresa fijada, dentro
 * de un SAVEPOINT. Deshacerlo devuelve el rol del dueno y la empresa del fixture, de modo que la
 * siguiente lectura o escritura no hereda el contexto de esta.
 */
async function leerComo(tx: TxDeTest, organizacionId: string): Promise<LecturaCaja459> {
  const punto = `sl39_${randomUUID().replace(/-/g, "")}`;
  await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
  try {
    await comoApp(tx, organizacionId);
    return await leerCajaEntera(montarServicios459(tx), MAESTRO);
  } finally {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
  }
}

/** R4: ganancia + IVA + capital + «De las tiendas», sumados con decimales exactos. */
function sumaR4(ganancia: string, iva: string, capital: string, deTerceros: string): string {
  return new Prisma.Decimal(ganancia).add(iva).add(capital).add(deTerceros).toFixed(2);
}

describeSiHayBase("SL-39/T0 — la ganancia de la caja sin IVA, y el IVA aparte (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R1/R2/R4/R5: con el ejemplo de design §1, la ganancia sube 1700.00 y el IVA 416.00, y la caja y «De la empresa» suben lo mismo que antes", async () => {
    const medido = await enTransaccionRevertida459(prisma, async (tx) => {
      const s = montarServicios459(tx);
      const organizacionId = await empresaDelFixture(tx);
      const antes = await leerCajaEntera(s, MAESTRO);
      const ids = await sembrar(tx, organizacionId, EJEMPLO_A);
      await afirmarSembradas(tx, ids, organizacionId, EJEMPLO_A);
      const despues = await leerCajaEntera(s, MAESTRO);
      return { antes, despues };
    });
    const { antes, despues } = medido;
    const delta = (campo: "entradas" | "salidas" | "enCaja" | "deEmpresa" | "deTerceros" | "capital" | "ganancia" | "ingresosPropios" | "egresosPropios") =>
      menos(despues.resumen[campo], antes.resumen[campo]);

    // R5 primero: lo que la ficha promete NO mover. Hoy ya se cumple, asi que el primer rojo del
    // archivo antes de T1 tiene que ser el de la ganancia y no uno de estos.
    // «Entro» es solo el efectivo: el contra-entrega. Los cuatro cargos (2500 + 325 + 700 + 91 =
    // 3616) no entran aparte: salen de el (ficha 459).
    expect(delta("entradas")).toBe("20000.00");
    expect(delta("salidas")).toBe("1500.00");
    expect(delta("enCaja")).toBe("18500.00"); // 20000 − 1500
    expect(delta("deEmpresa")).toBe("2116.00"); // ganancia 1700 + IVA 416 (R5: igual que hoy)
    expect(delta("deTerceros")).toBe("16384.00"); // 20000 − 3616: el IVA no es de la tienda
    expect(delta("capital")).toBe("0.00");

    // R1: la ganancia excluye el IVA. Hoy da 2116.00 (lo suma como ingreso propio).
    expect(delta("ganancia")).toBe("1700.00"); // (2500 + 700) − 1500
    // R3: los dos lados de la ganancia, sin IVA.
    expect(delta("ingresosPropios")).toBe("3200.00"); // 2500 + 700
    expect(delta("egresosPropios")).toBe("1500.00");

    // R2: el IVA, en su linea.
    expect(menos(ivaDe(despues), ivaDe(antes))).toBe("416.00"); // 325 + 91
    // La tarjeta de la composicion y el resumen hablan del mismo IVA (una lectura, dos derivaciones).
    expect(totalIvaDe(despues)).toBe(ivaDe(despues));

    // R4 sobre la diferencia: lo que suben ganancia, IVA, capital y «De las tiendas» es lo que sube
    // la cifra principal. El esperado es el literal de la caja, no otra suma de la derivacion.
    expect(
      sumaR4(
        delta("ganancia"),
        menos(ivaDe(despues), ivaDe(antes)),
        delta("capital"),
        delta("deTerceros"),
      ),
    ).toBe("18500.00"); // 1700 + 416 + 0 + 16384
  }, 180_000);

  it("R16: con IVA sembrado tambien en la empresa B, la caja de A solo cuenta el suyo y B ve el propio", async () => {
    const medido = await enTransaccionRevertida459(prisma, async (tx) => {
      const orgA = await empresaDelFixture(tx);
      const { id: orgB } = await crearOrganizacion(tx);

      const antesA = await leerComo(tx, orgA);
      const antesB = await leerComo(tx, orgB);
      const idsA = await sembrar(tx, orgA, EJEMPLO_A);
      const idsB = await sembrar(tx, orgB, EJEMPLO_B);
      await afirmarSembradas(tx, idsA, orgA, EJEMPLO_A);
      await afirmarSembradas(tx, idsB, orgB, EJEMPLO_B);
      const despuesA = await leerComo(tx, orgA);
      const despuesB = await leerComo(tx, orgB);
      return { antesA, antesB, despuesA, despuesB };
    });
    const { antesA, antesB, despuesA, despuesB } = medido;

    // Control: B si ve su propio dinero. Sin esto, una lectura que no viera nada (RLS mal fijada)
    // pasaria el «A no se mueve» por las razones equivocadas.
    // Solo el contra-entrega es efectivo: los cargos de B (40 + 5.20 + 1.30) salen de sus 500.
    expect(menos(despuesB.resumen.enCaja, antesB.resumen.enCaja)).toBe("500.00");
    // Y A ve exactamente su ejemplo: ni un centimo de B (con los 500 de B daria 19000.00).
    expect(menos(despuesA.resumen.enCaja, antesA.resumen.enCaja)).toBe("18500.00"); // 20000 − 1500

    expect(menos(despuesA.resumen.ganancia, antesA.resumen.ganancia)).toBe("1700.00");
    expect(menos(despuesB.resumen.ganancia, antesB.resumen.ganancia)).toBe("40.00"); // solo el flete

    expect(menos(ivaDe(despuesA), ivaDe(antesA))).toBe("416.00"); // 325 + 91, sin los 6.50 de B
    expect(menos(ivaDe(despuesB), ivaDe(antesB))).toBe("6.50"); // 5.20 + 1.30, sin los 416 de A
    expect(totalIvaDe(despuesA)).toBe(ivaDe(despuesA));
    expect(totalIvaDe(despuesB)).toBe(ivaDe(despuesB));
  }, 180_000);
});
