// @vitest-environment jsdom
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  ColaCierres,
  type ColaCierresBodegaProps,
  type ColaCierresConsolidarProps,
  type ColaCierresPropiosProps,
  type ColaCierresProps,
} from "@/components/private/cierres/cola/ColaCierres";
import { CifrasCierre } from "@/components/private/cierres/detalle/CifrasCierre";
import { Cuenta } from "@/components/private/cierres/detalle/Cuenta";
import { DineroCierre } from "@/components/private/cierres/detalle/DineroCierre";
import { MensajerosCierreBodega } from "@/components/private/cierres/detalle/MensajerosCierreBodega";
import {
  comisionCodConImpuesto,
  fletePorEntregadoConImpuesto,
  impuestoNoEsDeLaEmpresa,
  notaLeQuedaBodega,
  notaLeQuedaMensajero,
} from "@/components/private/cierres/detalle/detalle-cierre-labels";
import type { Cifra, DineroVista, FilaMensajeroBodega } from "@/components/private/cierres/detalle/detalle-cierre-vista";
import { deEsoImpuesto, impuestoConPorcentaje } from "@/components/private/cierres/fila/fila-gestion-labels";
import {
  FLETE_DEV_CON_IVA_LABEL,
  FLETE_NO_ENTREGADAS_CON_IVA_LABEL,
  fleteDevConImpuestoDeGestion,
  fleteDevConImpuestoLabel,
  fleteDevConIvaDeGestion,
  fleteNoEntregadasConImpuestoLabel,
  impuestoFleteNoEntregaLabel,
  ivaFleteNoEntregaLabel,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";
import {
  IVA_COMISION_LABEL,
  IVA_FLETE_LABEL,
  IVA_FLETE_RECHAZO_LABEL,
  impuestoComisionLabel,
  impuestoFleteLabel,
  impuestoFleteRechazoLabel,
} from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { formatearMontoEn, MONEDA_PLATAFORMA, SIN_MONTO_RAYA, type FormatoMoneda } from "@/lib/config/moneda";
import type { CierreBodegaResumen, CierreConsolidableCola } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreDetalleGestion, CierrePasadoDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import { MonedaDelPaisProvider } from "@/providers/MonedaDelPaisProvider";
import { MONEDA_CR, MONEDA_DE_PRUEBA } from "@/tests/fabricas/reglas-pais";

// SLT-244 — Moneda e impuesto del pais en pantallas: componentes de cierres.
//
// Un `describe` por requisito, con el `R<n>` en el nombre. Cada bloque de tasks.md AÑADE los suyos al
// final del archivo; no se reordena lo de los demas. Cada caso de pantalla se monta tres veces: con
// `MONEDA_DE_PRUEBA` + «IGV», con `MONEDA_CR` + «IVA» y sin proveedor. Con CR el texto debe ser,
// caracter a caracter, el mismo que sin proveedor (R9, R10).
//
// Los datos se doblan como en los tests que ya existen de cada componente (`ColaCierres.test.tsx`,
// `ColaCierresBodega.test.tsx`, `ColaCierresConsolidar.test.tsx`, `DetalleCierreDinero.test.tsx`).

// `useIsMobile` se simula como en `ColaCierres.test.tsx` (por defecto, escritorio).
const movil = vi.hoisted(() => ({ valor: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => movil.valor }));

afterEach(() => {
  cleanup();
  movil.valor = false;
});

type Montaje = "prueba" | "cr" | "sin proveedor";
const MONTAJES: readonly Montaje[] = ["prueba", "cr", "sin proveedor"];

/** La moneda con la que cada montaje debe pintar. Sin proveedor, la de la plataforma (R10). */
const MONEDA_DEL_MONTAJE: Record<Montaje, FormatoMoneda> = {
  prueba: MONEDA_DE_PRUEBA,
  cr: MONEDA_CR,
  "sin proveedor": MONEDA_PLATAFORMA,
};

function montar(montaje: Montaje, ui: ReactElement): ReactElement {
  if (montaje === "prueba") {
    return (
      <MonedaDelPaisProvider moneda={MONEDA_DE_PRUEBA} impuestoNombre="IGV">
        {ui}
      </MonedaDelPaisProvider>
    );
  }
  if (montaje === "cr") {
    return (
      <MonedaDelPaisProvider moneda={MONEDA_CR} impuestoNombre="IVA">
        {ui}
      </MonedaDelPaisProvider>
    );
  }
  return ui;
}

const conRaya = (moneda: FormatoMoneda, valor: string | null): string =>
  formatearMontoEn(moneda, valor, SIN_MONTO_RAYA);

const colapsar = (texto: string): string => texto.replace(/\s+/g, " ").trim();

/** Monta `ui` en los tres montajes y devuelve el texto de cada uno, desmontando entre uno y otro. */
function enLosTresMontajes(ui: () => ReactElement): Record<Montaje, string> {
  const textos = {} as Record<Montaje, string>;
  for (const m of MONTAJES) {
    const { container } = render(montar(m, ui()));
    textos[m] = colapsar(container.textContent ?? "");
    cleanup();
  }
  return textos;
}

/** R9 y R10 en una linea: CR = sin proveedor, y con la de prueba sale otra cosa. */
function compruebaCostaRicaYCaida(textos: Record<Montaje, string>): void {
  expect(textos.cr).toBe(textos["sin proveedor"]);
  expect(textos.prueba).not.toBe(textos["sin proveedor"]);
  expect(textos.prueba).toContain("€");
  expect(textos.prueba).not.toContain("₡");
}

/** Cada importe sale formateado con la moneda de su montaje (R1, R2, R10). */
function compruebaImportes(textos: Record<Montaje, string>, importes: readonly string[]): void {
  for (const m of MONTAJES) {
    for (const v of importes) expect(textos[m]).toContain(conRaya(MONEDA_DEL_MONTAJE[m], v));
  }
}

// ---------------------------------------------------------------------------------------------
// Bloque 1 — T1.1: la cola (R1, R9, R10)
// ---------------------------------------------------------------------------------------------

const COMUN = {
  descripcion: "Descripcion de la cola",
  onPestana: vi.fn(),
  barra: <input aria-label="Buscar" />,
  descargar: <button type="button">Descargar</button>,
  cargando: false,
  error: null,
  vacio: "Sin cierres.",
  region: "Cola de prueba",
  paginacion: <nav aria-label="Paginación doble" />,
} as const;

function cierreMensajero(over: Partial<CierreAdminResumen> & { cierreId: string }): CierreAdminResumen {
  return {
    mensajeroId: `m-${over.cierreId}`,
    mensajeroNombre: "Ana Mensajera",
    estado: "solicitado",
    destinoTipo: "bodega_central",
    destinoZonaId: "z1",
    destinoZonaNombre: "GAM",
    totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "285275.00" },
    totalPagoMensajero: "45000.00",
    totalIngresoBodegaRechazos: "0.00",
    pendientePagoMensajero: null,
    solicitadoAt: "2026-11-08T00:42:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    ...over,
  };
}

