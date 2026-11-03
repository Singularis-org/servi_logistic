import { describe, it, expect } from "vitest";

import { codigoSinComentarios } from "../../fixtures/sin-comentarios";

/**
 * ⭑ FICHA 366 / T8 — «NO SE RE-TARIFA HACIA ATRAS», SOSTENIDO POR UNA RED Y NO POR LA MEMORIA.
 *
 * QUE PROTEGE. La 366 mete, por primera vez, una escritura sobre `orden` DENTRO del guardado de
 * la configuracion de una zona. La promesa que el humano aprobo es estrecha: se corrige `zona_id`
 * de una orden viva y elegible, y NADA MAS —ni un `cierre_detail`, ni una wallet, ni un pago de
 * mensajero, ni el resto de la orden—. Esa promesa es una AUSENCIA, y una ausencia no la rompe un
 * fallo ruidoso: la rompe una linea que alguien añada aqui dentro dos fichas mas tarde.
 *
 * POR QUE HACE FALTA ADEMAS DE LAS GUARDIAS QUE YA HAY. `cierre-detail-inmutable` (69/R10) ya
 * prohibe `cierreDetail.update/delete/...` en TODO `lib/`, y las guardias de caja acotan quien
 * escribe wallets. Lo que ninguna vigila es la OTRA mitad de la promesa: que el `UPDATE` de esta
 * ficha siga tocando UNA sola columna. `data: { zonaId, ... }` con un campo mas compila, pasa los
 * tests de dobles y se lleva por delante R9 en silencio.
 *
 * ⚠️ EL TIPO NO PUEDE SOSTENER ESTO. `ZonaPrismaClient` es un `Pick<PrismaClient, ...>` que NO
 * incluye `orden` ni `cierreDetail`, pero el `tx` que entrega `$transaction` es el cliente
 * COMPLETO: dentro del callback se puede escribir en cualquier tabla. Por eso la red es estatica.
 *
 * EL DETECTOR SE AUTO-PRUEBA: se ejerce sobre cuerpos MUTADOS EN MEMORIA, porque una guardia
 * estatica rota no falla, CALLA.
 */

const ARCHIVO = "lib/repositories/ZonaRepository.ts";

/** Las cinco escrituras que romperian una tabla de dinero. */
const MUTACIONES = ["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert"];

/** Los modelos de dinero que este camino NO puede tocar, pase lo que pase. */
const TABLAS_PROHIBIDAS = [
  "cierreDetail",
  "cierreDia",
  "cierreBodega",
  "walletMovimiento",
  "pagoMensajeroMovimiento",
  "liquidacionPago",
  "liquidacionReparto",
  "gestionOrden",
  "tarifa",
];

/** El bloque `{ … }` que empieza en `desde`, cerrado por llaves balanceadas. */
function bloqueBalanceado(codigo: string, desde: number): string | null {
  const abre = codigo.indexOf("{", desde);
  if (abre === -1) return null;
  let profundidad = 0;
  for (let i = abre; i < codigo.length; i++) {
    if (codigo[i] === "{") profundidad++;
    else if (codigo[i] === "}") {
      profundidad--;
      if (profundidad === 0) return codigo.slice(abre, i + 1);
    }
  }
  return null;
}

