import { describe, expect, it } from "vitest";

import { contextoPara } from "@/lib/asistente/contexto";
import { leerCatalogoAyuda } from "@/lib/ayuda/catalogo";
import type { RolValue } from "@prisma/client";

/**
 * SL-45 (T9, design §7.4) — la ayuda de la caja al día con el pago a la plataforma. Molde:
 * `contexto-457.test.ts`.
 *
 * Apoya R1–R3 (la región dice qué hacer en cada estado), R9 (no se paga de más) y R15 (la anulación;
 * desde SLT-60 ya no sube la deuda). Se afirma que esas explicaciones LLEGAN al contexto de la oficina, maestro y admin, que es
 * quien ve la caja, y que NO llegan a mensajero, adminTienda ni adminSatelite.
 *
 * Las frases van escritas a mano: son el contrato de lo que el asistente tiene que poder explicar, y las
 * tres pistas son las literales de R1–R3. No se leen de `wallet-labels.ts`.
 *
 * SLT-60 (R38, design §6.4): la deuda baja al confirmar, no al registrar; solo se pagan facturas cerradas,
 * con el tope y el mensaje de R36; el pago solo se anula mientras está por confirmar; la pista de R35.
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
  it.each(OFICINA)("%s: R1–R3 y SLT-60 R35, la región en sus tres estados, con las pistas literales", (rol) => {
    const caja = cuerpoEnContexto(rol, "oficina/wallet-caja");
    expect(caja).toContain(
      "Lo que la plataforma cobra por las órdenes de la empresa (al crearlas o, con plan porcentual, al llegar a un estado final), menos las anuladas y los pagos ya confirmados. Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la caja al registrarlo y baja esta deuda cuando la plataforma lo confirma.",
    );
    expect(caja).toContain("La empresa está al día con la plataforma. Cada orden suma su cobro aquí cuando se cobra.");
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
    expect(caja).toContain("**La deuda no baja al registrar.** Baja cuando la plataforma confirma el pago");
  });

  it.each(OFICINA)("%s: SLT-60 R38, el pago queda por confirmar y la deuda baja al confirmarlo", (rol) => {
    const caja = cuerpoEnContexto(rol, "oficina/wallet-caja");
    expect(caja).toContain("**El pago queda por confirmar.**");
    expect(caja).toContain("**la deuda baja al confirmarlo**");
    // Ninguna frase dice que la deuda baja al registrar.
    expect(caja).not.toContain("**La deuda baja** en el monto");
    expect(caja).not.toContain("sale de la caja y baja esta deuda.");
    expect(caja).not.toContain("menos las anuladas y lo ya pagado.");
    expect(caja).not.toContain("Baja la deuda con la plataforma y la ganancia");
  });

  it.each(OFICINA)("%s: SLT-60 R38, solo se pagan facturas cerradas, hasta su saldo menos lo por confirmar", (rol) => {
    const caja = cuerpoEnContexto(rol, "oficina/wallet-caja");
    expect(caja).toContain("**Solo se pagan facturas cerradas.**");
    expect(caja).toContain(
      "si la empresa tiene facturas cerradas por 380 000 y 200 000 por confirmar, puede registrar hasta 180 000.",
    );
    expect(caja).toContain(
      "«El pago no puede ser mayor que lo pendiente de las facturas cerradas, descontados los pagos por confirmar.»",
    );
    expect(caja).not.toContain("**No se puede pagar de más.**");
    expect(caja).not.toContain("«El pago no puede ser mayor que lo que la empresa debe a la plataforma.»");
    expect(caja).toContain("**Cuándo aparece el saldo a favor.** Solo de una forma");
  });

  it.each(OFICINA)("%s: SLT-60 R38, el pago solo se anula mientras está por confirmar", (rol) => {
    const caja = cuerpoEnContexto(rol, "oficina/wallet-caja");
    expect(caja).toContain("**El pago solo se anula mientras está por confirmar.**");
    expect(caja).toContain("Una vez que la plataforma lo confirma, la empresa ya no puede anularlo.");
    expect(caja).not.toContain("la deuda vuelve a subir");
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