function colaMensajero(pestana: "pendientes" | "resueltos"): ColaCierresProps {
  return {
    ...COMUN,
    tipo: "mensajero",
    rol: "central",
    pestanas: [
      { id: "pendientes", label: "Pendientes", conteo: 1 },
      { id: "resueltos", label: "Resueltos", conteo: 1 },
    ],
    pestanaActiva: pestana,
    filas:
      pestana === "pendientes"
        ? [cierreMensajero({ cierreId: "0f3c9a2e-1b44-4d0a-9e77-5b2c8f2a11c4" })]
        : [
            cierreMensajero({
              cierreId: "cc33dd44-0000-4000-8000-00005e11a0b3",
              estado: "aprobado",
              resueltoAt: "2026-11-07T01:30:00.000Z",
              pendientePagoMensajero: "47500.00",
            }),
          ],
    acciones: { abrir: vi.fn(), destrabar: vi.fn(), registrarPago: vi.fn() },
  };
}

function cierreBodega(over: Partial<CierreBodegaResumen> & { cierreBodegaId: string }): CierreBodegaResumen {
  return {
    zonaId: `z-${over.cierreBodegaId}`,
    zonaNombre: "Limón",
    solicitadoPorId: "u1",
    solicitadoPorNombre: "Pedro Satélite",
    estado: "aprobado",
    totales: { efectivo: "987654.00", simpe: "0.00", transferencia: "0.00", general: "987654.00" },
    totalPagoMensajero: "45678.00",
    totalIngresoBodegaRechazos: "0.00",
    cantidadCierres: 3,
    solicitadoAt: "2026-11-08T01:55:00.000Z",
    resueltoAt: null,
    motivoRechazo: null,
    paraLaCentral: "349100.00",
    efectivoCubreDescuentos: true,
    conciliado: true,
    desmarcable: false,
    montoRecibido: "334100.00",
    faltaPorRecibir: "15000.00",
    conciliadoAt: "2026-11-08T03:00:00.000Z",
    conciliadoPorNombre: "Marcadora",
    conciliadoNota: null,
    incluyeModeloNuevo: true,
    ...over,
  };
}

