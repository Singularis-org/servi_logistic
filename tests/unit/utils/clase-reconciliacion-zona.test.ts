import { describe, expect, it } from "vitest";

import { ORDER_STATUS_SEED, type OrderStatusValue } from "@/lib/types/order-status";
import { ESTADOS_TERMINALES } from "@/lib/types/order-status-transiciones";
import {
  CLASE_RECONCILIACION_ZONA,
  ESTADOS_QUE_NO_SE_MUEVEN,
  type ClaseReconciliacionZona,
} from "@/lib/utils/estados-bodega-satelite";

/**
 * SLT-224 PR 2 (design §2.4, R1725) — cada estado del catalogo, clasificado para la reconciliacion de
 * zona. El `Record<OrderStatusValue, …>` ya rompe el typecheck si falta un estado; este test fija
 * ademas QUE clase lleva cada uno, escrito LITERAL (no derivado del propio mapa), para que mover un
 * estado de clase sea un cambio visible y no una casualidad.
 *
 * SLT-248 (R1801, R1805): `reprogramado` y `novedad` pasan a «se mueve»; la clase `por_liberar` ya no
 * existe y `devolucion` queda con 5 estados.
 */

function deClase(clase: ClaseReconciliacionZona): string[] {
  return (Object.keys(CLASE_RECONCILIACION_ZONA) as OrderStatusValue[])
    .filter((v) => CLASE_RECONCILIACION_ZONA[v] === clase)
    .sort();
}

describe("SLT-224/R1725 — la clasificacion de estados para la reconciliacion de zona", () => {
  it("las claves del mapa son exactamente el catalogo de estados", () => {
    expect(Object.keys(CLASE_RECONCILIACION_ZONA).sort()).toEqual([...ORDER_STATUS_SEED].sort());
  });

  it("R1801: «se mueve»: las vivas (con `reprogramado` y `novedad`), escritas literal", () => {
    expect(deClase("se_mueve")).toEqual(
      [
        "en_preparacion",
        "por_recolectar_en_tienda",
        "recolectando",
        "en_ruta_bodega_central",
        "en_bodega_central",
        "mensajero_recogiendo_en_bodega",
        "en_ruta_bodega_satelite",
        "en_reparto",
        "novedad_interna",
        "reprogramado",
        "novedad",
      ].sort(),
    );
  });

  it("R1805: cada clase que no se mueve, escrita literal", () => {
    expect(deClase("estante_satelite")).toEqual(["en_bodega_satelite"]);
    expect(deClase("finalizada")).toEqual(["devuelta_a_tienda", "entregado", "incidente"]);
    expect(deClase("devolucion")).toEqual(
      [
        "por_devolver_a_bodega_central",
        "devolviendo_a_bodega_central",
        "devolucion_a_origen_por_rechazo",
        "por_devolver_a_tienda",
        "devolviendo_a_tienda",
      ].sort(),
    );
  });

  it("R1721: `finalizada` es exactamente `ESTADOS_TERMINALES`", () => {
    expect(deClase("finalizada")).toEqual([...ESTADOS_TERMINALES].sort());
  });

  it("`ESTADOS_QUE_NO_SE_MUEVEN` es el complemento de «se mueve» (9 estados, R1805)", () => {
    expect([...ESTADOS_QUE_NO_SE_MUEVEN].sort()).toEqual(
      [
        "en_bodega_satelite",
        "entregado",
        "devuelta_a_tienda",
        "incidente",
        "por_devolver_a_bodega_central",
        "devolviendo_a_bodega_central",
        "devolucion_a_origen_por_rechazo",
        "por_devolver_a_tienda",
        "devolviendo_a_tienda",
      ].sort(),
    );
  });
});
