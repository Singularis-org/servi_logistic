import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PANTALLA_POR_CAPTURA,
  planDeCapturas,
  urlBaseLocal,
  fallosDePantalla,
  conTope,
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
