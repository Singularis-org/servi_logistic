import { describe, expect, it } from "vitest";

import { comoPlataforma, conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type { FormatoMoneda } from "@/lib/config/moneda";
import { PaisSinImpuesto, PaisSinMoneda, PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import { ReglasPaisEmpresaService } from "@/lib/services/ReglasPaisEmpresaService";
import type { PaisDTO, TipoDocumentoDTO } from "@/lib/types/pais";
import { CR, MONEDA_CR, MONEDA_DE_PRUEBA, reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-42 (T3.2; design §4.2) — `ReglasPaisEmpresaService` con un repositorio doble.
//   · R30: dos marcos de `conEmpresa` seguidos (o a la vez) con el MISMO servicio devuelven cada uno
//     el país de su empresa; dentro de un marco el país se lee una vez, entre marcos nunca se reusa.
//   · R28: sin zona horaria, `zonaHoraria()` lanza `PaisSinZonaHoraria`.
//   · R11: `tipoDocumento` pregunta por el país de la empresa en curso, no por otro.
//   · SL-21 (T3.2): `moneda()` y `nombreImpuesto()` dan los del país de la empresa en curso, sin caché
//     entre empresas (R5); sin moneda lanzan `PaisSinMoneda` (R6) y sin impuesto `PaisSinImpuesto`
//     (R7), sin caer en la de otro país ni en la de la plataforma.

function pais(id: string, o: Partial<PaisDTO> = {}): PaisDTO {
  return {
    id,
    nombre: `País ${id}`,
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
    moneda: null,
    impuestoNombre: null,
    ...o,
  };
}

const XA = pais("XA", { prefijoTelefonico: "99", telefonoDigitosNacionales: 7, zonaHoraria: "Pacific/Auckland" });
const XB = pais("XB", { prefijoTelefonico: "98", telefonoDigitosNacionales: 9, zonaHoraria: "Asia/Tokyo" });
const XC_SIN_ZONA = pais("XC", { prefijoTelefonico: "97", telefonoDigitosNacionales: 8 });

/** SL-21: una segunda moneda de prueba, distinta de `MONEDA_DE_PRUEBA` y de la de CR. */
const MONEDA_XB: FormatoMoneda = { codigo: "XXX", simbolo: "¤", separadorMiles: "'", separadorDecimal: ".", decimales: 1 };
const XA_CON_MONEDA = { ...XA, moneda: MONEDA_DE_PRUEBA, impuestoNombre: "Impuesto XA" };
const XB_CON_MONEDA = { ...XB, moneda: MONEDA_XB, impuestoNombre: "Impuesto XB" };

function repoDoble(paisPorEmpresa: Record<string, PaisDTO | null>) {
  const lecturas: string[] = [];
  const tipos: { paisId: string; idOValue: string }[] = [];
  const repo: Pick<IPaisRepository, "deLaEmpresa" | "tipoDocumentoDelPais"> = {
    deLaEmpresa: (organizacionId) => {
      lecturas.push(organizacionId);
      return Promise.resolve(paisPorEmpresa[organizacionId] ?? null);
    },
    tipoDocumentoDelPais: (paisId, idOValue) => {
      tipos.push({ paisId, idOValue });
      const tipo: TipoDocumentoDTO = {
        id: `tipo-${paisId}`,
        value: `${paisId}_doc`,
        paisId,
        clave: "doc",
        nombre: "Documento",
        caracteres: "digitos",
        largoMin: 8,
        largoMax: 8,
        activo: true,
      };
      return Promise.resolve(idOValue === tipo.id || idOValue === tipo.value ? tipo : null);
    },
  };
  return { repo, lecturas, tipos };
}

/** Sin sesión: fuera de un `conEmpresa` no hay empresa (como un job o un test). */
const sinSesion = () => Promise.resolve(null);

describe("SLT-42 · ReglasPaisEmpresaService", () => {
  describe("R30: sin datos de país entre empresas", () => {
    it("dos contextos seguidos con el mismo servicio devuelven cada uno el país de su empresa", async () => {
      const d = repoDoble({ "org-a": XA, "org-b": XB });
      const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

      const enA = await conEmpresa("org-a", () => servicio.deLaEmpresa());
      const enB = await conEmpresa("org-b", () => servicio.deLaEmpresa());
      const zonaA = await conEmpresa("org-a", () => servicio.zonaHoraria());

      expect(enA).toEqual({ paisId: "XA", zonaHoraria: "Pacific/Auckland", telefono: { prefijo: "99", digitosNacionales: 7 } });
      expect(enB).toEqual({ paisId: "XB", zonaHoraria: "Asia/Tokyo", telefono: { prefijo: "98", digitosNacionales: 9 } });
      expect(zonaA).toBe("Pacific/Auckland");
      // Una lectura por marco: el tercero (otra vez org-a) no reusó la del primero.
      expect(d.lecturas).toEqual(["org-a", "org-b", "org-a"]);
    });

    it("dos contextos a la vez tampoco se mezclan", async () => {
      const d = repoDoble({ "org-a": XA, "org-b": XB });
      const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

      const [a, b] = await Promise.all([
        conEmpresa("org-a", async () => [await servicio.zonaHoraria(), (await servicio.deLaEmpresa()).paisId]),
        conEmpresa("org-b", async () => [await servicio.zonaHoraria(), (await servicio.deLaEmpresa()).paisId]),
      ]);

      expect(a).toEqual(["Pacific/Auckland", "XA"]);
      expect(b).toEqual(["Asia/Tokyo", "XB"]);
    });

    it("dentro de UN marco el país se lee una sola vez", async () => {
      const d = repoDoble({ "org-a": XA });
      const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

      await conEmpresa("org-a", async () => {
        await servicio.deLaEmpresa();
        await servicio.zonaHoraria();
        await servicio.tipoDocumento("XA_doc");
      });

      expect(d.lecturas).toEqual(["org-a"]);
    });

    it("sin marco explícito (empresa de la sesión) no recuerda nada: cada llamada vuelve a la base", async () => {
      const d = repoDoble({ "org-a": XA });
      const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: () => Promise.resolve("org-a") });

      await servicio.deLaEmpresa();
      await servicio.zonaHoraria();

      expect(d.lecturas).toEqual(["org-a", "org-a"]);
    });
  });

  describe("R28: país sin zona horaria", () => {
    it("zonaHoraria() lanza PaisSinZonaHoraria con el país, y deLaEmpresa() lo da con zona null", async () => {
      const d = repoDoble({ "org-c": XC_SIN_ZONA });
      const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

      const error = await conEmpresa("org-c", () => servicio.zonaHoraria()).catch((e: unknown) => e);
      const reglas = await conEmpresa("org-c", () => servicio.deLaEmpresa());

      expect(error).toBeInstanceOf(PaisSinZonaHoraria);
      expect((error as PaisSinZonaHoraria).paisId).toBe("XC");
      expect(reglas.zonaHoraria).toBeNull();
    });

    it("el doble `reglasPaisFijas` cumple el mismo contrato", async () => {
      await expect(reglasPaisFijas({ paisId: "XC", zonaHoraria: null }).zonaHoraria()).rejects.toBeInstanceOf(PaisSinZonaHoraria);
      await expect(reglasPaisFijas(CR).zonaHoraria()).resolves.toBe(CR.zonaHoraria);
    });
  });

  describe("teléfono y documento", () => {
    it("sin prefijo o sin dígitos nacionales, `telefono` es null", async () => {
      const d = repoDoble({
        "sin-prefijo": pais("XD", { telefonoDigitosNacionales: 8, zonaHoraria: "Asia/Tokyo" }),
        "sin-digitos": pais("XE", { prefijoTelefonico: "96", zonaHoraria: "Asia/Tokyo" }),
      });
      const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

      expect((await conEmpresa("sin-prefijo", () => servicio.deLaEmpresa())).telefono).toBeNull();
      expect((await conEmpresa("sin-digitos", () => servicio.deLaEmpresa())).telefono).toBeNull();
    });

    it("R11: tipoDocumento pregunta por el país de la empresa en curso", async () => {
      const d = repoDoble({ "org-a": XA, "org-b": XB });
      const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

      const propio = await conEmpresa("org-a", () => servicio.tipoDocumento("tipo-XA"));
      const ajeno = await conEmpresa("org-b", () => servicio.tipoDocumento("tipo-XA"));

      expect(propio?.paisId).toBe("XA");
      expect(ajeno).toBeNull();
      expect(d.tipos).toEqual([
        { paisId: "XA", idOValue: "tipo-XA" },
        { paisId: "XB", idOValue: "tipo-XA" },
      ]);
    });

    it("el doble `reglasPaisFijas(CR)` encuentra los tipos de CR por id o por value, y no los de otro país", async () => {
      const cr = reglasPaisFijas(CR);
      expect((await cr.tipoDocumento("cedula"))?.clave).toBe("cedula_fisica");
      expect((await cr.tipoDocumento("tipo-cr-pasaporte"))?.caracteres).toBe("alfanumerico");
      expect(await reglasPaisFijas({ paisId: "XA" }).tipoDocumento("cedula")).toBeNull();
    });
  });

  describe("sin empresa", () => {
    it("sin contexto ni sesión, en plataforma o con una empresa que no se ve, lanza EmpresaNoResuelta sin leer el país", async () => {
      const d = repoDoble({});
      const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

      await expect(servicio.deLaEmpresa()).rejects.toBeInstanceOf(EmpresaNoResuelta);
      await expect(comoPlataforma("SL-20", "test", () => servicio.zonaHoraria())).rejects.toBeInstanceOf(EmpresaNoResuelta);
      expect(d.lecturas).toEqual([]);

      await expect(conEmpresa("org-fantasma", () => servicio.deLaEmpresa())).rejects.toBeInstanceOf(EmpresaNoResuelta);
      expect(d.lecturas).toEqual(["org-fantasma"]);
    });
  });
});

describe("SL-21 · moneda() y nombreImpuesto() del puerto", () => {
  it("R5: dos empresas seguidas con el mismo servicio reciben cada una la moneda y el impuesto de su país", async () => {
    const d = repoDoble({ "org-a": XA_CON_MONEDA, "org-b": XB_CON_MONEDA });
    const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

    const enA = await conEmpresa("org-a", async () => [await servicio.moneda(), await servicio.nombreImpuesto()]);
    const enB = await conEmpresa("org-b", async () => [await servicio.moneda(), await servicio.nombreImpuesto()]);
    const otraVezA = await conEmpresa("org-a", () => servicio.moneda());

    expect(enA).toEqual([MONEDA_DE_PRUEBA, "Impuesto XA"]);
    expect(enB).toEqual([MONEDA_XB, "Impuesto XB"]);
    expect(otraVezA).toEqual(MONEDA_DE_PRUEBA);
    // Una lectura por marco y ninguna reusada entre empresas.
    expect(d.lecturas).toEqual(["org-a", "org-b", "org-a"]);
  });

  it("R5: dos empresas a la vez no se mezclan", async () => {
    const d = repoDoble({ "org-a": XA_CON_MONEDA, "org-b": XB_CON_MONEDA });
    const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

    const [a, b] = await Promise.all([
      conEmpresa("org-a", async () => (await servicio.moneda()).codigo),
      conEmpresa("org-b", async () => (await servicio.moneda()).codigo),
    ]);

    expect([a, b]).toEqual(["XTS", "XXX"]);
  });

  it("R5: sin empresa en curso, la lectura falla como el resto del puerto (EmpresaNoResuelta) sin leer el país", async () => {
    const d = repoDoble({});
    const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

    await expect(servicio.moneda()).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(servicio.nombreImpuesto()).rejects.toBeInstanceOf(EmpresaNoResuelta);
    await expect(comoPlataforma("SL-20", "test", () => servicio.moneda())).rejects.toBeInstanceOf(EmpresaNoResuelta);
    expect(d.lecturas).toEqual([]);
  });

  it("R6: un país sin moneda lanza PaisSinMoneda con su código, aunque la empresa anterior sí la tuviera", async () => {
    const d = repoDoble({ "org-a": XA_CON_MONEDA, "org-c": { ...XC_SIN_ZONA, impuestoNombre: "Impuesto XC" } });
    const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

    await conEmpresa("org-a", () => servicio.moneda());
    const error = await conEmpresa("org-c", () => servicio.moneda()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaisSinMoneda);
    expect((error as PaisSinMoneda).paisId).toBe("XC");
    expect((error as Error).message).toBe("El país XC no tiene moneda");
    // El impuesto es independiente: el país lo tiene y se lee.
    await expect(conEmpresa("org-c", () => servicio.nombreImpuesto())).resolves.toBe("Impuesto XC");
  });

  it("R7: un país sin nombre de impuesto lanza PaisSinImpuesto con su código, sin dar uno por defecto", async () => {
    const d = repoDoble({ "org-a": { ...XA, moneda: MONEDA_DE_PRUEBA } });
    const servicio = new ReglasPaisEmpresaService({ repo: d.repo, empresaDeLaSesion: sinSesion });

    const error = await conEmpresa("org-a", () => servicio.nombreImpuesto()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaisSinImpuesto);
    expect((error as PaisSinImpuesto).paisId).toBe("XA");
    expect((error as Error).message).toBe("El país XA no tiene nombre de impuesto");
    await expect(conEmpresa("org-a", () => servicio.moneda())).resolves.toEqual(MONEDA_DE_PRUEBA);
  });

  it("el doble `reglasPaisFijas` cumple el mismo contrato: CR por defecto, y los dos errores con null", async () => {
    await expect(reglasPaisFijas().moneda()).resolves.toEqual(MONEDA_CR);
    await expect(reglasPaisFijas().nombreImpuesto()).resolves.toBe("IVA");
    await expect(reglasPaisFijas({ moneda: MONEDA_DE_PRUEBA }).moneda()).resolves.toBe(MONEDA_DE_PRUEBA);
    await expect(reglasPaisFijas({ paisId: "XA", moneda: null }).moneda()).rejects.toBeInstanceOf(PaisSinMoneda);
    await expect(reglasPaisFijas({ paisId: "XA", impuestoNombre: null }).nombreImpuesto()).rejects.toBeInstanceOf(
      PaisSinImpuesto,
    );
  });
});
