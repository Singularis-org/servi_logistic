import { describe, expect, it } from "vitest";

import { contextoPara } from "@/lib/asistente/contexto";
import { leerCatalogoAyuda } from "@/lib/ayuda/catalogo";
import type { RolValue } from "@prisma/client";

/**
 * SL-45 (T9, design §7.4) — la ayuda de la caja al día con el pago a la plataforma. Molde:
 * `contexto-457.test.ts`.
 *
 * Apoya R1–R3 (la región dice qué hacer en cada estado), R9 (no se paga de más) y R15 (la anulación sube
 * la deuda). Se afirma que esas explicaciones LLEGAN al contexto de la oficina, maestro y admin, que es
 * quien ve la caja, y que NO llegan a mensajero, adminTienda ni adminSatelite.
 *
 * Las frases van escritas a mano: son el contrato de lo que el asistente tiene que poder explicar, y las
 * tres pistas son las literales de R1–R3. No se leen de `wallet-labels.ts`.
 */

const docs = await leerCatalogoAyuda();

const OFICINA: RolValue[] = ["maestro", "admin"];
const FUERA_DE_OFICINA: RolValue[] = ["mensajero", "adminTienda", "adminSatelite"];

/** El Markdown con los saltos de línea y los espacios repetidos reducidos a uno. */
function plano(texto: string): string {
  return texto.replace(/\s+/g, " ");
}

function cuerpoEnContexto(rol: RolValue, slug: string): string {
  const doc = contextoPara(docs, rol).find((d) => d.slug === slug);
  expect(doc, `${rol} no recibe ${slug}`).toBeDefined();
  return plano(doc?.cuerpo ?? "");
}

describe("SL-45 — la oficina puede preguntar cómo se paga y se registra la deuda con la plataforma", () => {
  it.each(OFICINA)("%s: R1–R3, la región en sus tres estados, con las pistas literales", (rol) => {
    const caja = cuerpoEnContexto(rol, "oficina/wallet-caja");
    expect(caja).toContain(
      "Lo que la plataforma cobra por cada orden creada, menos las anuladas y lo ya pagado. Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la caja y baja esta deuda.",
    );
    expect(caja).toContain("La empresa está al día con la plataforma. Cada orden nueva suma su cobro aquí.");
    expect(caja).toContain("**Saldo a favor de la empresa con la plataforma**");
    expect(caja).toContain(
      "La empresa pagó más de lo que hoy debe, porque se anularon órdenes ya pagadas. Se descuenta de los próximos cobros.",
    );
    // La pista de SL-40 queda retirada: desde esta ficha el pago sí sale de la caja.
    expect(caja).not.toContain("Todavía no se cobra");
  });

  it.each(OFICINA)("%s: cómo se registra el pago y qué le pasa a la caja y a la ganancia", (rol) => {
    const caja = cuerpoEnContexto(rol, "oficina/wallet-caja");
    expect(caja).toContain("### Pagarle a la plataforma");
    expect(caja).toContain("se abre **Registrar un movimiento** con el concepto **Pago a la plataforma** ya elegido");
    expect(caja).toContain("**la ganancia de la empresa baja** en el monto, como con un sueldo");
    expect(caja).toContain("**La deuda baja** en el monto");
  });

  it.each(OFICINA)("%s: R9, no se paga de más, y cuándo aparece el saldo a favor", (rol) => {
    const caja = cuerpoEnContexto(rol, "oficina/wallet-caja");
    expect(caja).toContain("**No se puede pagar de más.**");
    expect(caja).toContain("«El pago no puede ser mayor que lo que la empresa debe a la plataforma.»");
    expect(caja).toContain("**Cuándo aparece el saldo a favor.** Solo de una forma");
  });

  it.each(OFICINA)("%s: R15, el pago mal registrado se anula y la deuda vuelve a subir", (rol) => {
    const caja = cuerpoEnContexto(rol, "oficina/wallet-caja");
    expect(caja).toContain("Al anularlo, la deuda vuelve a subir en el monto y la caja y la ganancia también.");
    expect(caja).toContain(
      "Al anular un **pago a la plataforma**, aparece una **Corrección de caja (suma)** por el mismo monto",
    );
    expect(caja).toContain("| **Pago a la plataforma** | Lo que la empresa le paga a la plataforma");
  });

  it.each(FUERA_DE_OFICINA)("%s NO recibe la ayuda del pago a la plataforma", (rol) => {
    const slugs = contextoPara(docs, rol).map((d) => d.slug);
    expect(slugs).not.toContain("oficina/wallet-caja");
    const todo = contextoPara(docs, rol)
      .map((doc) => plano(doc.cuerpo))
      .join(" ");
    expect(todo).not.toContain("### Pagarle a la plataforma");
  });
});
