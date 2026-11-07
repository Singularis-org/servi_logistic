import type { Prisma, PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type {
  ActorDeAltaDePais,
  ActualizarDatosPaisRepoResultado,
  CambiarActivoTipoDocumentoRepoResultado,
  CrearPaisRepoResultado,
  CrearTipoDocumentoRepoResultado,
  EditarTipoDocumentoRepoResultado,
  IPaisRepository,
} from "@/lib/interfaces/repositories/IPaisRepository";
import { esP2002, textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";
import { appendAccionPlataforma } from "@/lib/repositories/registrar-accion-plataforma";
import { resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import type {
  DatosDeAltaDePais,
  DatosDeTipoDocumentoNuevo,
  DatosTelefonoYZona,
  PaisDisponibleDTO,
  PaisDTO,
  PaisParaAltaDTO,
  TipoDocumentoDTO,
  TipoDocumentoNuevoInput,
} from "@/lib/types/pais";
import type { ReglaDocumento } from "@/lib/utils/documento";

/**
 * SL-20 (design §2.1, §5; R23, R33) — la tabla `pais`, de plataforma.
 *
 * No abre `comoPlataforma`: el contexto lo pone quien llama (la action del superadmin para leer y
 * crear; el layout, en el contexto de la empresa, para `deLaEmpresa`). Una empresa lee `pais` y no
 * lo escribe (R3): un `crear` fuera de plataforma lo rechaza la base.
 *
 * SLT-42: la única excepción es `zonasConEmpresas`, que abre `comoPlataforma` ella misma (design §6.1).
 *
 * SLT-81: las escrituras de los datos del país y de su catálogo de documentos corren en el
 * `comoPlataforma` de la action, como dueño; `servi_app` no puede escribir ninguna de las dos tablas.
 */
export type PaisPrismaClient = Pick<
  PrismaClient,
  "pais" | "organizacion" | "tipoIdentificacion" | "$transaction" | "$queryRaw"
>;

type Tx = Prisma.TransactionClient;

/** Los campos de `tipo_identificacion` que forman su DTO. */
const SELECT_TIPO = {
  id: true,
  value: true,
  paisId: true,
  clave: true,
  nombre: true,
  caracteres: true,
  largoMin: true,
  largoMax: true,
  activo: true,
} as const;

type FilaTipo = {
  id: string;
  value: string;
  paisId: string;
  clave: string;
  nombre: string;
  caracteres: string;
  largoMin: number;
  largoMax: number;
  activo: boolean;
};

function tipoDTO(fila: FilaTipo): TipoDocumentoDTO {
  return { ...fila, caracteres: caracteresDeDocumento(fila.caracteres) };
}

/** Lo que sale de la base de cada país: el DTO entero, nada más (`created_at` no lo usa nadie). */
const SELECT_PAIS = {
  id: true,
  nombre: true,
  nivel1Singular: true,
  nivel1Plural: true,
  nivel2Singular: true,
  nivel2Plural: true,
  nivel3Singular: true,
  nivel3Plural: true,
  digitosCodigoNivel1: true,
  digitosCodigoNivel2: true,
  digitosCodigoNivel3: true,
  disponible: true,
  // SLT-42 (R1): teléfono y hora del país.
  prefijoTelefonico: true,
  telefonoDigitosNacionales: true,
  zonaHoraria: true,
} as const;

export class PaisRepository implements IPaisRepository {
  constructor(private readonly prisma: PaisPrismaClient) {}

  listar(): Promise<PaisDTO[]> {
    return this.prisma.pais.findMany({ orderBy: [{ nombre: "asc" }], select: SELECT_PAIS });
  }

  /** R9/R45: el filtro va en el SQL, no en la pantalla; un país apagado no sale de la base. */
  listarDisponibles(): Promise<PaisDisponibleDTO[]> {
    return this.prisma.pais.findMany({
      where: { disponible: true },
      orderBy: [{ nombre: "asc" }],
      select: { id: true, nombre: true },
    });
  }

  porId(id: string): Promise<PaisDTO | null> {
    return this.prisma.pais.findUnique({ where: { id }, select: SELECT_PAIS });
  }

  /**
   * El país y su fila `pais_creado` en la MISMA transacción (R33): si el registro falla, el país no
   * queda. Un único violado (otra alta igual que ganó la carrera) es `duplicado`; cualquier otro
   * error sube tal cual, para que la action lo registre y responda `error` (R36).
   */
  async crear(datos: DatosDeAltaDePais, actor: ActorDeAltaDePais): Promise<CrearPaisRepoResultado> {
    const { tiposDocumento, ...delPais } = datos;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const pais = await tx.pais.create({ data: delPais, select: SELECT_PAIS });
        // SLT-81 (R6): los tipos van en la misma transacción; un único violado tumba también el país.
        const tipos = await tx.tipoIdentificacion.createManyAndReturn({
          data: tiposDocumento.map((t, i) => ({ ...datosDeTipo(t), paisId: pais.id, orden: i + 1 })),
          select: SELECT_TIPO,
        });
        const congelado = await resolverActorCongelado(tx, actor.usuarioId);
        await appendAccionPlataforma(tx, [
          {
            accion: "pais_creado",
            entidadTipo: "pais",
            entidadId: pais.id,
            entidadEtiqueta: pais.nombre,
            paisId: pais.id,
            actorUsuarioId: congelado.actorUsuarioId,
            actorNombre: congelado.actorNombre,
          },
          ...tipos.map((t) => ({
            accion: "tipo_documento_creado" as const,
            entidadTipo: "tipo_documento" as const,
            entidadId: t.id,
            entidadEtiqueta: t.nombre,
            paisId: pais.id,
            actorUsuarioId: congelado.actorUsuarioId,
            actorNombre: congelado.actorNombre,
            detalle: detalleDeTipoCreado(t),
          })),
        ]);
        return { estado: "creado", pais };
      });
    } catch (error) {
      const campo = campoDuplicado(error);
      if (campo) return { estado: "duplicado", campo };
      throw error;
    }
  }

  /**
   * R47. El `updateMany` con `disponible <> $2` es el «IS DISTINCT FROM» de §5 (la columna es NOT
   * NULL): decide en una sola sentencia si hubo cambio, así que dos peticiones iguales a la vez dejan
   * una sola fila en el historial. Solo con cero filas se mira si el país existe.
   */
  async cambiarDisponible(
    id: string,
    disponible: boolean,
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "sin_cambio" | "cambiado"> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.pais.updateMany({
        where: { id, disponible: { not: disponible } },
        data: { disponible },
      });
      const pais = await tx.pais.findUnique({ where: { id }, select: { nombre: true } });
      if (pais === null) return "no_existe";
      if (count === 0) return "sin_cambio";

      const congelado = await resolverActorCongelado(tx, actor.usuarioId);
      await appendAccionPlataforma(tx, [
        {
          accion: disponible ? "pais_disponibilidad_activada" : "pais_disponibilidad_desactivada",
          entidadTipo: "pais",
          entidadId: id,
          entidadEtiqueta: pais.nombre,
          paisId: id,
          actorUsuarioId: congelado.actorUsuarioId,
          actorNombre: congelado.actorNombre,
        },
      ]);
      return "cambiado";
    });
  }

  async deLaEmpresa(organizacionId: string): Promise<PaisDTO | null> {
    const fila = await this.prisma.organizacion.findUnique({
      where: { id: organizacionId },
      select: { pais: { select: SELECT_PAIS } },
    });
    return fila?.pais ?? null;
  }

  /**
   * SLT-42 (R11). El país va en el `WHERE`: un `id` o un `value` de otro país no casa. Si el texto
   * casara con el `id` de un tipo y el `value` de otro, gana el `id`.
   */
  async tipoDocumentoDelPais(paisId: string, idOValue: string): Promise<TipoDocumentoDTO | null> {
    // Sin `select`: la fila es corta y el DTO se arma campo a campo abajo. (Un `select` con el
    // literal del flag lo confundiría la guardia de 374, que lo reserva a la geografía.)
    const filas = await this.prisma.tipoIdentificacion.findMany({
      where: { paisId, OR: [{ id: idOValue }, { value: idOValue }] },
    });
    const fila = filas.find((f) => f.id === idOValue) ?? filas[0];
    if (!fila) return null;
    return {
      id: fila.id,
      value: fila.value,
      paisId: fila.paisId,
      clave: fila.clave,
      nombre: fila.nombre,
      caracteres: caracteresDeDocumento(fila.caracteres),
      largoMin: fila.largoMin,
      largoMax: fila.largoMax,
      activo: fila.activo,
    };
  }

  /** SLT-42 (R6). El inactivo no cuenta: no se puede elegir en ningún alta (R11). */
  async tieneTipoDocumentoActivo(paisId: string): Promise<boolean> {
    const fila = await this.prisma.tipoIdentificacion.findFirst({ where: { paisId, activo: true }, select: { id: true } });
    return fila !== null;
  }

  /**
   * SLT-42 (design §6.1, R25): `SELECT DISTINCT p.zona_horaria FROM pais p JOIN organizacion o ON
   * o.pais_id = p.id WHERE p.zona_horaria IS NOT NULL`, escrito con el cliente. En plataforma porque
   * la cola de jobs no tiene empresa y la RLS de `organizacion` solo deja ver la propia.
   */
  zonasConEmpresas(): Promise<string[]> {
    return comoPlataforma("SL-20", "SLT-42: zonas horarias de los países con empresas, para agendar los jobs diarios por zona", async () => {
      const filas = await this.prisma.pais.findMany({
        where: { zonaHoraria: { not: null }, organizaciones: { some: {} } },
        distinct: ["zonaHoraria"],
        orderBy: [{ zonaHoraria: "asc" }],
        select: { zonaHoraria: true },
      });
      return filas.flatMap((f) => (f.zonaHoraria === null ? [] : [f.zonaHoraria]));
    });
  }

  // ── SLT-81: datos del país y su catálogo de documentos ─────────────────────────────────────────

  /**
   * R10, R12, R17. El `updateMany` con «alguno distinto» decide en una sola sentencia si hubo cambio
   * (como `cambiarDisponible`): dos guardados iguales a la vez dejan una sola fila de historial. Las
   * columnas son `NULL`-ables (un país de antes de SLT-81 puede no tenerlas), por eso cada «distinto»
   * incluye el `NULL`.
   */
  async actualizarDatos(
    id: string,
    datos: DatosTelefonoYZona,
    empresas: number,
    actor: ActorDeAltaDePais,
  ): Promise<ActualizarDatosPaisRepoResultado> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.pais.findUnique({ where: { id }, select: SELECT_PAIS });
      if (antes === null) return { estado: "no_existe" };

      const { count } = await tx.pais.updateMany({
        where: {
          id,
          OR: [
            { prefijoTelefonico: null },
            { prefijoTelefonico: { not: datos.prefijoTelefonico } },
            { telefonoDigitosNacionales: null },
            { telefonoDigitosNacionales: { not: datos.telefonoDigitosNacionales } },
            { zonaHoraria: null },
            { zonaHoraria: { not: datos.zonaHoraria } },
          ],
        },
        data: datos,
      });
      if (count === 0) return { estado: "sin_cambio", pais: antes };

      const pais = await tx.pais.findUniqueOrThrow({ where: { id }, select: SELECT_PAIS });
      const congelado = await resolverActorCongelado(tx, actor.usuarioId);
      await appendAccionPlataforma(tx, [
        {
          accion: "pais_datos_cambiados",
          entidadTipo: "pais",
          entidadId: id,
          entidadEtiqueta: pais.nombre,
          paisId: id,
          actorUsuarioId: congelado.actorUsuarioId,
          actorNombre: congelado.actorNombre,
          detalle: {
            antes: { prefijo: antes.prefijoTelefonico, digitos: antes.telefonoDigitosNacionales, zona: antes.zonaHoraria },
            despues: { prefijo: pais.prefijoTelefonico, digitos: pais.telefonoDigitosNacionales, zona: pais.zonaHoraria },
            empresas,
          },
        },
      ]);
      return { estado: "cambiado", pais };
    });
  }

  contarEmpresas(paisId: string): Promise<number> {
    return this.prisma.organizacion.count({ where: { paisId } });
  }

  async listarTiposDocumento(paisId: string): Promise<TipoDocumentoDTO[]> {
    const filas = await this.prisma.tipoIdentificacion.findMany({
      where: { paisId },
      orderBy: [{ orden: "asc" }],
      select: SELECT_TIPO,
    });
    return filas.map(tipoDTO);
  }

  async tipoDocumentoPorId(id: string): Promise<TipoDocumentoDTO | null> {
    const fila = await this.prisma.tipoIdentificacion.findUnique({ where: { id }, select: SELECT_TIPO });
    return fila === null ? null : tipoDTO(fila);
  }

  /**
   * R13, R17. El `orden` se calcula dentro de la transacción; dos altas a la vez pueden repetirlo, y
   * no importa: solo ordena la lista y el `id` desempata. La clave sí la frena el único.
   */
  async crearTipoDocumento(
    paisId: string,
    datos: DatosDeTipoDocumentoNuevo,
    actor: ActorDeAltaDePais,
  ): Promise<CrearTipoDocumentoRepoResultado> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const pais = await tx.pais.findUnique({ where: { id: paisId }, select: { id: true } });
        if (pais === null) return { estado: "no_existe" };
        const { _max } = await tx.tipoIdentificacion.aggregate({ where: { paisId }, _max: { orden: true } });
        const fila = await tx.tipoIdentificacion.create({
          data: { ...datosDeTipo(datos), paisId, orden: (_max.orden ?? 0) + 1 },
          select: SELECT_TIPO,
        });
        await registrarTipo(tx, actor, fila, "tipo_documento_creado", detalleDeTipoCreado(fila));
        return { estado: "creado", tipo: tipoDTO(fila) };
      });
    } catch (error) {
      if (esP2002(error)) return { estado: "duplicado" };
      throw error;
    }
  }

  /** R13, R14, R17. Mismo «alguno distinto» que `actualizarDatos`; las cuatro columnas son NOT NULL. */
  async editarTipoDocumento(
    id: string,
    datos: TipoDocumentoNuevoInput,
    actor: ActorDeAltaDePais,
  ): Promise<EditarTipoDocumentoRepoResultado> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await tx.tipoIdentificacion.findUnique({ where: { id }, select: SELECT_TIPO });
      if (antes === null) return { estado: "no_existe" };

      const { count } = await tx.tipoIdentificacion.updateMany({
        where: {
          id,
          OR: [
            { nombre: { not: datos.nombre } },
            { caracteres: { not: datos.caracteres } },
            { largoMin: { not: datos.largoMin } },
            { largoMax: { not: datos.largoMax } },
          ],
        },
        data: { nombre: datos.nombre, caracteres: datos.caracteres, largoMin: datos.largoMin, largoMax: datos.largoMax },
      });
      if (count === 0) return { estado: "sin_cambio", tipo: tipoDTO(antes) };

      const fila = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { id }, select: SELECT_TIPO });
      await registrarTipo(tx, actor, fila, "tipo_documento_editado", {
        antes: reglaDeTipo(antes),
        despues: reglaDeTipo(fila),
      });
      return { estado: "cambiado", tipo: tipoDTO(fila) };
    });
  }

  /**
   * R15. `SELECT … FOR UPDATE` sobre la fila del PAÍS (no la del tipo): serializa a todas las
   * activaciones de ese país, así que dos desactivaciones de los dos últimos activos no pueden
   * contar «queda otro» a la vez. El tipo se vuelve a leer después del bloqueo.
   */
  async cambiarActivoTipoDocumento(
    id: string,
    activo: boolean,
    actor: ActorDeAltaDePais,
  ): Promise<CambiarActivoTipoDocumentoRepoResultado> {
    return this.prisma.$transaction(async (tx) => {
      const delTipo = await tx.tipoIdentificacion.findUnique({ where: { id }, select: { paisId: true } });
      if (delTipo === null) return { estado: "no_existe" };
      await tx.$queryRaw`SELECT "id" FROM "pais" WHERE "id" = ${delTipo.paisId} FOR UPDATE`;

      const fila = await tx.tipoIdentificacion.findUniqueOrThrow({ where: { id }, select: SELECT_TIPO });
      if (fila.activo === activo) return { estado: "sin_cambio", tipo: tipoDTO(fila) };
      if (!activo) {
        const otros = await tx.tipoIdentificacion.count({
          where: { paisId: fila.paisId, activo: true, id: { not: id } },
        });
        if (otros === 0) return { estado: "ultimo_activo" };
      }

      const nueva = await tx.tipoIdentificacion.update({ where: { id }, data: { activo }, select: SELECT_TIPO });
      await registrarTipo(tx, actor, nueva, activo ? "tipo_documento_activado" : "tipo_documento_desactivado", null);
      return { estado: "cambiado", tipo: tipoDTO(nueva) };
    });
  }

  /** R20. El filtro de activos y el orden van en el SQL: un tipo inactivo no sale de la base. */
  async listarDisponiblesParaAlta(): Promise<PaisParaAltaDTO[]> {
    const filas = await this.prisma.pais.findMany({
      where: { disponible: true },
      orderBy: [{ nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        prefijoTelefonico: true,
        tiposIdentificacion: {
          where: { activo: true },
          orderBy: [{ orden: "asc" }],
          select: { id: true, value: true, nombre: true },
        },
      },
    });
    return filas.map(({ tiposIdentificacion, ...pais }) => ({ ...pais, tiposDocumento: tiposIdentificacion }));
  }

  /**
   * R8. `pg_timezone_names` es una vista del sistema, no una tabla de negocio. Parametrizada: la zona
   * nunca se interpola en el SQL.
   */
  async zonaConocidaPorLaBase(zona: string): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ existe: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = ${zona}) AS existe`;
    return filas[0]?.existe === true;
  }
}

/** Lo que se inserta de un tipo nuevo (sin `paisId` ni `orden`, que pone quien llama). */
function datosDeTipo(t: DatosDeTipoDocumentoNuevo) {
  return {
    value: t.value,
    clave: t.clave,
    nombre: t.nombre,
    caracteres: t.caracteres,
    largoMin: t.largoMin,
    largoMax: t.largoMax,
  };
}

function reglaDeTipo(t: FilaTipo) {
  return { nombre: t.nombre, caracteres: t.caracteres, largoMin: t.largoMin, largoMax: t.largoMax };
}

/** design §2.2: sin PII, solo la identidad y la regla del tipo. */
function detalleDeTipoCreado(t: FilaTipo): Prisma.InputJsonValue {
  return { clave: t.clave, caracteres: t.caracteres, largoMin: t.largoMin, largoMax: t.largoMax };
}

async function registrarTipo(
  tx: Tx,
  actor: ActorDeAltaDePais,
  fila: FilaTipo,
  accion: "tipo_documento_creado" | "tipo_documento_editado" | "tipo_documento_activado" | "tipo_documento_desactivado",
  detalle: Prisma.InputJsonValue | null,
): Promise<void> {
  const congelado = await resolverActorCongelado(tx, actor.usuarioId);
  await appendAccionPlataforma(tx, [
    {
      accion,
      entidadTipo: "tipo_documento",
      entidadId: fila.id,
      entidadEtiqueta: fila.nombre,
      paisId: fila.paisId,
      actorUsuarioId: congelado.actorUsuarioId,
      actorNombre: congelado.actorNombre,
      detalle,
    },
  ]);
}

/**
 * La columna es `TEXT` con el CHECK `tipo_identificacion_caracteres` (`digitos` | `alfanumerico`).
 * Otro valor es una base que no cumple su propia regla: se lanza en vez de validar con una regla inventada.
 */
function caracteresDeDocumento(valor: string): ReglaDocumento["caracteres"] {
  if (valor === "digitos" || valor === "alfanumerico") return valor;
  throw new Error(`tipo_identificacion.caracteres inesperado: ${valor}`);
}

/**
 * El campo de un P2002 del alta.
 *
 * Con adapter, el texto trae el nombre de la restricción: `tipo_identificacion_*` (SLT-81 R6: la
 * clave o el `value` de un tipo) es `tiposDocumento`, `pais_nombre_key` el nombre y `pais_pkey` el
 * código. Se buscan los nombres enteros antes que las columnas porque el mensaje del driver en inglés
 * («duplicate key value violates…») contiene «value».
 *
 * Sin adapter solo llega `target` (las columnas): `clave` o `value` es un tipo, `nombre` el nombre del
 * país y lo demás el código. No se busca «id» en el texto: el mensaje en español dice «unicidad», que
 * lo contiene.
 */
function campoDuplicado(error: unknown): "id" | "nombre" | "tiposDocumento" | null {
  const texto = textoConstraintP2002(error);
  if (!texto) return null;
  if (texto.includes("tipo_identificacion")) return "tiposDocumento";
  if (texto.includes("pais_nombre_key")) return "nombre";
  if (texto.includes("pais_pkey")) return "id";
  if (/\b(clave|value)\b/.test(texto)) return "tiposDocumento";
  return texto.includes("nombre") ? "nombre" : "id";
}
