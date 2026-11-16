// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T1.3) — las dos cascadas del
// cierre de bodega, movidas SIN CAMBIAR NI UNA LÍNEA desde `CierresBodegaAdminModule.tsx`. Salen a
// un módulo propio porque ahora las lee también el detalle único (`components/private/cierres/`,
// R16): dos copias de la misma cascada es como dos superficies acaban diciendo cosas distintas de
// la misma cifra.

//
// SLT-172 «Limpieza tras el pago neto a la tienda: componentes de cierres sin uso» retiró de aquí
// `lineasCascadaDueno` («De quién es el dinero»): nadie la importaba desde que el detalle único
// sustituyó al modal. Solo queda la cascada «Lo que va a la central».
import {
  TOTAL_GENERAL_LABEL,
  PARA_LA_CENTRAL_LABEL,
  GANA_BODEGA_SATELITE_LABEL,
  PAGO_MENSAJERO_LABEL,
  PARA_LA_CENTRAL_NOTA,
  PARA_LA_CENTRAL_NOTA_MODELO_NUEVO,
  PARA_LA_CENTRAL_NEGATIVO_NOTA,
  EFECTIVO_NO_CUBRE_NOTA,
  GANA_BODEGA_SATELITE_NOTA,
  GANA_BODEGA_SATELITE_NOTA_MODELO_NUEVO,
  esMontoNegativo,
} from "./cierre-detalle-shared";
import type { LineaCascada } from "./CascadaDinero";

/**
 * Feature 393 (§4) — LAS LÍNEAS DE LA CASCADA «lo que va a la central», en un solo sitio.
 *
 * Es la cascada que la bodega satélite necesita para operar: de lo que se recaudó, cuánto le
 * entrega a la central. Los cuatro importes llegan YA DERIVADOS del servidor; aquí sólo se
 * eligen los rótulos, el orden y las notas. Ni una resta (R13).
 *
 * Vive en una función y no escrito dos veces porque el modal la monta una vez para el agregado
 * y otra por cada `cierre_dia`: dos copias es como dos superficies acaban diciendo cosas
 * distintas de la misma cifra (R23).
 */
export function lineasCascadaCentral(
  nivel: {
    general: string;
    totalPagoMensajero: string;
    totalIngresoBodegaRechazos: string;
    paraLaCentral: string;
    efectivoCubreDescuentos: boolean;
  },
  modeloNuevo: boolean,
): LineaCascada[] {
  // R26/R36/R37: la nota fija dice de qué resta sale; las dos condicionales, qué pasa cuando el
  // número no es tranquilo. Van SUELTAS y no unidas en un párrafo: cada una está o no está, y
  // fundirlas dejaría sin poder distinguir cuál se puso.
  const notas = [modeloNuevo ? PARA_LA_CENTRAL_NOTA_MODELO_NUEVO : PARA_LA_CENTRAL_NOTA];
  if (esMontoNegativo(nivel.paraLaCentral)) notas.push(PARA_LA_CENTRAL_NEGATIVO_NOTA);
  if (!nivel.efectivoCubreDescuentos) notas.push(EFECTIVO_NO_CUBRE_NOTA);

  return [
    // D5: la primera línea reusa el rótulo del total que YA está en esta pantalla («Total
    // general», el del panel de arriba). Estrenar un «Lo recaudado» sería dar dos nombres a la
    // misma cifra en la misma superficie, que es el defecto que esta ficha viene a arreglar.
    { label: TOTAL_GENERAL_LABEL, monto: nivel.general, signo: "neutro" },
    { label: PAGO_MENSAJERO_LABEL, monto: nivel.totalPagoMensajero, signo: "resta" },
    {
      label: GANA_BODEGA_SATELITE_LABEL,
      monto: nivel.totalIngresoBodegaRechazos,
      signo: "resta",
      notas: [modeloNuevo ? GANA_BODEGA_SATELITE_NOTA_MODELO_NUEVO : GANA_BODEGA_SATELITE_NOTA],
    },
    {
      label: PARA_LA_CENTRAL_LABEL,
      monto: nivel.paraLaCentral,
      signo: "neutro",
      destacado: true,
      notas,
    },
  ];
}
