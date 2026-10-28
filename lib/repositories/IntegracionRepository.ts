import { Prisma, type PrismaClient } from "@prisma/client";
import type { ZodType } from "zod";

import { contextoActual, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { esP2002, textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";
import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";
import {
  CAMPOS_SECRETOS,
  CATALOGO_INTEGRACIONES,
  ESQUEMAS_DATOS_PUBLICOS,
  type ServicioIntegracion,
} from "@/lib/types/integraciones";
import type {
  CambiosIntegracion,
  IIntegracionRepository,
  IntegracionConSecretos,
  IntegracionGuardada,
  NuevaIntegracion,
  ResultadoActualizarIntegracion,
  ResultadoCrearIntegracion,
  ResultadoPruebaGuardado,
} from "@/lib/interfaces/repositories/IIntegracionRepository";

// SL-36 (design §2, §4, §13; R8-R11, R14, R15, R18, R32, R33) — acceso a `integracion`. Solo
// consultas: ni permisos, ni pruebas, ni cifrado (eso es del service).
//
// LA EMPRESA SALE DEL CONTEXTO Y VA EN CADA `where`. La extensión del cliente ya filtra por
// empresa, pero el filtro propio es lo que se prueba contra la base con dos empresas: si un día la
// extensión deja de envolver un camino (un cliente sin extender, un `tx` prestado), esta consulta
// sigue sin ver la fila de otra empresa. Nunca se toma de la fila ni de la entrada (R7).

/** `integracion` y la transacción; dentro de ella, `usuario` (actor congelado) y el historial. */
type IntegracionPrismaClient = Pick<PrismaClient, "integracion" | "$transaction">;

/** Lo que se lee para la vista: nunca el resumen del token de verificación (R5). */
const SELECT_GUARDADA = {
  id: true,
  servicio: true,
  estado: true,
  datosPublicos: true,
  whatsappNumeroId: true,
  ultimoErrorCodigo: true,
  ultimaPruebaAt: true,
  ultimoWebhookAt: true,
} as const satisfies Prisma.IntegracionSelect;

const SELECT_CON_SECRETOS = { ...SELECT_GUARDADA, secretos: true } as const satisfies Prisma.IntegracionSelect;

type FilaGuardada = Prisma.IntegracionGetPayload<{ select: typeof SELECT_GUARDADA }>;
type FilaConSecretos = Prisma.IntegracionGetPayload<{ select: typeof SELECT_CON_SECRETOS }>;

/** Fila guardada que no cumple su forma: corrupción, no un caso de negocio. Sin valores. */
export class IntegracionMalFormadaError extends Error {
  constructor(servicio: string, columna: "datos_publicos" | "secretos") {
    super(`integracion ${servicio}: ${columna} no cumple su esquema`);
    this.name = "IntegracionMalFormadaError";
  }
}

function empresaEnCurso(operacion: string): string {
  const contexto = contextoActual();
  if (contexto?.tipo !== "empresa") throw new EmpresaNoResuelta("Integracion", operacion);
  return contexto.organizacionId;
}

/** El zod del servicio, al escribir y al leer (design §2.1). El error no lleva los valores. */
function datosPublicosValidos(servicio: ServicioIntegracion, datos: unknown): Prisma.InputJsonObject {
  const esquema: ZodType = ESQUEMAS_DATOS_PUBLICOS[servicio];
  const r = esquema.safeParse(datos);
  if (!r.success) throw new IntegracionMalFormadaError(servicio, "datos_publicos");
  return r.data as Prisma.InputJsonObject;
}

/** `{ campo: texto }` con solo los campos secretos del servicio: un campo ajeno no se escribe. */
function secretosValidos(servicio: ServicioIntegracion, secretos: unknown): Record<string, string> {
  const permitidos: readonly string[] = CAMPOS_SECRETOS[servicio];
  if (secretos === null || typeof secretos !== "object" || Array.isArray(secretos)) {
    throw new IntegracionMalFormadaError(servicio, "secretos");
  }
  const salida: Record<string, string> = {};
  for (const [campo, valor] of Object.entries(secretos)) {
    if (!permitidos.includes(campo) || typeof valor !== "string") {
      throw new IntegracionMalFormadaError(servicio, "secretos");
    }
    salida[campo] = valor;
  }
  return salida;
}

/** Campo a campo y sin spread: lo que no se nombra aquí no sale del repositorio. */
function aGuardada(fila: FilaGuardada): IntegracionGuardada {
  return {
    id: fila.id,
    servicio: fila.servicio,
    estado: fila.estado,
    datosPublicos: datosPublicosValidos(fila.servicio, fila.datosPublicos),
    whatsappNumeroId: fila.whatsappNumeroId,
    ultimoErrorCodigo: fila.ultimoErrorCodigo,
    ultimaPruebaAt: fila.ultimaPruebaAt,
    ultimoWebhookAt: fila.ultimoWebhookAt,
  } as IntegracionGuardada;
}

function aConSecretos(fila: FilaConSecretos): IntegracionConSecretos {
  return { ...aGuardada(fila), secretos: secretosValidos(fila.servicio, fila.secretos) } as IntegracionConSecretos;
}

function etiqueta(servicio: ServicioIntegracion): string {
  return etiquetaDeEntidad("integracion", { servicioNombre: CATALOGO_INTEGRACIONES[servicio].nombre });
}

/**
 * Qué único violó un P2002 (R10, R11). El número se mira PRIMERO: un alta de WhatsApp puede chocar
 * con los dos, y el número ocupado es lo que el maestro tiene que saber. Cualquier otro único (el
 * resumen del token, un id repetido) devuelve `null` y el llamador lo propaga.
 */
function duplicadoDe(error: unknown): "numero_ocupado" | "ya_existe" | null {
  if (!esP2002(error)) return null;
  const texto = textoConstraintP2002(error);
  if (texto === null) return null;
  if (texto.includes("whatsapp_numero_id") || texto.includes("whatsappnumeroid")) return "numero_ocupado";
  if (
    texto.includes("integracion_organizacion_id_servicio_key") ||
    texto.includes("organizacion_id,servicio") ||
    texto.includes("organizacionid,servicio")
  ) {
    return "ya_existe";
  }
  return null;
}

/** P2025: la fila del `update`/`delete` no está en la empresa en curso (o ya no existe). */
function esNoEncontrada(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export class IntegracionRepository implements IIntegracionRepository {
  constructor(private readonly prisma: IntegracionPrismaClient) {}

  async listar(): Promise<IntegracionGuardada[]> {
    const organizacionId = empresaEnCurso("findMany");
    const filas = await this.prisma.integracion.findMany({
      where: { organizacionId },
      select: SELECT_GUARDADA,
      orderBy: { servicio: "asc" },
    });
    return filas.map(aGuardada);
  }

  async porId(id: string): Promise<IntegracionConSecretos | null> {
    const organizacionId = empresaEnCurso("findFirst");
    const fila = await this.prisma.integracion.findFirst({
      where: { id, organizacionId },
      select: SELECT_CON_SECRETOS,
    });
    return fila === null ? null : aConSecretos(fila);
  }

  async porServicio(servicio: ServicioIntegracion): Promise<IntegracionConSecretos | null> {
    const organizacionId = empresaEnCurso("findFirst");
    const fila = await this.prisma.integracion.findFirst({
      where: { organizacionId, servicio },
      select: SELECT_CON_SECRETOS,
    });
    return fila === null ? null : aConSecretos(fila);
  }

  async crear(nueva: NuevaIntegracion, actorUsuarioId: string | null): Promise<ResultadoCrearIntegracion> {
    const organizacionId = empresaEnCurso("create");
    const datosPublicos = datosPublicosValidos(nueva.servicio, nueva.datosPublicos);
    const secretos = secretosValidos(nueva.servicio, nueva.secretos);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const fila = await tx.integracion.create({
          data: {
            id: nueva.id,
            organizacionId,
            servicio: nueva.servicio,
            // Solo se escribe tras una prueba buena (R12): nace conectada y con la hora de esa prueba.
            estado: "conectada",
            datosPublicos,
            secretos,
            whatsappNumeroId: nueva.whatsappNumeroId ?? null,
            whatsappResumenVerificacion: nueva.whatsappResumenVerificacion ?? null,
            ultimaPruebaAt: nueva.probadaAt,
          },
          select: SELECT_GUARDADA,
        });
        // R33: ni la credencial, ni su cifrado, ni el número: el servicio y quién lo hizo.
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [
          {
            accion: "integracion_conectada",
            entidadTipo: "integracion",
            entidadId: fila.id,
            entidadEtiqueta: etiqueta(fila.servicio),
            ...actor,
          },
        ]);
        return { status: "creada" as const, integracion: aGuardada(fila) };
      });
    } catch (error) {
      const duplicado = duplicadoDe(error);
      if (duplicado !== null) return { status: duplicado };
      throw error;
    }
  }

  async actualizar(
    id: string,
    cambios: CambiosIntegracion,
    actorUsuarioId: string | null,
  ): Promise<ResultadoActualizarIntegracion> {
    const organizacionId = empresaEnCurso("update");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const previa = await tx.integracion.findFirst({
          where: { id, organizacionId },
          select: { servicio: true, secretos: true },
        });
        if (previa === null) return { status: "no_encontrada" as const };

        const data: Prisma.IntegracionUpdateInput = {};
        if (cambios.datosPublicos !== undefined) {
          data.datosPublicos = datosPublicosValidos(previa.servicio, cambios.datosPublicos);
        }
        if (cambios.secretos !== undefined) {
          // R14: los secretos que no llegan se copian TAL CUAL están cifrados; no se descifran ni se
          // vuelven a cifrar. Se mezcla aquí, dentro de la transacción, sobre lo que hay ahora.
          data.secretos = {
            ...secretosValidos(previa.servicio, previa.secretos),
            ...secretosValidos(previa.servicio, cambios.secretos),
          };
        }
        if (cambios.whatsappNumeroId !== undefined) data.whatsappNumeroId = cambios.whatsappNumeroId;
        if (cambios.probadaAt !== undefined) {
          data.estado = "conectada";
          data.ultimoErrorCodigo = null;
          data.ultimaPruebaAt = cambios.probadaAt;
        }

        const fila = await tx.integracion.update({
          where: { id, organizacionId },
          data,
          select: SELECT_GUARDADA,
        });
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [
          {
            accion: "integracion_actualizada",
            entidadTipo: "integracion",
            entidadId: fila.id,
            entidadEtiqueta: etiqueta(fila.servicio),
            ...actor,
          },
        ]);
        return { status: "guardada" as const, integracion: aGuardada(fila) };
      });
    } catch (error) {
      // Borrada entre la lectura y la escritura: para el maestro es lo mismo que «no existe».
      if (esNoEncontrada(error)) return { status: "no_encontrada" };
      if (duplicadoDe(error) === "numero_ocupado") return { status: "numero_ocupado" };
      throw error;
    }
  }

  async registrarPrueba(
    id: string,
    resultado: ResultadoPruebaGuardado,
    probadaAt: Date,
    actorUsuarioId: string | null,
  ): Promise<boolean> {
    const organizacionId = empresaEnCurso("update");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const fila = await tx.integracion.update({
          where: { id, organizacionId },
          data: {
            estado: resultado.ok ? "conectada" : "error",
            ultimoErrorCodigo: resultado.ok ? null : resultado.codigo,
            ultimaPruebaAt: probadaAt,
          },
          select: { id: true, servicio: true },
        });
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [
          {
            accion: "integracion_probada",
            entidadTipo: "integracion",
            entidadId: fila.id,
            entidadEtiqueta: etiqueta(fila.servicio),
            ...actor,
            // El código del catálogo, nunca el mensaje del proveedor (R33).
            valorNuevo: resultado.ok ? "ok" : resultado.codigo,
          },
        ]);
        return true;
      });
    } catch (error) {
      if (esNoEncontrada(error)) return false;
      throw error;
    }
  }

  async regenerarToken(id: string, resumenVerificacion: string, actorUsuarioId: string | null): Promise<boolean> {
    const organizacionId = empresaEnCurso("update");
    try {
      return await this.prisma.$transaction(async (tx) => {
        // `servicio` en el `where`: pedir el token de una integración que no es de WhatsApp es
        // «no encontrada», no un CHECK que revienta.
        const fila = await tx.integracion.update({
          where: { id, organizacionId, servicio: "whatsapp" },
          data: { whatsappResumenVerificacion: resumenVerificacion },
          select: { id: true, servicio: true },
        });
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [
          {
            accion: "integracion_token_regenerado",
            entidadTipo: "integracion",
            entidadId: fila.id,
            entidadEtiqueta: etiqueta(fila.servicio),
            ...actor,
          },
        ]);
        return true;
      });
    } catch (error) {
      if (esNoEncontrada(error)) return false;
      throw error;
    }
  }

  async borrar(id: string, actorUsuarioId: string | null): Promise<ServicioIntegracion | null> {
    const organizacionId = empresaEnCurso("delete");
    try {
      return await this.prisma.$transaction(async (tx) => {
        // D7: borrado FÍSICO. La credencial cifrada deja de existir y el número queda libre (R32).
        const fila = await tx.integracion.delete({
          where: { id, organizacionId },
          select: { id: true, servicio: true },
        });
        // La fila del historial sobrevive: `entidad_id` es opaco y sin FK (design §2.2).
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [
          {
            accion: "integracion_desconectada",
            entidadTipo: "integracion",
            entidadId: fila.id,
            entidadEtiqueta: etiqueta(fila.servicio),
            ...actor,
          },
        ]);
        return fila.servicio;
      });
    } catch (error) {
      if (esNoEncontrada(error)) return null;
      throw error;
    }
  }

  async marcarError(servicio: ServicioIntegracion, codigo: string): Promise<void> {
    const organizacionId = empresaEnCurso("updateMany");
    await this.prisma.integracion.updateMany({
      where: { organizacionId, servicio },
      data: { estado: "error", ultimoErrorCodigo: codigo },
    });
  }

  async anotarWebhook(id: string, at: Date): Promise<void> {
    const organizacionId = empresaEnCurso("updateMany");
    await this.prisma.integracion.updateMany({
      where: { id, organizacionId },
      data: { ultimoWebhookAt: at },
    });
  }
}
