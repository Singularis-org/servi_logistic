import { createServerClient } from "@/lib/supabase/client";
import { postulacionConfig } from "@/lib/config/postulacion";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import { empresaDelAlmacen, rutaEnCarpeta, rutaRelativa } from "@/lib/storage/carpeta-de-empresa";

// Feature 22 (R8/R9) — implementacion de ISignedUrlProvider sobre Supabase
// Storage. Firma URLs temporales de objetos del bucket PRIVADO `mensajero-docs`
// con el service role (createServerClient), nunca desde el cliente. El cliente
// se inyecta para testear sin red (patron StorageClientLike de SupabaseFileStorage).
// No hardcodea URL/keys: viven en env via createServerClient.
//
// SL-19 (design §3.2; R16–R19): se firma solo dentro de la carpeta de la empresa en curso. Desde B,
// la ruta `x` es `B/x`: un objeto de A con esa misma ruta no existe para B.

/** Superficie minima del cliente Storage de Supabase que usamos (testeable). */
export interface SignedUrlClientLike {
  from(bucket: string): {
    createSignedUrl(
      path: string,
      expiresIn: number,
    ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    createSignedUrls(
      paths: string[],
      expiresIn: number,
    ): Promise<{
      data: Array<{ path: string | null; signedUrl: string; error: string | null }> | null;
      error: { message: string } | null;
    }>;
  };
}

export class SupabaseSignedUrlProvider implements ISignedUrlProvider {
  private readonly bucket: string;
  private storageClient: SignedUrlClientLike | undefined;

  constructor(storage?: SignedUrlClientLike, bucket: string = postulacionConfig.BUCKET) {
    // Igual que SupabaseFileStorage: cliente PEREZOSO. Construir este provider para
    // un flujo de solo lectura (que nunca firma URLs) NO exige la config de Supabase.
    this.storageClient = storage;
    this.bucket = bucket;
  }

  /** Cliente Storage perezoso: crea (y lee env via createServerClient) al 1er uso. */
  private get storage(): SignedUrlClientLike {
    if (!this.storageClient) {
      this.storageClient = createServerClient().storage as unknown as SignedUrlClientLike;
    }
    return this.storageClient;
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    const org = await empresaDelAlmacen(this.bucket, "firmar");
    const { data, error } = await this.storage
      .from(this.bucket)
      .createSignedUrl(rutaEnCarpeta(org, path), expiresInSeconds);
    if (error || !data) {
      throw new Error(`fallo al firmar URL de documento: ${error?.message ?? "sin data"}`);
    }
    return data.signedUrl;
  }

  async createSignedUrls(
    paths: string[],
    expiresInSeconds: number,
  ): Promise<Record<string, string>> {
    if (paths.length === 0) return {};
    const org = await empresaDelAlmacen(this.bucket, "firmar-lote");
    const completas = paths.map((p) => rutaEnCarpeta(org, p));
    const { data, error } = await this.storage
      .from(this.bucket)
      .createSignedUrls(completas, expiresInSeconds);
    if (error || !data) {
      throw new Error(`fallo al firmar URLs de documentos: ${error?.message ?? "sin data"}`);
    }
    // El resultado es PARCIAL a proposito: una entrada que el storage no pudo firmar se
    // OMITE en vez de tumbar el lote entero. Un objeto perdido o inaccesible es un dato
    // que falta, no un fallo de la operacion que lo pide: quien consume este Record ya
    // resuelve la ausencia (`urlByPath[path] ?? null`), porque un documento puede no
    // existir por diseño. Lanzar aqui convertia una evidencia huerfana en una pantalla
    // entera caida — asi se quedo un cierre de dia sin poder aprobarse (2026-07-29), y
    // con el, bloqueadas todas las asignaciones de la zona de ese mensajero.
    //
    // SL-19 (R19): Storage devuelve `entry.path` completo (`<org>/<ruta>`) y los consumidores buscan
    // `urlByPath[path]` con la ruta que pidieron: se re-indexa por la relativa. Una entrada fuera de
    // la carpeta no es de esta empresa y se descarta.
    const result: Record<string, string> = {};
    for (const entry of data) {
      if (entry.error || !entry.path) continue;
      const relativa = rutaRelativa(org, entry.path);
      if (relativa === null) continue;
      result[relativa] = entry.signedUrl;
    }
    return result;
  }
}
