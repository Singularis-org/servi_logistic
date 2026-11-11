import { describe, expect, it } from "vitest";

import { fechaCalendarioPlataforma, fechaDeEfectoPorDefecto } from "@/lib/planes/ciclo";
import { TIPOS_COBRO, type TipoCobro } from "@/lib/types/planes";

// SLT-99 (R10, design §3 paso 2, P2) — el corte del cambio de plan del maestro es el inicio del próximo
// período de cobro de la empresa: `fechaDeEfectoPorDefecto(tipoVigente, ahora)` de SLT-86, sin función nueva.
// Este archivo fija ese contrato para el maestro: si la función cambia, el corte de «Mi plan» cambia con ella.

/** El instante de `fecha` a `hora` en la hora de la plataforma (−06:00, sin horario de verano). */
function plataforma(fecha: string, hora = "00:00:00.000"): Date {
  return new Date(`${fecha}T${hora}-06:00`);
}

const ULTIMO_INSTANTE = "23:59:59.999";

type Caso = { ahora: Date; corte: string; nombre: string };

const CASOS: Record<TipoCobro, Caso[]> = {
  quincenal: [
    { nombre: "el 1 a las 00:00 → el 16", ahora: plataforma("2026-03-01"), corte: "2026-03-16" },
    { nombre: "el 15 a las 23:59:59.999 → el 16", ahora: plataforma("2026-03-15", ULTIMO_INSTANTE), corte: "2026-03-16" },
    { nombre: "el 16 a las 00:00 → el 1 del mes siguiente", ahora: plataforma("2026-03-16"), corte: "2026-04-01" },
    { nombre: "el 31 de diciembre → el 1 de enero", ahora: plataforma("2026-12-31", "12:00:00.000"), corte: "2027-01-01" },
    { nombre: "el 28 de febrero (año de 28) → el 1 de marzo", ahora: plataforma("2027-02-28", ULTIMO_INSTANTE), corte: "2027-03-01" },
  ],
  mensual: [
    { nombre: "el 1 a las 00:00 → el 1 del mes siguiente", ahora: plataforma("2026-05-01"), corte: "2026-06-01" },
    { nombre: "el 31 de enero → el 1 de febrero", ahora: plataforma("2027-01-31", ULTIMO_INSTANTE), corte: "2027-02-01" },
    { nombre: "el 28 de febrero (año de 28) → el 1 de marzo", ahora: plataforma("2027-02-28", "08:00:00.000"), corte: "2027-03-01" },
    { nombre: "el 29 de febrero (año de 29) → el 1 de marzo", ahora: plataforma("2028-02-29", ULTIMO_INSTANTE), corte: "2028-03-01" },
    { nombre: "el 31 de diciembre → el 1 de enero", ahora: plataforma("2026-12-31", ULTIMO_INSTANTE), corte: "2027-01-01" },
  ],
  bimestral: [
    { nombre: "el 1 de enero a las 00:00 → el 1 de marzo", ahora: plataforma("2027-01-01"), corte: "2027-03-01" },
    { nombre: "el 29 de febrero → el 1 de marzo", ahora: plataforma("2028-02-29", ULTIMO_INSTANTE), corte: "2028-03-01" },
    { nombre: "el 1 de marzo a las 00:00 → el 1 de mayo", ahora: plataforma("2027-03-01"), corte: "2027-05-01" },
    { nombre: "el 30 de noviembre → el 1 de enero siguiente", ahora: plataforma("2026-11-30", "10:00:00.000"), corte: "2027-01-01" },
    { nombre: "el 31 de diciembre → el 1 de enero siguiente", ahora: plataforma("2026-12-31", ULTIMO_INSTANTE), corte: "2027-01-01" },
  ],
  anual: [
    { nombre: "el 1 de enero a las 00:00 → el 1 de enero siguiente", ahora: plataforma("2027-01-01"), corte: "2028-01-01" },
    { nombre: "el 31 de diciembre a las 23:59:59.999 → el 1 de enero siguiente", ahora: plataforma("2026-12-31", ULTIMO_INSTANTE), corte: "2027-01-01" },
    { nombre: "en febrero espera al 1 de enero siguiente", ahora: plataforma("2027-02-10"), corte: "2028-01-01" },
  ],
};

describe("R10 — el corte del maestro es el inicio del próximo período de cobro de la empresa", () => {
  for (const tipo of TIPOS_COBRO) {
    describe(tipo, () => {
      for (const caso of CASOS[tipo]) {
        it(caso.nombre, () => {
          expect(fechaDeEfectoPorDefecto(tipo, caso.ahora)).toBe(caso.corte);
        });
      }
    });
  }

  it("cuenta el 30 de noviembre a las 23:59 de la plataforma como noviembre aunque en UTC ya sea 1 de diciembre", () => {
    const ahora = plataforma("2026-11-30", "23:59:00.000");
    expect(ahora.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(fechaDeEfectoPorDefecto("mensual", ahora)).toBe("2026-12-01");
    expect(fechaDeEfectoPorDefecto("quincenal", ahora)).toBe("2026-12-01");
    expect(fechaDeEfectoPorDefecto("bimestral", ahora)).toBe("2027-01-01");
    expect(fechaDeEfectoPorDefecto("anual", ahora)).toBe("2027-01-01");
  });

  it("nunca devuelve el día de hoy, ni a las 00:00 del inicio de un período", () => {
    const inicios = ["2026-01-01", "2026-01-16", "2026-03-01", "2026-07-01", "2026-11-16", "2027-01-01"];
    for (const tipo of TIPOS_COBRO) {
      for (const dia of inicios) {
        for (const hora of ["00:00:00.000", ULTIMO_INSTANTE]) {
          const ahora = plataforma(dia, hora);
          const corte = fechaDeEfectoPorDefecto(tipo, ahora);
          expect(corte > fechaCalendarioPlataforma(ahora), `${tipo} ${dia} ${hora}`).toBe(true);
        }
      }
    }
  });
});
