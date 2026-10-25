import { describe, it, expect, vi } from "vitest";
import {
  SupabaseAlmacenEnviosWhatsapp,
  type EnviosStorageClientLike,
} from "@/lib/storage/SupabaseAlmacenEnviosWhatsapp";
import { conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { RutaDeAlmacenInvalida } from "@/lib/storage/carpeta-de-empresa";

// Ficha 474 (T4.2, R43/R44) — almacen privado de los PDFs: ruta por ejecucion, nunca sobrescribe,
// bucket privado creado en el primer uso, firmado, y `borrar` propaga el error.
// SL-19 (R15–R18, R22): cada caso corre en la empresa ORG; el cliente recibe `ORG/<ruta>` y se
// devuelve la ruta de siempre.

const ORG = "11111111-1111-4111-8111-111111111111";
const enOrg = <T>(fn: () => Promise<T>) => conEmpresa(ORG, fn);

function doble(over: Partial<ReturnType<EnviosStorageClientLike["from"]>> = {}, createBucket = vi.fn(async () => ({ data: {}, error: null }))) {
  const api = {
    upload: vi.fn(async (path: string) => ({ data: { path }, error: null })),
    download: vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2])]), error: null })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://firmado" }, error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    ...over,
  };
  const from = vi.fn(() => api);
  const client = { from, createBucket } as unknown as EnviosStorageClientLike;
  return { client, api, from, createBucket };
}

describe("474/R43 — guardar", () => {
  it("ruta <envioId>/<ejecucionId>.pdf, upsert false, content type pdf, bucket configurado", async () => {
    const d = doble();
    const a = new SupabaseAlmacenEnviosWhatsapp(d.client, "whatsapp-envios");
    expect(await enOrg(() => a.guardar("env-1", "eje-1", new Uint8Array([1])))).toEqual({ ruta: "env-1/eje-1.pdf" });
    expect(d.from).toHaveBeenCalledWith("whatsapp-envios");
    expect(d.api.upload).toHaveBeenCalledWith(`${ORG}/env-1/eje-1.pdf`, expect.any(Uint8Array), {
      contentType: "application/pdf",
      upsert: false,
    });
  });

  it("bucket inexistente: lo crea PRIVADO y reintenta una vez", async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "Bucket not found", statusCode: "404" } })
      .mockResolvedValueOnce({ data: { path: "p" }, error: null });
    const d = doble({ upload });
    const a = new SupabaseAlmacenEnviosWhatsapp(d.client, "b");
    await enOrg(() => a.guardar("e", "x", new Uint8Array([1])));
    expect(d.createBucket).toHaveBeenCalledWith("b", { public: false });
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("un objeto existente NO se sobrescribe: el conflicto lanza", async () => {
    const upload = vi.fn(async () => ({ data: null, error: { message: "The resource already exists", statusCode: "409" } }));
    const d = doble({ upload });
    const a = new SupabaseAlmacenEnviosWhatsapp(d.client, "b");
    await expect(enOrg(() => a.guardar("e", "x", new Uint8Array([1])))).rejects.toMatchObject({
      message: expect.stringMatching(/ya estaba guardado/),
      ruta: "e/x.pdf",
    });
  });
});

describe("474/R43 — firmar y leer", () => {
  it("firma con el TTL pedido", async () => {
    const d = doble();
    const a = new SupabaseAlmacenEnviosWhatsapp(d.client, "b");
    expect(await enOrg(() => a.firmar("e/x.pdf", 300))).toBe("https://firmado");
    expect(d.api.createSignedUrl).toHaveBeenCalledWith(`${ORG}/e/x.pdf`, 300);
  });

  it("leer devuelve los bytes", async () => {
    const d = doble();
    const a = new SupabaseAlmacenEnviosWhatsapp(d.client, "b");
    expect(Array.from(await enOrg(() => a.leer("e/x.pdf")))).toEqual([1, 2]);
    expect(d.api.download).toHaveBeenCalledWith(`${ORG}/e/x.pdf`);
  });
});

describe("474/R44 — borrar", () => {
  it("propaga el error del SDK", async () => {
    const d = doble({ remove: vi.fn(async () => ({ data: null, error: { message: "boom" } })) });
    const a = new SupabaseAlmacenEnviosWhatsapp(d.client, "b");
    await expect(enOrg(() => a.borrar(["e/x.pdf"]))).rejects.toThrow(/boom/);
  });

  it("lista vacia: no llama al SDK", async () => {
    const d = doble();
    const a = new SupabaseAlmacenEnviosWhatsapp(d.client, "b");
    await enOrg(() => a.borrar([]));
    expect(d.api.remove).not.toHaveBeenCalled();
  });

  it("SL-19 R22: borra solo dentro de la carpeta de la empresa en curso", async () => {
    const d = doble();
    const a = new SupabaseAlmacenEnviosWhatsapp(d.client, "b");
    await enOrg(() => a.borrar(["e/x.pdf", "e/y.pdf"]));
    expect(d.api.remove).toHaveBeenCalledWith([`${ORG}/e/x.pdf`, `${ORG}/e/y.pdf`]);
  });
});

describe("SL-19 R17/R18 — ruta invalida o sin empresa", () => {
  it("falla sin llamar a Storage", async () => {
    const d = doble();
    const a = new SupabaseAlmacenEnviosWhatsapp(d.client, "b");
    await expect(enOrg(() => a.leer("../otra/e/x.pdf"))).rejects.toBeInstanceOf(RutaDeAlmacenInvalida);
    await expect(enOrg(() => a.guardar("..", "x", new Uint8Array([1])))).rejects.toBeInstanceOf(RutaDeAlmacenInvalida);
    await expect(a.firmar("e/x.pdf", 60)).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(a.borrar(["e/x.pdf"])).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(d.api.upload).not.toHaveBeenCalled();
    expect(d.api.download).not.toHaveBeenCalled();
    expect(d.api.createSignedUrl).not.toHaveBeenCalled();
    expect(d.api.remove).not.toHaveBeenCalled();
  });
});
