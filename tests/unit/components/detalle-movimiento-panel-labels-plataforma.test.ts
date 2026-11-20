import { describe, it, expect } from "vitest";

import {
  ACCION_AUTOMATICA_LABEL,
  PANEL_TEXTO,
  PLATAFORMA_ANULO,
  textoRegistro,
} from "@/components/shared/wallet/detalle-movimiento-panel-labels";
import type { RegistroDTO } from "@/lib/types/estado-cuenta";

// SLT-143 (T3.2; design §5/§5.1) — los literales escritos a mano: la marca de la plataforma no lleva
// «Automático», ni el nombre ni el id del superadmin.

describe("SLT-143 — textos de la plataforma en la wallet", () => {
  it("R13 — un pago registrado por fuera dice «Registrado por la plataforma», sin «Automático»", () => {
    const registro: RegistroDTO = { nombre: null, automatico: { accion: "plataforma", por: null } };
    expect(ACCION_AUTOMATICA_LABEL.plataforma).toBe("Registrado por la plataforma");
    expect(textoRegistro(registro)).toBe("Registrado por la plataforma");
  });

  it("R36 — el contra-asiento de la anulación dice «Anulado por la plataforma», sin «Automático»", () => {
    const registro: RegistroDTO = { nombre: null, automatico: { accion: "plataforma_anulacion", por: null } };
    expect(ACCION_AUTOMATICA_LABEL.plataforma_anulacion).toBe("Anulado por la plataforma");
    expect(textoRegistro(registro)).toBe("Anulado por la plataforma");
  });

  it("R36 — la línea de anulación del pago original nombra a la plataforma", () => {
    expect(PLATAFORMA_ANULO).toBe("la plataforma");
    expect(PANEL_TEXTO.anuladoDetalle("2026-11-19", PLATAFORMA_ANULO, "Pago duplicado", "14:05")).toBe(
      "Anulado el 2026-11-19 a las 14:05 por la plataforma · Pago duplicado",
    );
  });

  it("las acciones automáticas de antes conservan el prefijo «Automático · »", () => {
    const registro: RegistroDTO = { nombre: null, automatico: { accion: "sistema", por: null } };
    expect(textoRegistro(registro)).toBe("Automático · Registro del sistema");
  });
});
