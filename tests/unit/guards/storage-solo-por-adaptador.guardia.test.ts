import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { EXCEPCIONES_DE_STORAGE } from "@/lib/db/excepciones-aislamiento";

import {
  archivosDeCodigo,
  archivosRepetidos,
  leer,
  problemasDeExcepcion,
  RAIZ,
  sinComentarios,
} from "./_aislamiento-por-empresa";

/**
 * SL-19 · R20 — GUARDIA: STORAGE SOLO A TRAVES DE LOS ADAPTADORES DE `lib/storage/`.
 *
 * Los adaptadores de `lib/storage/` resuelven la empresa en curso y meten cada ruta en su carpeta
 * (`<organizacion_id>/<ruta>`). Un archivo que toma `.storage` del cliente de Supabase por su cuenta
 * se salta esa carpeta y puede leer o borrar lo de otra empresa. Cada uno fuera de `lib/storage/`
 * tiene que estar en `EXCEPCIONES_DE_STORAGE` con su ficha y su motivo.
 */

const CARPETAS = ["app", "lib", "scripts"] as const;
const CARPETA_DE_ADAPTADORES = "lib/storage/";

/**
 * Acceso a Storage sobre un cliente de Supabase (design §5.3): `createServerClient().storage`,
 * `.storage.from(` y las operaciones de buckets (`.storage.createBucket(` y sus hermanas). No casa
 * con `this.storage.upload(`, que es un `IFileStorage` inyectado y ya pasa por un adaptador.
 *
 * Tambien las dos formas de sacar `storage` a una variable y usarla despues sin `.storage.` (m1 de la
 * revision): la desestructuracion del cliente (`const { storage } = createServerClient()`) y el alias
 * (`const s = supabase.storage;`). El alias no casa con `this.storage` ni con `this.deps.storage`.
 */
const ACCESO_A_STORAGE = new RegExp(
  [
    /\bcreate\w*Client\s*\([^)]*\)\s*\.\s*storage\b/.source,
    /\.storage\s*\.\s*(?:from|createBucket|getBucket|listBuckets|updateBucket|emptyBucket|deleteBucket)\s*\(/.source,
    /\{[^}]*\bstorage\b[^}]*\}\s*=\s*(?:await\s+)?create\w*Client\s*\(/.source,
    /=\s*(?!this\b)\w+\s*\.\s*storage\b(?!\s*\.)/.source,
  ].join("|"),
);

function accedeAStorage(texto: string): boolean {
  return ACCESO_A_STORAGE.test(sinComentarios(texto));
}

function archivosQueAccedenAStorage(raiz: string = RAIZ): string[] {
  return archivosDeCodigo(CARPETAS, raiz).filter((rel) => accedeAStorage(leer(rel, raiz)));
}

function fueraDeLosAdaptadores(archivos: string[]): string[] {
  return archivos.filter((rel) => !rel.startsWith(CARPETA_DE_ADAPTADORES));
}

