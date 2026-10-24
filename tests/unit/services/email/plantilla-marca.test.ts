import { describe, expect, it } from "vitest";

import {
  componerCorreo,
  escaparHtml,
  type Bloque,
  type CorreoDeMarca,
} from "@/lib/services/email/plantillas/plantilla-marca";
import { componer, contraste } from "@/tests/fixtures/contraste";

// SL-41 (design §3, R1–R6, R39) — la plantilla común de los correos. Los colores, el orden de las
// zonas y los textos del pie son literales escritos aquí a mano: son el contrato de la maqueta
// (T1) y de docs/marca.md, no un reflejo de la propia plantilla.

const PALETA = {
  negro: "#111111",
  amarillo: "#FFD000",
  fondoClaro: "#F7F7F5",
  oscuroBarras: "#1C1C1A",
  blanco: "#FFFFFF",
} as const;

/** La única mezcla que declara el diseño (§3.2): texto secundario. */
const SECUNDARIO = "#585858";

const MARCA_ANTERIOR = ["#0b2545", "#0d2444", "#f26419"];

const BLOQUES: Bloque[] = [
  { tipo: "parrafo", texto: "Primer párrafo del correo." },
  { tipo: "codigo", codigo: "123456" },
  { tipo: "boton", texto: "Crear mi contraseña", url: "https://app.example.com/recuperar-contrasena#enlace=abc.def" },
  { tipo: "nota", texto: "Una nota de seguridad." },
];

function correo(extra: Partial<CorreoDeMarca> = {}): CorreoDeMarca {
  return {
    to: "ana@example.com",
    asunto: "Asunto de prueba",
    preheader: "Vista previa de prueba",
    bloques: BLOQUES,
    contacto: null,
    ...extra,
  };
}

const html = (extra?: Partial<CorreoDeMarca>) => componerCorreo(correo(extra)).html!;
const texto = (extra?: Partial<CorreoDeMarca>) => componerCorreo(correo(extra)).text;

