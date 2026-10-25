import { describe, expect, it, vi } from "vitest";

import { comoPlataforma, conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import {
  empresaDelAlmacen,
  RutaDeAlmacenInvalida,
  rutaEnCarpeta,
  rutaRelativa,
} from "@/lib/storage/carpeta-de-empresa";

// SL-19 (design §3.3; R15, R17, R18) — la carpeta de la empresa en el almacen, sin Storage: lo que
// se rechaza aqui nunca llega a un adaptador.

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

describe("R17 — una ruta invalida se rechaza con RutaDeAlmacenInvalida", () => {
  it.each([
    ["vacia", ""],
    ["empieza por /", "/orden-1/foto.jpg"],
    ["contiene \\", "orden-1\\foto.jpg"],
    ["segmento vacio en medio", "orden-1//foto.jpg"],
    ["segmento vacio al final", "orden-1/"],
    ["segmento .", "orden-1/./foto.jpg"],
    ["segmento ..", "../" + ORG_A + "/foto.jpg"],
    ["solo ..", ".."],
  ])("%s", (_caso, ruta) => {
    expect(() => rutaEnCarpeta(ORG_B, ruta)).toThrow(RutaDeAlmacenInvalida);
  });

  it("una empresa vacia o con / tampoco forma carpeta", () => {
    expect(() => rutaEnCarpeta("", "x")).toThrow(RutaDeAlmacenInvalida);
    expect(() => rutaEnCarpeta(`${ORG_A}/${ORG_B}`, "x")).toThrow(RutaDeAlmacenInvalida);
  });
});

describe("R15 — la ruta de siempre, dentro de la carpeta de la empresa", () => {
  it("rutaEnCarpeta antepone la empresa y conserva la ruta tal cual", () => {
    expect(rutaEnCarpeta(ORG_A, "orden-1/foto.jpg")).toBe(`${ORG_A}/orden-1/foto.jpg`);
    expect(rutaEnCarpeta(ORG_A, "tmp/u.json.gz")).toBe(`${ORG_A}/tmp/u.json.gz`);
  });

  it("rutaRelativa devuelve la de siempre, y null si la ruta no es de esa carpeta", () => {
    expect(rutaRelativa(ORG_A, `${ORG_A}/orden-1/foto.jpg`)).toBe("orden-1/foto.jpg");
    expect(rutaRelativa(ORG_A, `${ORG_B}/orden-1/foto.jpg`)).toBeNull();
    expect(rutaRelativa(ORG_A, "orden-1/foto.jpg")).toBeNull();
    expect(rutaRelativa(ORG_A, `${ORG_A}/`)).toBeNull();
    expect(rutaRelativa(ORG_A, `${ORG_A}/../${ORG_B}/x`)).toBeNull();
  });
});

describe("R18 — la empresa del almacen sale del contexto, nunca de la ruta", () => {
  it("con empresa en contexto: esa empresa, sin preguntar a la sesion", async () => {
    const sesion = vi.fn(async () => ORG_B);
    await expect(conEmpresa(ORG_A, () => empresaDelAlmacen("b", "subir", sesion))).resolves.toBe(ORG_A);
    expect(sesion).not.toHaveBeenCalled();
  });

  it("en plataforma: EmpresaNoResuelta, aunque la sesion tenga empresa", async () => {
    const sesion = vi.fn(async () => ORG_A);
    const p = comoPlataforma("SL-19", "test", () => empresaDelAlmacen("b", "firmar", sesion));
    await expect(p).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(
      comoPlataforma("SL-19", "test", () => empresaDelAlmacen("b", "firmar", sesion)),
    ).rejects.toMatchObject({ modelo: "Storage", operacion: "b:firmar" });
    expect(sesion).not.toHaveBeenCalled();
  });

  it("sin contexto y con sesion: la empresa de la sesion", async () => {
    await expect(empresaDelAlmacen("b", "subir", async () => ORG_B)).resolves.toBe(ORG_B);
  });

  it("sin contexto y sin sesion: EmpresaNoResuelta", async () => {
    await expect(empresaDelAlmacen("b", "subir", async () => null)).rejects.toBeInstanceOf(EmpresaNoResuelta);
  });

  it("sin contexto y fuera de una peticion, el resolutor real (perezoso) no da empresa", async () => {
    // Sin `next/headers` en marcha, `cookies()` lanza y el resolutor devuelve null: falla cerrado.
    await expect(empresaDelAlmacen("b", "subir")).rejects.toBeInstanceOf(EmpresaNoResuelta);
  });
});
