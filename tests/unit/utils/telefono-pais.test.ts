import { describe, it, expect } from "vitest";
import {
  normalizarTelefono,
  sqlNormalizarTelefono,
  telefonoSirveParaEnvio,
  type ReglasTelefono,
} from "@/lib/utils/telefono-pais";
import { normalizarTelefonoCR } from "@/lib/utils/telefono-cr";

// SLT-42 (R18, R20, R21). La tabla de CR se genero el 2026-11-03 corriendo el codigo ANTERIOR a esta
// ficha (`normalizarTelefonoCR`, `normalizarTelefonoWa` y `telefonoValido` sin tocar) sobre cada
// entrada, y se congela aqui: es el contrato de R21. Si una fila cambia, la clave de un hilo de
// WhatsApp de CR cambia. No se regenera: se corrige el codigo.

const CR: ReglasTelefono = { prefijo: "506", digitosNacionales: 8 };

// [entrada, normalizado (R18), sirve para envio (R20)]
const TABLA_CR_CONGELADA: ReadonlyArray<readonly [string, string, boolean]> = [
  ["88887777", "50688887777", true],
  ["8888-7777", "50688887777", true],
  ["8888 7777", "50688887777", true],
  ["(8888) 7777", "50688887777", true],
  ["50688887777", "50688887777", true],
  ["+50688887777", "50688887777", true],
  ["+506 8888-7777", "50688887777", true],
  [" +506 8888 7777", "50688887777", true],
  ["506 8888 7777", "50688887777", true],
  ["5068888777", "5068888777", false],
  ["506888877771", "506888877771", false],
  ["+1 202 555 0143", "12025550143", true],
  ["12025550143", "12025550143", true],
  ["+12025550143", "12025550143", true],
  ["22223333", "50622223333", true],
  ["50622223333", "50622223333", true],
  ["12345", "12345", false],
  ["123456789", "123456789", false],
  ["1234567890", "1234567890", true],
  ["123456789012345", "123456789012345", true],
  ["1234567890123456", "1234567890123456", false],
  ["5061234", "5061234", false],
  ["506", "506", false],
  ["", "", false],
  ["   ", "", false],
  ["sin numero", "", false],
  ["+", "", false],
  ["+5", "5", false],
  ["88887777x", "50688887777", true],
  ["0050688887777", "0050688887777", true],
  ["50650688887777", "50650688887777", false],
];

describe("telefono-pais con los datos de CR da lo mismo que el codigo anterior (R21)", () => {
  it.each(TABLA_CR_CONGELADA)("normaliza %j como antes", (entrada, normalizado) => {
    expect(normalizarTelefono(entrada, CR)).toBe(normalizado);
  });

  it.each(TABLA_CR_CONGELADA)("decide si %j sirve para envio como antes", (entrada, _n, sirve) => {
    expect(telefonoSirveParaEnvio(entrada, CR)).toBe(sirve);
  });

  it("null e undefined no sirven para envio, como antes", () => {
    expect(telefonoSirveParaEnvio(null, CR)).toBe(false);
    expect(telefonoSirveParaEnvio(undefined, CR)).toBe(false);
  });

  // `telefonoValido` (el validador viejo) se retiro en T4.4: su columna `sirve` la cubre ahora el
  // `it.each` de `telefonoSirveParaEnvio` de arriba.
  // `whatsapp-telefono.ts` (`normalizarTelefonoWa`) se borro el 2026-11-06 por decision del humano:
  // no tenia consumidores de produccion.
  it("el envoltorio de la UI sigue dando la tabla congelada", () => {
    for (const [entrada, normalizado] of TABLA_CR_CONGELADA) {
      expect(normalizarTelefonoCR(entrada)).toBe(normalizado);
    }
  });
});

describe("telefono-pais con otro prefijo y otro largo (R18, R20)", () => {
  // Pais de prueba: prefijo de 3 cifras que no es el de CR y numero nacional de 7 digitos.
  const XA: ReglasTelefono = { prefijo: "999", digitosNacionales: 7 };

  it("aplica las cuatro reglas en orden con el prefijo y el largo del pais", () => {
    // 1. `+` inicial: solo digitos, aunque sean del largo nacional.
    expect(normalizarTelefono("+1234567", XA)).toBe("1234567");
    // 2. ya empieza por el prefijo: tal cual.
    expect(normalizarTelefono("999 123 4567", XA)).toBe("9991234567");
    // 3. exactamente los digitos nacionales: prefijo delante.
    expect(normalizarTelefono("123-4567", XA)).toBe("9991234567");
    // 4. otro largo: tal cual, sin inventar prefijo.
    expect(normalizarTelefono("88887777", XA)).toBe("88887777");
  });

  it("no aplica las reglas de CR a otro pais", () => {
    expect(normalizarTelefono("88887777", XA)).not.toBe("50688887777");
    expect(normalizarTelefono("50688887777", XA)).toBe("50688887777");
  });

  it("acepta para envio solo prefijo mas digitos nacionales cuando empieza por el prefijo", () => {
    expect(telefonoSirveParaEnvio("1234567", XA)).toBe(true); // 9991234567: 10 digitos
    expect(telefonoSirveParaEnvio("99912345678", XA)).toBe(false); // prefijo + 8
    expect(telefonoSirveParaEnvio("+50688887777", XA)).toBe(true); // otro pais, 11 digitos
    expect(telefonoSirveParaEnvio("123456", XA)).toBe(false); // 6 digitos
  });
});

describe("sqlNormalizarTelefono (forma del gemelo SQL de R19)", () => {
  it("lleva el prefijo y los digitos como parametros, nunca interpolados", () => {
    const sql = sqlNormalizarTelefono("o.telefono_dest", 3, 4);
    expect(sql).toContain("$3::text");
    expect(sql).toContain("$4::int");
    expect(sql).not.toContain("506");
    expect(sql).toContain("ltrim(o.telefono_dest) LIKE '+%'");
  });
});
