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

const JPEG = new Uint8Array(readFileSync(path.join(process.cwd(), "e2e/fixtures/evidencia.jpg")));
const BUCKET = "gestion-evidencias";

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

  it("R4: las clases reales de lib/storage con SUPABASE_URL al doble suben y firman contra el", async () => {
    // Igual que la app y las fixtures del E2E: `new ...(undefined, bucket)` construye el cliente con
    // `createServerClient()` desde el entorno; no se inyecta nada.
    vi.stubEnv("SUPABASE_URL", doble.url);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "clave-falsa");
    const p = nuevoPath();

    const guardado = await new SupabaseFileStorage(undefined, BUCKET).upload({ path: p, bytes: JPEG, contentType: "image/jpeg" });
    expect(guardado).toBe(p);

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
  });
});
