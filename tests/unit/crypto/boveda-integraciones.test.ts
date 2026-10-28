import * as nodeCrypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `timingSafeEqual` envuelto en un espia que conserva el comportamiento real: el caso del resumen
// afirma que la comparacion es UNA y de 32 contra 32 bytes, y eso no se ve desde fuera.
vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  return { ...real, timingSafeEqual: vi.fn(real.timingSafeEqual) };
});

import { ConfiguracionBovedaError } from "@/lib/config/integraciones";
import {
  BovedaIntegraciones,
  CredencialIlegibleError,
  EntradaDeBovedaInvalidaError,
  FuenteAleatoriaCripto,
  ResumenSecretoSha256,
} from "@/lib/crypto/boveda-integraciones";
import type { ContextoSecreto } from "@/lib/interfaces/external/ICifradorSecretos";

// SL-36 T2.2 (design §3; R1, R2, R3, R4, R38) — la boveda, contra la bateria de QC §10 «Cifrador»,
// «Resumen» y «Configuracion», adaptada.
//
// Mutaciones medidas (progress/impl_SL-36.md): armar los datos asociados con `join(":")` pone en
// rojo «los contextos ambiguos con `:` no se cruzan».

const K1 = Buffer.alloc(32, 0x11).toString("base64");
const K2 = Buffer.alloc(32, 0x22).toString("base64");

const CTX: ContextoSecreto = {
  organizacionId: "org-a",
  integracionId: "4d1f1d4e-7d0a-4b4c-9a51-2c3f0e9b8a77",
  campo: "token_acceso",
};

const FORMA = /^v[1-9][0-9]*:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]+={0,2}$/;

function anillo(claves: string, activa: string): void {
  vi.stubEnv("INTEGRACIONES_CLAVES_CIFRADO", claves);
  vi.stubEnv("INTEGRACIONES_CLAVE_ACTIVA", activa);
}

/** El error de una promesa, para afirmar su forma entera (y no solo su clase). */
async function errorDe(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("la promesa no fallo");
}

/** R3: un unico «credencial ilegible», sin causa y sin trozos del valor guardado. */
async function esIlegible(p: Promise<unknown>, guardado: string, diagnostico?: string): Promise<void> {
  const e = (await errorDe(p)) as CredencialIlegibleError;
  expect(e).toBeInstanceOf(CredencialIlegibleError);
  expect(e.message).toBe("credencial ilegible");
  expect(e.codigo).toBe("credencial_ilegible");
  expect((e as Error & { cause?: unknown }).cause).toBeUndefined();
  for (const trozo of guardado.split(":").filter((t) => t.length >= 4)) {
    expect(e.message).not.toContain(trozo);
    expect(String(e.stack)).not.toContain(trozo);
  }
  if (diagnostico) expect(e.diagnostico).toBe(diagnostico);
}

/** Cambia UN caracter de una parte (0 version, 1 iv, 2 tag, 3 cifrado) por otro del alfabeto. */
function alterar(guardado: string, parte: 1 | 2 | 3): string {
  const partes = guardado.split(":");
  const p = partes[parte];
  const c = p[0] === "A" ? "B" : "A";
  partes[parte] = c + p.slice(1);
  return partes.join(":");
}

const boveda = new BovedaIntegraciones();

