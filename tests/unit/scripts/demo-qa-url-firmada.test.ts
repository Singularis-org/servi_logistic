// SL-43 T10 (R9) — la ruta que nombra una URL firmada de Storage, para borrar el PDF de etiquetas
// de una carga por API, que solo deja su URL (`carga.download_url`). Nunca algo fuera de la carpeta.

import { describe, expect, it } from "vitest";

import { rutaDeUrlFirmada } from "@/scripts/demo-qa/borrar";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTRA = "22222222-2222-4222-8222-222222222222";
const BASE = "http://127.0.0.1:54329/storage/v1/object/sign";

describe("rutaDeUrlFirmada (R9)", () => {
  it("devuelve la ruta dentro de la carpeta de la empresa", () => {
    expect(rutaDeUrlFirmada(`${BASE}/etiquetas-guia/${ORG}/lote/abc.pdf?token=x`, "etiquetas-guia", ORG)).toBe("lote/abc.pdf");
  });

  it("decodifica la ruta", () => {
    expect(rutaDeUrlFirmada(`${BASE}/etiquetas-guia/${ORG}/a%20b.pdf?token=x`, "etiquetas-guia", ORG)).toBe("a b.pdf");
  });

  it("null si es de otra empresa, de otro bucket, sin ruta, con `..` o no es una URL", () => {
    expect(rutaDeUrlFirmada(`${BASE}/etiquetas-guia/${OTRA}/abc.pdf?token=x`, "etiquetas-guia", ORG)).toBeNull();
    expect(rutaDeUrlFirmada(`${BASE}/otro-bucket/${ORG}/abc.pdf?token=x`, "etiquetas-guia", ORG)).toBeNull();
    expect(rutaDeUrlFirmada(`${BASE}/etiquetas-guia/${ORG}/?token=x`, "etiquetas-guia", ORG)).toBeNull();
    // `..` literal lo resuelve el parser de URL hacia otra carpeta; codificado con `%2F`, lo para la guarda.
    expect(rutaDeUrlFirmada(`${BASE}/etiquetas-guia/${ORG}/../${OTRA}/b.pdf?token=x`, "etiquetas-guia", ORG)).toBeNull();
    expect(rutaDeUrlFirmada(`${BASE}/etiquetas-guia/${ORG}/a%2F..%2F..%2Fb.pdf?token=x`, "etiquetas-guia", ORG)).toBeNull();
    expect(rutaDeUrlFirmada("no es una url", "etiquetas-guia", ORG)).toBeNull();
  });
});
