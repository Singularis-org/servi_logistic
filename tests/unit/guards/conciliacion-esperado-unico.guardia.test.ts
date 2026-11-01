import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

// SLT-76 · T4 · R6 — UNA SOLA FORMULA DEL ESPERADO.
//
// El ajuste de diferencia de la marca y de la correccion (`asentarDiferenciaSatelite`) y el «Falta por
// recibir» de `/wallet/satelites` y `/cierres-admin` calculan lo esperado de una consolidacion. Hasta
// SLT-76 el ajuste llamaba a `paraLaCentral(...)` a mano con los tres snapshots, y las pantallas a
// `esperadoDe`: dos expresiones que hoy coinciden y que un cambio en una sola separaria sin que nada se
// pusiera rojo. Esta guardia exige que el repositorio de la marca use `esperadoDe` y no reescriba la
// cascada. El valor literal (9.000 / 1.500 / 500 -> 7.000) lo prueba `slt73-marcar-asienta.int.test.ts`
// contra Postgres; esto solo cierra la puerta a la segunda copia.

const RAIZ = path.resolve(__dirname, "../../..");
const RUTA = "lib/repositories/CierresBodegaAdminRepository.ts";

/** Lo que falla de la regla en un codigo SIN comentarios. Vacio = cumple. */
export function incumplimientos(codigo: string): string[] {
  const fallos: string[] = [];
  if (/\bparaLaCentral\s*\(/.test(codigo)) fallos.push("llama a paraLaCentral( a mano");
  if (!/\besperadoDe\s*\(/.test(codigo)) fallos.push("no llama a esperadoDe(");
  return fallos;
}

describe("SLT-76 R6 — el detector se prueba a si mismo", () => {
  it("rojo con la llamada a mano de antes de SLT-76", () => {
    const antes = `const esperado = new Prisma.Decimal(
      paraLaCentral(c.totalGeneral.toFixed(2), c.totalPagoMensajero.toFixed(2), c.totalIngresoBodegaRechazos.toFixed(2)),
    );`;
    expect(incumplimientos(antes)).toEqual([
      "llama a paraLaCentral( a mano",
      "no llama a esperadoDe(",
    ]);
  });

  it("rojo si conviven las dos: la copia sigue ahi aunque se use la buena", () => {
    expect(incumplimientos("esperadoDe(c); paraLaCentral (a, b, c);")).toEqual([
      "llama a paraLaCentral( a mano",
    ]);
  });

  it("verde con la forma de SLT-76, y un comentario que nombre la funcion no cuenta", () => {
    const fuente = `// antes: paraLaCentral(general, pago, rechazos)
      const esperado = esperadoDe(consolidacion);`;
    expect(incumplimientos(quitarComentarios(fuente))).toEqual([]);
  });
});

describe("SLT-76 R6 — CierresBodegaAdminRepository usa la formula unica", () => {
  it("el codigo (sin comentarios) llama a esperadoDe( y no a paraLaCentral(", () => {
    const codigo = quitarComentarios(readFileSync(path.join(RAIZ, RUTA), "utf8"));
    expect(codigo.length).toBeGreaterThan(1000); // no vacuidad: se leyo el archivo de verdad
    expect(incumplimientos(codigo)).toEqual([]);
  });
});