beforeEach(() => {
  anillo(`v1:${K1}`, "v1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SL-36 R1 — forma v<n>:iv12:tag16 y contexto JSON", () => {
  it("cifra con la version activa en la forma v<n>:<iv 12>:<tag 16>:<cifrado>", async () => {
    const guardado = await boveda.cifrar("EAAG-token-de-prueba", CTX);
    expect(guardado).toMatch(FORMA);
    const [version, iv, tag, cifrado] = guardado.split(":");
    expect(version).toBe("v1");
    expect(Buffer.from(iv, "base64")).toHaveLength(12);
    expect(Buffer.from(tag, "base64")).toHaveLength(16);
    // GCM no rellena: el cifrado mide lo mismo que el texto en UTF-8.
    expect(Buffer.from(cifrado, "base64")).toHaveLength(Buffer.byteLength("EAAG-token-de-prueba"));
    expect(boveda.versionDe(guardado)).toBe("v1");
  });

  it.each([
    ["ASCII", "EAAGm0PX4ZCpsBA"],
    ["no ASCII", "clave-ñandú-🔑-日本"],
    ["1 caracter", "x"],
    ["4096 caracteres", "k".repeat(4096)],
    ["JSON de cuenta de servicio", JSON.stringify({ type: "service_account", private_key: "-----BEGIN-----\n…" })],
  ])("ida y vuelta: %s", async (_caso, texto) => {
    expect(await boveda.descifrar(await boveda.cifrar(texto, CTX), CTX)).toBe(texto);
  });

  it("otro contexto en empresa, integracion o campo falla con «ilegible»", async () => {
    const guardado = await boveda.cifrar("secreto", CTX);
    for (const otro of [
      { ...CTX, organizacionId: "org-b" },
      { ...CTX, integracionId: "0f0e0d0c-0b0a-4908-8706-050403020100" },
      { ...CTX, campo: "app_secret" },
    ]) {
      await esIlegible(boveda.descifrar(guardado, otro), guardado, "no_autentica");
    }
  });

  // El caso que mata `join(":")`: con dos puntos, las dos tuplas dan los mismos bytes.
  it("los contextos ambiguos con `:` no se cruzan", async () => {
    const a: ContextoSecreto = { organizacionId: "org:a", integracionId: "fila", campo: "clave_api" };
    const b: ContextoSecreto = { organizacionId: "org", integracionId: "a:fila", campo: "clave_api" };
    const c: ContextoSecreto = { organizacionId: "org", integracionId: "a", campo: "fila:clave_api" };
    const guardado = await boveda.cifrar("secreto", a);
    expect(await boveda.descifrar(guardado, a)).toBe("secreto");
    await esIlegible(boveda.descifrar(guardado, b), guardado, "no_autentica");
    await esIlegible(boveda.descifrar(guardado, c), guardado, "no_autentica");
  });

  it("la version va en los datos asociados: el mismo cifrado relabelado a otra version no se lee", async () => {
    // Las dos versiones con la MISMA clave: si la version no estuviera en los datos asociados,
    // cambiar `v1:` por `v2:` se descifraria igual.
    anillo(`v1:${K1},v2:${K1}`, "v1");
    const guardado = await boveda.cifrar("secreto", CTX);
    await esIlegible(boveda.descifrar(guardado.replace(/^v1:/, "v2:"), CTX), guardado, "no_autentica");
  });
});

describe("SL-36 R2 — dos cifrados difieren y no contienen el texto ni su base64", () => {
  it("dos cifrados del mismo texto son distintos, y los dos se leen", async () => {
    const texto = "EAAGm0PX4ZCpsBA-mismo-texto";
    const uno = await boveda.cifrar(texto, CTX);
    const otro = await boveda.cifrar(texto, CTX);
    expect(uno).not.toBe(otro);
    expect(uno.split(":")[1]).not.toBe(otro.split(":")[1]);
    expect(await boveda.descifrar(uno, CTX)).toBe(texto);
    expect(await boveda.descifrar(otro, CTX)).toBe(texto);
  });

  it("el valor guardado no contiene el texto, ni su base64, ni su base64url", async () => {
    const texto = "token-en-claro-que-no-debe-verse";
    const guardado = await boveda.cifrar(texto, CTX);
    expect(guardado).not.toContain(texto);
    expect(guardado).not.toContain(Buffer.from(texto).toString("base64").slice(0, 12));
    expect(guardado).not.toContain(Buffer.from(texto).toString("base64url").slice(0, 12));
  });
});

describe("SL-36 R3 — alterado, mal formado, versión ausente u otro contexto dan credencial ilegible sin cause", () => {
  it.each([1, 2, 3] as const)(
    "alterar la parte %i (1 iv, 2 tag, 3 cifrado) da «ilegible»",
    async (parte) => {
      const guardado = await boveda.cifrar("secreto-de-prueba", CTX);
      await esIlegible(boveda.descifrar(alterar(guardado, parte), CTX), guardado);
    },
  );

  it("un tag con el ultimo caracter cambiado solo en los bits de relleno no pasa (base64 canonica)", async () => {
    const guardado = await boveda.cifrar("secreto", CTX);
    const partes = guardado.split(":");
    const tag = partes[2];
    // El caracter 22 codifica 2 bits utiles y 4 de relleno: sumarle 1 en el alfabeto decodifica a
    // los MISMOS bytes. Sin la exigencia de base64 canonica, el valor alterado se daria por bueno.
    const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const i = alfabeto.indexOf(tag[21]);
    const vecino = alfabeto[i + 1];
    expect(Buffer.from(tag.slice(0, 21) + vecino + "==", "base64")).toEqual(Buffer.from(tag, "base64"));
    partes[2] = tag.slice(0, 21) + vecino + "==";
    await esIlegible(boveda.descifrar(partes.join(":"), CTX), guardado, "forma_invalida");
  });

  it.each([
    ["vacio", ""],
    ["texto en claro", "EAAGm0PX4ZCpsBA"],
    ["solo la version", "v1:"],
    ["tres partes", "v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA=="],
    ["version con cero delante", "v01:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:AAAA"],
    ["iv de 11 bytes", "v1:AAAAAAAAAAAAAAA=:AAAAAAAAAAAAAAAAAAAAAA==:AAAA"],
    ["tag de 12 bytes", "v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAA:AAAA"],
    ["base64url", "v1:AAAAAAAAAAAAAA-_:AAAAAAAAAAAAAAAAAAAAAA==:AAAA"],
    ["basura al final", "v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:AAAA!"],
    ["cifrado vacio", "v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:"],
  ])("forma invalida (%s): «ilegible» con diagnostico forma_invalida", async (_caso, guardado) => {
    await esIlegible(boveda.descifrar(guardado, CTX), guardado, "forma_invalida");
    expect(boveda.versionDe(guardado)).toBeNull();
  });

  it("una version que no esta en el anillo da «ilegible» con diagnostico version_ausente", async () => {
    anillo(`v1:${K1},v2:${K2}`, "v2");
    const guardado = await boveda.cifrar("secreto", CTX);
    anillo(`v1:${K1}`, "v1");
    await esIlegible(boveda.descifrar(guardado, CTX), guardado, "version_ausente");
    // Sin descifrar, la version se sigue pudiendo contar (recifrado).
    expect(boveda.versionDe(guardado)).toBe("v2");
  });

  it("texto vacio o contexto incompleto dan invalid_input, no «ilegible»", async () => {
    const vacio = await errorDe(boveda.cifrar("", CTX));
    expect(vacio).toBeInstanceOf(EntradaDeBovedaInvalidaError);
    expect((vacio as EntradaDeBovedaInvalidaError).codigo).toBe("invalid_input");
    for (const ctx of [
      { ...CTX, organizacionId: "" },
      { ...CTX, integracionId: "" },
      { ...CTX, campo: "" },
      { organizacionId: "org-a", integracionId: "fila" } as unknown as ContextoSecreto,
    ]) {
      expect(await errorDe(boveda.cifrar("secreto", ctx))).toBeInstanceOf(EntradaDeBovedaInvalidaError);
      expect(await errorDe(boveda.descifrar("v1:x", ctx))).toBeInstanceOf(EntradaDeBovedaInvalidaError);
    }
  });

  it("no escribe en la consola en ningun camino", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    const guardado = await boveda.cifrar("secreto", CTX);
    await boveda.descifrar(guardado, CTX);
    await errorDe(boveda.descifrar(alterar(guardado, 3), CTX));
    await errorDe(boveda.descifrar("basura", CTX));
    for (const espia of espias) {
      expect(espia).not.toHaveBeenCalled();
      espia.mockRestore();
    }
  });
});

describe("SL-36 R4 — sin configuracion valida, cifrar y descifrar fallan con el error de configuracion", () => {
  it("sin anillo: cifrar y descifrar dan ConfiguracionBovedaError, no «ilegible»", async () => {
    const guardado = await boveda.cifrar("secreto", CTX);
    vi.stubEnv("INTEGRACIONES_CLAVES_CIFRADO", undefined);
    const alCifrar = await errorDe(boveda.cifrar("secreto", CTX));
    const alDescifrar = await errorDe(boveda.descifrar(guardado, CTX));
    expect(alCifrar).toBeInstanceOf(ConfiguracionBovedaError);
    expect(alDescifrar).toBeInstanceOf(ConfiguracionBovedaError);
    expect((alDescifrar as Error).message).toBe("INTEGRACIONES_CLAVES_CIFRADO no esta definida");
  });
});

describe("SL-36 R38 — v1 sigue legible tras activar v2; lo nuevo sale en v2", () => {
  it("rotar la activa entre llamadas se refleja sin recrear la boveda", async () => {
    anillo(`v1:${K1},v2:${K2}`, "v1");
    const deV1 = await boveda.cifrar("secreto-viejo", CTX);
    expect(deV1.startsWith("v1:")).toBe(true);

    vi.stubEnv("INTEGRACIONES_CLAVE_ACTIVA", "v2");
    const deV2 = await boveda.cifrar("secreto-nuevo", CTX);
    expect(deV2.startsWith("v2:")).toBe(true);
    expect(boveda.versionDe(deV2)).toBe("v2");

    expect(await boveda.descifrar(deV1, CTX)).toBe("secreto-viejo");
    expect(await boveda.descifrar(deV2, CTX)).toBe("secreto-nuevo");
  });

  it("cada version cifra con SU clave: un v1 no se lee si su clave cambia en el anillo", async () => {
    anillo(`v1:${K1},v2:${K2}`, "v1");
    const deV1 = await boveda.cifrar("secreto", CTX);
    anillo(`v1:${K2},v2:${K2}`, "v2");
    await esIlegible(boveda.descifrar(deV1, CTX), deV1, "no_autentica");
  });
});

describe("SL-36 — Resumen (QC §10)", () => {
  const resumen = new ResumenSecretoSha256();

  it("vector conocido de `abc` en hex minuscula de 64", () => {
    expect(resumen.resumen("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("coincide con su propio resumen y no con otro secreto", () => {
    const r = resumen.resumen("token-aleatorio");
    expect(resumen.coincide("token-aleatorio", r)).toBe(true);
    expect(resumen.coincide("token-aleatorio-otro", r)).toBe(false);
  });

  it("exactamente una comparacion en tiempo constante, de 32 contra 32 bytes", () => {
    const espia = vi.mocked(nodeCrypto.timingSafeEqual);
    espia.mockClear();
    resumen.coincide("abc", resumen.resumen("abc"));
    expect(espia).toHaveBeenCalledTimes(1);
    const [a, b] = espia.mock.calls[0] as [Buffer, Buffer];
    expect(a).toHaveLength(32);
    expect(b).toHaveLength(32);
  });

  it.each([
    ["vacio", ""],
    ["mayusculas", "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD"],
    ["63 caracteres", "a".repeat(63)],
    ["65 caracteres", "a".repeat(65)],
    ["no hex", "z".repeat(64)],
  ])("un resumen mal formado (%s) da false sin comparar", (_caso, malo) => {
    const espia = vi.mocked(nodeCrypto.timingSafeEqual);
    espia.mockClear();
    expect(resumen.coincide("abc", malo)).toBe(false);
    expect(espia).not.toHaveBeenCalled();
  });
});

describe("SL-36 — Fuente aleatoria", () => {
  const fuente = new FuenteAleatoriaCripto();

  it("nuevoId da UUID distintos", () => {
    const a = fuente.nuevoId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(fuente.nuevoId()).not.toBe(a);
  });

  it("el token de verificacion son 32 bytes en base64url y no se repite", () => {
    const t = fuente.nuevoTokenVerificacion();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
    expect(fuente.nuevoTokenVerificacion()).not.toBe(t);
  });
});
