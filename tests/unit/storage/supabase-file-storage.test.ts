import { describe, it, expect, vi } from "vitest";
import { SupabaseFileStorage, type StorageClientLike } from "@/lib/storage/SupabaseFileStorage";
import { postulacionConfig } from "@/lib/config/postulacion";
import { conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { RutaDeAlmacenInvalida } from "@/lib/storage/carpeta-de-empresa";

// Feature 21 / R18: los documentos van a un bucket PRIVADO; nunca se genera URL
// publica. Se inyecta un cliente Storage falso para verificar sin red.
// SL-19 (R15–R18): cada caso corre en la empresa ORG; el cliente recibe `ORG/<ruta>` y quien sube
// recibe la ruta de siempre.

const ORG = "11111111-1111-4111-8111-111111111111";
const enOrg = <T>(fn: () => Promise<T>) => conEmpresa(ORG, fn);

function buildStorage() {
  const upload = vi.fn(async (path: string) => ({ data: { path }, error: null }));
  const remove = vi.fn().mockResolvedValue({ error: null });
  const getPublicUrl = vi.fn();
  const from = vi.fn().mockReturnValue({ upload, remove, getPublicUrl });
  const client: StorageClientLike = { from } as unknown as StorageClientLike;
  return { client, from, upload, remove, getPublicUrl };
}

describe("SupabaseFileStorage (R18)", () => {
  it("sube a la carpeta de la empresa del bucket privado, con upsert:false y contentType, y devuelve la ruta relativa (SL-19 R15)", async () => {
    const { client, from, upload } = buildStorage();
    const storage = new SupabaseFileStorage(client);

    const path = await enOrg(() =>
      storage.upload({
        path: "usr/cedula_anverso.jpg",
        bytes: new Uint8Array([1, 2, 3]),
        contentType: "image/jpeg",
      }),
    );

    expect(path).toBe("usr/cedula_anverso.jpg");
    expect(from).toHaveBeenCalledWith(postulacionConfig.BUCKET);
    expect(upload).toHaveBeenCalledWith(
      `${ORG}/usr/cedula_anverso.jpg`,
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: "image/jpeg", upsert: false }),
    );
  });

  it("R18: nunca solicita una URL publica del objeto", async () => {
    const { client, getPublicUrl } = buildStorage();
    const storage = new SupabaseFileStorage(client);
    await enOrg(() =>
      storage.upload({
        path: "usr/foto.jpg",
        bytes: new Uint8Array([1]),
        contentType: "image/jpeg",
      }),
    );
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("lanza si el backend devuelve error en la subida", async () => {
    const { client, from } = buildStorage();
    from.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
      remove: vi.fn(),
    });
    const storage = new SupabaseFileStorage(client);
    await expect(
      enOrg(() => storage.upload({ path: "x", bytes: new Uint8Array([1]), contentType: "image/png" })),
    ).rejects.toThrow(/fallo al subir/);
  });

  it("remove no lanza con lista vacia y delega al backend con las rutas dentro de la carpeta (SL-19 R16)", async () => {
    const { client, remove } = buildStorage();
    const storage = new SupabaseFileStorage(client);
    await enOrg(() => storage.remove([]));
    expect(remove).not.toHaveBeenCalled();
    await enOrg(() => storage.remove(["a", "b"]));
    expect(remove).toHaveBeenCalledWith([`${ORG}/a`, `${ORG}/b`]);
  });

  it("SL-19 R17/R18: ruta invalida o sin empresa ⇒ falla sin llamar a Storage", async () => {
    const { client, upload, remove } = buildStorage();
    const storage = new SupabaseFileStorage(client);
    const bytes = new Uint8Array([1]);
    await expect(enOrg(() => storage.upload({ path: "../x", bytes, contentType: "image/png" }))).rejects.toBeInstanceOf(
      RutaDeAlmacenInvalida,
    );
    await expect(enOrg(() => storage.remove(["a", "/b"]))).rejects.toBeInstanceOf(RutaDeAlmacenInvalida);
    await expect(storage.upload({ path: "x", bytes, contentType: "image/png" })).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
