import type {
  CuotaDeLaFactura,
  DetalleDeFactura,
  FacturaPlataformaDTO,
  LineaDeFactura,
} from "@/lib/types/factura-plataforma";

// SLT-119 — facturas de la plataforma para los tests de las pantallas. Los instantes van en UTC: las 00:00 de la
// hora de la plataforma (−06:00) son las 06:00 UTC.

/** El instante `hora` del día `fecha` en la hora de la plataforma. */
export function enPlataforma(fecha: string, hora = "00:00"): Date {
  const [h, m] = hora.split(":").map((n) => Number.parseInt(n, 10));
  return new Date(Date.parse(`${fecha}T00:00:00.000Z`) + ((h + 6) * 60 + m) * 60_000);
}

export function cuota(extra: Partial<CuotaDeLaFactura> = {}): CuotaDeLaFactura {
  return {
    planId: "11111111-1111-4111-8111-111111111111",
    planNombre: "Crecer",
    tipoCobro: "mensual",
    desde: enPlataforma("2026-12-01"),
    hasta: enPlataforma("2027-01-01"),
    precioMensual: "1000.00",
    cuota: "1000.00",
    diasCobrados: 31,
    diasPeriodo: 31,
    ...extra,
  };
}

export function factura(extra: Partial<FacturaPlataformaDTO> = {}): FacturaPlataformaDTO {
  return {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    estado: "cerrada",
    numero: 1,
    desde: enPlataforma("2026-11-16"),
    hasta: enPlataforma("2026-12-01"),
    hastaPrevisto: false,
    periodicidad: "quincenal",
    plan: { planId: "11111111-1111-4111-8111-111111111111", planNombre: "Crecer", tipoCobro: "mensual" },
    cargos: "600.00",
    reversos: "300.00",
    movimientos: 3,
    totalOrdenes: "300.00",
    cuota: null,
    primeraCuota: null,
    total: "300.00",
    cerradaAt: enPlataforma("2026-12-01", "00:05"),
    ...extra,
  };
}

export function linea(extra: Partial<LineaDeFactura> = {}): LineaDeFactura {
  return {
    id: "bbbbbbbb-0000-4000-8000-000000000001",
    instante: enPlataforma("2026-11-17", "09:30"),
    numGuia: 1001,
    tipo: "cargo",
    valor: "300.00",
    ...extra,
  };
}

export function detalle(f: FacturaPlataformaDTO, lineas: LineaDeFactura[], extra: { pagina?: number; total?: number } = {}): DetalleDeFactura {
  return {
    factura: f,
    lineas: { lineas, pagina: extra.pagina ?? 1, porPagina: 100, total: extra.total ?? lineas.length },
  };
}
