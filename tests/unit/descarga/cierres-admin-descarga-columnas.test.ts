import { describe, it, expect } from "vitest";

import {
  COLUMNAS_DESCARGA_CIERRES_HISTORICO,
  COLUMNAS_DESCARGA_CIERRES_PENDIENTES,
  filaDescargaCierreHistorico,
  filaDescargaCierrePendiente,
} from "@/app/(app)/cierres-admin/_components/cierres-admin-descarga-columnas";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";

// Feature 189 — ORDEN y CENSO de las columnas de los archivos descargables de «Cierres del
// día» del admin (feature 170, T E.1 / R5).
//
// Por qué existe este archivo: hasta ahora lo único que fijaba estas columnas eran
// `toContain` de un encabezado suelto y aserciones sobre `filas[i].campo`, y las dos son
// INSENSIBLES AL ORDEN: reordenar o quitar una columna no ponía rojo ningún test, y lo que
// cambia es un archivo que un usuario descarga.
//
// Los valores esperados se escriben A MANO —nunca derivados de la propia constante, que
// sería una tautología que siempre pasa—. Los encabezados compartidos (`PAGO_MENSAJERO_COL`,
// `INGRESO_BODEGA_RECHAZOS_COL`) se fijan por su TEXTO: es el texto lo que llega al archivo.

describe("orden de las columnas de descarga de los cierres del día (admin)", () => {
  it("la COLA de pendientes declara sus columnas en el orden de la pantalla (R5)", () => {
    expect(COLUMNAS_DESCARGA_CIERRES_PENDIENTES.map((c) => c.clave)).toEqual([
      "estado",
      "mensajero",
      "fecha",
      "destino",
      "general",
      "pagoMensajero",
      "ingresoBodega",
    ]);
    expect(COLUMNAS_DESCARGA_CIERRES_PENDIENTES.map((c) => c.encabezado)).toEqual([
      "Estado",
      "Mensajero",
      "Fecha",
      "Destino",
      "Total general",
      "Pago mensajero",
      "Ingreso bodega",
    ]);
  });

  it("el HISTÓRICO de resueltos declara sus columnas en el orden de la pantalla (R5)", () => {
    expect(COLUMNAS_DESCARGA_CIERRES_HISTORICO.map((c) => c.clave)).toEqual([
      "estado",
      "mensajero",
      "fechaResuelta",
      "destino",
      "general",
      "pagoMensajero",
      "ingresoBodega",
      "motivo",
    ]);
    expect(COLUMNAS_DESCARGA_CIERRES_HISTORICO.map((c) => c.encabezado)).toEqual([
      "Estado",
      "Mensajero",
      "Fecha resuelta",
      "Destino",
      "Total general",
      "Pago mensajero",
      "Ingreso bodega",
      "Motivo",
    ]);
  });
});

// SLT-76 (R21) — el día de las descargas de cierres es el de COSTA RICA, no el UTC. El instante
// es las 23:03 del 31 de octubre en Costa Rica (05:03 del 1 de noviembre en UTC): recortar el ISO
// daba «2026-11-01». El esperado se escribe A MANO.
describe("SLT-76 (R21) — las fechas de la descarga de cierres del día son de Costa Rica", () => {
  const CIERRE: CierreAdminResumen = {
    cierreId: "c7621001",
    mensajeroId: "m1",
    mensajeroNombre: "Mensajero Prueba",
    estado: "aprobado",
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    destinoZonaNombre: "Zona Prueba",
    totales: { efectivo: "10.00", simpe: "0.00", transferencia: "0.00", general: "10.00" },
    totalPagoMensajero: "1.00",
    totalIngresoBodegaRechazos: "0.00",
    pendientePagoMensajero: null,
    solicitadoAt: "2026-11-01T05:03:00.000Z",
    resueltoAt: "2026-11-01T05:03:00.000Z",
    motivoRechazo: null,
  };

  it("«Fecha» de la cola y «Fecha resuelta» del histórico dan el día de Costa Rica", () => {
    expect(filaDescargaCierrePendiente(CIERRE).fecha).toBe("2026-10-31");
    expect(filaDescargaCierreHistorico(CIERRE).fechaResuelta).toBe("2026-10-31");
  });

  it("un cierre sin resolver sigue bajando «Fecha resuelta» vacía (null)", () => {
    expect(filaDescargaCierreHistorico({ ...CIERRE, resueltoAt: null }).fechaResuelta).toBeNull();
  });
});
