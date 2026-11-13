import { describe, it, expect } from "vitest";

import {
  COLUMNAS_DESCARGA_DIA_CIERRES_PASADOS,
  filaDescargaDiaCierrePasado,
} from "@/app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas";
import type { CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";

// Feature 189 — ORDEN y CENSO de las columnas de los archivos descargables del «Cierre del
// día» del MENSAJERO (feature 170, T E.4 / R5).
//
// SLT-115 «Retirar los componentes de cierre sustituidos» (R404, R406): aquí vivían también los
// casos de las cinco secciones por resultado (entregadas, reprogramadas, devueltas, rechazadas,
// incidentes): orden de columnas, celda «Método» (feature 213), motivo del cron (FICHA 408) y
// «Tiene evidencia» (FICHA 486). SLT-109 dejó esos catálogos sin consumidor y SLT-115 los retiró;
// lo que miden vive hoy en la descarga de «Gestiones» del detalle único. Queda el histórico de
// cierres solicitados, cuyo esperado literal NO cambia (R406).
//
// «Total» y no «Total general», y «Ganancia» y no «Pago mensajero»: esta pantalla es la del
// MENSAJERO y usa sus palabras. El esperado se escribe a mano con el texto que de verdad
// llega al archivo, no leyendo la constante.

describe("orden de las columnas de descarga del cierre del día (mensajero)", () => {
  it("el histórico de CIERRES PASADOS declara sus columnas en el orden de la pantalla (R5)", () => {
    expect(COLUMNAS_DESCARGA_DIA_CIERRES_PASADOS.map((c) => c.clave)).toEqual([
      "estado",
      "destino",
      "efectivo",
      "simpe",
      "transferencia",
      "general",
      "ganancia",
      "fecha",
    ]);
    expect(COLUMNAS_DESCARGA_DIA_CIERRES_PASADOS.map((c) => c.encabezado)).toEqual([
      "Estado",
      "Destino",
      "Efectivo",
      "SINPE",
      "Transferencia",
      "Total",
      "Ganancia",
      "Fecha",
    ]);
  });


  it("el histórico NO lleva «Fecha de gestión»: su grano es el CIERRE y ya lleva su «Fecha»", () => {
    expect(COLUMNAS_DESCARGA_DIA_CIERRES_PASADOS.map((c) => c.clave)).not.toContain(
      "fechaGestion",
    );
  });
});


// SLT-76 (R21) — el día de las descargas de cierres es el de COSTA RICA, no el UTC. El instante
// es las 23:03 del 31 de octubre en Costa Rica (05:03 del 1 de noviembre en UTC): recortar el ISO
// daba «2026-11-01». El esperado se escribe A MANO.
describe("SLT-76 (R21) — la fecha del histórico de cierres del mensajero es de Costa Rica", () => {
  it("«Fecha» de un cierre pasado da el día de Costa Rica", () => {
    const cierre: CierrePasadoDTO = {
      cierreId: "c7621002",
      estado: "aprobado",
      destinoTipo: "bodega_central",
      destinoZonaId: "z1",
      totales: { efectivo: "10.00", simpe: "0.00", transferencia: "0.00", general: "10.00" },
      totalPagoMensajero: "1.00",
      totalIngresoBodegaRechazos: "0.00",
      solicitadoAt: "2026-11-01T05:03:00.000Z",
    };
    expect(filaDescargaDiaCierrePasado(cierre).fecha).toBe("2026-10-31");
  });
});
