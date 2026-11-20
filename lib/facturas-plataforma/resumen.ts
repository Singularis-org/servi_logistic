import { FACTURAS_TEXTOS, sumaDeCuotas } from "@/components/shared/facturas/facturas-vista";
import { MARCA_FACTURA } from "@/lib/config/marca";
import { MONEDA_DE_LOS_PLANES } from "@/lib/config/moneda";
import { aCentimos, aCentimosConSigno, aTexto } from "@/lib/planes/centimos";
import { fechaCalendarioPlataforma } from "@/lib/planes/ciclo";
import type { DatosDescargaFactura, TipoLineaFactura } from "@/lib/types/factura-plataforma";

// SLT-136 (design §3) — el resumen de la descarga de una factura cerrada, sin React y sin E/S. Lo comparten la factura,
// el anexo y sus pruebas. Los importes son los de la base (R9, R10); lo único que se suma aquí es el importe de
// cada día del desglose (R11), en céntimos exactos, y esa suma se contrasta con los totales de la base (R15).

/** Todos los literales de la factura y del anexo en PDF, en un sitio para cuando llegue la i18n. */
export const FACTURA_DESCARGA_TEXTOS = {
  emisor: MARCA_FACTURA.emisor,
  titulo: "FACTURA DE PLATAFORMA",
  numero: (n: number) => `Factura N.º ${n}`,
  cliente: (empresa: string) => `Cliente: ${empresa}`,
  /** R8: el PDF las pinta en versalitas. */
  tarjetas: {
    cliente: "Cliente",
    estado: "Estado",
    periodo: "Período facturado",
    emision: "Fecha de emisión (cierre)",
    periodicidad: "Periodicidad",
    plan: "Plan",
  },
  sinPlan: "Sin plan asignado",
  sinCuota: "sin cuota de plan",
  resumen: {
    titulo: "Resumen",
    concepto: "Concepto",
    cantidad: "Cantidad",
    importe: "Importe",
    tarifa: "Tarifa",
    cargos: "Cargos por orden",
    reversos: "Reversos de cargos",
    totalOrdenes: "Total órdenes",
    cuota: "Cuota del plan",
    sinCantidad: "—",
  },
  totalAPagar: "Total a pagar",
  notaMovimientos: (movimientos: string) => `Movimientos en total: ${movimientos}.`,
  /** R11: según la tarifa de R26; sin movimientos no se dice nada. */
  notaTarifa: {
    unica: (tarifa: string) => `Los cargos y reversos se cobran a ${tarifa} por orden.`,
    varias: "Los cargos y reversos se cobran con varias tarifas por orden.",
  },
  /** R11 (P3): el código y el símbolo salen de la configuración, sin literal de moneda. SL-21 (R15): los de los planes, no los del país. */
  notaMoneda: `Montos en ${MONEDA_DE_LOS_PLANES.codigo} (${MONEDA_DE_LOS_PLANES.simbolo}).`,
  /** R26: la celda de tarifa cuando no hay una sola. */
  tarifa: { varias: "Varias", sin: "—" },
  desglose: {
    titulo: "Desglose por día",
    dia: "Día",
    cargos: "Cargos",
    reversos: "Reversos",
    netas: "Órdenes netas",
    importe: "Importe neto",
    total: "Total",
    vacio: "Sin movimientos en el período",
    /** R12: N es el `movimientos` de la base. */
    notaAnexo: (movimientos: string, numero: number, empresa: string) =>
      `El detalle completo de los ${movimientos} movimientos va en el anexo ` +
      `«Factura ${numero} · ${empresa} · Detalle de movimientos».`,
  },
  pie: (numero: number, empresa: string) => `${MARCA_FACTURA.pie} · Factura N.º ${numero} · ${empresa}`,
  pagina: (n: number, de: number) => `Página ${n} de ${de}`,
  /** SLT-199 R16–R21: el anexo de movimientos. */
  anexo: {
    antetitulo: (n: number) => `ANEXO · FACTURA N.º ${n}`,
    titulo: "Detalle de movimientos",
    tarjetas: { movimientos: "Movimientos", cargos: "Cargos", reversos: "Reversos", totalNeto: "Total neto" },
    conteoEImporte: (cantidad: string, importe: string) => `${cantidad} · ${importe}`,
    periodo: (periodo: string) => `Periodo facturado: ${periodo}.`,
    tarifa: {
      unica: (tarifa: string) => `Tarifa: ${tarifa} por orden.`,
      varias: "Tarifa: varias por orden.",
      sin: "Tarifa: —.",
    },
    seccion: "Movimientos",
    columnas: { numero: "#", fecha: "Fecha", tipo: "Tipo", guia: "Guía", remision: "Remisión", importe: "Importe" },
    tipos: { cargo: "Cargo", reverso: "Reverso" } satisfies Record<TipoLineaFactura, string>,
    sinGuia: "—",
    vacio: "Sin movimientos en el período",
    totalNeto: (movimientos: string) => `Total neto (${movimientos} movimientos)`,
    pie: `${MARCA_FACTURA.pie} · Anexo: detalle de movimientos`,
  },
} as const;

