import { describe, expect, it, vi } from "vitest";

import type { IOrganizacionRepository } from "@/lib/interfaces/repositories/IOrganizacionRepository";
import { OrganizacionService } from "@/lib/services/OrganizacionService";
import type { AltaEmpresaDatos, AltaEmpresaResultado } from "@/lib/types/organizacion";
import type { PaisDTO, TipoDocumentoDTO } from "@/lib/types/pais";
import { CR, paisDelAltaFijo, paisesDelAltaFijos, type PaisDelAltaFijo } from "@/tests/fabricas/reglas-pais";

// SLT-42 (T4.3; design §4.2) — el alta de empresa corre en plataforma, sin empresa de la que sacar
// el país: el país es el ELEGIDO en la entrada. R6 (país incompleto) y R10, R11, R14-R16 del maestro
// con las reglas de ESE país, con el repositorio de organizaciones y el de países como dobles.
// «Sin escribir nada» = el repositorio de organizaciones no recibe la llamada.

const TIPO_PA: TipoDocumentoDTO = {
  id: "tipo-pa",
  value: "PA_cedula",
  paisId: "PA",
  clave: "cedula",
  nombre: "Cédula",
  caracteres: "digitos",
  largoMin: 8,
  largoMax: 8,
  activo: true,
};

/** Un segundo país completo y con reglas de teléfono en libphonenumber (los `X?` de prueba no las tienen). */
const PA = paisDelAltaFijo(
  { id: "PA", nombre: "Panamá", prefijoTelefonico: "507", telefonoDigitosNacionales: 8, zonaHoraria: "America/Panama" },
  [TIPO_PA],
);

function entrada(maestro: Partial<{ telefono: string; documento: string; tipoDocumento: string }> = {}, paisId = "CR") {
  return {
    nombre: "Envíos del Sur",
    slug: "envios-del-sur",
    paisId,
    maestro: {
      nombre: "Lucía Mora",
      email: "lucia@ejemplo.test",
      telefono: "88887777",
      documento: "112223333",
      tipoDocumento: "cedula",
      ...maestro,
    },
  };
}

function montar(paises: readonly PaisDelAltaFijo[] = [paisDelAltaFijo(), PA], repetida: AltaEmpresaResultado | null = null) {
  const altaEmpresa = vi.fn<(datos: AltaEmpresaDatos) => Promise<AltaEmpresaResultado>>(async () => ({
    estado: "creada",
    organizacionId: "org-1",
    maestroId: "u-1",
  }));
  const repeticion = vi.fn(async () => repetida);
  const repo: IOrganizacionRepository = { altaEmpresa, repeticion };
  return { servicio: new OrganizacionService(repo, paisesDelAltaFijos(paises)), altaEmpresa, repeticion };
}

/** Costa Rica con un dato de menos, para R6. */
function crCon(datos: Partial<PaisDTO>, tipos?: readonly TipoDocumentoDTO[]): PaisDelAltaFijo {
  return paisDelAltaFijo(datos, tipos);
}

