// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T1.3) — las dos cascadas del
// cierre de bodega, movidas SIN CAMBIAR NI UNA LÍNEA desde `CierresBodegaAdminModule.tsx`. Salen a
// un módulo propio porque ahora las lee también el detalle único (`components/private/cierres/`,
// R16): dos copias de la misma cascada es como dos superficies acaban diciendo cosas distintas de
// la misma cifra.

import type { TotalesIngresoEmpresa } from "@/lib/interfaces/services/ICierreDiaService";
import {
  TOTAL_GENERAL_LABEL,
  PARA_LA_CENTRAL_LABEL,
  PARA_LA_TIENDA_LABEL,
  NETO_EMPRESA_LABEL,
  COBRADO_SOBRE_RECAUDADO_LABEL,
  FACTURADO_EMPRESA_LABEL,
  GANA_BODEGA_SATELITE_LABEL,
  PAGO_MENSAJERO_LABEL,
  FLETE_CON_IVA_LABEL,
  COMISION_CON_IVA_LABEL,
  FLETE_DEV_CON_IVA_LABEL,
  FLETE_NO_ENTREGADAS_CON_IVA_LABEL,
  FLETE_NO_ENTREGADAS_NOTA,
  PARA_LA_CENTRAL_NOTA,
  PARA_LA_CENTRAL_NOTA_MODELO_NUEVO,
  PARA_LA_CENTRAL_NEGATIVO_NOTA,
  EFECTIVO_NO_CUBRE_NOTA,
  GANA_BODEGA_SATELITE_NOTA,
  GANA_BODEGA_SATELITE_NOTA_MODELO_NUEVO,
  FLETE_RECHAZO_NO_DEDUCIBLE_NOTA,
  IVA_FACTURADO_LABEL,
  IVA_FACTURADO_NOTA,
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

/**
 * Feature 393 (§3) — LAS LÍNEAS DE LA CASCADA «de quién es el dinero».
 *
 * Sólo en el detalle, que sólo abre el maestro (R39): la satélite ve lo suyo y nadie ve un
 * margen que no le toca.
 *
 * La LÍNEA PUENTE («Cobrado sobre lo recaudado») no es decorativa y va SIEMPRE, también con el
 * flete por rechazo en cero (R10): ese cobro se le factura a la tienda pero NO sale de lo
 * recaudado —un rechazo no cobra contra entrega—, así que sin ella la pantalla enseñaría
 * «recaudado − facturado = para la tienda», que no da en cuanto hay un rechazo.
 *
 * 💰 Ficha 396 (R1) — «PARA LA TIENDA» AQUÍ TAMBIÉN ERA LA SUMA DE VARIAS, y en el cierre de
 * bodega es el peor de los tres casos: agrega N mensajeros × M tiendas en un solo número. Ni un
 * importe cambia de valor (R18); lo que se añade es la NOTA que dice que es un total y de
 * cuántas tiendas, y el desglose que va debajo de la cascada. **No es un arreglo de dinero:** la
 * wallet reparte por tienda desde siempre y a nadie se le paga mal.
 */
export function lineasCascadaDueno(
  nivel: {
    general: string;
    totalesIngreso: TotalesIngresoEmpresa;
    totalPagoMensajero: string;
    totalIngresoBodegaRechazos: string;
    pagoTienda: string;
    cobradoSobreRecaudado: string;
    // SL-39 (R21) — derivado en el servidor; la cascada sólo lo pinta (R24).
    ivaFacturado: string;
    netoEmpresa: string;
  },
  // Ficha 396 (R1) — LA MARCA de este nivel, o `null` si sus gestiones son de una sola tienda.
  // Sale de `marcaDeVariasTiendas`, la MISMA funcion que decide si se pinta el desglose: las dos
  // cosas aparecen y desaparecen juntas, y ninguna de las dos se decide aqui.
  marcaDeVariasTiendasDelNivel: string | null,
  // SLT-54 (R65): alguna gestión del nivel es del modelo nuevo.
  modeloNuevo: boolean,
): LineaCascada[] {
  // ⚠️ LA MARCA VA EN «Para la tienda» Y NO EN OTRA LINEA, y es la unica de esta cascada que la
  // lleva: es la que nombra a «la tienda» EN SINGULAR y por tanto la unica que, sola, se lee como
  // si fuera de una. «Total general» tambien se parte por tienda, pero su rotulo no promete una.
  const notasDelPago = marcaDeVariasTiendasDelNivel === null ? [] : [marcaDeVariasTiendasDelNivel];

  return [
    { label: TOTAL_GENERAL_LABEL, monto: nivel.general, signo: "neutro" },
    { label: FLETE_CON_IVA_LABEL, monto: nivel.totalesIngreso.fleteConIva, signo: "resta" },
    {
      label: COMISION_CON_IVA_LABEL,
      monto: nivel.totalesIngreso.comisionConIva,
      signo: "resta",
    },
    {
      label: PARA_LA_TIENDA_LABEL,
      monto: nivel.pagoTienda,
      signo: "neutro",
      destacado: true,
      notas: notasDelPago,
    },
    // La línea puente: lo mismo que se acaba de restar, ahora leído como lo que la empresa cobró.
    {
      label: COBRADO_SOBRE_RECAUDADO_LABEL,
      monto: nivel.cobradoSobreRecaudado,
      signo: "neutro",
    },
    {
      label: modeloNuevo ? FLETE_NO_ENTREGADAS_CON_IVA_LABEL : FLETE_DEV_CON_IVA_LABEL,
      monto: nivel.totalesIngreso.fleteDevolucionConIva,
      signo: "suma",
      notas: [modeloNuevo ? FLETE_NO_ENTREGADAS_NOTA : FLETE_RECHAZO_NO_DEDUCIBLE_NOTA],
    },
    { label: FACTURADO_EMPRESA_LABEL, monto: nivel.totalesIngreso.total, signo: "neutro" },
    // SL-39 (R24) — el IVA va JUSTO después de lo facturado: no es de la empresa.
    {
      label: IVA_FACTURADO_LABEL,
      monto: nivel.ivaFacturado,
      signo: "resta",
      notas: [IVA_FACTURADO_NOTA],
    },
    { label: PAGO_MENSAJERO_LABEL, monto: nivel.totalPagoMensajero, signo: "resta" },
    {
      label: GANA_BODEGA_SATELITE_LABEL,
      monto: nivel.totalIngresoBodegaRechazos,
      signo: "resta",
      notas: [modeloNuevo ? GANA_BODEGA_SATELITE_NOTA_MODELO_NUEVO : GANA_BODEGA_SATELITE_NOTA],
    },
    { label: NETO_EMPRESA_LABEL, monto: nivel.netoEmpresa, signo: "neutro", destacado: true },
  ];
}