/** El cuerpo REAL de `async update(` en `ZonaRepository`. LANZA si no esta: no mide la nada. */
function cuerpoDeUpdate(): string {
  const codigo = codigoSinComentarios(ARCHIVO);
  const encontrado = /(?:^|\n)\s*async\s+update\s*\(/.exec(codigo);
  if (encontrado === null) {
    throw new Error(
      `no se encontro \`async update(\` en ${ARCHIVO}: o se renombro o se borro, y esta guardia ` +
        "estaria midiendo la nada",
    );
  }
  const cierreFirma = codigo.indexOf(")", encontrado.index + encontrado[0].length);
  const cuerpo = bloqueBalanceado(codigo, cierreFirma);
  if (cuerpo === null) throw new Error("el cuerpo de `update` no cierra: el recortador esta roto");
  return cuerpo;
}

/**
 * SLT-65 (design §6.1; decision humana 2026-11-03): la LECTURA de las ordenes elegibles salio de
 * `update` a `planificarReconciliacion`, que `update` llama y cuyo plan aplica. El cuerpo REAL de esa
 * funcion; LANZA si no esta, igual que `cuerpoDeUpdate`.
 */
function cuerpoDePlanificarReconciliacion(): string {
  const codigo = codigoSinComentarios(ARCHIVO);
  const encontrado = /(?:^|\n)\s*export\s+async\s+function\s+planificarReconciliacion\s*\(/.exec(codigo);
  if (encontrado === null) {
    throw new Error(
      `no se encontro \`async function planificarReconciliacion(\` en ${ARCHIVO}: o se renombro o ` +
        "se borro, y esta guardia estaria midiendo la nada",
    );
  }
  // La firma tiene un tipo de retorno (`Promise<…>`) entre `)` y `{`: se salta hasta el `{` del cuerpo.
  const cierreFirma = codigo.indexOf("): Promise<", encontrado.index + encontrado[0].length);
  if (cierreFirma === -1) throw new Error("la firma de `planificarReconciliacion` cambio: revisa el recortador");
  const finRetorno = codigo.indexOf(">", cierreFirma);
  const cuerpo = bloqueBalanceado(codigo, finRetorno);
  if (cuerpo === null) {
    throw new Error("el cuerpo de `planificarReconciliacion` no cierra: el recortador esta roto");
  }
  return cuerpo;
}

/** El plan SOLO LEE: ninguna escritura sobre ningun modelo. Vacio = cumple. */
export function escriturasDelPlan(cuerpo: string): string[] {
  const fallos: string[] = [];
  for (const op of MUTACIONES) {
    const m = new RegExp(`\\b(\\w+)\\s*\\.\\s*${op}\\s*\\(`, "g");
    for (const hallado of cuerpo.matchAll(m)) fallos.push(`escribe en \`${hallado[1]}.${op}()\``);
  }
  return fallos;
}

/** EL DETECTOR, en una funcion, para poder ejercerlo sobre cuerpos mutados. Vacio = cumple. */
export function fallosDeLaReconciliacion(cuerpo: string): string[] {
  const fallos: string[] = [];

  for (const tabla of TABLAS_PROHIBIDAS) {
    for (const op of MUTACIONES) {
      if (new RegExp(`\\b${tabla}\\s*\\.\\s*${op}\\s*\\(`).test(cuerpo)) {
        fallos.push(`escribe en \`${tabla}.${op}()\``);
      }
    }
  }

  // R9: el `data` del UPDATE de la orden lleva UNA sola clave, y es `zonaId`.
  const iUpdate = cuerpo.indexOf("orden.updateMany(");
  if (iUpdate === -1) {
    fallos.push("no contiene el `orden.updateMany(` de la reconciliacion");
  } else {
    const bloque = bloqueBalanceado(cuerpo, iUpdate) ?? "";
    const data = /data:\s*\{([^}]*)\}/.exec(bloque);
    if (data === null) fallos.push("el `updateMany` de la orden no tiene un `data` literal");
    else {
      const claves = data[1]
        .split(",")
        .map((p) => p.split(":")[0].trim())
        .filter((p) => p.length > 0);
      if (claves.join(",") !== "zonaId") {
        fallos.push(`el UPDATE de la orden toca ${claves.join(", ")} y solo puede tocar zonaId`);
      }
    }
  }

  return fallos;
}

describe("366/T8 — el detector se prueba a si mismo", () => {
  const SANO = `{
    return this.prisma.$transaction(async (tx) => {
      const elegibles = await tx.orden.findMany({ where: {} });
      await tx.orden.updateMany({ where: { id: { in: [] } }, data: { zonaId: z } });
      await appendAccion(tx, [], loteId);
    });
  }`;

  it("CONTRAPRUEBA: un cuerpo correcto NO produce fallos", () => {
    expect(fallosDeLaReconciliacion(SANO)).toEqual([]);
  });

  it("CONTRAPRUEBA (1/3): una escritura en una tabla de dinero se detecta", () => {
    const mutado = SANO.replace(
      "await appendAccion(tx, [], loteId);",
      "await tx.cierreDetail.updateMany({ where: {}, data: {} });",
    );
    expect(fallosDeLaReconciliacion(mutado)).toContain("escribe en `cierreDetail.updateMany()`");
  });

  it("CONTRAPRUEBA (2/3): una columna de mas en el UPDATE de la orden se detecta", () => {
    const mutado = SANO.replace("data: { zonaId: z }", "data: { zonaId: z, montoCobrar: 0 }");
    expect(fallosDeLaReconciliacion(mutado)).toEqual([
      "el UPDATE de la orden toca zonaId, montoCobrar y solo puede tocar zonaId",
    ]);
  });

  it("CONTRAPRUEBA (3/3): quitar el UPDATE entero se detecta", () => {
    const mutado = SANO.replace(/await tx\.orden\.updateMany\([\s\S]*?\}\);/, "");
    expect(fallosDeLaReconciliacion(mutado)).toContain(
      "no contiene el `orden.updateMany(` de la reconciliacion",
    );
  });

  it("CONTRAPRUEBA: pedir el metodo cuando no existe LANZA en vez de medir vacio", () => {
    // El recorte real se ejerce abajo; aqui se comprueba que el recortador no calla.
    expect(cuerpoDeUpdate().length).toBeGreaterThan(400);
    expect(cuerpoDePlanificarReconciliacion().length).toBeGreaterThan(400);
  });

  it("CONTRAPRUEBA (SLT-65): un plan que solo lee NO produce fallos; uno que escribe, si", () => {
    const PLAN_SANO = `{
      retenidas += await tx.orden.count({ where: base });
      const elegibles = await tx.orden.findMany({ where: base });
      if (elegibles.length > 0) porZona.set(zona, elegibles);
    }`;
    expect(escriturasDelPlan(PLAN_SANO)).toEqual([]);
    const mutado = PLAN_SANO.replace(
      "if (elegibles.length > 0)",
      "await tx.orden.updateMany({ where: base, data: { zonaId: zona } }); if (elegibles.length > 0)",
    );
    expect(escriturasDelPlan(mutado)).toEqual(["escribe en `orden.updateMany()`"]);
  });
});

