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
      triggersMismaEmpresa: 175,
      triggersSinCambio: 2,
    });
  });

  it("sin argumento usa MODELOS_DE_NEGOCIO, que hoy son 90 tablas (SL-38, SL-40, las dos de SL-36, SL-23, SLT-56, SLT-73, las cinco de SLT-52, la de SLT-54, la de SLT-83, la de SLT-94, la de SLT-85 y la de SLT-118)", () => {
    expect(MODELOS_DE_NEGOCIO).toHaveLength(90);
    // SLT-56: `gestion_pago_mensajero_ajuste` suma una politica, tres `sme_*` y un sin-cambio.
    // SLT-73: `conciliacion_bodega_ajuste` suma su politica, su trigger sin cambio y DOS de misma
    // empresa (sus FK a `cierre_bodega` y a `usuario`).
    // SLT-52: `grupo_distritos`, `grupo_distritos_distrito`, `tarifa_valor`, `cierre_detail_concepto` y
    // `gestion_pago_congelado` suman cinco politicas, cinco sin-cambio y DIEZ `sme_*` (156 -> 166); su T4.6 suma
    // el de `rechazo_tienda_cobro.tarifa_valor_id` (166 -> 167).
    // SLT-54: `tarifa_activacion` suma su politica, su sin-cambio y el `sme_*` de `activada_por` (167 -> 168).
    // SLT-83: `cobro_plataforma_porcentual_orden` suma su politica, su sin-cambio y UN `sme_*` (su FK a
    // `orden`; la de `organizacion` no cuenta) (168 -> 169).
    // SLT-94: `orden_fulfillment_movimiento` suma su politica, su sin-cambio y TRES `sme_*` (sus FK a
    // `orden`, a `usuario` (la tienda) y a `tarifa_valor`) (169 -> 172).
    // SLT-85: `cobro_plataforma_traza` suma su politica, su sin-cambio y TRES `sme_*` (sus FK a `orden`, a
    // `cobro_plataforma_movimiento` y a si misma por `reverso_de`) (172 -> 175).
    // SLT-118: `factura_plataforma` suma su politica y su sin-cambio, y ningun `sme_*`: su unica FK es a
    // `organizacion` (175 se queda).
    // SL-23: `organizacion_modulo` tampoco suma triggers de misma empresa: su unica FK es a `organizacion`.
    // SL-36 no suma triggers de misma empresa: sus dos tablas no tienen FK a otra tabla de negocio.
    // SL-19: `jobs` (empresa opcional) suma su `jobs_por_empresa`, pero no tiene trigger sin cambio.
    expect(MODELOS_CON_EMPRESA_OPCIONAL.map((m) => m.tabla)).toEqual(["jobs"]);
    expect(contratoEsperado()).toEqual({ politicasPorEmpresa: 91, triggersMismaEmpresa: 175, triggersSinCambio: 90 });
  });

  it("SL-19 — una tabla de empresa opcional suma una politica y ningun trigger sin cambio de empresa", () => {
    expect(contratoEsperado(DOS_MODELOS, [{ modelo: "Opcional", tabla: "opcional" }])).toEqual({
      politicasPorEmpresa: 3,
      triggersMismaEmpresa: 175,
      triggersSinCambio: 2,
    });
  });

  it("el punto 6 da OK con lo que pide el contrato y FALLA con una tabla de mas o de menos", () => {
    const contrato = contratoEsperado(DOS_MODELOS, []);
    const cuadra = { politicas: 2, para_app: 2, con_rls: 2, sme: 175, sin_cambio: 2 };
    expect(evaluarCatalogo(cuadra, contrato)).toMatchObject({ punto: 6, ok: true });
    expect(evaluarCatalogo({ ...cuadra, politicas: 3, para_app: 3, con_rls: 3 }, contrato).ok).toBe(false);
    expect(evaluarCatalogo({ ...cuadra, sin_cambio: 1 }, contrato).ok).toBe(false);
    expect(evaluarCatalogo(cuadra, contrato).detalle).toContain("politicas *_por_empresa=2/2");
  });
});
