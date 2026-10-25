// SL-19 (design §3.2 y §6; R15, R16, R19, R21, R22) — Storage con dos empresas, de punta a punta.
//
// El doble HTTP de Storage del E2E (`e2e/_storage-falso/servidor.mjs`) habla con el SDK REAL de
// `@supabase/supabase-js`, y encima corren los CUATRO adaptadores reales de `lib/storage/`, dentro de
// `conEmpresa(A)` y `conEmpresa(B)`. Lo que se afirma sobre el bucket se lee con el cliente crudo
// (sin carpeta), no con el adaptador que se esta probando. No necesita base ni red.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { arrancarStorageFalso } from "@/e2e/_storage-falso/servidor.mjs";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { RutaDeAlmacenInvalida } from "@/lib/storage/carpeta-de-empresa";
import { SupabaseAlmacenDescargas, type AlmacenStorageClientLike } from "@/lib/storage/SupabaseAlmacenDescargas";
import { SupabaseAlmacenEnviosWhatsapp, type EnviosStorageClientLike } from "@/lib/storage/SupabaseAlmacenEnviosWhatsapp";
import { SupabaseFileStorage, type StorageClientLike } from "@/lib/storage/SupabaseFileStorage";
import { SupabaseSignedUrlProvider, type SignedUrlClientLike } from "@/lib/storage/SupabaseSignedUrlProvider";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EVIDENCIAS = "gestion-evidencias";
const ETIQUETAS = "etiquetas-guia";
const DESCARGAS = "descargas";
const ENVIOS = "whatsapp-envios";

const texto = (s: string) => new TextEncoder().encode(s);

let doble: Awaited<ReturnType<typeof arrancarStorageFalso>>;
let cliente: SupabaseClient;
let n = 0;
/** Ruta distinta por caso, con la forma de las evidencias (`<ordenId>/<archivo>`). */
const nuevaRuta = () => `orden-${++n}/foto-${n}.jpg`;

// Los cuatro adaptadores reales, con el SDK real apuntando al doble (inyectado: el `.env` local no
// se lee nunca en este archivo).
const archivos = (bucket: string) => new SupabaseFileStorage(cliente.storage as unknown as StorageClientLike, bucket);
const firmador = (bucket: string) =>
  new SupabaseSignedUrlProvider(cliente.storage as unknown as SignedUrlClientLike, bucket);
const descargas = () => new SupabaseAlmacenDescargas(cliente.storage as unknown as AlmacenStorageClientLike, DESCARGAS);
const envios = () => new SupabaseAlmacenEnviosWhatsapp(cliente.storage as unknown as EnviosStorageClientLike, ENVIOS);

/** Los bytes de un objeto leidos con el cliente crudo, por su clave completa; `null` si no existe. */
async function bytesEnBucket(bucket: string, clave: string): Promise<string | null> {
  const { data, error } = await cliente.storage.from(bucket).download(clave);
  if (error || !data) return null;
  return new TextDecoder().decode(await data.arrayBuffer());
}

/** Lo que sirve una URL firmada, como lo pediria el navegador. */
async function servido(url: string): Promise<string> {
  const r = await fetch(url);
  expect(r.status).toBe(200);
  return new TextDecoder().decode(await r.arrayBuffer());
}

beforeAll(async () => {
  doble = await arrancarStorageFalso({ puerto: 0 });
  cliente = createClient(doble.url, "clave-falsa");
});

afterAll(async () => {
  await doble.cerrar();
});

describe("R15 — lo que guarda una empresa queda en su carpeta, con la ruta de siempre", () => {
  it("SupabaseFileStorage: devuelve la ruta relativa y el objeto vive en <A>/<ruta>, no en la raiz", async () => {
    const ruta = nuevaRuta();
    const devuelta = await conEmpresa(A, () =>
      archivos(EVIDENCIAS).upload({ path: ruta, bytes: texto("de A"), contentType: "image/jpeg" }),
    );
    expect(devuelta).toBe(ruta);
    expect(await bytesEnBucket(EVIDENCIAS, `${A}/${ruta}`)).toBe("de A");
    expect(await bytesEnBucket(EVIDENCIAS, ruta)).toBeNull();
  });

  it("SupabaseAlmacenEnviosWhatsapp: <envioId>/<ejecucionId>.pdf dentro de la carpeta de A", async () => {
    const { ruta } = await conEmpresa(A, () => envios().guardar(`env-${++n}`, "eje-1", texto("pdf de A")));
    expect(ruta).toBe(`env-${n}/eje-1.pdf`);
    expect(await bytesEnBucket(ENVIOS, `${A}/${ruta}`)).toBe("pdf de A");
    expect(await bytesEnBucket(ENVIOS, ruta)).toBeNull();
  });

  it("SupabaseAlmacenDescargas: tmp/<uuid>.json.gz dentro de la carpeta de A, y A la firma", async () => {
    const { ruta } = await conEmpresa(A, () => descargas().guardar(texto("descarga de A")));
    expect(ruta).toMatch(/^tmp\/[0-9a-f-]{36}\.json\.gz$/);
    expect(await bytesEnBucket(DESCARGAS, `${A}/${ruta}`)).toBe("descarga de A");
    expect(await servido(await conEmpresa(A, () => descargas().firmar(ruta, 60)))).toBe("descarga de A");
  });
});

