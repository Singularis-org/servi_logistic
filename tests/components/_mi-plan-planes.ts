// SLT-99 — los planes de «Mi plan» (`verPlanesDeMiPlan`) para los tests de la pantalla. Datos de ejemplo: dos planes
// públicos disponibles, «Básico» activo con cobro mensual y el corte el 1 de diciembre.
import type { PlanesDeMiPlan } from "@/app/(app)/mi-plan/_components/CambioDePlan";
import type { PlanVista } from "@/lib/types/planes";

export const BASICO: PlanVista = {
  id: "basico",
  nombre: "Básico",
  precio: { tipo: "monto", mensual: "12000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "10" } } },
  costoPorOrden: "200.00",
  costoPorOrdenPorcentual: null,
  topes: { porRol: { admin: 2, mensajero: 10, adminTienda: 5, adminSatelite: 1 }, apiKeys: 2 },
  modulos: [],
};

export const PRO: PlanVista = {
  id: "pro",
  nombre: "Pro",
  precio: { tipo: "monto", mensual: "85000.00", descuentos: { anual: { tipo: "porcentaje", porcentaje: "15" } } },
  costoPorOrden: "90.00",
  costoPorOrdenPorcentual: null,
  topes: { porRol: { admin: 10, mensajero: 60, adminTienda: 10, adminSatelite: 5 }, apiKeys: 5 },
  modulos: ["analitica", "monitoreo", "ranking"],
};

export const CUSTOM: PlanVista = { ...BASICO, id: "custom-1", nombre: "A la medida · Logística Norte" };

export function planesDeMiPlan(extra: Partial<PlanesDeMiPlan> = {}): PlanesDeMiPlan {
  return {
    estado: "ok",
    planes: [BASICO, PRO],
    activoId: "basico",
    customActivo: null,
    tipoCobro: "mensual",
    corte: "2026-12-01",
    primerPeriodo: {
      basico: { periodo: { desde: "2026-12-01", hasta: "2026-12-31", esTramo: false }, costo: "12000.00" },
      pro: { periodo: { desde: "2026-12-01", hasta: "2026-12-31", esTramo: false }, costo: "85000.00" },
    },
    puedeCambiar: true,
    hayPendiente: false,
    activoEsCustom: false,
    ...extra,
  };
}

/** Sin plan (R18, P5): los planes se ven pero no se elige. */
export function planesSinPlan(): PlanesDeMiPlan {
  return planesDeMiPlan({ activoId: null, tipoCobro: null, corte: null, primerPeriodo: {}, puedeCambiar: false });
}