/** El HTML de la zona `data-zona="<zona>"`: desde su celda hasta la siguiente zona o el final. */
function zona(h: string, nombre: "cabecera" | "contenido" | "pie"): string {
  const inicio = h.indexOf(`data-zona="${nombre}"`);
  expect(inicio, `no hay zona ${nombre}`).toBeGreaterThan(-1);
  const siguiente = h.slice(inicio + 1).search(/data-zona="/);
  return siguiente === -1 ? h.slice(inicio) : h.slice(inicio, inicio + 1 + siguiente);
}

describe("componerCorreo — mensaje (R1)", () => {
  it("devuelve destinatario, asunto, texto plano y HTML de la misma lista de bloques", () => {
    const m = componerCorreo(correo());
    expect(m.to).toBe("ana@example.com");
    expect(m.subject).toBe("Asunto de prueba");
    for (const fragmento of ["Primer párrafo del correo.", "123456", "Una nota de seguridad."]) {
      expect(m.text).toContain(fragmento);
      expect(m.html).toContain(fragmento);
    }
  });
});

describe("componerCorreo — estructura del HTML (R2)", () => {
  it("tiene cabecera, contenido y pie, en ese orden", () => {
    const h = html();
    const cabecera = h.indexOf('data-zona="cabecera"');
    const contenido = h.indexOf('data-zona="contenido"');
    const pie = h.indexOf('data-zona="pie"');
    expect(cabecera).toBeGreaterThan(-1);
    expect(contenido).toBeGreaterThan(cabecera);
    expect(pie).toBeGreaterThan(contenido);
  });

  it("la cabecera lleva el logo incrustado por CID, con alt y 180 px de ancho (Carlos, 2026-10-24)", () => {
    expect(zona(html(), "cabecera")).toContain(
      '<img src="cid:logo@servilogistic" alt="Servi Logistic" width="180"',
    );
    // Ningún `src` remoto: el logo no depende de que la URL resuelva ni de las imágenes remotas.
    expect(html()).not.toMatch(/src="https?:/);
  });

  it("el mensaje lleva el PNG del logo como imagen en línea con el cid que referencia el HTML", () => {
    const m = componerCorreo(correo());
    expect(m.imagenesEnLinea).toHaveLength(1);
    const [logo] = m.imagenesEnLinea!;
    expect(logo.cid).toBe("logo@servilogistic");
    expect(logo.tipoContenido).toBe("image/png");
    expect(logo.nombreArchivo).toMatch(/\.png$/);
    const bytes = Buffer.from(logo.contenidoBase64, "base64");
    // Firma PNG: el adjunto existe y es una imagen PNG, no un SVG ni un texto vacío.
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(bytes.length).toBeGreaterThan(1000);
    // Cada `cid:` del HTML tiene su adjunto, y no sobra ninguno.
    const cids = [...m.html!.matchAll(/src="cid:([^"]+)"/g)].map((x) => x[1]);
    expect(cids).toEqual(m.imagenesEnLinea!.map((i) => i.cid));
  });

  it("bajo la cabecera va una franja amarilla de 4 px, como fondo y no como texto", () => {
    expect(html()).toMatch(/<td style="height:4px;[^"]*background-color:#FFD000;">&nbsp;<\/td>/);
  });

  it("todo el contenido propio va en la zona de contenido", () => {
    const contenido = zona(html(), "contenido");
    expect(contenido).toContain("Primer párrafo del correo.");
    expect(contenido).toContain("Una nota de seguridad.");
    expect(contenido).toContain("Crear mi contraseña");
  });

  it("el pie dice «Servi Logistic» y que el correo es automático", () => {
    expect(zona(html(), "pie")).toContain(
      "Servi Logistic · Este correo se envió automáticamente; no lo respondas.",
    );
  });

  it("es HTML de correo: sin <style>, sin hojas externas, con tablas y un ancho máximo de 600 px", () => {
    const h = html();
    expect(h).not.toMatch(/<style/i);
    expect(h).not.toMatch(/<link/i);
    expect(h).toContain('role="presentation"');
    expect(h).toContain("max-width:600px");
  });

  it("la fuente es Archivo con respaldo legible", () => {
    expect(html()).toContain("font-family:Archivo, Arial, Helvetica, sans-serif");
  });

  it("el código va a 28 px, en negrita y con espaciado entre letras", () => {
    expect(html()).toMatch(/font-size:28px;[^"]*font-weight:700;letter-spacing:6px;color:#111111;">123456<\/p>/);
  });

  it("el botón es una celda negra con el enlace en blanco, y la URL va también visible", () => {
    const h = html();
    const url = "https://app.example.com/recuperar-contrasena#enlace=abc.def";
    expect(h).toMatch(/<td align="center" bgcolor="#111111" style="background-color:#111111;[^"]*"><a href="https:\/\/app\.example\.com\/recuperar-contrasena#enlace=abc\.def"[^>]*color:#FFFFFF;[^>]*>Crear mi contraseña<\/a>/);
    expect(h).toContain(`>${url}</a>`);
  });

  it("la nota va sobre el fondo claro con el texto secundario", () => {
    expect(html()).toContain("background-color:#F7F7F5;font-family:Archivo, Arial, Helvetica, sans-serif;font-size:14px;line-height:20px;color:#585858;\">Una nota de seguridad.</td>");
  });

  it("lleva el preheader oculto", () => {
    expect(html()).toMatch(/<div style="display:none;[^"]*">Vista previa de prueba<\/div>/);
  });
});

describe("componerCorreo — colores (R3)", () => {
  const colores = (h: string) => [...h.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map((m) => m[0].toUpperCase());

  it("el texto secundario es la mezcla declarada componer(#111111, #FFFFFF, 0.70)", () => {
    expect(componer(PALETA.negro, PALETA.blanco, 0.7).toUpperCase()).toBe(SECUNDARIO);
  });

  it.each([
    ["sin contacto", {}],
    ["con contacto", { contacto: "soporte@example.com" }],
  ])("todos los colores del HTML son de la paleta o la mezcla declarada (%s)", (_, extra) => {
    const permitidos = new Set<string>([...Object.values(PALETA), SECUNDARIO]);
    const usados = colores(html(extra as Partial<CorreoDeMarca>));
    expect(usados.length).toBeGreaterThan(0);
    for (const c of usados) expect(permitidos, `color fuera de la paleta: ${c}`).toContain(c);
  });

  it("ningún color de la marca anterior", () => {
    const h = html({ contacto: "soporte@example.com" }).toLowerCase();
    for (const c of MARCA_ANTERIOR) expect(h).not.toContain(c);
  });

  it("el amarillo nunca es color de texto", () => {
    const h = html({ contacto: "soporte@example.com" });
    expect(h).not.toMatch(/(^|[^-])color:\s*#FFD000/i);
  });

  it("cada color de texto da al menos 4.5:1 sobre el fondo en el que va", () => {
    const h = html({ contacto: "soporte@example.com" });
    const tintas = new Set([...h.matchAll(/(?:^|[;"\s])color:(#[0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase()));
    // El blanco solo va dentro del botón negro; el resto, sobre blanco o sobre el fondo claro.
    const fondoDe = (tinta: string) => (tinta === PALETA.blanco ? [PALETA.negro] : [PALETA.blanco, PALETA.fondoClaro]);
    expect([...tintas].sort()).toEqual([SECUNDARIO, PALETA.negro, PALETA.blanco].sort());
    for (const tinta of tintas) {
      for (const fondo of fondoDe(tinta)) expect(contraste(tinta, fondo)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("el texto blanco solo aparece en el enlace del botón", () => {
    const h = html();
    const usos = [...h.matchAll(/(?:^|[;"\s])color:#FFFFFF/gi)];
    expect(usos).toHaveLength(1);
    expect(h).toMatch(/background-color:#111111;[^"]*"><a [^>]*color:#FFFFFF;/);
  });
});

// R4 (decisión del leader, 2026-10-24): con el logo por CID, la cabecera lo pinta siempre. La
// plantilla ya no recibe ninguna URL base, así que no hay un «sin URL» que pueda quitarlo.
describe("componerCorreo — el logo siempre, sin depender de la URL base (R4)", () => {
  it("la cabecera es el logo por CID, sin cabecera de texto", () => {
    const h = html();
    expect(zona(h, "cabecera")).toContain('<img src="cid:logo@servilogistic" alt="Servi Logistic"');
    expect(zona(h, "cabecera")).not.toContain(">Servi Logistic</p>");
  });

  it("el mensaje lleva siempre el logo adjunto", () => {
    expect(componerCorreo(correo()).imagenesEnLinea?.map((i) => i.cid)).toEqual(["logo@servilogistic"]);
  });
});

describe("componerCorreo — texto plano (R5)", () => {
  it("abre con el nombre, sigue con cada bloque y cierra con el pie, separados por una línea en blanco", () => {
    expect(texto()).toBe(
      [
        "SERVI LOGISTIC",
        "",
        "Primer párrafo del correo.",
        "",
        "123456",
        "",
        "Crear mi contraseña: https://app.example.com/recuperar-contrasena#enlace=abc.def",
        "",
        "Una nota de seguridad.",
        "",
        "Servi Logistic · Este correo se envió automáticamente; no lo respondas.",
      ].join("\n"),
    );
  });

  it("no lleva etiquetas HTML ni entidades", () => {
    const t = texto({ contacto: "soporte@example.com" });
    expect(t).not.toMatch(/<[a-z!/]/i);
    expect(t).not.toMatch(/&[a-z]+;|&#\d+;/i);
  });

  it("lleva la URL completa de cada enlace, sin escapar", () => {
    const url = "https://app.example.com/recuperar-contrasena?x=1&y=2#enlace=abc.def";
    const t = texto({ bloques: [{ tipo: "boton", texto: "Abrir", url }] });
    expect(t).toContain(`Abrir: ${url}`);
  });

  it("el código va solo en su propia línea", () => {
    expect(texto().split("\n")).toContain("123456");
  });
});

describe("componerCorreo — escapado (R6)", () => {
  const MALO = '<b>x</b>"\'&';
  const ESCAPADO = "&lt;b&gt;x&lt;/b&gt;&quot;&#39;&amp;";

  it("escaparHtml escapa los cinco caracteres con significado en HTML", () => {
    expect(escaparHtml(MALO)).toBe(ESCAPADO);
  });

  it("escapa párrafos (nombre, empresa, email), código y nota", () => {
    const h = html({
      bloques: [
        { tipo: "parrafo", texto: `Hola, ${MALO}` },
        { tipo: "codigo", codigo: MALO },
        { tipo: "nota", texto: MALO },
      ],
    });
    expect(h).not.toContain("<b>x</b>");
    expect(h.split(ESCAPADO).length - 1).toBe(3);
  });

  it("escapa la URL del botón como atributo y como texto visible", () => {
    const h = html({ bloques: [{ tipo: "boton", texto: "Abrir", url: 'https://x.example/"><script>alert(1)</script>' }] });
    expect(h).not.toContain("<script>");
    expect(h).not.toContain('"><script');
    expect(h).toContain('href="https://x.example/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
  });

  it("escapa el asunto, el preheader y el contacto", () => {
    const h = html({
      asunto: MALO,
      preheader: MALO,
      contacto: '"><b>@example.com',
    });
    expect(h).not.toContain("<b>");
    expect(h).not.toContain('"onerror="');
    expect(h).toContain(`<title>${ESCAPADO}</title>`);
  });
});

describe("componerCorreo — contacto en el pie (R39)", () => {
  it("con contacto, el pie de texto y el de HTML lo muestran, con un mailto en el HTML", () => {
    const m = componerCorreo(correo({ contacto: "soporte@example.com" }));
    expect(m.text.endsWith(
      "Servi Logistic · Este correo se envió automáticamente; no lo respondas.\n¿Dudas? Escríbenos a soporte@example.com.",
    )).toBe(true);
    expect(zona(m.html!, "pie")).toContain(
      '¿Dudas? Escríbenos a <a href="mailto:soporte@example.com" style="color:#585858;text-decoration:underline;">soporte@example.com</a>.',
    );
  });

  it("sin contacto, el pie no muestra ninguna dirección", () => {
    const m = componerCorreo(correo({ contacto: null }));
    expect(m.text).not.toContain("Dudas");
    expect(zona(m.html!, "pie")).not.toContain("Dudas");
    expect(zona(m.html!, "pie")).not.toContain("mailto:");
    expect(zona(m.html!, "pie")).not.toContain("@");
  });
});
