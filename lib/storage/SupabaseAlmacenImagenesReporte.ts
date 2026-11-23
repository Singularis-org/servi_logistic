import { createServerClient } from "@/lib/supabase/client";
import { bucketReporteBug, IMAGEN_BYTES_MAX, TIPOS_IMAGEN } from "@/lib/config/reporte-bug";
import type { IAlmacenImagenesReporte } from "@/lib/interfaces/external/IAlmacenImagenesReporte";
import { empresaDelAlmacen, rutaEnCarpeta, rutaRelativa } from "@/lib/storage/carpeta-de-empresa";

// SLT-98 (design §3.2, §3.3; R9, R15, R16) — las imágenes de los reportes de problema sobre Supabase
// Storage, con el service role (`createServerClient`), nunca desde el cliente. El molde es
// `SupabaseAlmacenDescargas`: cliente PEREZOSO e INYECTABLE (los tests pasan un doble, sin red) y bucket
// inyectable. NUNCA genera una URL pública: la superficie del cliente ni siquiera la expone (R15).
//
// El navegador sube con un `PUT` a la URL firmada de `prepararSubida`; el servidor no ve los bytes hasta
// `leer`, en el envío. Toda ruta pasa por la carpeta de la empresa en curso (SL-19).

type ErrorSdk = { message: string; status?: number | string; statusCode?: number | string } | null;

/** Opciones de `StorageBucketApi.createBucket` que usa este almacén. */
export interface OpcionesBucketImagenes {
  public: boolean;
  fileSizeLimit: number;
  allowedMimeTypes: string[];
}

/** Superficie mínima del cliente Storage de Supabase que usa este almacén (testeable). */
export interface ImagenesStorageClientLike {
  from(bucket: string): {
    createSignedUploadUrl(
      path: string,
    ): Promise<{ data: { signedUrl: string; token: string; path: string } | null; error: ErrorSdk }>;
    download(path: string): Promise<{ data: Blob | null; error: ErrorSdk }>;
    createSignedUrls(
      paths: string[],
      expiresIn: number,
    ): Promise<{
      data: Array<{ path: string | null; signedUrl: string; error: string | null }> | null;
      error: ErrorSdk;
    }>;
    remove(paths: string[]): Promise<{ data: unknown; error: ErrorSdk }>;
  };
  createBucket(id: string, options: OpcionesBucketImagenes): Promise<{ data: unknown; error: ErrorSdk }>;
}

/** «Not found» del SDK (mensaje, o 404 en `statusCode`/`status`): bucket u objeto inexistente. */
function esNoEncontrado(error: ErrorSdk): boolean {
  if (!error) return false;
  return /bucket not found|not found/i.test(error.message) || String(error.statusCode) === "404" || String(error.status) === "404";
}

/** «Already exists» al crear el bucket: otro envío lo creó a la vez, se tolera. */
function esBucketYaExistente(error: ErrorSdk): boolean {
  if (!error) return false;
  return /already exists/i.test(error.message) || String(error.statusCode) === "409" || String(error.status) === "409";
}

export class SupabaseAlmacenImagenesReporte implements IAlmacenImagenesReporte {
  private storageClient: ImagenesStorageClientLike | undefined;

  constructor(
    storage?: ImagenesStorageClientLike,
    private readonly bucket: string = bucketReporteBug(),
  ) {
    this.storageClient = storage;
  }

  /** Cliente Storage perezoso: crea (y lee env vía createServerClient) al 1er uso. */
  private get storage(): ImagenesStorageClientLike {
    if (!this.storageClient) {
      this.storageClient = createServerClient().storage as unknown as ImagenesStorageClientLike;
    }
    return this.storageClient;
  }

  async prepararSubida(ruta: string): Promise<{ url: string }> {
    const org = await empresaDelAlmacen(this.bucket, "preparar-subida");
    const completa = rutaEnCarpeta(org, ruta);
    // Sin `{ upsert: true }`: el token no pisa un objeto que ya existe (R9).
    const pedir = () => this.storage.from(this.bucket).createSignedUploadUrl(completa);

    let r = await pedir();
    if (r.error && esNoEncontrado(r.error)) {
      // R16: el bucket se crea solo en la primera subida, PRIVADO y con los límites del reporte, para
      // que Storage rechace lo que el navegador no debió mandar. Un «ya existe» es otro envío que lo
      // creó a la vez: se ignora. Un bucket que ya existe no se toca.
      const c = await this.storage.createBucket(this.bucket, {
        public: false,
        fileSizeLimit: IMAGEN_BYTES_MAX,
        allowedMimeTypes: [...TIPOS_IMAGEN],
      });
      if (c.error && !esBucketYaExistente(c.error)) {
        throw new Error(`fallo al crear el bucket de reportes: ${c.error.message}`);
      }
      r = await pedir(); // reintento ÚNICO
    }
    if (r.error || !r.data) {
      throw new Error(`fallo al preparar la subida de la imagen del reporte: ${r.error?.message ?? "sin data"}`);
    }
    return { url: r.data.signedUrl };
  }

  async leer(ruta: string): Promise<Uint8Array | null> {
    const org = await empresaDelAlmacen(this.bucket, "leer");
    const { data, error } = await this.storage.from(this.bucket).download(rutaEnCarpeta(org, ruta));
    // R10: una imagen que no se subió (o un bucket que aún no existe) es un dato que falta, no un fallo.
    if (esNoEncontrado(error)) return null;
    if (error || !data) {
      throw new Error(`fallo al leer la imagen del reporte: ${error?.message ?? "sin data"}`);
    }
    return new Uint8Array(await data.arrayBuffer());
  }

  async firmar(rutas: string[], ttlSegundos: number): Promise<Record<string, string>> {
    if (rutas.length === 0) return {};
    const org = await empresaDelAlmacen(this.bucket, "firmar-lote");
    const completas = rutas.map((r) => rutaEnCarpeta(org, r));
    const { data, error } = await this.storage.from(this.bucket).createSignedUrls(completas, ttlSegundos);
    if (error || !data) {
      throw new Error(`fallo al firmar las imágenes del reporte: ${error?.message ?? "sin data"}`);
    }
    // Parcial, como `SupabaseSignedUrlProvider`: lo que no se pudo firmar se omite y el llamador muestra
    // la nota de R21/R23. Storage devuelve la ruta completa: se re-indexa por la relativa.
    const firmadas: Record<string, string> = {};
    for (const entrada of data) {
      if (entrada.error || !entrada.path) continue;
      const relativa = rutaRelativa(org, entrada.path);
      if (relativa === null) continue;
      firmadas[relativa] = entrada.signedUrl;
    }
    return firmadas;
  }

  async borrar(rutas: string[]): Promise<void> {
    if (rutas.length === 0) return;
    const org = await empresaDelAlmacen(this.bucket, "borrar");
    const r = await this.storage.from(this.bucket).remove(rutas.map((ruta) => rutaEnCarpeta(org, ruta)));
    if (r.error) throw new Error(`fallo al borrar imágenes del reporte: ${r.error.message}`);
  }
}
