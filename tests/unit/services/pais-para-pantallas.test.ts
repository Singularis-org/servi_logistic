import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { MONEDA_PLATAFORMA } from "@/lib/config/moneda";
import { IMPUESTO_ROTULO } from "@/lib/constants/impuesto-rotulo";
import {
  MEMO_PAIS_BARRIDO,
  MEMO_PAIS_MS,
  MemoPaisEmpresa,
  PARA_PANTALLAS_DE_PLATAFORMA,
  paisParaPantallasDelActor,
  paraPantallasDe,
} from "@/lib/services/pais-para-pantallas";
import { ETIQUETAS_NEUTRAS, etiquetasDePais, type PaisDTO } from "@/lib/types/pais";
import { MONEDA_DE_PRUEBA } from "@/tests/fabricas/reglas-pais";

// SLT-235 (T1.2; design §4) — el memo del país por proceso y los datos del país para pantallas.
//   · R2: sin empresa, lo de la plataforma sin llamar al servicio.
//   · R3, R4, R10: sin moneda o sin impuesto, lo de la plataforma y UN aviso por lectura de la base.
//   · R5: si la lectura falla, lo neutro y de la plataforma, y el error en el log.
//   · R7: a los 9:59 min responde el memo; a los 10:00 vuelve a leer.
//   · R8: cada empresa su país; un fallo o un `null` no se memorizan.
//   · R9: con 1 000 entradas o más, se barren las caducadas antes de escribir.
// Reloj falso: el memo recibe `ahora` y el test lo mueve a mano.

/** Un país de prueba completo: moneda distinta en todo de la de la plataforma y otro impuesto. */
function paisXa(o: Partial<PaisDTO> = {}): PaisDTO {
  return {
    id: "XA",
    nombre: "País de prueba XA",
    nivel1Singular: "Región",
    nivel1Plural: "Regiones",
    nivel2Singular: "Comuna",
    nivel2Plural: "Comunas",
    nivel3Singular: "Barrio",
    nivel3Plural: "Barrios",
    digitosCodigoNivel1: null,
    digitosCodigoNivel2: null,
    digitosCodigoNivel3: null,
    disponible: true,
    prefijoTelefonico: null,
    telefonoDigitosNacionales: null,
    zonaHoraria: null,
    moneda: MONEDA_DE_PRUEBA,
    impuestoNombre: "IGV",
    ...o,
  };
}

function reloj(t = 1_000_000) {
  const r = { t, ahora: () => r.t };
  return r;
}

let aviso: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;