describe("R16 — desde B, la ruta de un objeto de A se comporta como inexistente", () => {
  it("firmar (uno y en lote), descargar y borrar desde B no alcanzan el objeto de A, que queda intacto", async () => {
    const ruta = nuevaRuta();
    await conEmpresa(A, () => archivos(EVIDENCIAS).upload({ path: ruta, bytes: texto("solo de A"), contentType: "image/jpeg" }));

    await expect(conEmpresa(B, () => firmador(EVIDENCIAS).createSignedUrl(ruta, 60))).rejects.toThrow(/fallo al firmar/);
    expect(await conEmpresa(B, () => firmador(EVIDENCIAS).createSignedUrls([ruta], 60))).toEqual({});
    await conEmpresa(B, () => archivos(EVIDENCIAS).remove([ruta]));

    // El de A sigue ahi, byte a byte, y A lo sigue firmando.
    expect(await bytesEnBucket(EVIDENCIAS, `${A}/${ruta}`)).toBe("solo de A");
    expect(await servido(await conEmpresa(A, () => firmador(EVIDENCIAS).createSignedUrl(ruta, 60)))).toBe("solo de A");
  });

  it("leer, firmar y borrar un PDF de envios de A desde B: no existe para B, y el de A queda intacto", async () => {
    const { ruta } = await conEmpresa(A, () => envios().guardar(`env-${++n}`, "eje-1", texto("pdf solo de A")));

    await expect(conEmpresa(B, () => envios().leer(ruta))).rejects.toThrow(/fallo al leer/);
    await expect(conEmpresa(B, () => envios().firmar(ruta, 60))).rejects.toThrow(/fallo al firmar/);
    await conEmpresa(B, () => envios().borrar([ruta]));

    expect(await bytesEnBucket(ENVIOS, `${A}/${ruta}`)).toBe("pdf solo de A");
    expect(new TextDecoder().decode(await conEmpresa(A, () => envios().leer(ruta)))).toBe("pdf solo de A");
  });

  it("firmar desde B una descarga temporal de A falla", async () => {
    const { ruta } = await conEmpresa(A, () => descargas().guardar(texto("descarga solo de A")));
    await expect(conEmpresa(B, () => descargas().firmar(ruta, 60))).rejects.toThrow(/fallo al firmar/);
    expect(await bytesEnBucket(DESCARGAS, `${A}/${ruta}`)).toBe("descarga solo de A");
  });

  it("con la misma ruta, cada empresa ve solo su objeto", async () => {
    const ruta = nuevaRuta();
    await conEmpresa(A, () => archivos(EVIDENCIAS).upload({ path: ruta, bytes: texto("version A"), contentType: "image/jpeg" }));
    await conEmpresa(B, () => archivos(EVIDENCIAS).upload({ path: ruta, bytes: texto("version B"), contentType: "image/jpeg" }));

    expect(await servido(await conEmpresa(A, () => firmador(EVIDENCIAS).createSignedUrl(ruta, 60)))).toBe("version A");
    expect(await servido(await conEmpresa(B, () => firmador(EVIDENCIAS).createSignedUrl(ruta, 60)))).toBe("version B");
  });

  it("firmar o subir `../<A>/<ruta>` desde B no sale de la carpeta de B: se rechaza antes de llamar a Storage", async () => {
    const ruta = nuevaRuta();
    await conEmpresa(A, () => archivos(EVIDENCIAS).upload({ path: ruta, bytes: texto("de A"), contentType: "image/jpeg" }));
    await expect(conEmpresa(B, () => firmador(EVIDENCIAS).createSignedUrl(`../${A}/${ruta}`, 60))).rejects.toThrow(
      /Ruta de almacen invalida/,
    );
    await expect(
      conEmpresa(B, () => archivos(EVIDENCIAS).upload({ path: `../${A}/${ruta}`, bytes: texto("pisado"), contentType: "image/jpeg" })),
    ).rejects.toThrow(/Ruta de almacen invalida/);
    expect(await bytesEnBucket(EVIDENCIAS, `${A}/${ruta}`)).toBe("de A");
  });

  it("firmar desde B `x/../../<A>/<ruta>` (el .. en medio) se rechaza sin llamar a Storage, y el de A queda intacto", async () => {
    const ruta = nuevaRuta();
    await conEmpresa(A, () => archivos(EVIDENCIAS).upload({ path: ruta, bytes: texto("de A, en medio"), contentType: "image/jpeg" }));

    // El mismo SDK real, con un contador de las operaciones de firma (`from` solo arma el cliente del
    // bucket y no habla con Storage): si la ruta llegara a Storage, subiria.
    let llamadas = 0;
    const espiado = {
      from: (bucket: string) => {
        const api = cliente.storage.from(bucket);
        return {
          createSignedUrl: (clave: string, segundos: number) => {
            llamadas++;
            return api.createSignedUrl(clave, segundos);
          },
        };
      },
    };
    const firmadorEspiado = new SupabaseSignedUrlProvider(espiado as unknown as SignedUrlClientLike, EVIDENCIAS);

    await expect(conEmpresa(B, () => firmadorEspiado.createSignedUrl(`x/../../${A}/${ruta}`, 60))).rejects.toThrow(
      RutaDeAlmacenInvalida,
    );
    expect(llamadas).toBe(0);
    expect(await bytesEnBucket(EVIDENCIAS, `${A}/${ruta}`)).toBe("de A, en medio");
  });
});

