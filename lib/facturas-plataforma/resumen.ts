import { FACTURAS_TEXTOS, sumaDeCuotas } from "@/components/shared/facturas/facturas-vista";
import { MARCA_FACTURA } from "@/lib/config/marca";
import { monedaConfig } from "@/lib/config/moneda";
import { aCentimos, aCentimosConSigno, aTexto } from "@/lib/planes/centimos";
import { fechaCalendarioPlataforma } from "@/lib/planes/ciclo";
import type { DatosDescargaFactura, TipoLineaFactura } from "@/lib/types/factura-plataforma";

// SLT-136 (design §3) — el resumen de la descarga de una factura cerrada, sin React y sin E/S. Lo comparten el PDF,
// el Excel y sus pruebas. Los importes son los de la base (R9, R10); lo único que se suma aquí es el importe de
// cada día del desglose (R11), en céntimos exactos, y esa suma se contrasta con los totales de la base (R15).

/** Todos los literales del PDF y del Excel de la factura, en un sitio para cuando llegue la i18n. */
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
    cargos: "Cargos por orden",
    reversos: "Reversos de cargos",
    totalOrdenes: "Total órdenes",
    cuota: "Cuota del plan",
    sinCantidad: "—",
  },
  totalAPagar: "Total a pagar",
  notaMovimientos: (movimientos: string) => `Movimientos en total: ${movimientos}.`,
  desglose: {
    titulo: "Desglose por día",
    dia: "Día",
    cargos: "Cargos",
    reversos: "Reversos",
    netas: "Órdenes netas",
    importe: "Importe neto",
    total: "Total",
    vacio: "Sin movimientos en el período",
    nota: "Cada cargo y cada reverso, con su guía y su remisión, va en el Excel de esta factura.",
  },
  pie: (numero: number, empresa: string) => `${MARCA_FACTURA.pie} · Factura N.º ${numero} · ${empresa}`,
  pagina: (n: number, de: number) => `Página ${n} de ${de}`,
  excel: {
    hoja: "Movimientos",
    fecha: "Fecha",
    guia: "Guía",
    remision: "Remisión",
    tipo: "Tipo",
    valor: "Valor",
    tipos: { cargo: "Cobrado", reverso: "Reverso" } satisfies Record<TipoLineaFactura, string>,
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

/** Una cantidad entera con el separador de miles del dinero de la app («2.365», «-15»). */
export function cantidadVisible(n: number): string {
  const digitos = String(Math.abs(n));
  const grupos: string[] = [];
  for (let fin = digitos.length; fin > 0; fin -= 3) grupos.unshift(digitos.slice(Math.max(0, fin - 3), fin));
  return `${n < 0 ? "-" : ""}${grupos.join(monedaConfig.separadorMiles)}`;
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

/** R18: `factura-<n>-<empresa>.<ext>`. */
export function nombreArchivoFactura(numero: number, empresa: string, ext: "pdf" | "xlsx"): string {
  const slug = enSlug(empresa);
  return slug === "" ? `factura-${numero}.${ext}` : `factura-${numero}-${slug}.${ext}`;
}