describe("⭑ 366/R8/R9 — `ZonaRepository.update` no re-tarifa nada hacia atras", () => {
  it("no escribe en ninguna tabla de dinero y su UPDATE de la orden toca SOLO `zonaId`", () => {
    const cuerpo = cuerpoDeUpdate();
    // Anti-vacuidad: el recorte trae la reconciliacion entera, no un `{}`. SLT-65 (design §6.1): la
    // lectura de las elegibles vive en `planificarReconciliacion`; `update` la llama y aplica el plan.
    expect(cuerpo).toContain("appendAccion");
    expect(cuerpo).toContain("planificarReconciliacion(");
    const plan = cuerpoDePlanificarReconciliacion();
    expect(plan).toContain("orden.findMany(");
    expect(plan).toContain("orden.count(");

    expect(
      escriturasDelPlan(plan),
      "el plan solo LEE: las escrituras de la reconciliacion son las de `update`, y nada mas",
    ).toEqual([]);
    for (const tabla of TABLAS_PROHIBIDAS) expect(plan).not.toMatch(new RegExp(`\\b${tabla}\\b`));

    expect(
      fallosDeLaReconciliacion(cuerpo),
      "esta ficha corrige la zona de una orden y NADA MAS: un `cierre_detail` ya emitido, una " +
        "wallet o un pago de mensajero no se tocan, y el UPDATE no crece de columnas",
    ).toEqual([]);
  });
});
