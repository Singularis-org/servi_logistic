import { describe, it, expect } from "vitest";
import {
  rutasAFirmar,
  rutasEvidenciaGestion,
  urlsEvidenciaFirmadas,
} from "@/lib/utils/evidencias-gestion";

describe("rutasEvidenciaGestion (feature 486)", () => {
  it("R4: las hijas mandan y conservan el orden en que llegan (la consulta ya ordena por indice)", () => {
    const hijas = [{ storagePath: "g/0.jpg" }, { storagePath: "g/1.jpg" }, { storagePath: "g/2.jpg" }];
    expect(rutasEvidenciaGestion(hijas, "g/0.jpg")).toEqual(["g/0.jpg", "g/1.jpg", "g/2.jpg"]);
  });

  it("R4: con hijas la portada se IGNORA, aunque sea distinta (no se duplica ni se mezcla)", () => {
    const hijas = [{ storagePath: "g/a.jpg" }, { storagePath: "g/b.jpg" }];
    expect(rutasEvidenciaGestion(hijas, "g/portada.jpg")).toEqual(["g/a.jpg", "g/b.jpg"]);
  });

  it("R5: sin hijas y con portada en la columna antigua -> lista de una", () => {
    expect(rutasEvidenciaGestion([], "g/portada.jpg")).toEqual(["g/portada.jpg"]);
  });

  it("R6: sin hijas ni portada -> []", () => {
    expect(rutasEvidenciaGestion([], null)).toEqual([]);
  });
});

describe("urlsEvidenciaFirmadas (feature 486)", () => {
  it("R4/R7: URLs firmadas en el orden de las rutas, nunca la ruta cruda", () => {
    const urls = urlsEvidenciaFirmadas(["p/1", "p/2", "p/3"], {
      "p/3": "https://s/3?token=c",
      "p/1": "https://s/1?token=a",
      "p/2": "https://s/2?token=b",
    });
    expect(urls).toEqual(["https://s/1?token=a", "https://s/2?token=b", "https://s/3?token=c"]);
  });

  it("R9: si el firmador omite la foto 2, se entregan la 1 y la 3", () => {
    const urls = urlsEvidenciaFirmadas(["p/1", "p/2", "p/3"], {
      "p/1": "https://s/1?token=a",
      "p/3": "https://s/3?token=c",
    });
    expect(urls).toEqual(["https://s/1?token=a", "https://s/3?token=c"]);
  });

  it("R10: firmador caido (mapa vacio) -> []", () => {
    expect(urlsEvidenciaFirmadas(["p/1", "p/2"], {})).toEqual([]);
  });

  it("no confunde claves heredadas del prototipo con URLs firmadas", () => {
    expect(urlsEvidenciaFirmadas(["toString", "constructor"], {})).toEqual([]);
  });
});

describe("rutasAFirmar (feature 486, R8)", () => {
  it("aplana las rutas de todas las gestiones para UNA sola firma", () => {
    expect(
      rutasAFirmar([
        { evidenciaStoragePaths: ["a/0", "a/1", "a/2"] },
        { evidenciaStoragePaths: [] },
        { evidenciaStoragePaths: ["b/0"] },
      ]),
    ).toEqual(["a/0", "a/1", "a/2", "b/0"]);
  });
});