function colaBodega(): ColaCierresBodegaProps {
  return {
    ...COMUN,
    tipo: "bodega",
    rol: "central",
    pestanas: [
      { id: "pendientes", label: "Por conciliar", conteo: 1 },
      { id: "resueltos", label: "Conciliados", conteo: 0 },
    ],
    pestanaActiva: "pendientes",
    filas: [cierreBodega({ cierreBodegaId: "22222222-0000-4000-8000-00000ef4a5b6" })],
    acciones: { abrir: vi.fn() },
  };
}

function consolidable(over: Partial<CierreConsolidableCola> & { cierreDiaId: string }): CierreConsolidableCola {
  return {
    mensajeroId: `m-${over.cierreDiaId}`,
    mensajeroNombre: "Ana Mensajera",
    totales: { efectivo: "100000.00", simpe: "0.00", transferencia: "0.00", general: "100000.00" },
    totalPagoMensajero: "3000.00",
    totalIngresoBodegaRechazos: "1500.00",
    incluyeModeloNuevo: false,
    paraLaCentral: "-2000.00",
    aprobadoAt: "2026-11-08T01:10:00.000Z",
    gestionesAjustadas: 0,
    ...over,
  };
}

function colaConsolidar(pestana: "aConsolidar" | "solicitados"): ColaCierresConsolidarProps {
  return {
    ...COMUN,
    tipo: "bodega",
    rol: "satelite",
    pestanas: [
      { id: "aConsolidar", label: "A consolidar", conteo: 1 },
      { id: "solicitados", label: "Solicitados", conteo: 1 },
    ],
    pestanaActiva: pestana,
    filas: [consolidable({ cierreDiaId: "0f3c9a2e-1b44-4d0a-9e77-5b2c8f2ab7c9" })],
    acciones: { verSuCierre: vi.fn() },
    tarjetas: [],
    totales: { efectivo: "100000.00", simpe: "0.00", transferencia: "0.00", general: "100000.00" },
    aviso: null,
    botonPie: { deshabilitado: false, onClick: vi.fn() },
    solicitados: {
      tarjetas: [],
      filas: [cierreBodega({ cierreBodegaId: "11111111-0000-4000-8000-00000ab1c2d3" })],
      acciones: { ver: vi.fn() },
      cargando: false,
      error: null,
      paginacion: <nav aria-label="Paginación de solicitados" />,
    },
  };
}

const CIERRE_PROPIO: CierrePasadoDTO = {
  cierreId: "aa11bb22-0000-4000-8000-00071d0e3f2f",
  estado: "aprobado",
  destinoTipo: "bodega_central",
  destinoZonaId: "z1",
  totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "128300.00" },
  totalPagoMensajero: "23400.00",
  totalIngresoBodegaRechazos: "0.00",
  solicitadoAt: "2026-11-08T00:42:00.000Z",
  pendientePagoMensajero: "0.00",
};

function colaPropia(tarjetas?: readonly Cifra[]): ColaCierresPropiosProps {
  return {
    ...COMUN,
    tipo: "propios",
    rol: "mensajero",
    pestanas: [{ id: "pendientes", label: "Cierres solicitados", conteo: 1 }],
    pestanaActiva: "pendientes",
    filas: [CIERRE_PROPIO],
    acciones: { abrir: vi.fn(), leyendo: null },
    tarjetas,
  };
}

