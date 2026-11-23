// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  ColaCierres,
  type ColaCierresBodegaProps,
  type ColaCierresConsolidarProps,
  type ColaCierresPropiosProps,
  type ColaCierresProps,
} from "@/components/private/cierres/cola/ColaCierres";
import { CifrasCierre } from "@/components/private/cierres/detalle/CifrasCierre";
import { Cuenta } from "@/components/private/cierres/detalle/Cuenta";
import { DetalleCierre } from "@/components/private/cierres/detalle/DetalleCierre";
import { DineroCierre } from "@/components/private/cierres/detalle/DineroCierre";
import { MensajerosCierreBodega } from "@/components/private/cierres/detalle/MensajerosCierreBodega";
import {
  comisionCodConImpuesto,
  fletePorEntregadoConImpuesto,
  impuestoNoEsDeLaEmpresa,
  notaLeQuedaBodega,
  notaLeQuedaMensajero,
  pieBodega,
  pieResumenMensajero,
} from "@/components/private/cierres/detalle/detalle-cierre-labels";
import {
  cifrasDe,
  lineasDinero,
  notaOrigenIngresoBodega,
  pieTextoDe,
  type AccionId,
  type Cifra,
  type DetalleBodegaVista,
  type DetalleMensajeroVista,
  type DineroVista,
  type FilaMensajeroBodega,
  type PaisDelCierre,
} from "@/components/private/cierres/detalle/detalle-cierre-vista";
import { FilaGestion } from "@/components/private/cierres/fila/FilaGestion";
import {
  conPorcentaje,
  deEsoImpuesto,
  impuestoConPorcentaje,
  porcentajeDe,
} from "@/components/private/cierres/fila/fila-gestion-labels";
import { calculoDe, tarjetasDe, type AudienciaFila } from "@/components/private/cierres/fila/fila-gestion-vista";
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
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";
import { MONEDA_CR, MONEDA_DE_PRUEBA } from "@/tests/fabricas/reglas-pais";
import { CONGELADO_AT, gestionCanvas, gestionFila, ingresoNuevo, ingresoViejo } from "@/tests/fixtures/gestion-cierre-fila";
import {
  columnasGestionesModeloNuevoPara,
  filaGestionModeloNuevoEn,
} from "@/app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga-columnas";
import { libroGestiones } from "@/app/(app)/cierres-admin/_components/cierres-gestiones-modelo-nuevo-descarga";
import { DescargarGestionesDialog } from "@/app/(app)/cierres-admin/_components/DescargarGestionesDialog";
import { COLUMNAS_DESCARGA_GESTIONES_FUNDIDA } from "@/app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas";
import { ToastProvider } from "@/providers/ToastProvider";
import type { DescargaConfig } from "@/lib/types/descarga";
import type { IngresoEmpresaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type { CierreGestionDescargaDTO } from "@/lib/interfaces/services/ICierresAdminService";
import type { CatalogoFiltrosCierresDTO } from "@/lib/types/filtros-cierres";
import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

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

// R7: la descarga se dobla como en `DescargarGestionesModeloNuevo.test.tsx`: el archivo no se baja y
// `construirDescarga` se ESPÍA (corre el real por debajo) para leer el libro que recibe el generador.
const descarga = vi.hoisted(() => ({ blob: vi.fn(), construir: vi.fn() }));
vi.mock("@/components/shared/descargar-blob", () => ({ descargarBlob: (...a: unknown[]) => descarga.blob(...a) }));
vi.mock("@/lib/utils/descarga-dataset", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/utils/descarga-dataset")>();
  return {
    ...real,
    construirDescarga: (config: DescargaConfig, zona: string, fecha?: Date) => {
      descarga.construir(config);
      return real.construirDescarga(config, zona, fecha);
    },
  };
});

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

// ---------------------------------------------------------------------------------------------
// Bloque 2 — T2.2: textos del detalle (R3, R6, R8, R9, R10)
// ---------------------------------------------------------------------------------------------

const PAIS_PLATAFORMA: PaisDelCierre = { moneda: MONEDA_PLATAFORMA, impuesto: IMPUESTO_ROTULO };

// Los dobles del detalle son los de `DetalleCierreDinero.test.tsx`.
const VISTA_MENSAJERO: DetalleMensajeroVista = {
  mensajeroNombre: "Ana Mensajera",
  destino: "Bodega central",
  zona: "GAM",
  folio: "8F2A11C4",
  estado: "solicitado",
  solicitadoAt: "2026-11-08T00:42:00.000Z",
  resueltoAt: null,
  reprogramadasRetenidasHoy: 0,
  motivoRechazo: null,
  totales: { efectivo: "70000.00", simpe: "30000.00", transferencia: "0.00", general: "100000.00" },
  totalPagoMensajero: "3000.00",
  empresa: {
    pagoTienda: "92090.00",
    cobradoSobreRecaudado: "5650.00",
    totalIngresoBodegaRechazos: "500.00",
    ivaFacturado: "910.00",
    netoEmpresa: "3500.00",
    totalesIngreso: { fleteConIva: "4520.00", comisionConIva: "1130.00", fleteDevolucionConIva: "2260.00", total: "7910.00" },
    partesPorTienda: [
      { tiendaId: "t-norte", tiendaNombre: "Tienda Norte", recaudado: "60000.00", pagoTienda: "55480.00" },
      { tiendaId: "t-sur", tiendaNombre: "Tienda Sur", recaudado: "40000.00", pagoTienda: "36610.00" },
    ],
    modeloNuevo: false,
  },
  conteos: {
    gestiones: 19,
    entregadas: 12,
    noEntregadas: 7,
    pagosAjustados: 1,
    incidentesSinIndemnizar: 1,
    rechazosDeTienda: 2,
    paquetesVuelven: 6,
    tiendas: 2,
  },
};

