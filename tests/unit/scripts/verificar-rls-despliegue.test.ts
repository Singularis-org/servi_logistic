import { describe, it, expect } from "vitest";

import { MODELOS_DE_NEGOCIO } from "@/lib/db/modelos-de-negocio";
import { contratoEsperado, evaluarCatalogo } from "@/scripts/verificar-rls-despliegue";

// SL-38 (R23) — el punto 6 del script de despliegue espera una politica `*_por_empresa` y un trigger
// `*_sin_cambio_de_empresa` por cada modelo de `MODELOS_DE_NEGOCIO`, sin un numero escrito a mano.
//
// Mutacion (progress/impl_SL-38.md, T10): con las constantes otra vez en literal, la lista inventada
// de dos modelos sigue esperando el literal y este archivo cae.

const DOS_MODELOS = [
  { modelo: "Inventado", tabla: "inventado" },
  { modelo: "OtroInventado", tabla: "otro_inventado" },
] as const;

describe("verificar-rls-despliegue — el contrato sale de MODELOS_DE_NEGOCIO (R23)", () => {
  it("con una lista inventada de 2 modelos espera 2 politicas y 2 triggers sin cambio de empresa", () => {
    expect(contratoEsperado(DOS_MODELOS)).toEqual({
      politicasPorEmpresa: 2,
      triggersMismaEmpresa: 151,
      triggersSinCambio: 2,
    });
  });

  it("sin argumento usa MODELOS_DE_NEGOCIO, que hoy son 75 tablas (SL-38 y SL-40)", () => {
    expect(MODELOS_DE_NEGOCIO).toHaveLength(75);
    expect(contratoEsperado()).toEqual({ politicasPorEmpresa: 75, triggersMismaEmpresa: 151, triggersSinCambio: 75 });
  });

  it("el punto 6 da OK con lo que pide el contrato y FALLA con una tabla de mas o de menos", () => {
    const contrato = contratoEsperado(DOS_MODELOS);
    const cuadra = { politicas: 2, para_app: 2, con_rls: 2, sme: 151, sin_cambio: 2 };
    expect(evaluarCatalogo(cuadra, contrato)).toMatchObject({ punto: 6, ok: true });
    expect(evaluarCatalogo({ ...cuadra, politicas: 3, para_app: 3, con_rls: 3 }, contrato).ok).toBe(false);
    expect(evaluarCatalogo({ ...cuadra, sin_cambio: 1 }, contrato).ok).toBe(false);
    expect(evaluarCatalogo(cuadra, contrato).detalle).toContain("politicas *_por_empresa=2/2");
  });
});
