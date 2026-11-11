// SL-44 D2 (R4, R5) — test de contrato del doble de Storage del E2E.
//
// Usa el cliente REAL de `@supabase/supabase-js` (y las clases reales de `lib/storage/`) contra el
// doble: si una version nueva del SDK cambia rutas o formas, este test cae antes que el E2E. Los
// bytes se comparan con los de la fixture de evidencia, no con lo que devuelve el propio doble.

import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { arrancarStorageFalso } from "@/e2e/_storage-falso/servidor.mjs";
import { SupabaseFileStorage } from "@/lib/storage/SupabaseFileStorage";
import { SupabaseSignedUrlProvider } from "@/lib/storage/SupabaseSignedUrlProvider";
import { conEmpresa } from "@/lib/db/contexto-empresa";

const JPEG = new Uint8Array(readFileSync(path.join(process.cwd(), "e2e/fixtures/evidencia.jpg")));
const BUCKET = "gestion-evidencias";
/** SL-19: las clases de `lib/storage` operan en la carpeta de la empresa en curso. */
const EMPRESA = "33333333-3333-4333-8333-333333333333";

let doble: Awaited<ReturnType<typeof arrancarStorageFalso>>;
let cliente: SupabaseClient;
let n = 0;
/** Path distinto por caso: los casos no dependen del orden. */
const nuevoPath = () => `empresa-x/gestion-${++n}/foto.jpg`;

/** Descarga una URL firmada como lo haria el navegador con el `src` de la imagen. */
async function descargar(url: string) {
  const r = await fetch(url);
  return { status: r.status, tipo: r.headers.get("content-type"), bytes: new Uint8Array(await r.arrayBuffer()) };
}

beforeAll(async () => {
  doble = await arrancarStorageFalso({ puerto: 0 });
  cliente = createClient(doble.url, "clave-falsa");
});