describe("SL-19 · Storage solo por los adaptadores de lib/storage (R20)", () => {
  const acceden = archivosQueAccedenAStorage();
  const enLista = new Set(EXCEPCIONES_DE_STORAGE.map((e) => e.archivo));

  it("control positivo: el barrido ve los cuatro adaptadores de lib/storage", () => {
    expect(acceden).toEqual(
      expect.arrayContaining([
        "lib/storage/SupabaseAlmacenDescargas.ts",
        "lib/storage/SupabaseAlmacenEnviosWhatsapp.ts",
        "lib/storage/SupabaseFileStorage.ts",
        "lib/storage/SupabaseSignedUrlProvider.ts",
      ]),
    );
  });

  it("todo archivo fuera de lib/storage que accede a Storage está en EXCEPCIONES_DE_STORAGE", () => {
    const fuera = fueraDeLosAdaptadores(acceden).filter((rel) => !enLista.has(rel));
    expect(
      fuera,
      "Usa un adaptador de lib/storage (pone la carpeta de la empresa) o añade el archivo a EXCEPCIONES_DE_STORAGE con ficha y motivo",
    ).toEqual([]);
  });

  it("cada excepción trae ficha SL-<n>, motivo y un archivo que existe, sin repetirse", () => {
    expect(EXCEPCIONES_DE_STORAGE.flatMap((e) => problemasDeExcepcion(e))).toEqual([]);
    expect(archivosRepetidos(EXCEPCIONES_DE_STORAGE)).toEqual([]);
  });

  describe("autocomprobación con fuentes inventadas", () => {
    it("detecta cada forma de acceso, también con salto de línea", () => {
      expect(accedeAStorage("const s = createServerClient().storage;")).toBe(true);
      expect(accedeAStorage('await supabase.storage.from("b").remove([p]);')).toBe(true);
      expect(accedeAStorage('await cliente.storage\n  .from("b")\n  .download(p);')).toBe(true);
      expect(accedeAStorage('await cliente.storage.createBucket("b", { public: false });')).toBe(true);
    });

    it("detecta la desestructuracion del cliente (m1)", () => {
      expect(accedeAStorage('const { storage } = createServerClient();\nawait storage.from("b").remove([p]);')).toBe(true);
      expect(accedeAStorage("const { auth, storage: st } = await createBrowserClient(url, clave);")).toBe(true);
    });

    it("detecta el alias de .storage (m1)", () => {
      expect(accedeAStorage('const s = supabase.storage;\nawait s.from("b").download(p);')).toBe(true);
      expect(accedeAStorage("const s = cliente.storage as unknown as StorageClientLike;")).toBe(true);
    });

    it("no confunde un IFileStorage inyectado, un comentario ni otro nombre", () => {
      expect(accedeAStorage("await this.storage.upload({ path, bytes, contentType });")).toBe(false);
      expect(accedeAStorage("await this.deps.storage.remove(paths);")).toBe(false);
      expect(accedeAStorage('// antes: supabase.storage.from("b")\nconst a = 1;')).toBe(false);
      expect(accedeAStorage('const x = almacen.storageFrom("b");')).toBe(false);
      expect(accedeAStorage("const s = this.storage;")).toBe(false);
      expect(accedeAStorage("const s = this.deps.storage;")).toBe(false);
      expect(accedeAStorage("const { storage } = deps;")).toBe(false);
    });

    describe("el barrido de un árbol inventado", () => {
      const raiz = mkdtempSync(path.join(tmpdir(), "sl19-storage-"));
      afterAll(() => rmSync(raiz, { recursive: true, force: true }));

      it("nombra el archivo de lib/services que llama a .storage.from( y deja pasar los adaptadores y los tests", () => {
        const escribir = (rel: string, texto: string) => {
          mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
          writeFileSync(path.join(raiz, rel), texto);
        };
        const acceso = 'await createServerClient().storage.from("b").download("x");\n';
        escribir("lib/storage/Adaptador.ts", acceso);
        escribir("lib/services/intruso.ts", acceso);
        escribir("scripts/tarea.ts", 'await cliente.storage.from("b").list("");\n');
        escribir("app/y/route.test.ts", acceso);
        escribir("lib/services/limpio.ts", "await this.storage.upload(input);\n");
        escribir("lib/services/desestructura.ts", 'const { storage } = createServerClient();\nawait storage.from("b").list("");\n');
        escribir("app/z/alias.ts", 'const s = supabase.storage;\nawait s.from("b").remove(["x"]);\n');
        expect(fueraDeLosAdaptadores(archivosQueAccedenAStorage(raiz)).sort()).toEqual([
          "app/z/alias.ts",
          "lib/services/desestructura.ts",
          "lib/services/intruso.ts",
          "scripts/tarea.ts",
        ]);
      });
    });

    it("una excepción sin ficha válida, sin motivo o con archivo inexistente falla", () => {
      const mala = { archivo: "scripts/no-existe.ts", ficha: "SL19" as `SL-${number}`, motivo: " " };
      expect(problemasDeExcepcion(mala)).toHaveLength(3);
    });
  });
});
