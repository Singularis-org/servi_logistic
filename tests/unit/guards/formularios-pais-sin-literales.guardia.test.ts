// GUARDIA — SLT-81 (design §7.7; R24): LOS CINCO FORMULARIOS Y LA POSTULACIÓN NO TIENEN PAÍS PROPIO.
//
// El prefijo y los tipos de documento que pintan estos formularios salen del país de la empresa
// (el proveedor del portal, la lista de países del alta, la lectura de la postulación). Un `506` o
// una lista fija de tipos (`TIPO_IDENTIFICACION_LABELS`, `"cedula"`, `"ruc"`, `"pasaporte"`) en uno
// de ellos es Costa Rica colado como país por defecto. Los comentarios no cuentan: explican la regla
// y pueden nombrar lo que prohíbe.
//
// La selecciona `pnpm exec vitest run guard` por el nombre del archivo.
import { describe, expect, it } from "vitest";

import { codigoSinComentarios, quitarComentarios } from "../../fixtures/sin-comentarios";

/** Los cinco formularios de R24, la página de la postulación y el adorno compartido. */
const ARCHIVOS = [
  "app/(app)/configuracion/_components/UsuarioForm.tsx",
  "app/postulacion/_components/PostulacionForm.tsx",
  "app/postulacion/page.tsx",
  "app/(app)/plataforma/empresas/_components/EmpresasModule.tsx",
  "app/(app)/ordenes/_components/CorregirDatosClienteModal.tsx",
  "app/(app)/configuracion/envios-whatsapp/_components/DestinatariosField.tsx",
  "components/shared/PrefijoTelefonico.tsx",
] as const;

/** Lo que delata un país implícito, con el motivo que se muestra si aparece. */
const PROHIBIDOS: readonly { patron: RegExp; motivo: string }[] = [
  { patron: /(?<!\d)506(?!\d)/, motivo: "el prefijo de Costa Rica escrito a mano" },
  { patron: /TIPO_IDENTIFICACION_LABELS/, motivo: "la lista fija de etiquetas de tipos" },
  { patron: /["'`](cedula|ruc|pasaporte)["'`]/i, motivo: "un tipo de documento escrito a mano" },
];

/**
 * `cedula` es también el NOMBRE del campo del número de documento (columna `usuario.cedula`, campo
 * del formulario y del `FormData`), que no dice nada del país. Esos usos se quitan antes de buscar:
 * el `id` del campo, `setField`/`formData.set` y la unión de nombres de campo de un `Record<…>`.
 */
const CEDULA_COMO_CAMPO = /(\bid=|\bsetField\(|\.set\(|\|\s*)"cedula"/g;

export function literalesDePais(codigo: string): string[] {
  const sinCampos = codigo.replace(CEDULA_COMO_CAMPO, "$1CAMPO");
  return PROHIBIDOS.filter(({ patron }) => patron.test(sinCampos)).map(({ motivo }) => motivo);
}

describe("SLT-81 R24 — formularios sin prefijo ni tipos de documento fijos", () => {
  it.each(ARCHIVOS)("%s no trae `506` ni una lista fija de tipos", (archivo) => {
    expect(literalesDePais(codigoSinComentarios(archivo)), archivo).toEqual([]);
  });

  it("CONTRAPRUEBA — cada literal prohibido pone la guardia roja, y en un comentario no", () => {
    const base = codigoSinComentarios(ARCHIVOS[0]);
    expect(literalesDePais(`${base}\nconst p = "506";`)).toEqual(["el prefijo de Costa Rica escrito a mano"]);
    expect(literalesDePais(`${base}\nconst TIPO_IDENTIFICACION_LABELS = {};`)).toEqual([
      "la lista fija de etiquetas de tipos",
    ]);
    expect(literalesDePais(`${base}\nconst t = ["cedula"];`)).toEqual(["un tipo de documento escrito a mano"]);
    expect(literalesDePais(quitarComentarios(`${base}\n// el 506 de Costa Rica y "cedula"`))).toEqual([]);
    // Un número que solo contiene esos dígitos no es el prefijo.
    expect(literalesDePais(`${base}\nconst n = 15060;`)).toEqual([]);
    // `cedula` como nombre del campo del número no es un tipo; como opción de una lista, sí.
    expect(literalesDePais('<FormField id="cedula" />; setField("cedula", v); formData.set("cedula", c);')).toEqual(
      [],
    );
    expect(literalesDePais('const opciones = [{ value: "cedula", label: "Cédula" }];')).toEqual([
      "un tipo de documento escrito a mano",
    ]);
  });
});