describe("R19 — el lote se indexa por las rutas que se pidieron", () => {
  it("las claves son las rutas relativas pedidas; la que falta se omite; cada URL sirve su objeto", async () => {
    const x = nuevaRuta();
    const y = nuevaRuta();
    await conEmpresa(A, async () => {
      await archivos(EVIDENCIAS).upload({ path: x, bytes: texto("x de A"), contentType: "image/jpeg" });
      await archivos(EVIDENCIAS).upload({ path: y, bytes: texto("y de A"), contentType: "image/jpeg" });
    });

    const mapa = await conEmpresa(A, () => firmador(EVIDENCIAS).createSignedUrls([x, "orden-0/no-subida.jpg", y], 60));

    expect(Object.keys(mapa).sort()).toEqual([x, y].sort());
    expect(await servido(mapa[x])).toBe("x de A");
    expect(await servido(mapa[y])).toBe("y de A");
  });
});

describe("R21, R22 — las purgas de A borran solo en la carpeta de A", () => {
  it("purga de PDF de cargas (SupabaseFileStorage.remove en etiquetas): borra el de A, no el de B con la misma ruta", async () => {
    const ruta = `usr-${++n}/lote.pdf`;
    await conEmpresa(A, () => archivos(ETIQUETAS).upload({ path: ruta, bytes: texto("etiquetas A"), contentType: "application/pdf" }));
    await conEmpresa(B, () => archivos(ETIQUETAS).upload({ path: ruta, bytes: texto("etiquetas B"), contentType: "application/pdf" }));

    await conEmpresa(A, () => archivos(ETIQUETAS).remove([ruta]));

    expect(await bytesEnBucket(ETIQUETAS, `${A}/${ruta}`)).toBeNull();
    expect(await bytesEnBucket(ETIQUETAS, `${B}/${ruta}`)).toBe("etiquetas B");
  });

  it("mantenimiento de envios (borrar): borra el PDF de A, no el de B con la misma ruta", async () => {
    const envio = `env-${++n}`;
    const { ruta } = await conEmpresa(A, () => envios().guardar(envio, "eje-1", texto("pdf A")));
    await conEmpresa(B, () => envios().guardar(envio, "eje-1", texto("pdf B")));

    await conEmpresa(A, () => envios().borrar([ruta]));

    expect(await bytesEnBucket(ENVIOS, `${A}/${ruta}`)).toBeNull();
    expect(await bytesEnBucket(ENVIOS, `${B}/${ruta}`)).toBe("pdf B");
  });

  it("purga de descargas en A: borra lo vencido de <A>/tmp y deja <B>/tmp y la raiz", async () => {
    const deA = await conEmpresa(A, () => descargas().guardar(texto("vieja de A")));
    const deB = await conEmpresa(B, () => descargas().guardar(texto("vieja de B")));
    await cliente.storage.from(DESCARGAS).upload("tmp/de-antes.json.gz", texto("sin carpeta"), { contentType: "application/gzip" });

    // Corte en el futuro: todo lo subido esta vencido.
    const r = await conEmpresa(A, () => descargas().purgarAnterioresA(new Date(Date.now() + 3_600_000), 5000));

    expect(r.borrados).toBeGreaterThanOrEqual(1);
    expect(await bytesEnBucket(DESCARGAS, `${A}/${deA.ruta}`)).toBeNull();
    expect(await bytesEnBucket(DESCARGAS, `${B}/${deB.ruta}`)).toBe("vieja de B");
    expect(await bytesEnBucket(DESCARGAS, "tmp/de-antes.json.gz")).toBe("sin carpeta");
  });
});
