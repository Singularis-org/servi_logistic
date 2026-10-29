import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import sharp from "sharp";
import {
  PANTALLA_POR_CAPTURA,
  planDeCapturas,
  urlBaseLocal,
  fallosDePantalla,
  conTope,
  dimensionesPng,
  fallosDeTamano,
} from "@/scripts/capturas-pwa.mjs";

// SL-9 (D1) — partes puras del script de capturas de la PWA. Se importan sin abrir el navegador:
// `@playwright/test` solo se carga dentro de `main()`, que no corre al importar.

// El nombre anterior de la plataforma, partido: este archivo no puede contenerlo literal (R17),
// y aun así tiene que armar el texto con el que se prueba que el script lo detecta (R9).
const NOMBRE_ANTERIOR = ["orden", "ex"].join("");

const MANIFIESTO_REAL = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/manifest.json"), "utf8"),
);

const CAPTURAS_REALES = [
  { src: "/screenshots/inicio-narrow.png", sizes: "540x1170", form_factor: "narrow" },
  { src: "/screenshots/ingreso-narrow.png", sizes: "540x1170", form_factor: "narrow" },
  { src: "/screenshots/inicio-wide.png", sizes: "1280x720", form_factor: "wide" },
];

const PANTALLA_BUENA = {
  texto: "Servi Logistic. Entrar",
  logos: ["http://localhost:3000/brand/logo-horizontal-fondo-claro.svg"],
  archivoCargada: true,
  indicadorVisible: false,
};

describe("planDeCapturas con el manifiesto real (R2, R5)", () => {
  const plan = () => planDeCapturas(MANIFIESTO_REAL);

  it("planifica las tres capturas del manifiesto, cada una con su pantalla", () => {
    expect(plan().map((p) => [p.src, p.ruta])).toEqual([
      ["/screenshots/inicio-narrow.png", "/"],
      ["/screenshots/ingreso-narrow.png", "/login"],
      ["/screenshots/inicio-wide.png", "/"],
    ]);
  });

  it("pinta las narrow a 360x780 CSS con escala 1.5 para dar 540x1170", () => {
    for (const p of plan().filter((x) => x.src.includes("narrow"))) {
      expect(p).toMatchObject({
        ancho: 540,
        alto: 1170,
        viewport: { width: 360, height: 780 },
        escala: 1.5,
      });
    }
  });

  it("pinta la wide a 1280x720 con escala 1", () => {
    const wide = plan().find((p) => p.src === "/screenshots/inicio-wide.png");
    expect(wide).toMatchObject({
      ancho: 1280,
      alto: 720,
      viewport: { width: 1280, height: 720 },
      escala: 1,
    });
  });
});

describe("planDeCapturas toma los tamaños del manifiesto, no del script (R5)", () => {
  it("un manifiesto con otro sizes cambia el plan", () => {
    const plan = planDeCapturas({
      screenshots: [
        { src: "/screenshots/inicio-narrow.png", sizes: "720x1560", form_factor: "narrow" },
        { src: "/screenshots/ingreso-narrow.png", sizes: "1080x2340", form_factor: "narrow" },
        { src: "/screenshots/inicio-wide.png", sizes: "1920x1080", form_factor: "wide" },
      ],
    });
    expect(plan.map((p) => [p.ancho, p.alto, p.viewport.width, p.viewport.height, p.escala])).toEqual([
      [720, 1560, 360, 780, 2],
      [1080, 2340, 360, 780, 3],
      [1920, 1080, 1920, 1080, 1],
    ]);
  });

  it("lanza si un narrow no da un alto CSS entero a 360 px", () => {
    expect(() =>
      planDeCapturas({
        screenshots: [
          { src: "/screenshots/inicio-narrow.png", sizes: "540x1171", form_factor: "narrow" },
          CAPTURAS_REALES[1],
          CAPTURAS_REALES[2],
        ],
      }),
    ).toThrow(/inicio-narrow\.png/);
  });
});

describe("planDeCapturas exige que manifiesto y tabla coincidan (R6)", () => {
  it("la tabla de pantallas cubre exactamente las capturas del manifiesto real", () => {
    expect(Object.keys(PANTALLA_POR_CAPTURA).sort()).toEqual(
      MANIFIESTO_REAL.screenshots.map((c: { src: string }) => c.src).sort(),
    );
  });

  it("lanza nombrando la captura que el manifiesto declara de más", () => {
    const deMas = { src: "/screenshots/panel-wide.png", sizes: "1280x720", form_factor: "wide" };
    expect(() => planDeCapturas({ screenshots: [...CAPTURAS_REALES, deMas] })).toThrow(
      /panel-wide\.png/,
    );
  });

  it("lanza nombrando la captura que falta en el manifiesto", () => {
    expect(() => planDeCapturas({ screenshots: CAPTURAS_REALES.slice(0, 2) })).toThrow(
      /inicio-wide\.png/,
    );
  });
});

describe("urlBaseLocal solo acepta la app local (R7)", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1:3044/", "http://localhost:3000/login"])(
    "acepta %s",
    (texto) => {
      expect(() => urlBaseLocal(texto)).not.toThrow();
    },
  );

  it("normaliza la URL a su origen, sin ruta ni barra final", () => {
    expect(urlBaseLocal("http://127.0.0.1:3044/")).toBe("http://127.0.0.1:3044");
  });

  it.each(["https://servilogistic.com", "http://localhost.example.com:3000", "no es una url"])(
    "lanza con %s",
    (texto) => {
      expect(() => urlBaseLocal(texto)).toThrow();
    },
  );
});