const VISTA_BODEGA: DetalleBodegaVista = {
  zonaNombre: "Limón",
  solicitadoPorNombre: "Sara Satélite",
  folio: "C07B3E19",
  solicitadoAt: "2026-11-08T01:05:00.000Z",
  conciliado: false,
  faltaPorRecibir: "96500.00",
  montoRecibido: null,
  conciliadoAt: null,
  conciliadoPorNombre: null,
  totales: VISTA_MENSAJERO.totales,
  totalPagoMensajero: "3000.00",
  totalIngresoBodegaRechazos: "500.00",
  paraLaCentral: "96500.00",
  efectivoCubreDescuentos: true,
  pagoTienda: "92090.00",
  cobradoSobreRecaudado: "5650.00",
  ivaFacturado: "910.00",
  netoEmpresa: "3500.00",
  totalesIngreso: VISTA_MENSAJERO.empresa!.totalesIngreso,
  partesPorTienda: VISTA_MENSAJERO.empresa!.partesPorTienda,
  modeloNuevo: false,
  conteos: { gestiones: 31, mensajeros: 2, cierres: 2, pagosAjustados: 2 },
};

function detalleMensajero(): ReactElement {
  return (
    <DetalleCierre
      tipo="mensajero"
      detalle={VISTA_MENSAJERO}
      audiencia="central"
      modo="solo lectura"
      marco="pagina"
      pestanas={{ gestiones: null, rechazos: null }}
      acciones={{}}
    />
  );
}

describe("SLT-244 R3 — los importes del pie y de la nota de bodega van en la moneda del país", () => {
  it("pieTextoDe de un cierre de mensajero: «Recaudado €100 000 · 19 gestiones»", () => {
    expect(pieTextoDe("mensajero", "central", "solo lectura", VISTA_MENSAJERO, PAIS_PRUEBA)).toBe(
      "Recaudado €100 000 · 19 gestiones",
    );
    // R9: con Costa Rica, el texto de hoy, igual al de la plataforma.
    expect(pieTextoDe("mensajero", "central", "solo lectura", VISTA_MENSAJERO, PAIS_CR)).toBe(
      "Recaudado ₡100.000 · 19 gestiones",
    );
    expect(pieTextoDe("mensajero", "central", "solo lectura", VISTA_MENSAJERO, PAIS_PLATAFORMA)).toBe(
      "Recaudado ₡100.000 · 19 gestiones",
    );
  });

  it("pieTextoDe de un cierre de bodega: «Declarado €96 500 · …»", () => {
    expect(pieTextoDe("bodega", "central", "decidir", VISTA_BODEGA, PAIS_PRUEBA)).toBe(
      "Declarado €96 500 · márcalo recibido cuando llegue",
    );
    expect(pieTextoDe("bodega", "central", "solo lectura", VISTA_BODEGA, PAIS_PRUEBA)).toBe("Declarado €96 500");
    expect(pieTextoDe("bodega", "central", "decidir", VISTA_BODEGA, PAIS_CR)).toBe(
      "Declarado ₡96.500 · márcalo recibido cuando llegue",
    );
  });

  it("pieTextoDe con `disponibles`: `pais` va antes del opcional y el texto no cambia", () => {
    expect(
      pieTextoDe("mensajero", "mensajero", "rechazado", VISTA_MENSAJERO, PAIS_PRUEBA, new Set<AccionId>(["cerrar"])),
    ).toBe("Lo envías desde esta página cuando sea el siguiente por enviar.");
  });

  it("lineasDinero del modelo viejo con desglose de bodega: la nota lleva «€»", () => {
    const vista = { ...VISTA_MENSAJERO, desgloseIngresoBodega: { sla: "2700.00", manual: "0.00" } };
    const notaDe = (pais: PaisDelCierre) => lineasDinero("mensajero", vista, pais)!.cuentas[1].lineas[3].notas;
    expect(notaDe(PAIS_PRUEBA)).toEqual(["Automático (por plazo vencido) €2 700 · Manual (mensajero) €0"]);
    expect(notaDe(PAIS_CR)).toEqual(["Automático (por plazo vencido) ₡2.700 · Manual (mensajero) ₡0"]);
    expect(notaDe(PAIS_PLATAFORMA)).toEqual(notaDe(PAIS_CR));
    expect(notaOrigenIngresoBodega({ sla: "2700.00", manual: "0.00" }, MONEDA_DE_PRUEBA)).toBe(
      "Automático (por plazo vencido) €2 700 · Manual (mensajero) €0",
    );
  });

  it("pieResumenMensajero y pieBodega reciben la moneda", () => {
    expect(pieResumenMensajero("100000.00", 1, MONEDA_DE_PRUEBA)).toBe("Recaudado €100 000 · 1 gestión");
    expect(pieBodega("96500.00", "", MONEDA_DE_PRUEBA)).toBe("Declarado €96 500");
    expect(pieBodega("96500.00", "x", MONEDA_CR)).toBe("Declarado ₡96.500 · x");
  });

  it("montado: el pie del detalle sale en la moneda del montaje", () => {
    const textos = enLosTresMontajes(detalleMensajero);
    compruebaCostaRicaYCaida(textos);
    expect(textos.prueba).toContain("Recaudado €100 000 · 19 gestiones");
    expect(textos["sin proveedor"]).toContain("Recaudado ₡100.000 · 19 gestiones");
  });
});

