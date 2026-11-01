import { describe, it, expect } from "vitest";

import { MODELOS_CON_EMPRESA_OPCIONAL, MODELOS_DE_NEGOCIO } from "@/lib/db/modelos-de-negocio";
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
    expect(contratoEsperado(DOS_MODELOS, [])).toEqual({
      politicasPorEmpresa: 2,
      triggersMismaEmpresa: 156,
      triggersSinCambio: 2,
    });
  });

  it("sin argumento usa MODELOS_DE_NEGOCIO, que hoy son 80 tablas (SL-38, SL-40, las dos de SL-36, SL-23, SLT-56 y SLT-73)", () => {
    expect(MODELOS_DE_NEGOCIO).toHaveLength(80);
    // SLT-56: `gestion_pago_mensajero_ajuste` suma una politica, tres `sme_*` y un sin-cambio.
    // SLT-73: `conciliacion_bodega_ajuste` suma su politica, su trigger sin cambio y DOS de misma
    // empresa (sus FK a `cierre_bodega` y a `usuario`).
    // SL-23: `organizacion_modulo` tampoco suma triggers de misma empresa: su unica FK es a `organizacion`.
    // SL-36 no suma triggers de misma empresa: sus dos tablas no tienen FK a otra tabla de negocio.
    // SL-19: `jobs` (empresa opcional) suma su `jobs_por_empresa`, pero no tiene trigger sin cambio.
    expect(MODELOS_CON_EMPRESA_OPCIONAL.map((m) => m.tabla)).toEqual(["jobs"]);
    expect(contratoEsperado()).toEqual({ politicasPorEmpresa: 81, triggersMismaEmpresa: 156, triggersSinCambio: 80 });
  });

  it("SL-19 — una tabla de empresa opcional suma una politica y ningun trigger sin cambio de empresa", () => {
    expect(contratoEsperado(DOS_MODELOS, [{ modelo: "Opcional", tabla: "opcional" }])).toEqual({
      politicasPorEmpresa: 3,
      triggersMismaEmpresa: 156,
      triggersSinCambio: 2,
    });
  });

  it("el punto 6 da OK con lo que pide el contrato y FALLA con una tabla de mas o de menos", () => {
    const contrato = contratoEsperado(DOS_MODELOS, []);
    const cuadra = { politicas: 2, para_app: 2, con_rls: 2, sme: 156, sin_cambio: 2 };
    expect(evaluarCatalogo(cuadra, contrato)).toMatchObject({ punto: 6, ok: true });
    expect(evaluarCatalogo({ ...cuadra, politicas: 3, para_app: 3, con_rls: 3 }, contrato).ok).toBe(false);
    expect(evaluarCatalogo({ ...cuadra, sin_cambio: 1 }, contrato).ok).toBe(false);
    expect(evaluarCatalogo(cuadra, contrato).detalle).toContain("politicas *_por_empresa=2/2");
  });
});
