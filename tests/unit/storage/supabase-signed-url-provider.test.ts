import { describe, it, expect, vi } from "vitest";
import {
  SupabaseSignedUrlProvider,
  type SignedUrlClientLike,
} from "@/lib/storage/SupabaseSignedUrlProvider";
import { postulacionConfig } from "@/lib/config/postulacion";
import { conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { RutaDeAlmacenInvalida } from "@/lib/storage/carpeta-de-empresa";

// Feature 22 / R8/R9: firma URLs temporales del bucket privado. Cliente falso
// para verificar path/ttl y manejo de error sin red.
// SL-19 (R16–R19): cada caso corre en la empresa ORG; el cliente recibe `ORG/<ruta>` y el mapa del
// lote vuelve indexado por la ruta relativa que se pidio.

const ORG = "11111111-1111-4111-8111-111111111111";
const OTRA = "22222222-2222-4222-8222-222222222222";
const enOrg = <T>(fn: () => Promise<T>) => conEmpresa(ORG, fn);

function buildClient() {
  const createSignedUrl = vi
    .fn()
    .mockResolvedValue({ data: { signedUrl: "https://signed/one" }, error: null });
  const createSignedUrls = vi.fn().mockImplementation(async (paths: string[]) => ({
    data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}`, error: null })),
    error: null,
  }));
  const from = vi.fn().mockReturnValue({ createSignedUrl, createSignedUrls });
  const client: SignedUrlClientLike = { from } as unknown as SignedUrlClientLike;
  return { client, from, createSignedUrl, createSignedUrls };
}

describe("SupabaseSignedUrlProvider (R8/R9)", () => {
  it("firma una URL con el bucket privado y el ttl indicado", async () => {
    const { client, from, createSignedUrl } = buildClient();
    const provider = new SupabaseSignedUrlProvider(client);

    const url = await enOrg(() => provider.createSignedUrl("usr-1/cedula_anverso.jpg", 300));

    expect(url).toBe("https://signed/one");
    expect(from).toHaveBeenCalledWith(postulacionConfig.BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith(`${ORG}/usr-1/cedula_anverso.jpg`, 300);
  });

  it("firma varias URLs en batch y devuelve mapa path relativo->url con el ttl (SL-19 R19)", async () => {
    const { client, createSignedUrls } = buildClient();
    const provider = new SupabaseSignedUrlProvider(client);

    const map = await enOrg(() => provider.createSignedUrls(["a.jpg", "b.jpg"], 120));

    expect(createSignedUrls).toHaveBeenCalledWith([`${ORG}/a.jpg`, `${ORG}/b.jpg`], 120);
    expect(map).toEqual({ "a.jpg": `https://signed/${ORG}/a.jpg`, "b.jpg": `https://signed/${ORG}/b.jpg` });
  });

  it("SL-19 R19: una entrada que Storage devuelve fuera de la carpeta se descarta", async () => {
    const { client, from } = buildClient();
    from.mockReturnValue({
      createSignedUrl: vi.fn(),
      createSignedUrls: vi.fn().mockResolvedValue({
        data: [
          { path: `${OTRA}/a.jpg`, signedUrl: "https://signed/ajena", error: null },
          { path: "a.jpg", signedUrl: "https://signed/raiz", error: null },
          { path: `${ORG}/b.jpg`, signedUrl: "https://signed/b", error: null },
        ],
        error: null,
      }),
    });
    const provider = new SupabaseSignedUrlProvider(client);

    expect(await enOrg(() => provider.createSignedUrls(["a.jpg", "b.jpg"], 300))).toEqual({ "b.jpg": "https://signed/b" });
  });

  it("SL-19 R17/R18: ruta invalida o sin empresa ⇒ falla sin llamar a Storage", async () => {
    const { client, createSignedUrl, createSignedUrls } = buildClient();
    const provider = new SupabaseSignedUrlProvider(client);
    await expect(enOrg(() => provider.createSignedUrl(`../${OTRA}/a.jpg`, 60))).rejects.toBeInstanceOf(RutaDeAlmacenInvalida);
    await expect(enOrg(() => provider.createSignedUrls(["a.jpg", "b//c.jpg"], 60))).rejects.toBeInstanceOf(
      RutaDeAlmacenInvalida,
    );
    await expect(provider.createSignedUrl("a.jpg", 60)).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(provider.createSignedUrls(["a.jpg"], 60)).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("batch vacio no llama al backend", async () => {
    const { client, createSignedUrls } = buildClient();
    const provider = new SupabaseSignedUrlProvider(client);
    const map = await enOrg(() => provider.createSignedUrls([], 300));
    expect(map).toEqual({});
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("lanza con contexto si el backend devuelve error al firmar una URL", async () => {
    const { client, from } = buildClient();
    from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }),
      createSignedUrls: vi.fn(),
    });
    const provider = new SupabaseSignedUrlProvider(client);
    await expect(enOrg(() => provider.createSignedUrl("x", 300))).rejects.toThrow(/fallo al firmar/);
  });

  // El batch devuelve un resultado PARCIAL: la entrada que el storage no pudo firmar se
  // omite. Antes lanzaba, y un solo objeto perdido tumbaba a quien pidiera el lote entero:
  // asi se quedo un cierre de dia sin poder abrirse (produccion, 2026-07-29) y, con el,
  // bloqueadas las asignaciones de la zona de ese mensajero. Quien consume el mapa ya
  // resuelve la ausencia con `?? null`, porque un documento puede faltar por diseño.
  it("una entrada con error se OMITE del mapa, sin tumbar el resto del batch", async () => {
    const { client, from } = buildClient();
    from.mockReturnValue({
      createSignedUrl: vi.fn(),
      createSignedUrls: vi.fn().mockResolvedValue({
        data: [
          { path: `${ORG}/a.jpg`, signedUrl: "", error: "not found" },
          { path: `${ORG}/b.jpg`, signedUrl: "https://signed/b.jpg", error: null },
        ],
        error: null,
      }),
    });
    const provider = new SupabaseSignedUrlProvider(client);

    const map = await enOrg(() => provider.createSignedUrls(["a.jpg", "b.jpg"], 300));

    expect(map).toEqual({ "b.jpg": "https://signed/b.jpg" });
  });

  it("un batch entero fallido devuelve mapa vacio, no una excepcion por entrada", async () => {
    const { client, from } = buildClient();
    from.mockReturnValue({
      createSignedUrl: vi.fn(),
      createSignedUrls: vi.fn().mockResolvedValue({
        data: [{ path: `${ORG}/a.jpg`, signedUrl: "", error: "not found" }],
        error: null,
      }),
    });
    const provider = new SupabaseSignedUrlProvider(client);

    expect(await enOrg(() => provider.createSignedUrls(["a.jpg"], 300))).toEqual({});
  });

  // El error GLOBAL (credencial ausente, storage caido) sigue lanzando: no es "falta este
  // objeto", es "no se pudo preguntar". Quien lo necesite best-effort lo decide arriba.
  it("un error global del backend SI lanza (distinto de una entrada fallida)", async () => {
    const { client, from } = buildClient();
    from.mockReturnValue({
      createSignedUrl: vi.fn(),
      createSignedUrls: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "supabaseUrl is required" } }),
    });
    const provider = new SupabaseSignedUrlProvider(client);

    await expect(enOrg(() => provider.createSignedUrls(["a.jpg"], 300))).rejects.toThrow(/fallo al firmar/);
  });
});