/** R11: un día con al menos un movimiento. */
export interface DiaDelDesglose {
  /** `YYYY-MM-DD` en la hora de la plataforma. */
  dia: string;
  cargos: number;
  reversos: number;
  /** Cargos − reversos; puede ser negativo. */
  netas: number;
  /** La suma exacta de los valores del día, con signo y dos decimales. */
  importe: string;
}

/** R9–R11: lo que pinta el PDF, con los importes de la base y los conteos de los movimientos. */
export interface ResumenDeFactura {
  /** Importe = `cargos` de la base. */
  cargos: { cantidad: number; importe: string };
  /** Importe = `reversos` de la base, en negativo. */
  reversos: { cantidad: number; importe: string };
  /** Cantidad = cargos − reversos; importe = `total_ordenes` de la base. */
  totalOrdenes: { cantidad: number; importe: string };
  /** La cuota de la emisión más la primera cuota, o `"0.00"` si no lleva ninguna. */
  cuota: string;
  /** `total` de la base. */
  total: string;
  /** `movimientos` de la base. */
  movimientos: number;
  /** Solo los días con movimientos, de menor a mayor. */
  dias: DiaDelDesglose[];
}

/** R15: los movimientos no cuadran con los totales de la base. No se genera ningún archivo. */
export class DescuadreDeFactura extends Error {
  constructor(motivo: string) {
    super(`la factura no cuadra con sus movimientos: ${motivo}`);
    this.name = "DescuadreDeFactura";
  }
}

/** El día de calendario de un instante, en la hora de la plataforma (hasta SLT-90, la de las pantallas de SLT-119). */
function diaDe(instante: Date): string {
  return fechaCalendarioPlataforma(instante);
}

function aDiaNumerico(dia: string): string {
  const [anio, mes, d] = dia.split("-");
  return `${d}/${mes}/${anio}`;
}

/** R8, R11: `dd/mm/aaaa` del instante, en la hora de la plataforma. */
export function fechaNumerica(instante: Date): string {
  return aDiaNumerico(diaDe(instante));
}

/** R11: `dd/mm/aaaa` de un día `YYYY-MM-DD` del desglose. */
export function diaNumerico(dia: string): string {
  return aDiaNumerico(dia);
}

/** R8: «<primer día> al <último día>»; `hasta` está excluido, así que el último día es el de `hasta` − 1 ms. */
export function periodoNumerico(desde: Date, hasta: Date): string {
  return `${fechaNumerica(desde)} al ${fechaNumerica(new Date(hasta.getTime() - 1))}`;
}

/** Las cifras en grupos de tres separados por un espacio: el formato de la referencia, no el de pantalla. */
function agrupado(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+$)/g, " ");
}

/** SLT-199 R4: una cantidad entera de los PDF («2 365», «-15»). */
export function cantidadVisible(n: number): string {
  return `${n < 0 ? "-" : ""}${agrupado(String(Math.abs(n)))}`;
}

const FORMA_DE_LA_BASE = /^(-?)(\d+)\.(\d{2})$/;

/**
 * SLT-199 R3: un importe de la base con el formato de los PDF («₡473 000,00», «-₡40 400,00»). Trabaja sobre el
 * texto, sin pasar por `Number`, para no redondear. Vive aquí y no en `lib/config/moneda.ts`: es solo de documento
 * y allí sería un camino público más del dinero de pantalla (guardia 359). Otra forma de entrada es un fallo.
 */
export function importeDocumento(valor: string): string {
  const partes = FORMA_DE_LA_BASE.exec(valor);
  if (partes === null) throw new Error(`importeDocumento: importe no válido: ${valor}`);
  const [, signo, enteros, decimales] = partes;
  // «-0.00» no es negativo: sale «₡0,00».
  const negativo = signo === "-" && /[1-9]/.test(enteros + decimales);
  // SL-21 (R15): la moneda de los planes, sea cual sea el país de la empresa (SLT-237).
  const { simbolo, separadorDecimal } = MONEDA_DE_LOS_PLANES;
  return `${negativo ? "-" : ""}${simbolo}${agrupado(enteros)}${separadorDecimal}${decimales}`;
}

