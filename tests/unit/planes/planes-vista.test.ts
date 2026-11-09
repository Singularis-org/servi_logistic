import { describe, expect, it } from "vitest";

import { NOMBRES_DEL_TOPE, lineaTopeSobra, mensajeTopesSobran } from "@/lib/planes/mensajes";
import { ROLES_CON_TOPE } from "@/lib/types/planes";

// SLT-99 (design §5, §6; R4, R6, R8, R13) — la lógica de vista de los planes. La tanda de backend (T3) solo trae
// el texto de R13 (`mensajeTopesSobran`), que comparten el rechazo del servicio y el aviso previo del detalle;
// T5.1 suma aquí `components/shared/planes/planes-vista.ts`.

describe("R13 (P4) — «sobra(n) N {rol}» por cada rol con tope y por API keys", () => {
  it("cada rol con tope y las API keys tienen su nombre en singular y en plural", () => {
    expect(Object.keys(NOMBRES_DEL_TOPE).sort()).toEqual([...ROLES_CON_TOPE, "api_keys"].sort());
  });

  it.each([
    ["admin", "administrador", "administradores"],
    ["mensajero", "mensajero", "mensajeros"],
    ["adminTienda", "admin de tienda", "admins de tienda"],
    ["adminSatelite", "admin satélite", "admins satélite"],
    ["api_keys", "API key", "API keys"],
  ] as const)("%s: singular con 1 de más y plural con varios", (tope, singular, plural) => {
    expect(lineaTopeSobra("Básico", { tope, usados: 4, maximo: 3 })).toBe(`Básico permite 3 y tienes 4: sobra 1 ${singular}.`);
    expect(lineaTopeSobra("Básico", { tope, usados: 7, maximo: 3 })).toBe(`Básico permite 3 y tienes 7: sobran 4 ${plural}.`);
  });

  it("el aviso completo abre con «No puedes cambiar a {plan}:» y lleva una línea por tope pasado", () => {
    expect(
      mensajeTopesSobran("Básico", [
        { tope: "mensajero", usados: 6, maximo: 5 },
        { tope: "api_keys", usados: 3, maximo: 1 },
      ]),
    ).toBe("No puedes cambiar a Básico:\nBásico permite 5 y tienes 6: sobra 1 mensajero.\nBásico permite 1 y tienes 3: sobran 2 API keys.");
  });
});