beforeEach(() => {
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("R7 — el memo responde sin leer durante 10 minutos", () => {
  it("a los 9:59 min responde desde el memo; a los 10:00 vuelve a leer la base", async () => {
    const r = reloj();
    const memo = new MemoPaisEmpresa(r.ahora);
    const leer = vi.fn(async () => paisXa());

    expect(await memo.leer("org-a", leer)).toEqual({ pais: paisXa(), recienLeido: true });
    r.t += MEMO_PAIS_MS - 1_000;
    expect(await memo.leer("org-a", leer)).toEqual({ pais: paisXa(), recienLeido: false });
    expect(leer).toHaveBeenCalledTimes(1);

    r.t += 1_000;
    expect(await memo.leer("org-a", leer)).toEqual({ pais: paisXa(), recienLeido: true });
    expect(leer).toHaveBeenCalledTimes(2);
  });

  it("la caducidad es de 10 minutos", () => {
    expect(MEMO_PAIS_MS).toBe(10 * 60 * 1_000);
  });
});

describe("R8 — ni el país de otra empresa, ni un fallo, ni un null", () => {
  it("dos empresas son dos lecturas, y cada una recibe el suyo", async () => {
    const memo = new MemoPaisEmpresa(reloj().ahora);
    const deA = paisXa({ id: "XA" });
    const deB = paisXa({ id: "XB", impuestoNombre: "Impuesto XB" });

    expect((await memo.leer("org-a", async () => deA)).pais).toEqual(deA);
    expect((await memo.leer("org-b", async () => deB)).pais).toEqual(deB);
    const leerOtra = vi.fn(async () => deB);
    expect((await memo.leer("org-a", leerOtra)).pais).toEqual(deA);
    expect(leerOtra).not.toHaveBeenCalled();
  });

  it("una lectura que lanza sube el error y no se memoriza: la siguiente vuelve a leer", async () => {
    const memo = new MemoPaisEmpresa(reloj().ahora);
    await expect(memo.leer("org-a", async () => Promise.reject(new Error("la base se cayó")))).rejects.toThrow(
      "la base se cayó",
    );
    const leer = vi.fn(async () => paisXa());
    expect(await memo.leer("org-a", leer)).toEqual({ pais: paisXa(), recienLeido: true });
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it("una empresa sin país lanza con su id y no se memoriza", async () => {
    const memo = new MemoPaisEmpresa(reloj().ahora);
    await expect(memo.leer("org-sin-pais", async () => null)).rejects.toThrow("org-sin-pais");
    expect(memo.tamano).toBe(0);
    const leer = vi.fn(async () => paisXa());
    await memo.leer("org-sin-pais", leer);
    expect(leer).toHaveBeenCalledTimes(1);
  });
});

describe("R9 — barrido a 1 000 entradas", () => {
  it("con 1 000 entradas caducadas, escribir una más deja solo la nueva", async () => {
    const r = reloj();
    const memo = new MemoPaisEmpresa(r.ahora);
    for (let i = 0; i < MEMO_PAIS_BARRIDO; i++) await memo.leer(`org-${i}`, async () => paisXa());
    expect(memo.tamano).toBe(MEMO_PAIS_BARRIDO);

    r.t += MEMO_PAIS_MS;
    await memo.leer("org-nueva", async () => paisXa());
    expect(memo.tamano).toBe(1);
  });

  it("por debajo de 1 000 no barre: las caducadas siguen hasta que se piden", async () => {
    const r = reloj();
    const memo = new MemoPaisEmpresa(r.ahora);
    for (let i = 0; i < MEMO_PAIS_BARRIDO - 1; i++) await memo.leer(`org-${i}`, async () => paisXa());

    r.t += MEMO_PAIS_MS;
    await memo.leer("org-nueva", async () => paisXa());
    expect(memo.tamano).toBe(MEMO_PAIS_BARRIDO);
  });

  it("el barrido solo quita las caducadas: las vigentes se quedan", async () => {
    const r = reloj();
    const memo = new MemoPaisEmpresa(r.ahora);
    for (let i = 0; i < MEMO_PAIS_BARRIDO - 1; i++) await memo.leer(`org-${i}`, async () => paisXa());
    r.t += MEMO_PAIS_MS / 2;
    await memo.leer("org-vigente", async () => paisXa());
    r.t += MEMO_PAIS_MS / 2;
    await memo.leer("org-nueva", async () => paisXa());
    expect(memo.tamano).toBe(2);
  });
});

describe("R3, R4, R10 — país sin moneda o sin impuesto", () => {
  it("con todo, da sus etiquetas, su moneda y su impuesto, sin avisos", () => {
    expect(paraPantallasDe(paisXa(), true, "org-a")).toEqual({
      etiquetas: etiquetasDePais(paisXa()),
      moneda: MONEDA_DE_PRUEBA,
      impuestoNombre: "IGV",
    });
    expect(aviso).not.toHaveBeenCalled();
  });

  it("R3: sin moneda, la de la plataforma y un aviso que nombra la empresa y el país", () => {
    const r = paraPantallasDe(paisXa({ moneda: null }), true, "org-a");
    expect(r.moneda).toEqual(MONEDA_PLATAFORMA);
    expect(r.impuestoNombre).toBe("IGV");
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0]?.[0])).toMatch(/org-a.*XA.*moneda/);
  });

  it("R4: sin impuesto, el rótulo de la plataforma y un aviso que nombra la empresa y el país", () => {
    const r = paraPantallasDe(paisXa({ impuestoNombre: null }), true, "org-a");
    expect(r.impuestoNombre).toBe(IMPUESTO_ROTULO);
    expect(r.moneda).toEqual(MONEDA_DE_PRUEBA);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0]?.[0])).toMatch(/org-a.*XA.*impuesto/);
  });

  it("R10: desde el memo (no recién leído) cae igual pero no avisa", () => {
    const r = paraPantallasDe(paisXa({ moneda: null, impuestoNombre: null }), false, "org-a");
    expect(r).toMatchObject({ moneda: MONEDA_PLATAFORMA, impuestoNombre: IMPUESTO_ROTULO });
    expect(aviso).not.toHaveBeenCalled();
  });

  it("R10: con el memo, el aviso sale una vez por lectura de la base, no en cada página", async () => {
    const r = reloj();
    const memo = new MemoPaisEmpresa(r.ahora);
    const sinMoneda = paisXa({ moneda: null });
    const pagina = async () => {
      const { pais, recienLeido } = await memo.leer("org-a", async () => sinMoneda);
      return paraPantallasDe(pais, recienLeido, "org-a");
    };

    await pagina();
    await pagina();
    await pagina();
    expect(aviso).toHaveBeenCalledTimes(1);

    r.t += MEMO_PAIS_MS;
    await pagina();
    expect(aviso).toHaveBeenCalledTimes(2);
  });
});

