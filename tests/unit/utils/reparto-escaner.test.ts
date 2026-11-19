import { describe, it, expect } from "vitest";

import { ordenPorGuia } from "@/app/(app)/mis-asignaciones/_components/reparto-escaner";
import type { MiAsignacionDTO } from "@/lib/interfaces/services/IMisAsignacionesService";

// SLT-156 (R514, R515): qué orden por gestionar corresponde a la guía leída en Reparto.

function orden(id: string, numGuia: number | null): MiAsignacionDTO {
  return { id, numGuia, estatusValue: "en_reparto" } as MiAsignacionDTO;
}

describe("ordenPorGuia", () => {
  it("encuentra la orden por gestionar por su número de guía", () => {
    const porGestionar = [orden("a", 3141), orden("b", 2718), orden("c", 1618)];
    expect(ordenPorGuia(porGestionar, [], 2718)?.id).toBe("b");
  });

  it("ignora las órdenes con ayuda solicitada: ni las de su lista ni una que figure en las dos", () => {
    const ayuda = orden("ayuda", 5923);
    const repetida = orden("repetida", 6047);
    const porGestionar = [orden("a", 3141), repetida];
    const conAyuda = [ayuda, repetida];
    expect(ordenPorGuia(porGestionar, conAyuda, 5923)).toBeNull();
    expect(ordenPorGuia(porGestionar, conAyuda, 6047)).toBeNull();
    expect(ordenPorGuia(porGestionar, conAyuda, 3141)?.id).toBe("a");
  });

  it("devuelve null si la guía no es de ninguna (tampoco de una orden sin guía)", () => {
    const porGestionar = [orden("a", 3141), orden("sin", null)];
    expect(ordenPorGuia(porGestionar, [], 8093)).toBeNull();
    expect(ordenPorGuia([], [], 3141)).toBeNull();
  });
});