describe("SLT-244 R6 — el detalle montado nombra el impuesto del país", () => {
  it("«Flete por entregado + IGV», «IGV (no es de la empresa)» y la nota «sin IGV, …»; con CR, «IVA»", () => {
    const textos = enLosTresMontajes(detalleMensajero);
    compruebaCostaRicaYCaida(textos);
    expect(textos.prueba).toContain("Flete por entregado + IGV");
    expect(textos.prueba).toContain("Comisión COD + IGV");
    expect(textos.prueba).toContain("Flete por devolución a origen + IGV");
    expect(textos.prueba).toContain("IGV (no es de la empresa)");
    expect(textos.prueba).toContain("sin IGV, ya restados mensajero y bodega");
    expect(textos.prueba).not.toMatch(/\bIVA\b/);
    for (const m of ["cr", "sin proveedor"] as const) {
      expect(textos[m]).toContain("Flete por entregado + IVA");
      expect(textos[m]).toContain("IVA (no es de la empresa)");
      expect(textos[m]).not.toMatch(/\bIGV\b/);
    }
  });

  it("cifrasDe de bodega: «sin IGV, ya restados mensajeros y satélite»", () => {
    const leQueda = (pais: PaisDelCierre) =>
      cifrasDe("bodega", "central", VISTA_BODEGA, pais).find((c) => c.id === "leQueda")?.contexto;
    expect(leQueda(PAIS_PRUEBA)).toBe("sin IGV, ya restados mensajeros y satélite");
    expect(leQueda(PAIS_CR)).toBe("sin IVA, ya restados mensajeros y satélite");
  });

  it("lineasDinero de bodega del modelo nuevo: «Flete de gestiones no entregadas + IGV»", () => {
    const factura = lineasDinero("bodega", { ...VISTA_BODEGA, modeloNuevo: true }, PAIS_PRUEBA).cuentas.find(
      (c) => c.titulo === "Lo que se le factura a la tienda",
    );
    expect(factura?.lineas.map((l) => l.label)).toEqual([
      "Flete por entregado + IGV",
      "Comisión COD + IGV",
      "Flete de gestiones no entregadas + IGV",
      "Total facturado",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 2 — T2.3: la fila (R4, R5, R6, R8, R9, R10)
// ---------------------------------------------------------------------------------------------

// Como en `FilaGestion.test.tsx`.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/cierres-admin",
  useSearchParams: () => new URLSearchParams(),
}));

const DE_CANVAS = "de la orden REM-001 · Beto Ruiz";

/** Monta la fila en cada montaje, la despliega (y abre «Ver cómo se calculó» si se pide) y lee el texto. */
async function filaEnLosTresMontajes(
  g: CierreDetalleGestion,
  opciones: { audiencia?: AudienciaFila; calculo?: boolean; tarjetaMensajero?: boolean } = {},
): Promise<Record<Montaje, string>> {
  const audiencia = opciones.audiencia ?? "central";
  const textos = {} as Record<Montaje, string>;
  for (const m of MONTAJES) {
    const user = userEvent.setup();
    const { container } = render(
      montar(
        m,
        <FilaGestion
          gestion={g}
          audiencia={audiencia}
          quienMiraEsCentral={audiencia === "central"}
          congeladoAt={CONGELADO_AT}
          acciones={{}}
          tarjetaMensajero={opciones.tarjetaMensajero ?? false}
        />,
      ),
    );
    if (!opciones.tarjetaMensajero) {
      const nombre = g.ingresoEmpresa ? `Desglose de ingreso ${DE_CANVAS}` : `Detalle de la orden REM-001 · Beto Ruiz`;
      await user.click(screen.getByRole("button", { name: nombre }));
      if (opciones.calculo) await user.click(screen.getByRole("button", { name: "Ver cómo se calculó" }));
    }
    textos[m] = colapsar(container.textContent ?? "");
    cleanup();
  }
  return textos;
}

describe("SLT-244 R4 — la fila pinta columnas, ganancia y tarjetas con la moneda del país", () => {
  it("central, desplegada: columnas y las cuatro tarjetas", async () => {
    const textos = await filaEnLosTresMontajes(gestionCanvas());
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, [
      "25000.00",
      "15000.00",
      "10000.00",
      "3955.00",
      "565.00",
      "4520.00",
      "520.00",
      "2500.00",
      "700.00",
      "1800.00",
      "600.00",
      "78.00",
      "678.00",
    ]);
    // Escrito a mano.
    expect(textos.prueba).toContain("€25 000");
    expect(textos.prueba).toContain("€4 520");
    expect(textos["sin proveedor"]).toContain("₡4.520");
  });

  it("la tarjeta del mensajero: la ganancia", async () => {
    const textos = await filaEnLosTresMontajes(gestionCanvas(), { audiencia: "mensajero", tarjetaMensajero: true });
    compruebaCostaRicaYCaida(textos);
    compruebaImportes(textos, ["1800.00"]);
    expect(textos.prueba).toContain("€1 800");
  });

  it("sin importe, la ganancia pinta «—» en los tres montajes", () => {
    const g = gestionFila({ gestionId: "s", montoRecibido: null, pagoMensajero: null, ingresoEmpresa: null, pagos: [] });
    for (const m of MONTAJES) {
      const { container } = render(
        montar(
          m,
          <FilaGestion
            gestion={g}
            audiencia="mensajero"
            quienMiraEsCentral={false}
            congeladoAt={CONGELADO_AT}
            acciones={{}}
            tarjetaMensajero
          />,
        ),
      );
      expect(container.querySelector('[data-columna="ganancia"]')?.textContent).toBe(SIN_MONTO_RAYA);
      cleanup();
    }
  });

  it("tarjetasDe: el porcentaje del fulfillment con el impuesto del país", () => {
    const fulfillment = tarjetasDe(gestionCanvas(), "central", true, PAIS_PRUEBA).find((t) => t.id === "fulfillment");
    expect(fulfillment?.lineas.map((l) => l.label)).toEqual(["Fulfillment", "IGV 13 %", "Se cobró"]);
  });
});

describe("SLT-244 R5 — «Ver cómo se calculó»: base en la moneda del país y porcentaje con su separador", () => {
  const conPct = (valor: string) =>
    gestionCanvas({
      ingresoEmpresa: ingresoNuevo({
        conceptosTarifa: ingresoNuevo().conceptosTarifa!.map((c) => (c.concepto === "comisionCod" ? { ...c, valor } : c)),
      }),
    });
  const rotuloComision = (g: CierreDetalleGestion, pais: PaisDelCierre) =>
    calculoDe(g, CONGELADO_AT, pais)!.cuentas.find((c) => c.titulo === "Comisión COD")!.lineas[0].label;

  it("tarifa en porcentaje con base: «2 % de €25 000»; con CR, «2 % de ₡25.000»", () => {
    expect(rotuloComision(gestionCanvas(), PAIS_PRUEBA)).toBe("2 % de €25 000");
    expect(rotuloComision(gestionCanvas(), PAIS_CR)).toBe("2 % de ₡25.000");
    expect(rotuloComision(gestionCanvas(), PAIS_PLATAFORMA)).toBe("2 % de ₡25.000");
  });

  it("«3.50» sale «3,5» con una moneda de coma decimal y «3.5» con MONEDA_DE_PRUEBA", () => {
    expect(rotuloComision(conPct("3.50"), PAIS_CR)).toBe("3,5 % de ₡25.000");
    expect(rotuloComision(conPct("3.50"), PAIS_PRUEBA)).toBe("3.5 % de €25 000");
    expect(porcentajeDe("3.50", null, MONEDA_CR)).toBe("3,5 %");
    expect(porcentajeDe("3.50", null, MONEDA_DE_PRUEBA)).toBe("3.5 %");
    expect(porcentajeDe("2.00", "25000.00", MONEDA_DE_PRUEBA)).toBe("2 % de €25 000");
  });

  it("modelo viejo: «IGV flete (13 % de €4 000)» y la comisión con su base", () => {
    const g = gestionFila({ gestionId: "v", ingresoEmpresa: ingresoViejo() });
    const lineas = (pais: PaisDelCierre, titulo: string) =>
      calculoDe(g, CONGELADO_AT, pais)!.cuentas.find((c) => c.titulo === titulo)!.lineas.map((l) => l.label);
    expect(lineas(PAIS_PRUEBA, "Flete por entregado")).toEqual([
      "tarifa GAM",
      "IGV flete (13 % de €4 000)",
      "Flete por entregado",
    ]);
    expect(lineas(PAIS_PRUEBA, "Comisión COD")).toEqual([
      "Comisión COD (4 % de €25 000)",
      "IGV comisión (13 % de €1 000)",
      "Comisión COD",
    ]);
    // R9: con Costa Rica, el texto de hoy.
    expect(lineas(PAIS_CR, "Flete por entregado")[1]).toBe("IVA flete (13 % de ₡4.000)");
    expect(conPorcentaje("IGV flete", "13.00", "4000.00", MONEDA_DE_PRUEBA)).toBe("IGV flete (13 % de €4 000)");
  });

  it("modelo viejo con devolución: «IGV del flete por devolución a origen (13 % de €…)»", () => {
    const g = gestionFila({
      gestionId: "d",
      resultado: "devolucion_a_origen_por_rechazo",
      ingresoEmpresa: ingresoViejo({ fleteDevolucion: "2000.00", ivaFleteDevolucion: "260.00", fleteDevolucionConIva: "2260.00" }),
    });
    const cuenta = calculoDe(g, CONGELADO_AT, PAIS_PRUEBA)!.cuentas.find((c) => c.lineas[1]?.label.startsWith("IGV del flete"));
    expect(cuenta?.lineas[1].label).toBe("IGV del flete por devolución a origen (13 % de €2 000)");
  });

  it("montado: «Ver cómo se calculó» pinta «2 % de €25 000» y «IGV 13 %»", async () => {
    const textos = await filaEnLosTresMontajes(gestionCanvas(), { calculo: true });
    compruebaCostaRicaYCaida(textos);
    expect(textos.prueba).toContain("2 % de €25 000");
    expect(textos.prueba).toContain("IGV 13 %");
    expect(textos["sin proveedor"]).toContain("2 % de ₡25.000");
    expect(textos["sin proveedor"]).toContain("IVA 13 %");
  });
});

describe("SLT-244 R6 — la fila montada nombra el impuesto del país", () => {
  it("«de eso, IGV (no es de la empresa)» y «Flete por entregado + IGV»; con CR, «IVA»", async () => {
    const textos = await filaEnLosTresMontajes(gestionCanvas());
    compruebaCostaRicaYCaida(textos);
    expect(textos.prueba).toContain("de eso, IGV (no es de la empresa)");
    expect(textos.prueba).toContain("Flete por entregado + IGV");
    expect(textos.prueba).not.toMatch(/\bIVA\b/);
    for (const m of ["cr", "sin proveedor"] as const) {
      expect(textos[m]).toContain("de eso, IVA (no es de la empresa)");
      expect(textos[m]).not.toMatch(/\bIGV\b/);
    }
  });

  it("tarjetasDe del modelo nuevo con novedad: «Flete por novedad + IGV»", () => {
    const g = gestionCanvas({
      resultado: "novedad",
      ingresoEmpresa: ingresoNuevo({ fleteDevolucionConIva: "2260.00" }),
    });
    const cobro = tarjetasDe(g, "central", true, PAIS_PRUEBA).find((t) => t.id === "cobro");
    expect(cobro?.lineas.map((l) => l.label)).toContain("Flete por novedad + IGV");
    expect(cobro?.aparte?.label).toBe("de eso, IGV (no es de la empresa)");
  });
});

// ---------------------------------------------------------------------------------------------
// R8 — sin `pais` o sin `moneda`, el typecheck rechaza la llamada (lo comprueba `pnpm run typecheck`)
// ---------------------------------------------------------------------------------------------

/** Nunca se llama: solo existe para que `tsc` compruebe cada `@ts-expect-error`. */
function llamadasSinPais(): unknown[] {
  const g = gestionCanvas();
  return [
    // @ts-expect-error R8: `cifrasDe` sin `pais`.
    cifrasDe("mensajero", "central", VISTA_MENSAJERO),
    // @ts-expect-error R8: `lineasDinero` sin `pais`.
    lineasDinero("bodega", VISTA_BODEGA),
    // @ts-expect-error R8: `tarjetasDe` sin `pais`.
    tarjetasDe(g, "central", true),
    // @ts-expect-error R8: `calculoDe` sin `pais`.
    calculoDe(g, CONGELADO_AT),
    // @ts-expect-error R8: `porcentajeDe` sin `moneda`.
    porcentajeDe("2.00", "25000.00"),
    // @ts-expect-error R8: `libroGestiones` sin `moneda`.
    libroGestiones({ items: [], rechazos: [], columnasAnterior: [], audiencia: "admin" }),
  ];
}

describe("SLT-244 R8 — moneda e impuesto obligatorios", () => {
  it("las llamadas sin `pais` o sin `moneda` existen solo para el typecheck", () => {
    expect(typeof llamadasSinPais).toBe("function");
  });
});

// ---------------------------------------------------------------------------------------------
// Bloque 3 — T3.1: la descarga «Gestiones» del modelo nuevo (R7, R9, R10)
// ---------------------------------------------------------------------------------------------

/** Ingreso del modelo nuevo, como en `cierres-gestiones-modelo-nuevo-descarga.test.ts`. */
function ingresoDescarga(over: Partial<IngresoEmpresaDTO>): IngresoEmpresaDTO {
  return {
    tarifaModelo: "nuevo",
    montoCobrar: null,
    cobraComision: false,
    esCentral: false,
    esZonaEspecial: false,
    fleteOrigen: "normal",
    fleteDevolucionOrigen: "normal",
    flete: null,
    ivaFlete: null,
    fleteDevolucion: null,
    ivaFleteDevolucion: null,
    comisionCod: null,
    ivaComisionCod: null,
    fleteConIva: null,
    fleteDevolucionConIva: null,
    comisionConIva: null,
    total: "0.00",
    fulfillment: null,
    ivaFulfillment: null,
    tarifa: null,
    ...over,
  };
}

/** La gestión «A» de `cierres-gestiones-modelo-nuevo-descarga.test.ts`: flete fijo, comisión en %. */
const GESTION_DESCARGA: CierreGestionDescargaDTO = {
  mensajeroNombre: "Mario Mensajero",
  cierreSolicitadoAt: "2026-11-06T18:00:00.000Z",
  fechaGestion: "2026-11-06",
  diaReparto: "2026-11-05",
  fechaCreacionOrden: "2026-11-04",
  folioCierre: "ABCD1234",
  cierreModelo: "nuevo",
  numGuia: 501,
  numRemision: "REM-A",
  destinatario: "Laura Díaz",
  direccion: "Calle 3",
  zonaNombre: "Centro",
  provinciaNombre: "San José",
  cantonNombre: "Central",
  distritoNombre: "Carmen",
  producto: "Caja",
  tiendaNombre: "Tienda Sol",
  intentosContactoTienda: 0,
  intentosEntrega: 1,
  resultado: "entregado",
  montoRecibido: "25000.00",
  pagos: [{ metodo: "efectivo", monto: "25000.00" }],
  motivo: null,
  fechaReprogramacion: null,
  esRechazoSla: false,
  causaIncidente: null,
  indemnizacion: null,
  pagoMensajero: "1800.00",
  ingresoBodegaRechazo: null,
  ingresoEmpresa: ingresoDescarga({
    montoCobrar: "25000.00",
    cobraComision: true,
    flete: "3500.00",
    ivaFlete: "455.00",
    comisionCod: "500.00",
    ivaComisionCod: "65.00",
    total: "4520.00",
    ivaIncluido: "520.00",
    conceptosTarifa: [
      { concepto: "flete", modo: "monto", valor: "3500.00", ivaPct: "13.00", base: null, nivel: "grupo", zonaNombre: "Centro", grupoNombre: "San José centro", vehiculoNombre: null },
      { concepto: "comisionCod", modo: "porcentaje", valor: "2.00", ivaPct: "13.00", base: "25000.00", nivel: "zona", zonaNombre: "Centro", grupoNombre: null, vehiculoNombre: null },
    ],
  }),
  pagoPorTarifa: {
    importe: "2500.00",
    modo: "monto",
    valor: "2500.00",
    base: null,
    nivel: "zona",
    zonaNombre: "Centro",
    grupoNombre: null,
    vehiculoNombre: null,
    ajuste: null,
  },
  ajustesPago: [],
  tarifaFaltante: false,
};

/** Las claves de texto de tarifa: las únicas celdas que cambian con la moneda (R7). */
const CLAVES_TARIFA: ReadonlySet<string> = new Set([
  "tarifaFlete",
  "tarifaComision",
  "tarifaFleteDevolucion",
  "tarifaPago",
]);

describe("SLT-244 R7 — la descarga «Gestiones» escribe la tarifa en la moneda del país", () => {
  it("filaGestionModeloNuevoEn(MONEDA_DE_PRUEBA): «Monto fijo €3 500 · …» y «2 % de €25 000 · …»", () => {
    const fila = filaGestionModeloNuevoEn(MONEDA_DE_PRUEBA)(GESTION_DESCARGA, "admin");
    // Escrito a mano (MONEDA_DE_PRUEBA: «€», espacio de miles, sin decimales).
    expect(fila.tarifaFlete).toBe("Monto fijo €3 500 · grupo «San José centro» de la zona Centro");
    expect(fila.tarifaComision).toBe("2 % de €25 000 · valor base de la zona Centro");
    expect(fila.tarifaPago).toBe("Monto fijo €2 500 · valor base de la zona Centro");
  });

  it("las demás celdas son las mismas que con MONEDA_PLATAFORMA (mismas claves)", () => {
    for (const audiencia of ["admin", "satelite"] as const) {
      const prueba = filaGestionModeloNuevoEn(MONEDA_DE_PRUEBA)(GESTION_DESCARGA, audiencia);
      const plataforma = filaGestionModeloNuevoEn(MONEDA_PLATAFORMA)(GESTION_DESCARGA, audiencia);
      expect(Object.keys(prueba)).toEqual(Object.keys(plataforma));
      for (const columna of columnasGestionesModeloNuevoPara(audiencia)) {
        if (CLAVES_TARIFA.has(columna.clave)) continue;
        expect(prueba[columna.clave]).toEqual(plataforma[columna.clave]);
      }
    }
  });

  it("con MONEDA_CR, el texto de hoy (R9): igual que con MONEDA_PLATAFORMA", () => {
    expect(filaGestionModeloNuevoEn(MONEDA_CR)(GESTION_DESCARGA, "admin")).toEqual(
      filaGestionModeloNuevoEn(MONEDA_PLATAFORMA)(GESTION_DESCARGA, "admin"),
    );
    expect(filaGestionModeloNuevoEn(MONEDA_PLATAFORMA)(GESTION_DESCARGA, "admin").tarifaFlete).toBe(
      "Monto fijo ₡3.500 · grupo «San José centro» de la zona Centro",
    );
  });

  it("libroGestiones usa la moneda que recibe en la hoja «Gestiones»", () => {
    const hojas = libroGestiones({
      items: [GESTION_DESCARGA],
      rechazos: [],
      columnasAnterior: [],
      audiencia: "admin",
      moneda: MONEDA_DE_PRUEBA,
    });
    expect(hojas?.[0].filas[0].tarifaComision).toBe("2 % de €25 000 · valor base de la zona Centro");
  });
});

const MENSAJERO_DESCARGA = "11111111-1111-4111-8111-111111111111";
const CATALOGO_DESCARGA: CatalogoFiltrosCierresDTO = {
  zonas: [{ id: "33333333-3333-4333-8333-333333333333", nombre: "Centro" }],
  mensajeros: [{ id: MENSAJERO_DESCARGA, nombre: "Mario Mensajero", zonaId: null }],
  mensajerosFiltro: [{ id: MENSAJERO_DESCARGA, nombre: "Mario Mensajero", zonaId: null }],
};

/** Monta el diálogo (como `DescargarGestionesDialog.test.tsx`), descarga y devuelve las tarifas del libro. */
async function tarifasDelLibro(montaje: Montaje): Promise<{ flete: unknown; comision: unknown }> {
  descarga.blob.mockReset();
  descarga.construir.mockReset();
  const accion = vi.fn(async () => ({
    status: "ok" as const,
    items: [GESTION_DESCARGA],
    total: 1,
    rechazosDeTienda: [],
  }));
  const user = userEvent.setup();
  render(
    montar(
      montaje,
      <ToastProvider>
        <DescargarGestionesDialog
          catalogo={CATALOGO_DESCARGA}
          accion={accion}
          columnas={COLUMNAS_DESCARGA_GESTIONES_FUNDIDA}
          audiencia="admin"
        />
      </ToastProvider>,
    ),
  );
  await user.click(screen.getByRole("button", { name: "Descargar detallada por mensajero" }));
  await user.click(await screen.findByRole("button", { name: "Descargar Gestiones de cierres" }));
  // El generador se importa en dinámico (exceljs): con la suite en paralelo tarda más de 1 s.
  await waitFor(() => expect(descarga.blob).toHaveBeenCalled(), { timeout: 15_000 });
  expect(descarga.construir).toHaveBeenCalledTimes(1);
  const config = descarga.construir.mock.calls[0][0] as DescargaConfig;
  expect(config.tituloHoja).toBe("Gestiones");
  cleanup();
  return { flete: config.filas[0].tarifaFlete, comision: config.filas[0].tarifaComision };
}

describe("SLT-244 R7 — DescargarGestionesDialog arma el libro con la moneda del país", () => {
  it("con el proveedor de prueba, «€» en la tarifa; con CR, lo mismo que sin proveedor (R9, R10)", async () => {
    const prueba = await tarifasDelLibro("prueba");
    expect(prueba).toEqual({
      flete: "Monto fijo €3 500 · grupo «San José centro» de la zona Centro",
      comision: "2 % de €25 000 · valor base de la zona Centro",
    });
    const cr = await tarifasDelLibro("cr");
    const sinProveedor = await tarifasDelLibro("sin proveedor");
    expect(cr).toEqual(sinProveedor);
    expect(sinProveedor).toEqual({
      flete: "Monto fijo ₡3.500 · grupo «San José centro» de la zona Centro",
      comision: "2 % de ₡25.000 · valor base de la zona Centro",
    });
  }, 60_000);
});

// --- Bloque 4 (T4.3): censo de la carpeta y excepciones de `pais-sin-literales` ---

const CARPETA_CIERRES = "components/private/cierres";

/** Cada `.ts`/`.tsx` de la carpeta, leído del disco: un archivo nuevo entra solo (design §8). */
function archivosDeCierres(): string[] {
  return readdirSync(join(process.cwd(), CARPETA_CIERRES), { recursive: true, encoding: "utf8" })
    .map((rel) => `${CARPETA_CIERRES}/${rel.replace(/\\/g, "/")}`)
    .filter((rel) => /\.tsx?$/.test(rel))
    .sort();
}

/** Los formateadores que usan la moneda de la plataforma sin nombrarla (R12). */
const FORMATEADORES_IMPLICITOS_CIERRES = ["money", "moneyTope", "formatMontoString", "formatMontoTope"];
/** Los rótulos de `cierres-admin` con «IVA» de la tabla de design §5 que se quedan (R13). */
const ROTULOS_CON_IVA = [
  "FLETE_DEV_CON_IVA_LABEL",
  "FLETE_NO_ENTREGADAS_CON_IVA_LABEL",
  "fleteDevConIvaDeGestion",
  "ivaFleteNoEntregaLabel",
  "IVA_FLETE_LABEL",
  "IVA_COMISION_LABEL",
  "IVA_FLETE_RECHAZO_LABEL",
];

/** Lo que un archivo de `components/private/cierres/**` hace mal (R12, R13); vacío si nada. */
function infraccionesDeCierres(fuente: string): string[] {
  const codigo = quitarComentarios(fuente);
  const infracciones: string[] = [];
  for (const nombre of FORMATEADORES_IMPLICITOS_CIERRES) {
    if (new RegExp(`(?<![\\w.$])${nombre}\\s*\\(`).test(codigo)) infracciones.push(`llama a ${nombre}(`);
  }
  if (/\bIVA\b/.test(codigo)) infracciones.push("escribe «IVA»");
  if (/import\s+(?:type\s+)?\{[^}]*\bIMPUESTO_ROTULO\b[^}]*\}\s*from/.test(codigo)) {
    infracciones.push("importa IMPUESTO_ROTULO");
  }
  if (/(?<![\w.$])porcentajeParaVerEnLaPlataforma\s*\(/.test(codigo)) {
    infracciones.push("llama a porcentajeParaVerEnLaPlataforma(");
  }
  for (const m of codigo.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const rotulo of ROTULOS_CON_IVA) {
      if (new RegExp(`\\b${rotulo}\\b`).test(m[1])) infracciones.push(`importa ${rotulo}`);
    }
  }
  return infracciones;
}

