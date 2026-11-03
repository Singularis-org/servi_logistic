import { describe, it, expect } from "vitest";

import {
  avisoPeriodoEnCurso,
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

// SLT-62, tanda 2 (decisión del humano, 2026-11-02) — CONCORDANCIA EN NÚMERO. Al quitar el suelo
// de 20, el héroe pasó a escribir sus frases con 1 orden, y salían «de las 1 orden que entraron» y
// «100% de las 1 orden con desenlace terminaron en Entregado»: el sustantivo ya concordaba
// (`contarOrdenes`), pero el artículo y el verbo eran plurales fijos. Cada frase se fija con n = 1 y
// con n > 1; los literales están escritos a mano y no salen del módulo que se prueba.
describe("SLT-62 · tanda 2 · las frases del héroe concuerdan con una sola orden", () => {
  it("el detalle del titular: «de la 1 orden que entró»", () => {
    const una = titularDelHeroe(evaluarMadurezDeCohorte({ total: 1, entregadas: 1, enProceso: 0 }));
    expect(una.detalle).toBe("de la 1 orden que entró");
  });

  it("el detalle del titular, en plural: «de las 12 órdenes que entraron»", () => {
    const doce = titularDelHeroe(evaluarMadurezDeCohorte({ total: 12, entregadas: 8, enProceso: 1 }));
    expect(doce.detalle).toBe("de las 12 órdenes que entraron");
  });

  it("la línea sobre las que tienen desenlace: «… de la 1 orden con desenlace terminó en Entregado»", () => {
    expect(fraseSobreCerradas({ valor: 1, base: 1, motivo: null })).toBe(
      "100% de la 1 orden con desenlace terminó en Entregado",
    );
  });

  it("la línea sobre las que tienen desenlace, en plural", () => {
    expect(fraseSobreCerradas({ valor: 8 / 11, base: 11, motivo: null })).toBe(
      "72,7% de las 11 órdenes con desenlace terminaron en Entregado",
    );
  });

  it("el aviso de período abierto con UNA viva de UNA cargada: «1 de su 1 orden sigue viva»", () => {
    const madurez = evaluarMadurezDeCohorte({ total: 1, entregadas: 0, enProceso: 1 });
    expect(avisoPeriodoEnCurso(madurez)).toBe(
      "Este período todavía se está cerrando. 1 de su 1 orden sigue viva, así que la efectividad va a subir.",
    );
  });

  it("el aviso de período abierto con UNA viva de varias: «1 de sus 12 órdenes sigue viva»", () => {
    const madurez = evaluarMadurezDeCohorte({ total: 12, entregadas: 8, enProceso: 1 });
    expect(avisoPeriodoEnCurso(madurez)).toBe(
      "Este período todavía se está cerrando. 1 de sus 12 órdenes sigue viva, así que la efectividad va a subir.",
    );
  });

  it("el aviso de período abierto en plural: «3 de sus 12 órdenes siguen vivas»", () => {
    const madurez = evaluarMadurezDeCohorte({ total: 12, entregadas: 8, enProceso: 3 });
    expect(avisoPeriodoEnCurso(madurez)).toBe(
      "Este período todavía se está cerrando. 3 de sus 12 órdenes siguen vivas, así que la efectividad va a subir.",
    );
  });
});
