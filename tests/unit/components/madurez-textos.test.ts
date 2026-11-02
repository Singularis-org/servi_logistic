import { describe, it, expect } from "vitest";

import {
  fraseSobreCerradas,
  titularDelHeroe,
} from "@/app/(app)/analitica/_components/entregas/madurez-textos";
import { evaluarMadurezDeCohorte } from "@/lib/analytics/madurez-cohorte";

// SLT-62 (2026-10-30, decisión del humano) — R6: la tarjeta héroe NO escribe ningún aviso de base
// pequeña, con ningún tamaño de cohorte. El porcentaje va «siempre y limpio».
//
// Barrido de todos los repartos con `cargadas ∈ [1, 25]` y al menos un desenlace: el rango cubre
// entero el tramo que tapaba el suelo de 20 (bases de 1 a 19) y unas cuantas por encima.
//
// La expresión prohibida recoge las cuatro redacciones que hubo («…hacen falta 20 para que este
// porcentaje no baile solo», «Son muy pocas para un porcentaje…», «una sola orden movería la
// cifra…») y el titular sustituto «Entregado: 4 de 12 órdenes», que ocupaba el hueco de la cifra.
// Es un literal escrito a mano y no sale del módulo que se prueba.
const AVISO_BASE_CHICA = /hacen falta|baile|muy pocas|mover[íi]a|\d+ de \d+ órdenes$/i;

/** Todos los repartos válidos con `cargadas ∈ [1, 25]` y `cerradas ≥ 1`. */
function* repartosConDesenlace() {
  for (let cargadas = 1; cargadas <= 25; cargadas++) {
    for (let vivas = 0; vivas < cargadas; vivas++) {
      for (let entregadas = 0; entregadas <= cargadas - vivas; entregadas++) {
        yield { total: cargadas, entregadas, enProceso: vivas };
      }
    }
  }
}

describe("SLT-62 · R6 · ningún aviso de base pequeña en la tarjeta héroe", () => {
  // ANTI-VACÍO: Σ_{c=1..25} Σ_{k=1..c} (k+1) = Σ_{c=1..25} c(c+3)/2 = 3250.
  it("el barrido recorre los 3250 repartos con al menos un desenlace", () => {
    expect([...repartosConDesenlace()].length).toBe(3250);
  });

  it("con al menos un desenlace hay cifra arriba, línea abajo y ningún aviso", () => {
    const fallos: string[] = [];
    for (const reparto of repartosConDesenlace()) {
      const madurez = evaluarMadurezDeCohorte(reparto);
      const titular = titularDelHeroe(madurez);
      const frase = fraseSobreCerradas(madurez.sobreCerradas);
      const caso = `${reparto.total}/${reparto.entregadas}/${reparto.enProceso}`;

      if (titular.porcentaje === null) fallos.push(`${caso}: el héroe se calló la cifra`);
      if (frase === null) fallos.push(`${caso}: no se pintó la línea de abajo`);
      for (const texto of [titular.titular, titular.detalle, frase]) {
        if (texto !== null && AVISO_BASE_CHICA.test(texto)) {
          fallos.push(`${caso}: «${texto}»`);
        }
      }
    }

    expect(fallos.slice(0, 10), `${fallos.length} fallos`).toEqual([]);
  });
});
