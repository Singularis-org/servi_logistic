import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// El cliente real NUNCA se construye en este archivo: ningún test toca Storage de verdad. Si algún camino
// llegase a `createServerClient`, este mock lo delata.
const createServerClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ createServerClient }));

import {
  SupabaseAlmacenImagenesReporte,
  type ImagenesStorageClientLike,
} from "@/lib/storage/SupabaseAlmacenImagenesReporte";
import { bucketReporteBug } from "@/lib/config/reporte-bug";
import { BUCKETS } from "@/lib/storage/buckets";
import { conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { RutaDeAlmacenInvalida } from "@/lib/storage/carpeta-de-empresa";

// SLT-98 (T4; R9, R15, R16) — el almacén de las imágenes de los reportes, con un DOBLE del cliente
// Storage y sin red. Cada operación corre en la empresa ORG: el cliente recibe `ORG/<ruta>` y lo que se
// devuelve va por la ruta relativa.

const ORG = "11111111-1111-4111-8111-111111111111";
const RUTA = "22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png";
const URL_SUBIDA = `https://x.supabase.co/storage/v1/object/upload/sign/bug-reports/${ORG}/${RUTA}?token=t`;

type Api = ReturnType<ImagenesStorageClientLike["from"]>;
type Err = { message: string; statusCode?: string; status?: number } | null;

function doble(opciones: {
  subida?: Err[];
  createBucket?: Err;
  descarga?: { bytes?: Uint8Array<ArrayBuffer>; error?: Err };
  firmas?: { data?: Array<{ path: string | null; signedUrl: string; error: string | null }>; error?: Err };
  removeError?: Err;
} = {}) {
  const colaSubida = [...(opciones.subida ?? [])];
  const createSignedUploadUrl = vi.fn<Api["createSignedUploadUrl"]>(async (path) => {
    const error = colaSubida.length ? colaSubida.shift()! : null;
    return error ? { data: null, error } : { data: { signedUrl: URL_SUBIDA, token: "t", path }, error: null };
  });
  const download = vi.fn<Api["download"]>(async () => {
    if (opciones.descarga?.error) return { data: null, error: opciones.descarga.error };
    return { data: new Blob([opciones.descarga?.bytes ?? new Uint8Array([1, 2, 3])]), error: null };
  });
  const createSignedUrls = vi.fn<Api["createSignedUrls"]>(async (paths, ttl) => {
    if (opciones.firmas?.error) return { data: null, error: opciones.firmas.error };
    const data =
      opciones.firmas?.data ??
      paths.map((p) => ({ path: p, signedUrl: `https://x.supabase.co/storage/v1/object/sign/${p}?ttl=${ttl}`, error: null }));
    return { data, error: null };
  });
  const remove = vi.fn<Api["remove"]>(async () => ({ data: [], error: opciones.removeError ?? null }));
  // No es parte de la superficie: está aquí solo para comprobar que nadie la pide (R15).
  const getPublicUrl = vi.fn();
  const createBucket = vi.fn<ImagenesStorageClientLike["createBucket"]>(async () => ({ data: null, error: opciones.createBucket ?? null }));
  const api = { createSignedUploadUrl, download, createSignedUrls, remove, getPublicUrl };
  const from = vi.fn<(bucket: string) => Api>(() => api);
  const cliente: ImagenesStorageClientLike = { from, createBucket };
  return { cliente, from, createSignedUploadUrl, download, createSignedUrls, remove, getPublicUrl, createBucket };
}

const enOrg = <T>(fn: () => Promise<T>) => conEmpresa(ORG, fn);

beforeEach(() => createServerClient.mockReset());
afterEach(() => vi.unstubAllEnvs());

describe("R9 — prepararSubida", () => {
  it("prepararSubida firma <org>/<ruta> sin upsert y devuelve la URL", async () => {
    const d = doble();
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    const r = await enOrg(() => a.prepararSubida(RUTA));
    expect(r).toEqual({ url: URL_SUBIDA });
    expect(d.from).toHaveBeenCalledWith("b");
    // Solo la ruta: sin `{ upsert: true }` (el token no pisa un objeto que ya existe).
    expect(d.createSignedUploadUrl).toHaveBeenCalledTimes(1);
    expect(d.createSignedUploadUrl.mock.calls[0]).toEqual([`${ORG}/${RUTA}`]);
    expect(d.createBucket).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("un error que no es «not found» lanza sin crear el bucket", async () => {
    const d = doble({ subida: [{ message: "timeout", statusCode: "500" }] });
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    await expect(enOrg(() => a.prepararSubida(RUTA))).rejects.toThrow(/preparar la subida.*timeout/);
    expect(d.createBucket).not.toHaveBeenCalled();
    expect(d.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });
});

describe("R15 — bucket privado y configurable", () => {
  it("bucketReporteBug: vacío o ausente da bug-reports, y BUG_REPORT_BUCKET recortada manda", () => {
    expect(BUCKETS.BUG_REPORTS).toBe("bug-reports");
    expect(bucketReporteBug(undefined)).toBe("bug-reports");
    expect(bucketReporteBug("")).toBe("bug-reports");
    expect(bucketReporteBug("   ")).toBe("bug-reports");
    expect(bucketReporteBug("  reportes-qa  ")).toBe("reportes-qa");

    vi.stubEnv("BUG_REPORT_BUCKET", "  desde-env ");
    expect(bucketReporteBug()).toBe("desde-env");
  });

  it("el bucket por defecto del adaptador es el de bucketReporteBug()", async () => {
    vi.stubEnv("BUG_REPORT_BUCKET", "");
    const d1 = doble();
    await enOrg(() => new SupabaseAlmacenImagenesReporte(d1.cliente).prepararSubida(RUTA));
    expect(d1.from).toHaveBeenCalledWith("bug-reports");

    vi.stubEnv("BUG_REPORT_BUCKET", " reportes-qa ");
    const d2 = doble();
    await enOrg(() => new SupabaseAlmacenImagenesReporte(d2.cliente).prepararSubida(RUTA));
    expect(d2.from).toHaveBeenCalledWith("reportes-qa");
  });

  it("ninguna operación pide una URL pública (la superficie del cliente no la expone)", async () => {
    const d = doble();
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    await enOrg(async () => {
      await a.prepararSubida(RUTA);
      await a.leer(RUTA);
      await a.firmar([RUTA], 86400);
      await a.borrar([RUTA]);
    });
    expect(d.getPublicUrl).not.toHaveBeenCalled();
    // La lectura es siempre firmada y con caducidad.
    expect(d.createSignedUrls).toHaveBeenCalledWith([`${ORG}/${RUTA}`], 86400);
  });
});

describe("R16 — el bucket se crea solo en la primera subida", () => {
  it("«Bucket not found» ⇒ createBucket privado con fileSizeLimit 5242880 y los tres tipos, y UN reintento", async () => {
    const d = doble({ subida: [{ message: "Bucket not found", statusCode: "404" }] });
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    const r = await enOrg(() => a.prepararSubida(RUTA));
    expect(r).toEqual({ url: URL_SUBIDA });
    expect(d.createBucket).toHaveBeenCalledTimes(1);
    expect(d.createBucket).toHaveBeenCalledWith("b", {
      public: false,
      fileSizeLimit: 5242880,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    });
    expect(d.createSignedUploadUrl).toHaveBeenCalledTimes(2);
  });

  it("un segundo «not found» tras crear no reintenta otra vez: lanza", async () => {
    const nf = { message: "Bucket not found", statusCode: "404" };
    const d = doble({ subida: [nf, nf, nf] });
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    await expect(enOrg(() => a.prepararSubida(RUTA))).rejects.toThrow(/preparar la subida/);
    expect(d.createSignedUploadUrl).toHaveBeenCalledTimes(2);
    expect(d.createBucket).toHaveBeenCalledTimes(1);
  });

  it("«already exists» al crear se ignora", async () => {
    const d = doble({
      subida: [{ message: "Bucket not found", statusCode: "404" }],
      createBucket: { message: "The resource already exists", statusCode: "409" },
    });
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    await expect(enOrg(() => a.prepararSubida(RUTA))).resolves.toEqual({ url: URL_SUBIDA });
    expect(d.createSignedUploadUrl).toHaveBeenCalledTimes(2);
  });

  it("otro error al crear lanza sin reintentar", async () => {
    const d = doble({
      subida: [{ message: "Bucket not found", statusCode: "404" }],
      createBucket: { message: "permission denied", statusCode: "403" },
    });
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    await expect(enOrg(() => a.prepararSubida(RUTA))).rejects.toThrow("fallo al crear el bucket de reportes: permission denied");
    expect(d.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });
});

describe("leer, firmar y borrar (design §3.2)", () => {
  it("leer devuelve los bytes del objeto <org>/<ruta>", async () => {
    const d = doble({ descarga: { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) } });
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    const bytes = await enOrg(() => a.leer(RUTA));
    expect(Array.from(bytes ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(d.download).toHaveBeenCalledWith(`${ORG}/${RUTA}`);
  });

  it("leer da null si el objeto o el bucket no existe, y lanza con otro error", async () => {
    const porMensaje = doble({ descarga: { error: { message: "Object not found" } } });
    await expect(enOrg(() => new SupabaseAlmacenImagenesReporte(porMensaje.cliente, "b").leer(RUTA))).resolves.toBeNull();
    const por404 = doble({ descarga: { error: { message: "x", status: 404 } } });
    await expect(enOrg(() => new SupabaseAlmacenImagenesReporte(por404.cliente, "b").leer(RUTA))).resolves.toBeNull();
    const otro = doble({ descarga: { error: { message: "timeout", statusCode: "500" } } });
    await expect(enOrg(() => new SupabaseAlmacenImagenesReporte(otro.cliente, "b").leer(RUTA))).rejects.toThrow(/leer la imagen.*timeout/);
  });

  it("firmar re-indexa por la ruta relativa y omite lo que no pudo firmar o es de otra carpeta", async () => {
    const otra = "u/otra.png";
    const d = doble({
      firmas: {
        data: [
          { path: `${ORG}/${RUTA}`, signedUrl: "https://firmada/1", error: null },
          { path: `${ORG}/${otra}`, signedUrl: "", error: "Object not found" },
          { path: `99999999-9999-4999-8999-999999999999/x/y.png`, signedUrl: "https://ajena", error: null },
        ],
      },
    });
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    const r = await enOrg(() => a.firmar([RUTA, otra], 86400));
    expect(r).toEqual({ [RUTA]: "https://firmada/1" });
    expect(d.createSignedUrls).toHaveBeenCalledWith([`${ORG}/${RUTA}`, `${ORG}/${otra}`], 86400);
  });

  it("firmar lanza si falla la llamada entera, y con lista vacía no llama", async () => {
    const d = doble({ firmas: { error: { message: "timeout" } } });
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    await expect(enOrg(() => a.firmar([RUTA], 60))).rejects.toThrow(/firmar las imágenes.*timeout/);
    const vacio = doble();
    await expect(enOrg(() => new SupabaseAlmacenImagenesReporte(vacio.cliente, "b").firmar([], 60))).resolves.toEqual({});
    expect(vacio.createSignedUrls).not.toHaveBeenCalled();
  });

  it("borrar quita <org>/<ruta> de cada una, propaga el error, y con lista vacía no llama", async () => {
    const d = doble();
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    await enOrg(() => a.borrar([RUTA, "u/b.jpg"]));
    expect(d.remove).toHaveBeenCalledWith([`${ORG}/${RUTA}`, `${ORG}/u/b.jpg`]);
    await enOrg(() => a.borrar([]));
    expect(d.remove).toHaveBeenCalledTimes(1);
    const falla = doble({ removeError: { message: "timeout" } });
    await expect(enOrg(() => new SupabaseAlmacenImagenesReporte(falla.cliente, "b").borrar([RUTA]))).rejects.toThrow(/borrar.*timeout/);
  });
});

describe("SL-19 — sin empresa o con ruta inválida no se toca Storage", () => {
  it("fuera de una empresa todas fallan con EmpresaNoResuelta, y una ruta con «..» con RutaDeAlmacenInvalida", async () => {
    const d = doble();
    const a = new SupabaseAlmacenImagenesReporte(d.cliente, "b");
    await expect(a.prepararSubida(RUTA)).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(a.leer(RUTA)).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(a.firmar([RUTA], 60)).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(a.borrar([RUTA])).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(enOrg(() => a.prepararSubida("../otra/x.png"))).rejects.toBeInstanceOf(RutaDeAlmacenInvalida);
    expect(d.createSignedUploadUrl).not.toHaveBeenCalled();
    expect(d.download).not.toHaveBeenCalled();
    expect(d.createSignedUrls).not.toHaveBeenCalled();
    expect(d.remove).not.toHaveBeenCalled();
    expect(d.createBucket).not.toHaveBeenCalled();
  });
});