describe("fallosDePantalla da un motivo por cada problema (R9)", () => {
  it("la pantalla buena no tiene motivos", () => {
    expect(fallosDePantalla(PANTALLA_BUENA)).toEqual([]);
  });

  it("detecta el nombre anterior en mayúsculas", () => {
    const motivos = fallosDePantalla({
      ...PANTALLA_BUENA,
      texto: `Bienvenido a ${NOMBRE_ANTERIOR.toUpperCase()}`,
    });
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toMatch(/nombre anterior/);
  });

  it("detecta que no hay logo servido desde /brand/", () => {
    const motivos = fallosDePantalla({
      ...PANTALLA_BUENA,
      logos: ["http://localhost:3000/icons/icon-192.png"],
    });
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toMatch(/\/brand\//);
  });

  it("detecta la fuente Archivo sin cargar", () => {
    const motivos = fallosDePantalla({ ...PANTALLA_BUENA, archivoCargada: false });
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toMatch(/Archivo/);
  });

  it("detecta el indicador de desarrollo de Next visible", () => {
    const motivos = fallosDePantalla({ ...PANTALLA_BUENA, indicadorVisible: true });
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toMatch(/indicador/);
  });

  it("suma un motivo por cada problema a la vez", () => {
    expect(
      fallosDePantalla({
        texto: NOMBRE_ANTERIOR,
        logos: [],
        archivoCargada: false,
        indicadorVisible: true,
      }),
    ).toHaveLength(4);
  });
});

describe("conTope corta una espera que no termina (R9)", () => {
  it("rechaza con el motivo si la promesa no se resuelve a tiempo", async () => {
    const nunca = new Promise<never>(() => {});
    await expect(conTope(nunca, 20, "las imágenes no terminaron de cargar")).rejects.toThrow(
      "las imágenes no terminaron de cargar",
    );
  });

  it("devuelve el valor si la promesa se resuelve antes del tope", async () => {
    await expect(conTope(Promise.resolve("listo"), 1000, "tope")).resolves.toBe("listo");
  });

  it("propaga el error propio de la promesa, no el del tope", async () => {
    await expect(conTope(Promise.reject(new Error("propio")), 1000, "tope")).rejects.toThrow("propio");
  });
});

describe("fallosDeTamano compara la cabecera IHDR con el plan (R10)", () => {
  const paso = { src: "/screenshots/inicio-narrow.png", ancho: 540, alto: 1170 };
  const pngDe = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: { r: 17, g: 17, b: 17 } } })
      .png()
      .toBuffer();

  it("un PNG del tamaño declarado no da fallo", async () => {
    const png = await pngDe(540, 1170);
    expect(dimensionesPng(png)).toEqual({ ancho: 540, alto: 1170 });
    expect(fallosDeTamano(png, paso)).toBeNull();
  });

  it("un PNG de otro tamaño da un fallo que nombra la captura y las dos medidas", async () => {
    const fallo = fallosDeTamano(await pngDe(360, 780), paso);
    expect(fallo).toContain("/screenshots/inicio-narrow.png");
    expect(fallo).toContain("360x780");
    expect(fallo).toContain("540x1170");
  });

  it("un buffer que no es PNG da un fallo que nombra la captura", () => {
    const fallo = fallosDeTamano(Buffer.from("esto no es un png, aunque mida lo suficiente"), paso);
    expect(fallo).toMatch(/inicio-narrow\.png.*no es un PNG/);
  });
});

// R7 y R8 de punta a punta: el script como proceso hijo. Los dos casos cortan antes de cargar
// Playwright, así que no abren navegador.
describe("el script corta sin tocar public/screenshots (R7, R8)", () => {
  const RAIZ = process.cwd();
  const SCRIPT = path.join(RAIZ, "scripts", "capturas-pwa.mjs");
  const CAPTURAS = ["inicio-narrow.png", "ingreso-narrow.png", "inicio-wide.png"];
  const TOPE_PROCESO_MS = 30_000;

  const huellas = () =>
    CAPTURAS.map((nombre) =>
      createHash("sha256")
        .update(readFileSync(path.join(RAIZ, "public", "screenshots", nombre)))
        .digest("hex"),
    );

  /** Un puerto que estuvo libre y ya está cerrado: nadie responde ahí. */
  const puertoCerrado = () =>
    new Promise<number>((ok, mal) => {
      const servidor = net.createServer();
      servidor.once("error", mal);
      servidor.listen(0, "127.0.0.1", () => {
        const { port } = servidor.address() as net.AddressInfo;
        servidor.close(() => ok(port));
      });
    });

  const correr = (url: string) =>
    spawnSync(process.execPath, [SCRIPT], {
      cwd: RAIZ,
      env: { ...process.env, CAPTURAS_URL: url },
      encoding: "utf8",
      timeout: TOPE_PROCESO_MS,
    });

  it(
    "R8: con la app parada sale con error, avisa que no responde y no cambia ninguna captura",
    async () => {
      const puerto = await puertoCerrado();
      const antes = huellas();
      const r = correr(`http://127.0.0.1:${puerto}`);
      expect(r.error).toBeUndefined();
      expect(r.status).not.toBe(0);
      expect(r.status).not.toBeNull();
      expect(r.stderr).toContain(`La app no responde en http://127.0.0.1:${puerto}`);
      expect(huellas()).toEqual(antes);
    },
    TOPE_PROCESO_MS + 5_000,
  );

  it(
    "R7: con un host no local sale con error, lo nombra y no cambia ninguna captura",
    () => {
      const antes = huellas();
      const r = correr("https://example.com");
      expect(r.error).toBeUndefined();
      expect(r.status).not.toBe(0);
      expect(r.status).not.toBeNull();
      expect(r.stderr).toMatch(/localhost o 127\.0\.0\.1, no a "example\.com"/);
      expect(huellas()).toEqual(antes);
    },
    TOPE_PROCESO_MS + 5_000,
  );
});
