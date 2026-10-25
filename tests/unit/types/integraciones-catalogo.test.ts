import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CATALOGO_INTEGRACIONES,
  CODIGOS_ERROR_INTEGRACION,
  CODIGOS_RECHAZO_USO,
  ESQUEMAS_DATOS_PUBLICOS,
  MOTIVOS_PRUEBA,
  SERVICIOS_INTEGRACION,
  TEXTO_ERROR_DESCONOCIDO,
  TEXTOS_ERROR_INTEGRACION,
  TEXTOS_RECHAZO_USO,
  codigoPruebaFallida,
  textoDelUltimoError,
} from "@/lib/types/integraciones";

// SL-36 T5.5 (design §7, §8; R13, R31, R34, R35) — el catálogo de servicios.
//
// POR QUÉ CONTRA EL DESIGN Y NO CONTRA EL PROPIO CATÁLOGO. Comparar el texto de «qué deja de
// funcionar» con la constante que lo genera siempre da verde. Aquí se lee `design.md` y se exige que
// cada texto del catálogo esté escrito ahí, entre comillas angulares, tal cual (normalizando solo los
// saltos de línea del markdown). Las marcas y las guías son contrato literal: van escritas a mano.

const DESIGN = readFileSync(
  path.resolve(__dirname, "../../../specs/SL-36-integraciones-por-empresa/design.md"),
  "utf8",
).replace(/\s+/g, " ");

describe("SL-36 T5.5 — catálogo de integraciones", () => {
  it("los cuatro servicios, en el orden de la pantalla", () => {
    expect(SERVICIOS_INTEGRACION).toEqual(["whatsapp", "google_maps", "optimizacion_rutas", "asistente"]);
    expect(Object.keys(CATALOGO_INTEGRACIONES)).toEqual([...SERVICIOS_INTEGRACION]);
  });

  it("R31: «qué deja de funcionar» es el literal del design §7 para cada servicio", () => {
    for (const s of SERVICIOS_INTEGRACION) {
      const texto = CATALOGO_INTEGRACIONES[s].queDejaDeFuncionar;
      expect(texto.length, s).toBeGreaterThan(40);
      expect(DESIGN, `${s}: el texto no está en el design`).toContain(`«${texto}»`);
    }
  });

  it("marca PROVISIONAL de requirements.md: WhatsApp y Maps requeridos; rutas y asistente recomendados", () => {
    expect(Object.fromEntries(SERVICIOS_INTEGRACION.map((s) => [s, CATALOGO_INTEGRACIONES[s].marca]))).toEqual({
      whatsapp: "requerido",
      google_maps: "requerido",
      optimizacion_rutas: "recomendado",
      asistente: "recomendado",
    });
  });

  it("R35: cada servicio enlaza su guía de design §8", () => {
    expect(Object.fromEntries(SERVICIOS_INTEGRACION.map((s) => [s, CATALOGO_INTEGRACIONES[s].guia]))).toEqual({
      whatsapp: "/ayuda/oficina/integracion-whatsapp",
      google_maps: "/ayuda/oficina/integracion-google-maps",
      optimizacion_rutas: "/ayuda/oficina/integracion-optimizacion-rutas",
      asistente: "/ayuda/oficina/integracion-asistente",
    });
  });

  it("campos y secretos de design §8; cada secreto del servicio es un campo secreto del formulario", () => {
    expect(CATALOGO_INTEGRACIONES.whatsapp.secretos).toEqual(["token_acceso", "app_secret"]);
    expect(CATALOGO_INTEGRACIONES.google_maps.secretos).toEqual(["clave_api"]);
    expect(CATALOGO_INTEGRACIONES.optimizacion_rutas.secretos).toEqual(["clave_cuenta_servicio"]);
    expect(CATALOGO_INTEGRACIONES.asistente.secretos).toEqual(["clave_api"]);
    expect(CATALOGO_INTEGRACIONES.whatsapp.campos.map((c) => c.nombre)).toEqual([
      "nombreVisible",
      "numeroId",
      "wabaId",
      "token_acceso",
      "app_secret",
    ]);
    for (const s of SERVICIOS_INTEGRACION) {
      const secretosDelFormulario = CATALOGO_INTEGRACIONES[s].campos.filter((c) => c.secreto).map((c) => c.nombre);
      expect(secretosDelFormulario, s).toEqual([...CATALOGO_INTEGRACIONES[s].secretos]);
    }
  });

  it("R13: cada motivo de prueba fallida de cada servicio tiene su texto propio, sin el código", () => {
    for (const s of SERVICIOS_INTEGRACION) {
      const textos = CATALOGO_INTEGRACIONES[s].textosPruebaFallida as Record<string, string>;
      expect(Object.keys(textos).sort(), s).toEqual([...MOTIVOS_PRUEBA[s]].sort());
      for (const motivo of MOTIVOS_PRUEBA[s]) {
        expect(textos[motivo].length, `${s}.${motivo}`).toBeGreaterThan(20);
        expect(textos[motivo]).not.toContain(motivo);
      }
    }
    // Los motivos propios que devuelven los probadores de T4.
    expect(MOTIVOS_PRUEBA.whatsapp).toEqual(
      expect.arrayContaining(["sin_permiso", "numero_no_encontrado", "waba_no_encontrada"]),
    );
    expect(MOTIVOS_PRUEBA.optimizacion_rutas).toContain("clave_mal_formada");
  });

  it("R34: el texto del último error sale del catálogo y nunca es el código ni texto del proveedor", () => {
    expect(textoDelUltimoError(null)).toBeNull();
    expect(textoDelUltimoError(codigoPruebaFallida("whatsapp", "waba_no_encontrada"))).toBe(
      CATALOGO_INTEGRACIONES.whatsapp.textosPruebaFallida.waba_no_encontrada,
    );
    expect(textoDelUltimoError("credencial_ilegible")).toMatch(/Vuelve a escribir la credencial/);
    for (const codigo of CODIGOS_RECHAZO_USO) expect(textoDelUltimoError(codigo)).toBe(TEXTOS_RECHAZO_USO[codigo]);
    // Un código que el catálogo ya no conoce, o un servicio inventado, sale con el genérico.
    for (const raro of ["prueba_fallida.whatsapp.otro", "prueba_fallida.fax.proveedor", "Invalid OAuth access token", "toString"]) {
      expect(textoDelUltimoError(raro)).toBe(TEXTO_ERROR_DESCONOCIDO);
    }
  });

  it("cada código de error de las operaciones tiene su texto; numero_ocupado no nombra empresa", () => {
    for (const c of CODIGOS_ERROR_INTEGRACION) expect(TEXTOS_ERROR_INTEGRACION[c].length, c).toBeGreaterThan(10);
    expect(TEXTOS_ERROR_INTEGRACION.numero_ocupado).not.toMatch(/empresa/i);
  });

  it("R5: datos_publicos rechaza una clave de más en vez de descartarla", () => {
    expect(ESQUEMAS_DATOS_PUBLICOS.google_maps.safeParse({}).success).toBe(true);
    expect(ESQUEMAS_DATOS_PUBLICOS.google_maps.safeParse({ clave_api: "x" }).success).toBe(false);
    expect(
      ESQUEMAS_DATOS_PUBLICOS.whatsapp.safeParse({
        nombreVisible: "n",
        wabaId: "1",
        telefonoVisible: "+1",
        nombreVerificado: "v",
        token_acceso: "x",
      }).success,
    ).toBe(false);
  });
});