describe("SLT-42 (punto 7 tras la tanda 2) — la repetición se decide antes que el país, como SL-20 §13", () => {
  it("repetir un alta en un país que quedó incompleto da `ya_existe`, sin validar el país ni escribir", async () => {
    const { servicio, altaEmpresa, repeticion } = montar([crCon({ prefijoTelefonico: null })], {
      estado: "ya_existe",
      organizacionId: "org-1",
    });
    expect(await servicio.altaEmpresa(entrada())).toEqual({ estado: "ya_existe", organizacionId: "org-1" });
    expect(repeticion).toHaveBeenCalledWith(expect.objectContaining({ slug: "envios-del-sur", paisId: "CR" }));
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("repetir un alta cuyo maestro ya no cumple la regla del documento también da `ya_existe`", async () => {
    const { servicio, altaEmpresa } = montar(undefined, { estado: "ya_existe", organizacionId: "org-1" });
    expect(await servicio.altaEmpresa(entrada({ documento: "1" }))).toEqual({ estado: "ya_existe", organizacionId: "org-1" });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("el `conflicto` de una repetición también va antes del país", async () => {
    const { servicio } = montar([crCon({ zonaHoraria: null })], { estado: "conflicto", campo: "slug" });
    expect(await servicio.altaEmpresa(entrada())).toEqual({ estado: "conflicto", campo: "slug" });
  });

  it("la entrada mal formada sigue siendo `invalida` sin consultar la repetición", async () => {
    const { servicio, repeticion } = montar(undefined, { estado: "ya_existe", organizacionId: "org-1" });
    expect((await servicio.altaEmpresa({ ...entrada(), slug: "Mal Slug" })).estado).toBe("invalida");
    expect(repeticion).not.toHaveBeenCalled();
  });
});

describe("SLT-42 R6 — el país elegido tiene que estar completo", () => {
  const incompletos: [string, PaisDelAltaFijo][] = [
    ["sin prefijo telefónico", crCon({ prefijoTelefonico: null })],
    ["sin dígitos nacionales", crCon({ telefonoDigitosNacionales: null })],
    ["sin zona horaria", crCon({ zonaHoraria: null })],
    ["sin ningún tipo de documento", crCon({}, [])],
    ["solo con tipos inactivos", crCon({}, CR.tiposDocumento.map((t) => ({ ...t, activo: false })))],
  ];

  it.each(incompletos)("R6: un país %s rechaza el alta con `invalida` en `paisId`, sin escribir nada", async (_t, cr) => {
    const { servicio, altaEmpresa } = montar([cr]);
    expect(await servicio.altaEmpresa(entrada())).toEqual({ estado: "invalida", campo: "paisId" });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("R6: un país que no existe también es `invalida` en `paisId`, sin escribir nada", async () => {
    const { servicio, altaEmpresa } = montar();
    expect(await servicio.altaEmpresa(entrada({}, "XZ"))).toEqual({ estado: "invalida", campo: "paisId" });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("R6: el país incompleto se rechaza antes de mirar al maestro (el error es del país, no del maestro)", async () => {
    const { servicio } = montar([crCon({ zonaHoraria: null })]);
    expect(await servicio.altaEmpresa(entrada({ telefono: "1", documento: "x" }))).toEqual({ estado: "invalida", campo: "paisId" });
  });

  it("R6: con el país completo, el alta llega al repositorio", async () => {
    const { servicio, altaEmpresa } = montar();
    expect((await servicio.altaEmpresa(entrada())).estado).toBe("creada");
    expect(altaEmpresa).toHaveBeenCalledTimes(1);
  });
});

describe("SLT-42 R10, R11 — el documento del maestro, con los tipos del país elegido", () => {
  it("R10: un documento que no cumple la regla de su tipo es `invalida` en `maestro.documento`, sin escribir nada", async () => {
    const { servicio, altaEmpresa } = montar();
    // Cédula física de CR: 9 dígitos.
    for (const documento of ["11222333", "1122233334", "1-1222-3333", "ABC123456"]) {
      expect(await servicio.altaEmpresa(entrada({ documento }))).toEqual({ estado: "invalida", campo: "maestro.documento" });
    }
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("R10: la regla es la del tipo elegido: el mismo número vale como cédula jurídica (10) y no como física (9)", async () => {
    const { servicio, altaEmpresa } = montar();
    expect(await servicio.altaEmpresa(entrada({ documento: "3101123456" }))).toEqual({ estado: "invalida", campo: "maestro.documento" });
    expect((await servicio.altaEmpresa(entrada({ documento: "3101123456", tipoDocumento: "ruc" }))).estado).toBe("creada");
    expect(altaEmpresa).toHaveBeenCalledTimes(1);
  });

  it("R11: un tipo que no existe es `invalida` en `maestro.tipoDocumento`, sin escribir nada", async () => {
    const { servicio, altaEmpresa } = montar();
    expect(await servicio.altaEmpresa(entrada({ tipoDocumento: "no-existe" }))).toEqual({
      estado: "invalida",
      campo: "maestro.tipoDocumento",
    });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("R11: un tipo inactivo del país es `invalida` en `maestro.tipoDocumento`, sin escribir nada", async () => {
    const tipos = CR.tiposDocumento.map((t) => (t.value === "nite" ? { ...t, activo: false } : t));
    const { servicio, altaEmpresa } = montar([paisDelAltaFijo({}, tipos)]);
    expect(await servicio.altaEmpresa(entrada({ tipoDocumento: "nite", documento: "1234567890" }))).toEqual({
      estado: "invalida",
      campo: "maestro.tipoDocumento",
    });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("R11: un tipo de OTRO país es `invalida` en `maestro.tipoDocumento`, por `value` y por `id`", async () => {
    const { servicio, altaEmpresa } = montar();
    for (const tipoDocumento of [TIPO_PA.value, TIPO_PA.id]) {
      expect(await servicio.altaEmpresa(entrada({ tipoDocumento, documento: "12345678" }))).toEqual({
        estado: "invalida",
        campo: "maestro.tipoDocumento",
      });
    }
    // Y al revés: la cédula de CR no es un tipo de Panamá.
    expect(
      await servicio.altaEmpresa(entrada({ telefono: "61234567", tipoDocumento: "cedula", documento: "112223333" }, "PA")),
    ).toEqual({ estado: "invalida", campo: "maestro.tipoDocumento" });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("R10, R11: el tipo pedido por `id` llega al repositorio como su `value`; el pasaporte, en mayúsculas", async () => {
    const { servicio, altaEmpresa } = montar();
    const pasaporte = CR.tiposDocumento.find((t) => t.value === "pasaporte");
    expect(pasaporte).toBeDefined();
    await servicio.altaEmpresa(entrada({ tipoDocumento: pasaporte?.id, documento: "ab12345c" }));
    expect(altaEmpresa.mock.calls[0][0].maestro).toMatchObject({ tipoDocumento: "pasaporte", documento: "AB12345C" });
  });
});

describe("SLT-42 R14-R16 — el teléfono del maestro, con libphonenumber y la región del país elegido", () => {
  it("R14: un teléfono que no es válido en el país es `invalida` en `maestro.telefono`, sin escribir nada", async () => {
    const { servicio, altaEmpresa } = montar();
    for (const telefono of ["8888777", "888877776", "12345678", "abc"]) {
      expect(await servicio.altaEmpresa(entrada({ telefono }))).toEqual({ estado: "invalida", campo: "maestro.telefono" });
    }
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("R14: un número válido de OTRO país no pasa como del país elegido", async () => {
    const { servicio, altaEmpresa } = montar();
    expect(await servicio.altaEmpresa(entrada({ telefono: "+507 6123 4567" }))).toEqual({
      estado: "invalida",
      campo: "maestro.telefono",
    });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("R14: la región es la del país ELEGIDO: el mismo alta en Panamá valida con las reglas de Panamá", async () => {
    const { servicio, altaEmpresa } = montar();
    const enPA = entrada({ telefono: "6123-4567", documento: "12345678", tipoDocumento: TIPO_PA.value }, "PA");
    expect((await servicio.altaEmpresa(enPA)).estado).toBe("creada");
    expect(altaEmpresa.mock.calls[0][0]).toMatchObject({ paisId: "PA", maestro: { telefono: "61234567", tipoDocumento: "PA_cedula" } });
  });

  it("R15: el teléfono válido llega al repositorio como número nacional en dígitos", async () => {
    const { servicio, altaEmpresa } = montar();
    for (const telefono of ["+506 8888-7777", "(506) 8888 7777", "8888-7777"]) {
      await servicio.altaEmpresa(entrada({ telefono }));
    }
    expect(altaEmpresa.mock.calls.map((c) => c[0].maestro.telefono)).toEqual(["88887777", "88887777", "88887777"]);
  });

  it("R16: si libphonenumber no tiene reglas para el país (completo en el catálogo), es `invalida` en `maestro.telefono`", async () => {
    const XA = paisDelAltaFijo(
      { id: "XA", nombre: "País de prueba XA", prefijoTelefonico: "999", telefonoDigitosNacionales: 7, zonaHoraria: "Europe/Madrid" },
      [{ ...TIPO_PA, id: "tipo-xa", value: "XA_nacional", paisId: "XA", clave: "nacional" }],
    );
    const { servicio, altaEmpresa } = montar([XA]);
    const r = await servicio.altaEmpresa(entrada({ telefono: "1234567", documento: "12345678", tipoDocumento: "XA_nacional" }, "XA"));
    expect(r).toEqual({ estado: "invalida", campo: "maestro.telefono" });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });

  it("R10, R14: con documento y teléfono mal a la vez, el campo señalado es el documento (el contrato da uno solo)", async () => {
    const { servicio, altaEmpresa } = montar();
    expect(await servicio.altaEmpresa(entrada({ documento: "1", telefono: "1" }))).toEqual({
      estado: "invalida",
      campo: "maestro.documento",
    });
    expect(altaEmpresa).not.toHaveBeenCalled();
  });
});
