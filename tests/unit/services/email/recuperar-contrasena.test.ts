import { describe, expect, it } from "vitest";

import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import {
  plantillaRecuperarContrasena,
  type RecuperarContrasenaParams,
} from "@/lib/services/email/plantillas/recuperar-contrasena";

// SL-18 T3.1 (design §4.1) — el correo de «recuperar contraseña»: una línea por cuenta con el
// nombre de su empresa («Plataforma» la de plataforma) y su enlace, y el secreto de cada enlace solo
// detrás de `#enlace=` (R16, R21).

const BASE = "https://app.example.com/recuperar-contrasena#enlace=";
const ID = ["0f8fad5b-d9cb-469f-a165-70867728950e", "1a2b3c4d-d9cb-469f-a165-70867728950e", "2b3c4d5e-d9cb-469f-a165-70867728950e"];
const SECRETO = [
  "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE",
  "ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210-_ZyXwV",
  "q2Zl3x8VtYw0bN4mR7cK1pJ9sH6dA5eG2uI0oL3nB8z",
];
const url = (i: number) => `${BASE}${ID[i]}.${SECRETO[i]}`;

const PARAMS: RecuperarContrasenaParams = {
  to: "ana@example.com",
  enlaces: [
    { empresaNombre: "Mensajería Rápida", url: url(0) },
    { empresaNombre: null, url: url(1) },
    { empresaNombre: "Envíos del Sur", url: url(2) },
  ],
  ttlMinutos: 10,
  contacto: null,
};

const partes = (m: EmailMessage) => ({ asunto: m.subject, texto: m.text, html: m.html ?? "" });

describe("plantillaRecuperarContrasena (SL-18 T3.1)", () => {
  it("R16: N cuentas → N líneas «<empresa>: <url>» en el texto, en orden, y N botones en el HTML", () => {
    const m = plantillaRecuperarContrasena(PARAMS);

    expect(m.to).toBe("ana@example.com");
    expect(m.text).toContain(`Mensajería Rápida: ${url(0)}`);
    expect(m.text).toContain(`Plataforma: ${url(1)}`);
    expect(m.text).toContain(`Envíos del Sur: ${url(2)}`);
    const orden = [url(0), url(1), url(2)].map((u) => m.text.indexOf(u));
    expect(orden).toEqual([...orden].sort((x, y) => x - y));
    // Cada enlace, en su botón (y en la URL visible debajo, que también es un enlace).
    for (let i = 0; i < 3; i++) expect(m.html).toContain(`href="${url(i)}"`);
    expect(m.html!.split(">Mensajería Rápida</a>")).toHaveLength(2);
    expect(m.html!.split(">Envíos del Sur</a>")).toHaveLength(2);
  });

  it("R16: la cuenta sin empresa sale como «Plataforma», en el texto y en el HTML", () => {
    const m = plantillaRecuperarContrasena({ ...PARAMS, enlaces: [{ empresaNombre: null, url: url(0) }] });

    expect(m.text).toContain(`Plataforma: ${url(0)}`);
    expect(m.html).toContain(">Plataforma</a>");
    expect(m.text).not.toContain("null");
  });

  it("dice cuánto vence el enlace y que no cambia nada si no se pidió", () => {
    const m = plantillaRecuperarContrasena(PARAMS);
    expect(m.text).toContain("vence en 10 minutos y sirve una sola vez");
    expect(m.text).toContain("Si no lo pediste, ignora este correo");
  });

  it("R21: cada secreto aparece solo detrás de `#enlace=<id>.`, y nunca en el asunto", () => {
    const m = plantillaRecuperarContrasena(PARAMS);

    expect(m.subject).not.toContain("#enlace=");
    for (let i = 0; i < 3; i++) {
      for (const [parte, valor] of Object.entries(partes(m))) {
        const trozos = valor.split(SECRETO[i]);
        // Control: el secreto SÍ está en el cuerpo, una vez en el texto y en el HTML (href y URL visible).
        if (parte !== "asunto") expect(trozos.length, `${parte} ${i}`).toBeGreaterThan(1);
        for (const antes of trozos.slice(0, -1)) {
          expect(antes.endsWith(`#enlace=${ID[i]}.`), `${parte} ${i}`).toBe(true);
        }
      }
    }
  });
});
