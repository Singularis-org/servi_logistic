import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/utils/password";
import { UsuarioDuplicadoError } from "@/lib/interfaces/repositories/IUserRepository";
import type { IPostulacionRepository } from "@/lib/interfaces/repositories/IPostulacionRepository";
import type { MensajeroDocumentoInput } from "@/lib/interfaces/repositories/IMensajeroDocumentoRepository";
import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import type {
  IPostulacionMensajeroService,
  PostularMensajeroCommand,
} from "@/lib/interfaces/services/IPostulacionMensajeroService";
import {
  DOCUMENTO_TIPOS,
  type DocumentoTipo,
  type PostularMensajeroResult,
} from "@/lib/types/postulacion-mensajero";
import { MIME_EXTENSION } from "@/lib/config/postulacion";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { validarPersonaDelPais, type ResultadoPersona } from "@/lib/services/validacion-documento-telefono";
import {
  emitirBestEffort,
  notificadorNoOp,
  type PostulacionNotificador,
} from "@/lib/notificaciones/notificadores";

/** Rol al que se asigna toda postulacion (R12). */
const ROL_MENSAJERO = "mensajero";

/** SLT-42: las claves de `fieldErrors` del formulario de postulacion (snake_case, como sus campos). */
const CAMPOS_DE_POSTULACION = { telefono: "telefono", documento: "cedula", tipo: "tipo_identificacion_id" } as const;

/**
 * Logica de negocio de la postulacion de mensajero (feature 21). Orquesta
 * catalogos + unicidad + hash + subida a Storage + escritura atomica, con
 * limpieza de archivos si algo falla (R24). No conoce HTTP ni Prisma.
 */
export class PostulacionMensajeroService implements IPostulacionMensajeroService {
  constructor(
    private readonly repo: IPostulacionRepository,
    private readonly storage: IFileStorage,
    /**
     * Feature 146 (R23/R25): notificador de "postulacion pendiente". El DEFAULT es NO-OP a
     * proposito: el composition root (`lib/actions/postulacion-mensajero.ts`) inyecta el
     * notificador real, y un service construido sin cablear —un doble de test— no puede tocar
     * la base por accidente. BEST-EFFORT: corre tras la escritura atomica y la subida de
     * documentos, y absorbe su propio fallo, porque una postulacion ya creada con sus
     * documentos no puede tirarse por un aviso perdido.
     */
    private readonly notificar: PostulacionNotificador = notificadorNoOp,
    /**
     * SLT-42 (R10, R11, R14-R16): las reglas del pais de la empresa que recibe la postulacion.
     * OPCIONAL EN EL CONSTRUCTOR, OBLIGATORIO EN EL USO, con la misma disciplina que en
     * `UsuarioService`: `postular` LANZA si no esta, en vez de guardar sin validar. Que el
     * composition root lo pasa lo prueba `postulacion-mensajero-service-pais.test.ts`.
     */
    private readonly reglasPais?: IReglasPaisEmpresa,
  ) {}