afterAll(async () => {
  await doble.cerrar();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("doble de Storage del E2E (SL-44 D2)", () => {
  it("la fixture de evidencia es un JPEG completo (FFD8 ... FFD9)", () => {
    expect(JPEG.length).toBeGreaterThan(100);
    expect([JPEG[0], JPEG[1]]).toEqual([0xff, 0xd8]);
    expect([JPEG[JPEG.length - 2], JPEG[JPEG.length - 1]]).toEqual([0xff, 0xd9]);
  });

  it("GET /salud responde 200 para el webServer de Playwright", async () => {
    const r = await fetch(`${doble.url}/salud`);
    expect(r.status).toBe(200);
  });

  it("R4/R5: lo subido con el cliente real se sirve por su URL firmada con los mismos bytes y tipo", async () => {
    const p = nuevoPath();
    const subida = await cliente.storage.from(BUCKET).upload(p, JPEG, { contentType: "image/jpeg", upsert: false });
    expect(subida.error).toBeNull();
    expect(subida.data?.path).toBe(p);

    const firma = await cliente.storage.from(BUCKET).createSignedUrl(p, 60);
    expect(firma.error).toBeNull();
    // storage-js devuelve la URL ABSOLUTA (antepone `${SUPABASE_URL}/storage/v1`); la app la usa tal
    // cual como `src`, sin rehacerla.
    expect(firma.data?.signedUrl.startsWith(`${doble.url}/storage/v1/object/sign/${BUCKET}/${p}?token=`)).toBe(true);

    const d = await descargar(firma.data!.signedUrl);
    expect(d.status).toBe(200);
    expect(d.tipo).toBe("image/jpeg");
    expect(d.bytes).toEqual(JPEG);
  });

  it("R5: firmar varios devuelve URL para lo subido y error (sin URL) para lo ausente", async () => {
    const a = nuevoPath();
    const b = nuevoPath();
    const otros = new TextEncoder().encode("%PDF-1.4 falso");
    await cliente.storage.from(BUCKET).upload(a, JPEG, { contentType: "image/jpeg" });
    await cliente.storage.from(BUCKET).upload(b, otros, { contentType: "application/pdf" });

    const { data, error } = await cliente.storage.from(BUCKET).createSignedUrls([a, "no/subido.jpg", b], 60);
    expect(error).toBeNull();
    expect(data?.map((e) => e.path)).toEqual([a, "no/subido.jpg", b]);
    expect(data?.[1].signedUrl).toBeNull();
    expect(data?.[1].error).toBeTruthy();

    const da = await descargar(data![0].signedUrl!);
    expect(da.tipo).toBe("image/jpeg");
    expect(da.bytes).toEqual(JPEG);
    const db = await descargar(data![2].signedUrl!);
    expect(db.tipo).toBe("application/pdf");
    expect(db.bytes).toEqual(otros);
  });

  it("R5: firmar un objeto que no se subio devuelve error", async () => {
    const { data, error } = await cliente.storage.from(BUCKET).createSignedUrl("nunca/subido.jpg", 60);
    expect(data).toBeNull();
    expect(error?.message).toMatch(/not found/i);
  });

  it("subir un path repetido sin upsert falla con el error de Storage (409, already exists)", async () => {
    const p = nuevoPath();
    expect((await cliente.storage.from(BUCKET).upload(p, JPEG, { contentType: "image/jpeg" })).error).toBeNull();

    const repetida = await cliente.storage.from(BUCKET).upload(p, new Uint8Array([1, 2, 3]), { upsert: false });
    expect(repetida.data).toBeNull();
    // La forma que leen `esBucketYaExistente` de `SupabaseAlmacen*`.
    expect(repetida.error?.message).toMatch(/already exists/i);
    expect((repetida.error as unknown as { statusCode?: string }).statusCode).toBe("409");

    // El original no se piso.
    const firma = await cliente.storage.from(BUCKET).createSignedUrl(p, 60);
    expect((await descargar(firma.data!.signedUrl)).bytes).toEqual(JPEG);
  });

  it("con upsert: true el path repetido se sobrescribe y se sirven los bytes nuevos", async () => {
    const p = nuevoPath();
    await cliente.storage.from(BUCKET).upload(p, JPEG, { contentType: "image/jpeg" });
    const nuevos = new TextEncoder().encode("version 2");
    const r = await cliente.storage.from(BUCKET).upload(p, nuevos, { contentType: "text/plain", upsert: true });
    expect(r.error).toBeNull();

    const firma = await cliente.storage.from(BUCKET).createSignedUrl(p, 60);
    const d = await descargar(firma.data!.signedUrl);
    expect(d.tipo).toBe("text/plain");
    expect(d.bytes).toEqual(nuevos);
  });

  it("R5: borrar deja el objeto sin firma y su URL firmada previa responde 400", async () => {
    const p = nuevoPath();
    await cliente.storage.from(BUCKET).upload(p, JPEG, { contentType: "image/jpeg" });
    const antes = await cliente.storage.from(BUCKET).createSignedUrl(p, 60);

    const borrado = await cliente.storage.from(BUCKET).remove([p, "no/existe.jpg"]);
    expect(borrado.error).toBeNull();
    expect(borrado.data?.map((o) => o.name)).toEqual([p]);

    expect((await cliente.storage.from(BUCKET).createSignedUrl(p, 60)).error).not.toBeNull();
    expect((await descargar(antes.data!.signedUrl)).status).toBe(400);
  });

  it("R5: una URL firmada con un token que no casa responde 400", async () => {
    const p = nuevoPath();
    await cliente.storage.from(BUCKET).upload(p, JPEG, { contentType: "image/jpeg" });
    const otro = nuevoPath();
    await cliente.storage.from(BUCKET).upload(otro, JPEG, { contentType: "image/jpeg" });
    const firmaOtro = await cliente.storage.from(BUCKET).createSignedUrl(otro, 60);
    const tokenOtro = new URL(firmaOtro.data!.signedUrl).searchParams.get("token");

    const base = `${doble.url}/storage/v1/object/sign/${BUCKET}/${p}`;
    expect((await descargar(`${base}?token=inventado`)).status).toBe(400);
    expect((await descargar(`${base}?token=${tokenOtro}`)).status).toBe(400);
    expect((await descargar(base)).status).toBe(400);
  });

  it("download y list (los usan SupabaseAlmacenEnviosWhatsapp y SupabaseAlmacenDescargas)", async () => {
    await cliente.storage.from("descargas").upload("tmp/b.json.gz", new Uint8Array([2]), { contentType: "application/gzip" });
    await cliente.storage.from("descargas").upload("tmp/a.json.gz", new Uint8Array([1]), { contentType: "application/gzip" });
    await cliente.storage.from("descargas").upload("tmp/sub/c.json.gz", new Uint8Array([3]));

    const bajado = await cliente.storage.from("descargas").download("tmp/a.json.gz");
    expect(bajado.error).toBeNull();
    expect(new Uint8Array(await bajado.data!.arrayBuffer())).toEqual(new Uint8Array([1]));
    expect((await cliente.storage.from("descargas").download("tmp/nada.json.gz")).error).not.toBeNull();

    const lista = await cliente.storage.from("descargas").list("tmp", { limit: 10, offset: 0 });
    expect(lista.error).toBeNull();
    expect(lista.data?.map((o) => o.name)).toEqual(["a.json.gz", "b.json.gz", "sub"]);
  });

  it("R4: las clases reales de lib/storage con SUPABASE_URL al doble suben y firman contra el", () => conEmpresa(EMPRESA, async () => {
    // Igual que la app y las fixtures del E2E: `new ...(undefined, bucket)` construye el cliente con
    // `createServerClient()` desde el entorno; no se inyecta nada. Desde SL-19 operan dentro de una
    // empresa y guardan en su carpeta del bucket.
    vi.stubEnv("SUPABASE_URL", doble.url);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "clave-falsa");
    const p = nuevoPath();

    const guardado = await new SupabaseFileStorage(undefined, BUCKET).upload({ path: p, bytes: JPEG, contentType: "image/jpeg" });
    expect(guardado).toBe(p);
    // SL-19: el objeto vive en la carpeta de la empresa; en la raiz del bucket no hay nada.
    expect((await cliente.storage.from(BUCKET).download(`${EMPRESA}/${p}`)).error).toBeNull();
    expect((await cliente.storage.from(BUCKET).download(p)).error).not.toBeNull();

    const firmador = new SupabaseSignedUrlProvider(undefined, BUCKET);
    const varias = await firmador.createSignedUrls([p, "no/subido.jpg"], 60);
    expect(Object.keys(varias)).toEqual([p]);
    const d = await descargar(varias[p]);
    expect(d.tipo).toBe("image/jpeg");
    expect(d.bytes).toEqual(JPEG);

    const una = await firmador.createSignedUrl(p, 60);
    expect((await descargar(una)).bytes).toEqual(JPEG);
    await expect(firmador.createSignedUrl("no/subido.jpg", 60)).rejects.toThrow();

    await new SupabaseFileStorage(undefined, BUCKET).remove([p]);
    await expect(firmador.createSignedUrl(p, 60)).rejects.toThrow();
  }));
});

// SLT-98 design §10: la subida firmada que usa el panel de reporte de bugs. La URL la pide el
// servidor (service role) y el navegador sube con un PUT sin `apikey`, desde otro origen.
describe("doble de Storage: subida firmada y limites del bucket (SLT-98)", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const ORIGEN = "http://127.0.0.1:3999";
  let m = 0;
  const nuevaRuta = (ext = "jpg") => `org-x/usuario-x/imagen-${++m}.${ext}`;
  const codigo = (e: unknown) => (e as { statusCode?: string } | null)?.statusCode;

  /** Crea el bucket si falta: los casos no dependen del orden. */
  async function asegurarBucket(nombre: string) {
    const { error } = await cliente.storage.createBucket(nombre, { public: false });
    if (error && !/already exists/i.test(error.message)) throw error;
  }

  /** El PUT del navegador: solo el token de la URL, sin `apikey` ni `authorization`. */
  async function putNavegador(url: string, bytes: Uint8Array, tipo: string) {
    const r = await fetch(url, { method: "PUT", body: new Uint8Array(bytes), headers: { "content-type": tipo, origin: ORIGEN } });
    return { status: r.status, cors: r.headers.get("access-control-allow-origin"), cuerpo: await r.json() };
  }

  it("createSignedUploadUrl + PUT del navegador sin apikey (y uploadToSignedUrl) + download devuelven los bytes", async () => {
    const BUCKET_SUBIDAS = "subidas-firmadas";
    await asegurarBucket(BUCKET_SUBIDAS);
    const p = nuevaRuta();
    const firma = await cliente.storage.from(BUCKET_SUBIDAS).createSignedUploadUrl(p);
    expect(firma.error).toBeNull();
    // Absoluta, como la de Storage real: el navegador la usa tal cual.
    expect(firma.data?.signedUrl.startsWith(`${doble.url}/storage/v1/object/upload/sign/${BUCKET_SUBIDAS}/${p}?token=`)).toBe(true);

    const put = await putNavegador(firma.data!.signedUrl, JPEG, "image/jpeg");
    expect(put.status).toBe(200);
    expect(put.cors).toBe("*");
    expect(put.cuerpo).toEqual({ Key: `${BUCKET_SUBIDAS}/${p}` });
    const bajado = await cliente.storage.from(BUCKET_SUBIDAS).download(p);
    expect(new Uint8Array(await bajado.data!.arrayBuffer())).toEqual(JPEG);

    // El mismo camino con el cliente real.
    const q = nuevaRuta("png");
    const otra = await cliente.storage.from(BUCKET_SUBIDAS).createSignedUploadUrl(q);
    const subida = await cliente.storage.from(BUCKET_SUBIDAS).uploadToSignedUrl(q, otra.data!.token, PNG, { contentType: "image/png" });
    expect(subida.error).toBeNull();
    expect(subida.data?.path).toBe(q);
    expect(new Uint8Array(await (await cliente.storage.from(BUCKET_SUBIDAS).download(q)).data!.arrayBuffer())).toEqual(PNG);
  });

  it("R9: un token de otra ruta no sube y sin upsert no pisa un objeto existente", async () => {
    const BUCKET_R9 = "reportes-r9";
    await asegurarBucket(BUCKET_R9);
    const mia = nuevaRuta();
    const ajena = nuevaRuta();
    const firmaMia = await cliente.storage.from(BUCKET_R9).createSignedUploadUrl(mia);
    const token = firmaMia.data!.token;

    // El token de `mia` no sirve para `ajena`, ni con el cliente ni con el PUT del navegador.
    const conCliente = await cliente.storage.from(BUCKET_R9).uploadToSignedUrl(ajena, token, PNG, { contentType: "image/png" });
    expect(conCliente.data).toBeNull();
    expect(conCliente.error).not.toBeNull();
    const urlAjena = `${doble.url}/storage/v1/object/upload/sign/${BUCKET_R9}/${ajena}?token=${token}`;
    expect((await putNavegador(urlAjena, PNG, "image/png")).status).toBe(400);
    // Un token de LECTURA tampoco sube.
    await cliente.storage.from(BUCKET_R9).upload(ajena + ".leida", JPEG, { contentType: "image/jpeg" });
    const lectura = await cliente.storage.from(BUCKET_R9).createSignedUrl(ajena + ".leida", 60);
    const tokenLectura = new URL(lectura.data!.signedUrl).searchParams.get("token");
    const urlMiaConLectura = `${doble.url}/storage/v1/object/upload/sign/${BUCKET_R9}/${mia}?token=${tokenLectura}`;
    expect((await putNavegador(urlMiaConLectura, PNG, "image/png")).status).toBe(400);
    expect((await cliente.storage.from(BUCKET_R9).download(ajena)).error).not.toBeNull();

    // Con su token sube; repetir el PUT o pedir otra URL sin upsert no pisa lo subido.
    expect((await putNavegador(firmaMia.data!.signedUrl, JPEG, "image/jpeg")).status).toBe(200);
    const repetido = await putNavegador(firmaMia.data!.signedUrl, PNG, "image/png");
    expect(repetido.status).toBe(400);
    expect(repetido.cuerpo.statusCode).toBe("409");
    const otraFirma = await cliente.storage.from(BUCKET_R9).createSignedUploadUrl(mia);
    expect(otraFirma.data).toBeNull();
    expect(otraFirma.error?.message).toMatch(/already exists/i);
    expect(codigo(otraFirma.error)).toBe("409");
    const bajado = await cliente.storage.from(BUCKET_R9).download(mia);
    expect(new Uint8Array(await bajado.data!.arrayBuffer())).toEqual(JPEG);
  });

  it("R16: sin bucket, Bucket not found; con límites, 413 y 415", async () => {
    const BUCKET_R16 = "bug-reports";
    const sin = await cliente.storage.from(BUCKET_R16).createSignedUploadUrl(nuevaRuta("png"));
    expect(sin.data).toBeNull();
    // La forma que mira el adaptador para crear el bucket (design §3.3).
    expect(sin.error?.message).toMatch(/bucket not found/i);
    expect(codigo(sin.error)).toBe("404");

    const creado = await cliente.storage.createBucket(BUCKET_R16, {
      public: false,
      fileSizeLimit: PNG.length,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    });
    expect(creado.error).toBeNull();
    expect(codigo((await cliente.storage.createBucket(BUCKET_R16, { public: false })).error)).toBe("409");

    const subirCon = async (bytes: Uint8Array, tipo: string) => {
      const ruta = nuevaRuta();
      const firma = await cliente.storage.from(BUCKET_R16).createSignedUploadUrl(ruta);
      expect(firma.error).toBeNull();
      const r = await cliente.storage.from(BUCKET_R16).uploadToSignedUrl(ruta, firma.data!.token, bytes, { contentType: tipo });
      return { ...r, ruta };
    };

    // Un byte de mas que el limite: 413, y no queda nada guardado.
    const grande = await subirCon(new Uint8Array(PNG.length + 1), "image/png");
    expect(codigo(grande.error)).toBe("413");
    expect((await cliente.storage.from(BUCKET_R16).download(grande.ruta)).error).not.toBeNull();
    // Un tipo fuera de la lista: 415. Tambien por el PUT del navegador, con CORS en el error.
    const gif = await subirCon(new Uint8Array([0x47, 0x49, 0x46]), "image/gif");
    expect(codigo(gif.error)).toBe("415");
    const ruta = nuevaRuta();
    const firma = await cliente.storage.from(BUCKET_R16).createSignedUploadUrl(ruta);
    const put = await putNavegador(firma.data!.signedUrl, new Uint8Array([1]), "text/plain");
    expect(put.status).toBe(400);
    expect(put.cuerpo.statusCode).toBe("415");
    expect(put.cors).toBe("*");
    // Justo en el limite y con un tipo permitido, sube.
    expect((await subirCon(PNG, "image/png")).error).toBeNull();
  });

  it("CORS: OPTIONS responde 204 con los metodos y encabezados del PUT del navegador", async () => {
    const r = await fetch(`${doble.url}/storage/v1/object/upload/sign/bug-reports/x/y.png?token=t`, {
      method: "OPTIONS",
      headers: { origin: ORIGEN, "access-control-request-method": "PUT", "access-control-request-headers": "content-type" },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-methods")).toMatch(/\bPUT\b/);
    expect(r.headers.get("access-control-allow-headers")).toMatch(/content-type/);
    expect(r.headers.get("access-control-allow-headers")).toMatch(/x-upsert/);
  });
});
