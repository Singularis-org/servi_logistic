import { describe, expect, it } from "vitest";

import { comoPlataforma, conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import { ReglasPaisEmpresaService } from "@/lib/services/ReglasPaisEmpresaService";
import type { PaisDTO, TipoDocumentoDTO } from "@/lib/types/pais";
import { CR, reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-42 (T3.2; design §4.2) — `ReglasPaisEmpresaService` con un repositorio doble.
//   · R30: dos marcos de `conEmpresa` seguidos (o a la vez) con el MISMO servicio devuelven cada uno
//     el país de su empresa; dentro de un marco el país se lee una vez, entre marcos nunca se reusa.
//   · R28: sin zona horaria, `zonaHoraria()` lanza `PaisSinZonaHoraria`.
//   · R11: `tipoDocumento` pregunta por el país de la empresa en curso, no por otro.

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
    ...o,
  };
}

const XA = pais("XA", { prefijoTelefonico: "99", telefonoDigitosNacionales: 7, zonaHoraria: "Pacific/Auckland" });
const XB = pais("XB", { prefijoTelefonico: "98", telefonoDigitosNacionales: 9, zonaHoraria: "Asia/Tokyo" });
const XC_SIN_ZONA = pais("XC", { prefijoTelefonico: "97", telefonoDigitosNacionales: 8 });

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