  async postular(command: PostularMensajeroCommand): Promise<PostularMensajeroResult> {
    // R15: resolver el rol mensajero de los datos sembrados (no se crean catalogos).
    const rolId = await this.repo.findRolIdByValue(ROL_MENSAJERO);
    if (!rolId) return { status: "error" };

    // R9: FKs de catalogo deben existir; error por campo, sin crear cuenta.
    // SLT-42 (R10, R11, R14-R16): el tipo es el del pais de la empresa (por `id` o por `value`),
    // y documento y telefono se miden con su regla; todo antes de subir un solo archivo.
    const persona = await this.validarPersona(command);
    const fieldErrors: Record<string, string[]> = persona.ok ? {} : { ...persona.fieldErrors };
    if (!(await this.repo.vehiculoExiste(command.vehiculoId))) {
      fieldErrors.vehiculo_id = ["vehiculo no valido"];
    }
    if (!persona.ok || Object.keys(fieldErrors).length > 0) {
      return { status: "validation_error", fieldErrors };
    }
    const { telefono, documento: cedula, tipo } = persona;

    // R19/R20: unicidad de aplicacion para dar error de campo limpio. El
    // constraint DB (R21) es la garantia dura ante carreras (ver abajo).
    if (await this.repo.emailExiste(command.email)) {
      return { status: "conflict", field: "email" };
    }
    // SLT-42 (R13): el documento es unico por empresa Y tipo, como el indice `usuario_cedula_key`.
    if (await this.repo.cedulaExiste(cedula, tipo.id)) {
      return { status: "conflict", field: "cedula" };
    }

    // R14: solo se persiste el hash bcrypt, nunca el texto plano.
    const passwordHash = await hashPassword(command.password);

    // R16: id generado antes de subir para que el storage_path y la fila usuario
    // compartan el mismo identificador.
    const usuarioId = randomUUID();
    const subidos: string[] = [];
    const documentos: MensajeroDocumentoInput[] = [];
    let creado = false;

    try {
      for (const tipo of DOCUMENTO_TIPOS) {
        const archivo = command.documentos[tipo as DocumentoTipo];
        const ext = MIME_EXTENSION[archivo.contentType];
        const path = `${usuarioId}/${tipo}.${ext}`;
        const stored = await this.storage.upload({
          path,
          bytes: archivo.bytes,
          contentType: archivo.contentType,
        });
        subidos.push(stored);
        documentos.push({ tipo, storagePath: stored, contentType: archivo.contentType });
      }

      // R12/R13/R16/R24: escritura atomica usuario + documentos.
      await this.repo.crearMensajeroConDocumentos(
        {
          id: usuarioId,
          nombre: command.nombre,
          primerApellido: command.primerApellido,
          segundoApellido: command.segundoApellido ?? null,
          email: command.email,
          telefono, // R15: el numero nacional
          passwordHash,
          cedula,
          tipoIdentificacionId: tipo.id,
          rolId,
          vehiculoId: command.vehiculoId,
          placa: command.placa,
        },
        documentos,
      );

      creado = true;
    } catch (error) {
      // R24: sin cuenta parcial ni archivos huerfanos: limpiar lo subido.
      await this.storage.remove(subidos);
      // R21: la carrera puede materializar el duplicado en el constraint DB.
      if (error instanceof UsuarioDuplicadoError) {
        return { status: "conflict", field: error.campo };
      }
      return { status: "error" };
    }

    // Feature 146/R23/R25: dos filas `warning` sin alcance (maestro + admin). Va FUERA del
    // try/catch de la postulacion a proposito: si estuviera dentro, un notificador que lanza
    // dispararia la limpieza de documentos (R24) y convertiria un alta correcta en un error.
    // El notificador real ya absorbe su propio fallo; esto lo blinda tambien frente a uno
    // inyectado que no lo haga.
    if (creado) {
      await emitirBestEffort("postulacion_mensajero_pendiente", () =>
        this.notificar({
          postulanteId: usuarioId,
          nombre: [command.nombre, command.primerApellido].filter(Boolean).join(" ").trim(),
        }),
      );
    }
    return { status: "ok" };
  }

  /** SLT-42 (R10, R11, R14-R16): el pais de la empresa en curso y la regla de su tipo de documento. */
  private async validarPersona(command: PostularMensajeroCommand): Promise<ResultadoPersona> {
    if (!this.reglasPais) {
      throw new Error(
        "PostulacionMensajeroService.postular requiere las reglas del pais de la empresa: sin ellas " +
          "el telefono y el documento se guardarian sin validar (SLT-42)",
      );
    }
    const { paisId } = await this.reglasPais.deLaEmpresa();
    const tipo = await this.reglasPais.tipoDocumento(command.tipoIdentificacionId);
    return validarPersonaDelPais(
      paisId,
      { telefono: command.telefono, documento: command.cedula, tipo },
      CAMPOS_DE_POSTULACION,
    );
  }
}
