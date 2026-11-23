import { describe, expect, it, vi } from "vitest";

import { POSTULACION_VALIDADA_POR_PAIS_DESDE } from "@/lib/config/aprobacion-postulaciones";
import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type {
  IAprobacionPostulacionRepository,
  PersonaDePostulacion,
} from "@/lib/interfaces/repositories/IAprobacionPostulacionRepository";
import type { IPostulacionRepository } from "@/lib/interfaces/repositories/IPostulacionRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { PostularMensajeroCommand } from "@/lib/interfaces/services/IPostulacionMensajeroService";
import { AprobacionPostulacionService } from "@/lib/services/AprobacionPostulacionService";
import { PostulacionMensajeroService } from "@/lib/services/PostulacionMensajeroService";
import type { TipoDocumentoDTO } from "@/lib/types/pais";
import { DOCUMENTO_TIPOS } from "@/lib/types/postulacion-mensajero";
import { CR, reglasPaisFijas, type ReglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-42 (T4.2; design §4.2) — la postulación de mensajero valida tipo, documento y teléfono con las
// reglas del país de la empresa que la recibe (R10, R11, R14-R16) y lo vuelve a hacer al aprobarla,
// que es cuando el mensajero queda dado de alta en la empresa. Las reglas son un doble del puerto
// (`reglasPaisFijas`), con Costa Rica por defecto; los repositorios y el Storage, dobles.
// «Sin escribir nada» = ni se sube un archivo ni se llama a la escritura.

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

// ---------------------------------------------------------------------------------------------
// Al recibir: PostulacionMensajeroService
// ---------------------------------------------------------------------------------------------

function repoPostulacion(): IPostulacionRepository {
  return {
    emailExiste: vi.fn().mockResolvedValue(false),
    cedulaExiste: vi.fn().mockResolvedValue(false),
    findRolIdByValue: vi.fn().mockResolvedValue("rol-mensajero"),
    tipoIdentificacionExiste: vi.fn().mockResolvedValue(true),
    vehiculoExiste: vi.fn().mockResolvedValue(true),
    crearMensajeroConDocumentos: vi.fn().mockResolvedValue({ id: "usr-nuevo" }),
  };
}

function storage(): IFileStorage {
  return {
    upload: vi.fn().mockImplementation(async ({ path }: { path: string }) => path),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

function comando(o: Partial<PostularMensajeroCommand> = {}): PostularMensajeroCommand {
  const documentos = Object.fromEntries(
    DOCUMENTO_TIPOS.map((t) => [t, { contentType: "image/jpeg", bytes: new Uint8Array([1]) }]),
  ) as PostularMensajeroCommand["documentos"];
  return {
    nombre: "Ana",
    primerApellido: "Perez",
    email: "ana@example.com",
    telefono: "88887777",
    tipoIdentificacionId: "tipo-cr-cedula",
    cedula: "112223333",
    vehiculoId: "veh-1",
    placa: "ABC123",
    password: "Abcdef1!",
    documentos,
    ...o,
  };
}

function postulacion(pais: Partial<ReglasPaisFijas> = {}) {
  const repo = repoPostulacion();
  const files = storage();
  const service = new PostulacionMensajeroService(repo, files, undefined, reglasPaisFijas(pais));
  /** Lo que llegó a la escritura, o `undefined` si no se escribió. */
  const escrito = () =>
    (repo.crearMensajeroConDocumentos as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      | { telefono: string; cedula: string; tipoIdentificacionId: string }
      | undefined;
  const nadaEscrito = () => {
    expect(files.upload).not.toHaveBeenCalled();
    expect(repo.crearMensajeroConDocumentos).not.toHaveBeenCalled();
  };
  return { repo, service, escrito, nadaEscrito };
}

describe("SLT-42 — PostulacionMensajeroService valida con las reglas del país de la empresa", () => {
  it("R10: un documento que no cumple la regla de su tipo es `validation_error` en `cedula`, sin escribir nada", async () => {
    const { service, nadaEscrito } = postulacion();
    for (const cedula of ["11222333", "1122233334", "1-1222-3333"]) {
      const r = await service.postular(comando({ cedula }));
      expect(r.status).toBe("validation_error");
      if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["cedula"]);
    }
    nadaEscrito();
  });

  it("R10: la regla es la del tipo elegido; el pasaporte se guarda en mayúsculas", async () => {
    const { service, escrito } = postulacion();
    expect(await service.postular(comando({ tipoIdentificacionId: "tipo-cr-pasaporte", cedula: "ab12345c" }))).toEqual({
      status: "ok",
    });
    expect(escrito()).toMatchObject({ cedula: "AB12345C", tipoIdentificacionId: "tipo-cr-pasaporte" });
  });

  it("R11: un tipo que no existe es `validation_error` en `tipo_identificacion_id`, sin escribir nada", async () => {
    const { service, nadaEscrito } = postulacion();
    expect(await service.postular(comando({ tipoIdentificacionId: "no-existe" }))).toEqual({
      status: "validation_error",
      fieldErrors: { tipo_identificacion_id: ["El tipo de documento indicado no existe"] },
    });
    nadaEscrito();
  });

  it("R11: un tipo inactivo del país es `validation_error` en `tipo_identificacion_id` con su propio mensaje", async () => {
    const tipos = CR.tiposDocumento.map((t) => (t.value === "dimex" ? { ...t, activo: false } : t));
    const { service, nadaEscrito } = postulacion({ tiposDocumento: tipos });
    expect(await service.postular(comando({ tipoIdentificacionId: "tipo-cr-dimex", cedula: "123456789012" }))).toEqual({
      status: "validation_error",
      fieldErrors: { tipo_identificacion_id: ["El tipo de documento indicado ya no está activo"] },
    });
    nadaEscrito();
  });

  it("R11: un tipo de OTRO país es `validation_error` en `tipo_identificacion_id`, igual que uno que no existe", async () => {
    const { service, nadaEscrito } = postulacion({ tiposDocumento: [...CR.tiposDocumento, TIPO_PA] });
    for (const tipoIdentificacionId of [TIPO_PA.id, TIPO_PA.value]) {
      expect(await service.postular(comando({ tipoIdentificacionId, cedula: "12345678" }))).toEqual({
        status: "validation_error",
        fieldErrors: { tipo_identificacion_id: ["El tipo de documento indicado no existe"] },
      });
    }
    nadaEscrito();
  });

  it("R11: el tipo puede llegar por su `value`; se guarda su `id`", async () => {
    const { service, escrito } = postulacion();
    expect(await service.postular(comando({ tipoIdentificacionId: "cedula" }))).toEqual({ status: "ok" });
    expect(escrito()?.tipoIdentificacionId).toBe("tipo-cr-cedula");
  });

  it("R14: un teléfono que no es válido en el país es `validation_error` en `telefono`, sin escribir nada", async () => {
    const { service, nadaEscrito } = postulacion();
    for (const telefono of ["8888777", "12345678", "+507 6123 4567"]) {
      expect(await service.postular(comando({ telefono }))).toEqual({
        status: "validation_error",
        fieldErrors: { telefono: ["El teléfono no es válido para el país de la empresa"] },
      });
    }
    nadaEscrito();
  });

  it("R14: la región es la del país de la empresa: en Panamá vale un número panameño", async () => {
    const { service, escrito } = postulacion({
      paisId: "PA",
      zonaHoraria: "America/Panama",
      telefono: { prefijo: "507", digitosNacionales: 8 },
      tiposDocumento: [TIPO_PA],
    });
    expect(await service.postular(comando({ telefono: "6123-4567", tipoIdentificacionId: "PA_cedula", cedula: "12345678" }))).toEqual({
      status: "ok",
    });
    expect(escrito()).toMatchObject({ telefono: "61234567", cedula: "12345678", tipoIdentificacionId: "tipo-pa" });
  });

  it("R15: el teléfono válido se guarda como número nacional en dígitos", async () => {
    const { service, escrito } = postulacion();
    expect(await service.postular(comando({ telefono: "+506 8888-7777" }))).toEqual({ status: "ok" });
    expect(escrito()?.telefono).toBe("88887777");
  });

  it("R16: si libphonenumber no tiene reglas para el país, `validation_error` en `telefono` con un mensaje que lo dice", async () => {
    const { service, nadaEscrito } = postulacion({
      paisId: "XA",
      telefono: { prefijo: "999", digitosNacionales: 7 },
      tiposDocumento: [{ ...TIPO_PA, id: "tipo-xa", value: "XA_nacional", paisId: "XA" }],
    });
    expect(await service.postular(comando({ telefono: "1234567", tipoIdentificacionId: "tipo-xa", cedula: "12345678" }))).toEqual({
      status: "validation_error",
      fieldErrors: { telefono: ["El país de la empresa no tiene reglas de teléfono"] },
    });
    nadaEscrito();
  });

  it("R10, R14: junta en una respuesta los errores de documento, teléfono y vehículo", async () => {
    const { repo, service, nadaEscrito } = postulacion();
    (repo.vehiculoExiste as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const r = await service.postular(comando({ cedula: "1", telefono: "1" }));
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors).sort()).toEqual(["cedula", "telefono", "vehiculo_id"]);
    nadaEscrito();
  });

  it("R13: el duplicado del documento se busca con el documento normalizado y el tipo resuelto", async () => {
    const { repo, service } = postulacion();
    await service.postular(comando({ tipoIdentificacionId: "pasaporte", cedula: "ab12345c" }));
    expect(repo.cedulaExiste).toHaveBeenCalledWith("AB12345C", "tipo-cr-pasaporte");
  });

  it("R10, R14: sin las reglas del país, `postular` lanza en vez de guardar sin validar", async () => {
    const repo = repoPostulacion();
    const files = storage();
    const service = new PostulacionMensajeroService(repo, files);
    await expect(service.postular(comando())).rejects.toThrow(/reglas del pais/);
    expect(files.upload).not.toHaveBeenCalled();
    expect(repo.crearMensajeroConDocumentos).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// Al aprobar: AprobacionPostulacionService
// ---------------------------------------------------------------------------------------------

const MAESTRO: Actor = { usuarioId: "maestro-1", rol: "maestro" };
/** Una postulacion recibida desde SLT-42: se valida al aprobarla. */
const NUEVA = new Date(POSTULACION_VALIDADA_POR_PAIS_DESDE.getTime() + 1);
/** Una postulacion recibida antes de SLT-42 (punto 6 tras la tanda 2): se aprueba sin validar. */
const PREVIA = new Date(POSTULACION_VALIDADA_POR_PAIS_DESDE.getTime() - 1);

function aprobacion(persona: Partial<PersonaDePostulacion> | null = {}, pais: Partial<ReglasPaisFijas> = {}) {
  const repo: IAprobacionPostulacionRepository = {
    listPendientes: vi.fn(),
    findMensajeroById: vi.fn().mockResolvedValue({ id: "usr-1", estado: "pendiente" }),
    personaPendiente: vi.fn().mockResolvedValue(
      persona === null
        ? null
        : { telefono: "88887777", cedula: "112223333", tipoIdentificacionId: "tipo-cr-cedula", createdAt: NUEVA, ...persona },
    ),
    actualizarEstadoSiPendiente: vi.fn().mockResolvedValue(1),
  };
  const urls = { createSignedUrl: vi.fn(), createSignedUrls: vi.fn() } as unknown as ISignedUrlProvider;
  return { repo, service: new AprobacionPostulacionService(repo, urls, undefined, reglasPaisFijas(pais)) };
}

describe("SLT-42 — AprobacionPostulacionService valida al aprobar con las reglas del país de la empresa", () => {
  it("R10, R11, R14: una postulación con datos válidos del país se aprueba", async () => {
    const { repo, service } = aprobacion();
    expect(await service.aprobar("usr-1", MAESTRO)).toEqual({ status: "ok", usuarioId: "usr-1", estado: "activo" });
    expect(repo.actualizarEstadoSiPendiente).toHaveBeenCalledWith("usr-1", "activo", "maestro-1");
  });

  it("R10: un documento guardado que no cumple la regla de su tipo es `validation_error` en `cedula`, sin aprobar", async () => {
    const { repo, service } = aprobacion({ cedula: "1710034065" });
    const r = await service.aprobar("usr-1", MAESTRO);
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["cedula"]);
    expect(repo.actualizarEstadoSiPendiente).not.toHaveBeenCalled();
  });

  it("R11: un tipo inactivo o de otro país es `validation_error` en `tipoIdentificacion`, sin aprobar", async () => {
    const inactivo = CR.tiposDocumento.map((t) => (t.value === "cedula" ? { ...t, activo: false } : t));
    for (const [persona, pais] of [
      [{}, { tiposDocumento: inactivo }],
      [{ tipoIdentificacionId: "tipo-pa", cedula: "12345678" }, { tiposDocumento: [...CR.tiposDocumento, TIPO_PA] }],
    ] as const) {
      const { repo, service } = aprobacion(persona, pais);
      const r = await service.aprobar("usr-1", MAESTRO);
      expect(r.status).toBe("validation_error");
      if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["tipoIdentificacion"]);
      expect(repo.actualizarEstadoSiPendiente).not.toHaveBeenCalled();
    }
  });

  it("R14: un teléfono guardado que no es válido en el país es `validation_error` en `telefono`, sin aprobar", async () => {
    const { repo, service } = aprobacion({ telefono: "0991234567" });
    expect(await service.aprobar("usr-1", MAESTRO)).toEqual({
      status: "validation_error",
      fieldErrors: { telefono: ["El teléfono no es válido para el país de la empresa"] },
    });
    expect(repo.actualizarEstadoSiPendiente).not.toHaveBeenCalled();
  });

  it("R16: sin reglas de teléfono para el país, `validation_error` en `telefono` con un mensaje que lo dice", async () => {
    const { service } = aprobacion(
      { tipoIdentificacionId: "tipo-xa", cedula: "12345678", telefono: "1234567" },
      { paisId: "XA", tiposDocumento: [{ ...TIPO_PA, id: "tipo-xa", value: "XA_nacional", paisId: "XA" }] },
    );
    expect(await service.aprobar("usr-1", MAESTRO)).toEqual({
      status: "validation_error",
      fieldErrors: { telefono: ["El país de la empresa no tiene reglas de teléfono"] },
    });
  });

  it("punto 6 tras la tanda 2: una postulación PREVIA a SLT-42 con documento y teléfono fuera de regla se aprueba igual", async () => {
    const { repo, service } = aprobacion({ cedula: "1710034065", telefono: "0991234567", createdAt: PREVIA });
    expect(await service.aprobar("usr-1", MAESTRO)).toEqual({ status: "ok", usuarioId: "usr-1", estado: "activo" });
    expect(repo.actualizarEstadoSiPendiente).toHaveBeenCalledWith("usr-1", "activo", "maestro-1");
  });

  it("punto 6 tras la tanda 2: una postulación NUEVA con documento y teléfono fuera de regla es `validation_error`", async () => {
    const { repo, service } = aprobacion({ cedula: "1710034065", telefono: "0991234567", createdAt: NUEVA });
    const r = await service.aprobar("usr-1", MAESTRO);
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors).sort()).toEqual(["cedula", "telefono"]);
    expect(repo.actualizarEstadoSiPendiente).not.toHaveBeenCalled();
  });

  it("punto 6 tras la tanda 2: la frontera es exacta, una postulación creada EN el instante de corte ya es nueva", async () => {
    const { service } = aprobacion({ cedula: "1710034065", createdAt: new Date(POSTULACION_VALIDADA_POR_PAIS_DESDE) });
    expect((await service.aprobar("usr-1", MAESTRO)).status).toBe("validation_error");
  });

  it("R10: lo que no es una postulación pendiente no se valida: sigue siendo `not_found` o `conflict`", async () => {
    const { repo, service } = aprobacion(null);
    (repo.actualizarEstadoSiPendiente as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (repo.findMensajeroById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await service.aprobar("usr-x", MAESTRO)).toEqual({ status: "not_found" });
  });

  it("R10: rechazar no valida nada: una postulación con datos fuera de regla se puede rechazar", async () => {
    const { repo, service } = aprobacion({ cedula: "x", telefono: "x" });
    expect(await service.rechazar("usr-1", MAESTRO)).toEqual({ status: "ok", usuarioId: "usr-1", estado: "inactivo" });
    expect(repo.personaPendiente).not.toHaveBeenCalled();
  });

  it("R10, R14: sin las reglas del país, `aprobar` lanza en vez de aprobar sin validar", async () => {
    const { repo } = aprobacion();
    const urls = { createSignedUrl: vi.fn(), createSignedUrls: vi.fn() } as unknown as ISignedUrlProvider;
    await expect(new AprobacionPostulacionService(repo, urls).aprobar("usr-1", MAESTRO)).rejects.toThrow(/reglas del pais/);
    expect(repo.actualizarEstadoSiPendiente).not.toHaveBeenCalled();
  });
});