function cifra(over: Partial<Cifra> & { id: Cifra["id"] }): Cifra {
  return {
    label: `Cifra ${over.id}`,
    valor: "0.00",
    esMonto: true,
    contexto: "",
    conMetodos: false,
    destacada: false,
    ...over,
  };
}

describe("SLT-244 R1 — la cola pinta cada importe con la moneda del país", () => {
  it("mensajeros, Pendientes: recaudado y pago al mensajero", () => {
    const textos = enLosTresMontajes(() => <ColaCierres {...colaMensajero("pendientes")} />);
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["285275.00", "45000.00"]);
    // Escrito a mano (MONEDA_DE_PRUEBA: «€», espacio de miles, sin decimales).
    expect(textos.prueba).toContain("€285 275");
    expect(textos["sin proveedor"]).toContain("₡285.275");
  });

  it("mensajeros, Resueltos: el pendiente del pago al mensajero", () => {
    const textos = enLosTresMontajes(() => <ColaCierres {...colaMensajero("resueltos")} />);
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["47500.00"]);
    expect(textos.prueba).toContain("€47 500");
  });

  it("bodega de la central: debe llegar, recibido y falta por recibir", () => {
    const textos = enLosTresMontajes(() => <ColaCierres {...colaBodega()} />);
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["349100.00", "334100.00", "15000.00"]);
    expect(textos.prueba).toContain("€349 100");
  });

  it("satélite, A consolidar: recaudado, pago, ingreso por rechazos y a la central (con signo)", () => {
    const textos = enLosTresMontajes(() => <ColaCierres {...colaConsolidar("aConsolidar")} />);
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["100000.00", "3000.00", "1500.00", "-2000.00"]);
    expect(textos.prueba).toContain("€100 000");
  });

  it("satélite, Solicitados: recaudado y las celdas de bodega", () => {
    const textos = enLosTresMontajes(() => <ColaCierres {...colaConsolidar("solicitados")} />);
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["987654.00", "349100.00", "334100.00", "15000.00"]);
  });

  it("cola propia del mensajero, escritorio: recaudado y ganancia", () => {
    const textos = enLosTresMontajes(() => <ColaCierres {...colaPropia()} />);
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["128300.00", "23400.00"]);
    expect(textos.prueba).toContain("€128 300");
  });

  it("cola propia del mensajero, teléfono: la ganancia de la fila", () => {
    movil.valor = true;
    const textos = enLosTresMontajes(() => <ColaCierres {...colaPropia()} />);
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["23400.00"]);
    expect(textos.prueba).toContain("€23 400");
  });

  it("sin importe, el marcador «—» en las tarjetas de la cola propia", () => {
    for (const m of MONTAJES) {
      render(
        montar(
          m,
          <ColaCierres
            {...colaPropia([cifra({ id: "gananciaPendiente", label: "Pendiente", valor: null })])}
          />,
        ),
      );
      const caja = screen.getByRole("group", { name: "Pendiente" });
      expect(caja.querySelector('[data-cifra="gananciaPendiente"]')?.textContent).toBe(SIN_MONTO_RAYA);
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 1 — T1.2: el detalle (R2, R9, R10)
// ---------------------------------------------------------------------------------------------

describe("SLT-244 R2 — el detalle pinta sus importes con la moneda del país", () => {
  it("CifrasCierre: la cifra y el desglose por método", () => {
    const cifras = [cifra({ id: "recaudado", label: "Recaudado", valor: "130000.00", conMetodos: true })];
    const totales = { efectivo: "100000.00", simpe: "30000.00", transferencia: "0.00", general: "130000.00" };
    const textos = enLosTresMontajes(() => <CifrasCierre cifras={cifras} totales={totales} />);
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["130000.00", "100000.00", "30000.00"]);
    expect(textos.prueba).toContain("€130 000");
  });

  it("CifrasCierre: sin importe, «—»", () => {
    for (const m of MONTAJES) {
      const { container } = render(
        montar(m, <CifrasCierre cifras={[cifra({ id: "pago", label: "Pago", valor: null })]} />),
      );
      expect(container.querySelector('[data-cifra="pago"]')?.textContent).toBe(SIN_MONTO_RAYA);
      cleanup();
    }
  });

  it("Cuenta: la línea y el aparte", () => {
    const textos = enLosTresMontajes(() => (
      <Cuenta
        titulo="Una cuenta"
        lineas={[
          { label: "Partida", monto: "25000.00", signo: "neutro", tipo: "partida" },
          { label: "Total", monto: "21000.00", signo: "neutro", tipo: "total" },
        ]}
        aparte={{ label: "Aparte", monto: "3000.00" }}
      />
    ));
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["25000.00", "21000.00", "3000.00"]);
    expect(textos.prueba).toContain("€25 000");
  });

  it("DineroCierre: el reparto y la tabla por tienda", () => {
    const dinero: DineroVista = {
      reparto: [
        { label: "Para las tiendas", monto: "80000.00", porcentaje: 80 },
        { label: "Para la empresa", monto: "20000.00", porcentaje: 20 },
      ],
      cuentas: [
        {
          titulo: "Cuenta del dinero",
          lineas: [{ label: "Total", monto: "100000.00", signo: "neutro", tipo: "total" }],
        },
      ],
      porTienda: [
        { tiendaId: "t1", tiendaNombre: "Tienda Uno", recaudado: "60000.00", pagoTienda: "55000.00" },
        { tiendaId: "t2", tiendaNombre: "Tienda Dos", recaudado: "40000.00", pagoTienda: "-1200.00" },
      ],
    };
    const textos = enLosTresMontajes(() => <DineroCierre dinero={dinero} />);
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["80000.00", "20000.00", "100000.00", "60000.00", "55000.00", "40000.00", "-1200.00"]);
    expect(textos.prueba).toContain("€80 000");
  });

  it("MensajerosCierreBodega: recaudado, pago y a la central", () => {
    const filas: FilaMensajeroBodega[] = [
      {
        cierreDiaId: "cd-1",
        mensajero: "Ana Mensajera",
        gestiones: 4,
        recaudado: "72000.00",
        pago: "8000.00",
        aLaCentral: "64000.00",
        senal: "",
        href: "/cierres-admin?cierre=cd-1",
      },
    ];
    const textos = enLosTresMontajes(() => <MensajerosCierreBodega filas={filas} />);
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["72000.00", "8000.00", "64000.00"]);
    expect(textos.prueba).toContain("€72 000");
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 2 — T2.1: rótulos con el impuesto (R6, R9)
// ---------------------------------------------------------------------------------------------

const PAIS_PRUEBA = { moneda: MONEDA_DE_PRUEBA, impuesto: "IGV" };
const PAIS_CR = { moneda: MONEDA_CR, impuesto: "IVA" };

const GESTION_NUEVO = {
  resultado: "novedad",
  ingresoEmpresa: { tarifaModelo: "nuevo" },
} as unknown as Pick<CierreDetalleGestion, "resultado" | "ingresoEmpresa">;
const GESTION_VIEJO = {
  resultado: "devolucion_a_origen_por_rechazo",
  ingresoEmpresa: { tarifaModelo: "viejo" },
} as unknown as Pick<CierreDetalleGestion, "resultado" | "ingresoEmpresa">;

describe("SLT-244 R6 — los rótulos con el impuesto dicen el nombre del impuesto del país", () => {
  it("detalle-cierre-labels: con «IGV», la columna «Perú» de design §5 (escrita a mano)", () => {
    expect(fletePorEntregadoConImpuesto("IGV")).toBe("Flete por entregado + IGV");
    expect(comisionCodConImpuesto("IGV")).toBe("Comisión COD + IGV");
    expect(impuestoNoEsDeLaEmpresa("IGV")).toBe("IGV (no es de la empresa)");
    expect(notaLeQuedaMensajero("IGV")).toBe("sin IGV, ya restados mensajero y bodega");
    expect(notaLeQuedaBodega("IGV")).toBe("sin IGV, ya restados mensajeros y satélite");
  });

  it("detalle-cierre-labels: con «IVA», el texto de hoy (R9)", () => {
    expect(fletePorEntregadoConImpuesto("IVA")).toBe("Flete por entregado + IVA");
    expect(comisionCodConImpuesto("IVA")).toBe("Comisión COD + IVA");
    expect(impuestoNoEsDeLaEmpresa("IVA")).toBe("IVA (no es de la empresa)");
    expect(notaLeQuedaMensajero("IVA")).toBe("sin IVA, ya restados mensajero y bodega");
    expect(notaLeQuedaBodega("IVA")).toBe("sin IVA, ya restados mensajeros y satélite");
  });

  it("fila-gestion-labels: «de eso, IGV (no es de la empresa)» y «IGV 18 %»", () => {
    expect(deEsoImpuesto("IGV")).toBe("de eso, IGV (no es de la empresa)");
    expect(deEsoImpuesto("IVA")).toBe("de eso, IVA (no es de la empresa)");
    expect(impuestoConPorcentaje("18.00", PAIS_PRUEBA)).toBe("IGV 18 %");
    expect(impuestoConPorcentaje("13.00", PAIS_CR)).toBe("IVA 13 %");
  });

  it("impuestoConPorcentaje: el porcentaje con el separador decimal de la moneda del país (R5)", () => {
    expect(impuestoConPorcentaje("3.50", PAIS_PRUEBA)).toBe("IGV 3.5 %");
    expect(impuestoConPorcentaje("3.50", PAIS_CR)).toBe("IVA 3,5 %");
    expect(impuestoConPorcentaje("3.50", { moneda: MONEDA_PLATAFORMA, impuesto: "IVA" })).toBe("IVA 3,5 %");
  });

  it("cierre-labels: con «IGV», la columna «Perú»; con «IVA», el texto de hoy", () => {
    expect(fleteDevConImpuestoLabel("IGV")).toBe("Flete por devolución a origen + IGV");
    expect(fleteNoEntregadasConImpuestoLabel("IGV")).toBe("Flete de gestiones no entregadas + IGV");
    expect(fleteDevConImpuestoDeGestion(GESTION_NUEVO, "IGV")).toBe("Flete por novedad + IGV");
    expect(fleteDevConImpuestoDeGestion(GESTION_VIEJO, "IGV")).toBe("Flete por devolución a origen + IGV");
    expect(impuestoFleteNoEntregaLabel("devolucion_a_origen_por_rechazo", "IGV")).toBe(
      "IGV del flete por devolución a origen",
    );
    expect(impuestoFleteNoEntregaLabel("novedad", "IGV")).toBe("IGV del flete por novedad");

    expect(fleteDevConImpuestoLabel("IVA")).toBe("Flete por devolución a origen + IVA");
    expect(fleteNoEntregadasConImpuestoLabel("IVA")).toBe("Flete de gestiones no entregadas + IVA");
    expect(fleteDevConImpuestoDeGestion(GESTION_NUEVO, "IVA")).toBe("Flete por novedad + IVA");
    expect(impuestoFleteNoEntregaLabel("novedad", "IVA")).toBe("IVA del flete por novedad");
  });

  it("cierre-labels: las constantes que lee el código sin montar conservan su texto (R11)", () => {
    expect(FLETE_DEV_CON_IVA_LABEL).toBe("Flete por devolución a origen + IVA");
    expect(FLETE_NO_ENTREGADAS_CON_IVA_LABEL).toBe("Flete de gestiones no entregadas + IVA");
    expect(fleteDevConIvaDeGestion(GESTION_NUEVO)).toBe("Flete por novedad + IVA");
    expect(fleteDevConIvaDeGestion(GESTION_VIEJO)).toBe("Flete por devolución a origen + IVA");
    expect(ivaFleteNoEntregaLabel("novedad")).toBe("IVA del flete por novedad");
  });

  it("cierre-detalle-shared: con «IGV», la columna «Perú»; las constantes, el texto de hoy", () => {
    expect(impuestoFleteLabel("IGV")).toBe("IGV flete");
    expect(impuestoComisionLabel("IGV")).toBe("IGV comisión");
    expect(impuestoFleteRechazoLabel("IGV")).toBe("IGV del flete por devolución a origen");

    expect(impuestoFleteLabel("IVA")).toBe("IVA flete");
    expect(IVA_FLETE_LABEL).toBe("IVA flete");
    expect(IVA_COMISION_LABEL).toBe("IVA comisión");
    expect(IVA_FLETE_RECHAZO_LABEL).toBe("IVA del flete por devolución a origen");
  });
});