describe("SLT-244 R12, R13 — censo de components/private/cierres/** leído del disco", () => {
  const archivos = archivosDeCierres();

  it("la carpeta tiene archivos que censar (no-vacuidad)", () => {
    expect(archivos.length).toBeGreaterThanOrEqual(20);
    expect(archivos).toContain(`${CARPETA_CIERRES}/detalle/detalle-cierre-vista.ts`);
    expect(archivos).toContain(`${CARPETA_CIERRES}/fila/fila-gestion-labels.ts`);
  });

  it.each(archivos)("R12, R13: %s no llama a formateadores implícitos ni escribe «IVA»", (archivo) => {
    const fuente = readFileSync(join(process.cwd(), archivo), "utf8");
    expect(fuente.length).toBeGreaterThan(0);
    expect(infraccionesDeCierres(fuente)).toEqual([]);
  });

  describe("contraprueba sobre fuentes inventadas", () => {
    const ROJOS: [string, string, string][] = [
      ["money(", `import { money } from "@/lib/config/moneda";\nconst t = money(1);`, "llama a money("],
      ["moneyTope(", `const t = moneyTope(1);`, "llama a moneyTope("],
      ["formatMontoString(", `const t = formatMontoString("1");`, "llama a formatMontoString("],
      ["formatMontoTope(", `const t = formatMontoTope(1);`, "llama a formatMontoTope("],
      ["«IVA» en un texto", `const r = "Flete + IVA";`, "escribe «IVA»"],
      ["«IVA» en una plantilla", "const r = `IVA ${pct} %`;", "escribe «IVA»"],
      [
        "IMPUESTO_ROTULO importado",
        `import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";`,
        "importa IMPUESTO_ROTULO",
      ],
      [
        "porcentajeParaVerEnLaPlataforma(",
        `const p = porcentajeParaVerEnLaPlataforma(3.5);`,
        "llama a porcentajeParaVerEnLaPlataforma(",
      ],
      ...ROTULOS_CON_IVA.map((rotulo): [string, string, string] => [
        `${rotulo} importado`,
        `import {\n  otra,\n  ${rotulo},\n} from "@/app/(app)/cierres-admin/_components/cierre-labels";`,
        `importa ${rotulo}`,
      ]),
    ];
    it.each(ROJOS)("rojo con %s", (_caso, fuente, infraccion) => {
      expect(infraccionesDeCierres(fuente)).toContain(infraccion);
    });

    const VERDES: [string, string][] = [
      ["money( en un comentario de línea", `// antes: money(1)\nconst x = 1;`],
      ["formateadores en un comentario de bloque", `/* moneyTope(1), formatMontoString("1"), formatMontoTope(1) */\nconst x = 1;`],
      ["«IVA» en un comentario", `// «Flete + IVA» era el texto viejo\n/** De eso, IVA */\nconst x = 1;`],
      ["IMPUESTO_ROTULO en un comentario", `// import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";\nconst x = 1;`],
      ["porcentajeParaVerEnLaPlataforma en un comentario", `// porcentajeParaVerEnLaPlataforma(3.5)\nconst x = 1;`],
      ["los rótulos con «IVA» en un comentario", `/*\nimport { ${ROTULOS_CON_IVA.join(", ")} } from "./x";\n*/\nconst x = 1;`],
      ["la moneda explícita", `import { formatearMontoEn } from "@/lib/config/moneda";\nformatearMontoEn(moneda, 1, SIN_MONTO_RAYA);`],
      ["un nombre interno con «iva»", `const v = fila.fleteConIva + fila.ivaFlete;`],
    ];
    it.each(VERDES)("verde con %s", (_caso, fuente) => {
      expect(infraccionesDeCierres(fuente)).toEqual([]);
    });
  });
});

describe("SLT-244 R14 — la lista de excepciones de `pais-sin-literales` no tiene nada a nombre de SLT-244", () => {
  it("ninguna excepción está a nombre de SLT-244", async () => {
    const { EXCEPCIONES_PAIS_SIN_LITERALES } = await import("@/tests/unit/guards/_pais-sin-literales-excepciones");
    expect(EXCEPCIONES_PAIS_SIN_LITERALES.filter((e) => e.ficha === "SLT-244")).toEqual([]);
  });

  it("el tope queda en 12 o menos y la lista no lo supera", async () => {
    const { EXCEPCIONES_PAIS_SIN_LITERALES, TOPE_EXCEPCIONES } = await import(
      "@/tests/unit/guards/_pais-sin-literales-excepciones"
    );
    // Rebanadas posteriores de SLT-235 bajan el tope: se fija como máximo, no exacto.
    expect(TOPE_EXCEPCIONES).toBeLessThanOrEqual(12);
    expect(EXCEPCIONES_PAIS_SIN_LITERALES.length).toBeLessThanOrEqual(TOPE_EXCEPCIONES);
  });
});