describe("R2, R5 — paisParaPantallasDelActor", () => {
  it("R2: sin empresa da lo de la plataforma y no llama al servicio", async () => {
    const paraPantallas = vi.fn();
    expect(await paisParaPantallasDelActor(null, { paraPantallas })).toEqual({
      etiquetas: ETIQUETAS_NEUTRAS,
      moneda: MONEDA_PLATAFORMA,
      impuestoNombre: IMPUESTO_ROTULO,
    });
    expect(paraPantallas).not.toHaveBeenCalled();
    expect(PARA_PANTALLAS_DE_PLATAFORMA).toEqual({
      etiquetas: ETIQUETAS_NEUTRAS,
      moneda: MONEDA_PLATAFORMA,
      impuestoNombre: IMPUESTO_ROTULO,
    });
  });

  it("con empresa devuelve lo que da el servicio para ESA empresa", async () => {
    const datos = paraPantallasDe(paisXa(), false, "org-a");
    const paraPantallas = vi.fn(async () => datos);
    expect(await paisParaPantallasDelActor("org-a", { paraPantallas })).toEqual(datos);
    expect(paraPantallas).toHaveBeenCalledWith("org-a");
  });

  it("R5: si la lectura falla, lo neutro y de la plataforma, sin lanzar, y el error en el log con la empresa", async () => {
    const fallo = new Error("la base se cayó");
    const paraPantallas = vi.fn(async () => Promise.reject(fallo));
    expect(await paisParaPantallasDelActor("org-a", { paraPantallas })).toEqual(PARA_PANTALLAS_DE_PLATAFORMA);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("org-a");
    expect(error.mock.calls[0]?.[1]).toBe(fallo);
  });

  it("R5: si no encuentra país (el memo lanza), también cae sin lanzar", async () => {
    const memo = new MemoPaisEmpresa(reloj().ahora);
    const servicio = {
      paraPantallas: async (org: string) => {
        const { pais, recienLeido } = await memo.leer(org, async () => null);
        return paraPantallasDe(pais, recienLeido, org);
      },
    };
    expect(await paisParaPantallasDelActor("org-sin-pais", servicio)).toEqual(PARA_PANTALLAS_DE_PLATAFORMA);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
