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
 * ⚠️ EL TIPO NO PUEDE SOSTENER ESTO. El `tx` que entrega `$transaction` es el cliente COMPLETO:
 * dentro del callback se puede escribir en cualquier tabla. Por eso la red es estatica.
 *
 * SLT-224 (design §2.3): la reconciliacion se movio de `ZonaRepository.update` a un helper
 * compartido por TRES llamadores (el guardado de zona, la recepcion en la central y el boton
 * «Actualizar zonas»). El detector se aplica al cuerpo del helper, y dos aserciones mas vigilan que
 * los tres lo usen y que ninguno repita el corte ni la accion (R1706).
 *
 * EL DETECTOR SE AUTO-PRUEBA: se ejerce sobre cuerpos MUTADOS EN MEMORIA, porque una guardia
 * estatica rota no falla, CALLA.
 */

const HELPER = "lib/repositories/_shared/reconciliar-zona-ordenes.ts";

/** Los tres llamadores del helper: archivo y metodo (R1706). */
const LLAMADORES = [
  { archivo: "lib/repositories/ZonaRepository.ts", metodo: "update" },
  { archivo: "lib/repositories/OrdenRepository.ts", metodo: "recibirEnBodegaCentral" },
  { archivo: "lib/repositories/ActualizacionZonasRepository.ts", metodo: "actualizar" },
] as const;

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

/**
 * El cuerpo REAL de `nombre` en `archivo`: metodo (`async nombre(`) o funcion exportada
 * (`export async function nombre(`). LANZA si no esta: no mide la nada.
 */
function cuerpoDe(archivo: string, nombre: string): string {
  const codigo = codigoSinComentarios(archivo);
  const declaracion = new RegExp(
    `(?:^|\\n)\\s*(?:export\\s+)?async\\s+(?:function\\s+)?${nombre}\\s*\\(`,
  );
  const encontrado = declaracion.exec(codigo);
  if (encontrado === null) {
    throw new Error(
      `no se encontro \`async ${nombre}(\` en ${archivo}: o se renombro o se borro, y esta guardia ` +
        "estaria midiendo la nada",
    );
  }
  const cierreFirma = codigo.indexOf(")", encontrado.index + encontrado[0].length);
  const cuerpo = bloqueBalanceado(codigo, cierreFirma);
  if (cuerpo === null) throw new Error(`el cuerpo de \`${nombre}\` no cierra: el recortador esta roto`);
  return cuerpo;
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

/**
 * SLT-224/R1706 — EL DETECTOR DE LOS LLAMADORES. Un llamador usa el helper y no repite ni el corte
 * de dinero (`cierreDetalles: { none`) ni la accion (`"orden_zona_reconciliada"`). Vacio = cumple.
 *
 * Se mira el CUERPO del metodo llamador y no el archivo entero: `ZonaRepository` tiene otro
 * `cierreDetalles: { none` legitimo en `contarOrdenesVivasPorZona` (376/Q4), que cuenta ordenes
 * y no reconcilia nada. La accion, en cambio, se vigila tambien a nivel de archivo (abajo).
 */
export function fallosDelLlamador(cuerpo: string): string[] {
  const fallos: string[] = [];
  if (!/\breconciliarZonaDeOrdenes\s*\(/.test(cuerpo)) {
    fallos.push("no llama a `reconciliarZonaDeOrdenes(`");
  }
  if (/cierreDetalles:\s*\{\s*none/.test(cuerpo)) {
    fallos.push("repite el corte `cierreDetalles: { none`");
  }
  if (cuerpo.includes('"orden_zona_reconciliada"')) {
    fallos.push("registra `orden_zona_reconciliada` por su cuenta");
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

  it("CONTRAPRUEBA: pedir una funcion que no existe LANZA en vez de medir vacio", () => {
    expect(cuerpoDe(HELPER, "reconciliarZonaDeOrdenes").length).toBeGreaterThan(400);
    expect(() => cuerpoDe(HELPER, "funcionQueNoExiste")).toThrow(/no se encontro/);
  });
});

describe("SLT-224/R1706 — el detector de los llamadores se prueba a si mismo", () => {
  const SANO = `{
    return this.prisma.$transaction(async (tx) => {
      await tx.orden.updateMany({ where: {}, data: {} });
      await reconciliarZonaDeOrdenes(tx, { distritoIds: [d] }, actor);
    });
  }`;

  it("CONTRAPRUEBA: un llamador correcto NO produce fallos", () => {
    expect(fallosDelLlamador(SANO)).toEqual([]);
  });

  it("CONTRAPRUEBA: un llamador que no usa el helper se detecta", () => {
    const mutado = SANO.replace("await reconciliarZonaDeOrdenes(tx, { distritoIds: [d] }, actor);", "");
    expect(fallosDelLlamador(mutado)).toEqual(["no llama a `reconciliarZonaDeOrdenes(`"]);
  });

  it("CONTRAPRUEBA: un llamador que repite el corte se detecta", () => {
    const mutado = SANO.replace("where: {}", "where: { cierreDetalles: { none: {} } }");
    expect(fallosDelLlamador(mutado)).toEqual(["repite el corte `cierreDetalles: { none`"]);
  });

  it("CONTRAPRUEBA: un llamador que registra la accion por su cuenta se detecta", () => {
    const mutado = SANO.replace("data: {}", 'data: {}, accion: "orden_zona_reconciliada"');
    expect(fallosDelLlamador(mutado)).toEqual(["registra `orden_zona_reconciliada` por su cuenta"]);
  });
});

describe("⭑ 366/R8/R9 + SLT-224/R1707 — la reconciliacion no re-tarifa nada hacia atras", () => {
  it("el helper no escribe en ninguna tabla de dinero y su UPDATE de la orden toca SOLO `zonaId`", () => {
    const cuerpo = cuerpoDe(HELPER, "reconciliarZonaDeOrdenes");
    // Anti-vacuidad: el recorte trae la reconciliacion entera, no un `{}`.
    expect(cuerpo).toContain("appendAccion");
    expect(cuerpo).toContain("orden.findMany(");

    expect(
      fallosDeLaReconciliacion(cuerpo),
      "esta regla corrige la zona de una orden y NADA MAS: un `cierre_detail` ya emitido, una " +
        "wallet o un pago de mensajero no se tocan, y el UPDATE no crece de columnas",
    ).toEqual([]);
  });
});

describe("⭑ SLT-224/R1706 — una sola implementacion de la regla", () => {
  it.each(LLAMADORES)(
    "$archivo#$metodo usa el helper y no repite el corte ni la accion",
    ({ archivo, metodo }) => {
      expect(fallosDelLlamador(cuerpoDe(archivo, metodo))).toEqual([]);
    },
  );

  it("ningun archivo llamador registra `orden_zona_reconciliada` fuera del helper", () => {
    for (const { archivo } of LLAMADORES) {
      expect(codigoSinComentarios(archivo), archivo).not.toContain('"orden_zona_reconciliada"');
    }
  });
});