/** SLT-199 R26: la tarifa de la factura, sacada de sus movimientos sin leer nada nuevo. */
export type TarifaDeLaFactura = { tipo: "unica"; importe: string } | { tipo: "varias" } | { tipo: "sin" };

/** R26: un solo valor absoluto entre cargos y reversos es la tarifa; dos o más, «Varias»; ninguno, «—». */
export function tarifaDeLaFactura(datos: DatosDescargaFactura): TarifaDeLaFactura {
  const valores = new Set<bigint>();
  for (const m of datos.movimientos) {
    const centimos = aCentimosConSigno(m.valor);
    valores.add(centimos < BigInt(0) ? -centimos : centimos);
    if (valores.size > 1) return { tipo: "varias" };
  }
  const [unico] = valores;
  return unico === undefined ? { tipo: "sin" } : { tipo: "unica", importe: aTexto(unico) };
}

/** R8: el nombre del plan o «Sin plan asignado», con «· sin cuota de plan» si la factura no lleva cuota. */
export function planVisible(datos: DatosDescargaFactura): string {
  const { factura } = datos;
  const plan = factura.plan?.planNombre ?? FACTURA_DESCARGA_TEXTOS.sinPlan;
  return sumaDeCuotas(factura) === null ? `${plan} · ${FACTURA_DESCARGA_TEXTOS.sinCuota}` : plan;
}

/** R8: la etiqueta de la periodicidad («Quincenal», «Mensual»). */
export function periodicidadVisible(datos: DatosDescargaFactura): string {
  return FACTURAS_TEXTOS.periodicidad[datos.factura.periodicidad];
}

/** R11: agrupa los movimientos por día de la plataforma, con el importe sumado en céntimos exactos. */
function desglosar(datos: DatosDescargaFactura): DiaDelDesglose[] {
  const porDia = new Map<string, { cargos: number; reversos: number; centimos: bigint }>();
  for (const m of datos.movimientos) {
    const dia = diaDe(m.instante);
    const acumulado = porDia.get(dia) ?? { cargos: 0, reversos: 0, centimos: BigInt(0) };
    if (m.tipo === "cargo") acumulado.cargos += 1;
    else acumulado.reversos += 1;
    acumulado.centimos += aCentimosConSigno(m.valor);
    porDia.set(dia, acumulado);
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dia, d]) => ({
      dia,
      cargos: d.cargos,
      reversos: d.reversos,
      netas: d.cargos - d.reversos,
      importe: aTexto(d.centimos),
    }));
}

/**
 * R9–R11, R15: el resumen de la factura. Lanza `DescuadreDeFactura` si la suma de los días no es el
 * `total_ordenes` de la base o si los movimientos contados no son los `movimientos` de la base: la base garantiza
 * los dos (SLT-118 R7), así que un descuadre es un fallo y no se emite un archivo con dos totales que no casan.
 */
export function resumirFactura(datos: DatosDescargaFactura): ResumenDeFactura {
  const { factura } = datos;
  const dias = desglosar(datos);
  const cargos = dias.reduce((n, d) => n + d.cargos, 0);
  const reversos = dias.reduce((n, d) => n + d.reversos, 0);

  const sumaDias = dias.reduce((suma, d) => suma + aCentimosConSigno(d.importe), BigInt(0));
  if (sumaDias !== aCentimosConSigno(factura.totalOrdenes)) {
    throw new DescuadreDeFactura(`los días suman ${aTexto(sumaDias)} y el total de órdenes es ${factura.totalOrdenes}`);
  }
  if (cargos + reversos !== factura.movimientos) {
    throw new DescuadreDeFactura(`hay ${cargos + reversos} movimientos y la factura dice ${factura.movimientos}`);
  }

  return {
    cargos: { cantidad: cargos, importe: factura.cargos },
    reversos: { cantidad: reversos, importe: aTexto(-aCentimos(factura.reversos)) },
    totalOrdenes: { cantidad: cargos - reversos, importe: factura.totalOrdenes },
    cuota: sumaDeCuotas(factura) ?? "0.00",
    total: factura.total,
    movimientos: factura.movimientos,
    dias,
  };
}

/** Sin tildes ni diacríticos, en minúsculas y con guiones: «Mensajería Ñandú S.A.» → «mensajeria-nandu-s-a». */
function enSlug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** SLT-199 R24: `factura-<n>-<empresa>.pdf` y, el anexo, `factura-<n>-<empresa>-anexo.pdf`. */
export function nombreArchivoFactura(numero: number, empresa: string, documento: "factura" | "anexo"): string {
  const slug = enSlug(empresa);
  const base = slug === "" ? `factura-${numero}` : `factura-${numero}-${slug}`;
  return documento === "anexo" ? `${base}-anexo.pdf` : `${base}.pdf`;
}
