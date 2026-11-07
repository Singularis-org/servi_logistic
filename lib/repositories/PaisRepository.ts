import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  ActorDeAltaDePais,
  CrearPaisConTiposRepoResultado,
  CrearPaisRepoResultado,
  IPaisRepository,
} from "@/lib/interfaces/repositories/IPaisRepository";
import { textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";
import {
  appendAccionPlataforma,
  type EntradaAccionPlataforma,
} from "@/lib/repositories/registrar-accion-plataforma";
import { resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import type { TipoNivelDTO } from "@/lib/types/geografia-nodo";
import {
  PAIS_NIVELES_MAX,
  type DatosDeAltaDePais,
  type DatosDeAltaDePaisConTipos,
  type PaisDisponibleDTO,
  type PaisDTO,
} from "@/lib/types/pais";

/**
 * SL-20 (design §2.1, §5; R23, R33) — la tabla `pais`, de plataforma.
 *
 * No abre `comoPlataforma`: el contexto lo pone quien llama (la action del superadmin para leer y
 * crear; el layout, en el contexto de la empresa, para `deLaEmpresa`). Una empresa lee `pais` y no
 * lo escribe (R3): un `crear` fuera de plataforma lo rechaza la base.
 *
 * SLT-46 (design §2.4, §4.4; R43) — ESCRITOR ÚNICO de `tipo_nivel_geografico` (lo vigila
 * `nodo-geografico-escritor-unico.guardia.test.ts`). Los tipos 1–3 los crea y los mantiene el
 * trigger `pais_tipos_de_nivel` desde `pais.nivel_N_*`; por eso cada escritura de esos nombres va
 * también a `pais`, en la misma transacción. No hay trigger en `tipo_nivel_geografico`: copiar a
 * `pais` desde aquí no hace bucle. Nada aquí borra un tipo (R50) ni escribe `nodo_geografico`.
 */
export type PaisPrismaClient = Pick<
  PrismaClient,
  "pais" | "organizacion" | "tipoNivelGeografico" | "historialPlataforma" | "usuario" | "$transaction"
>;

/** Un tipo tal como sale de la base, con lo que necesita su DTO. */
const SELECT_TIPO = {
  id: true,
  clave: true,
  nombreSingular: true,
  nombrePlural: true,
  digitosCodigo: true,
  codigoHeredaPrefijo: true,
} as const;

/** El nivel más profundo que tiene copia en `pais.nivel_N_*` (las columnas de SL-20). */
const NIVELES_EN_PAIS = 3;

/**
 * Lo que `pais` guarda de un nivel 3 inexistente (design §2.4, P2): texto vacío. Cumple el
 * `NOT NULL` y es la marca con la que `pais_tipos_de_nivel` no crea `nivel_3`. Solo lo pone este
 * repositorio; ningún schema lo acepta como nombre.
 */
const SIN_NIVEL = "";

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
    try {
      return await this.prisma.$transaction(async (tx) => {
        const pais = await tx.pais.create({ data: datos, select: SELECT_PAIS });
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
   * SLT-46 (design §2.4; R23, R37, R46). En una transacción:
   *   1. `pais.create` con los tipos 1–3 en `nivel_{1,2,3}_*` (con P = 2, `''` en los de nivel 3) →
   *      el trigger crea `nivel_1..min(P,3)` con la regla de código de `pais` (un país nuevo, sin
   *      dígitos);
   *   2. `createMany` de `nivel_4..nivel_P`, sin regla de código;
   *   3. `pais_creado` y una `tipo_nivel_geografico_creado` por tipo (`origen: "alta_de_pais"`).
   * Mismo tratamiento de los únicos que `crear`: en un país nuevo solo puede chocar `pais`.
   */
  async crearConTipos(
    datos: DatosDeAltaDePaisConTipos,
    actor: ActorDeAltaDePais,
  ): Promise<CrearPaisConTiposRepoResultado> {
    const { id, nombre, tipos } = datos;
    // El service ya lo validó (2–10); con otra cantidad el país quedaría sin su catálogo entero.
    if (tipos.length < 2 || tipos.length > PAIS_NIVELES_MAX) {
      throw new Error(`alta de país: ${tipos.length} tipos de nivel, fuera de 2–${PAIS_NIVELES_MAX}`);
    }
    const [n1, n2] = tipos;
    const n3 = tipos.length > 2 ? tipos[2] : { singular: SIN_NIVEL, plural: SIN_NIVEL };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const pais = await tx.pais.create({
          data: {
            id,
            nombre,
            nivel1Singular: n1.singular,
            nivel1Plural: n1.plural,
            nivel2Singular: n2.singular,
            nivel2Plural: n2.plural,
            nivel3Singular: n3.singular,
            nivel3Plural: n3.plural,
          },
          select: SELECT_PAIS,
        });
        const debajoDelTres = tipos.slice(NIVELES_EN_PAIS);
        if (debajoDelTres.length > 0) {
          await tx.tipoNivelGeografico.createMany({
            data: debajoDelTres.map((t, i) => ({
              paisId: id,
              clave: claveDeProfundidad(NIVELES_EN_PAIS + 1 + i),
              nombreSingular: t.singular,
              nombrePlural: t.plural,
              digitosCodigo: null,
              codigoHeredaPrefijo: false,
            })),
          });
        }
        const creados = (
          await tx.tipoNivelGeografico.findMany({ where: { paisId: id }, select: SELECT_TIPO })
        )
          .map(tipoDTO)
          .sort((a, b) => a.profundidad - b.profundidad);

        const congelado = await resolverActorCongelado(tx, actor.usuarioId);
        const quien = { actorUsuarioId: congelado.actorUsuarioId, actorNombre: congelado.actorNombre };
        await appendAccionPlataforma(tx, [
          {
            accion: "pais_creado",
            entidadTipo: "pais",
            entidadId: pais.id,
            entidadEtiqueta: pais.nombre,
            paisId: pais.id,
            ...quien,
          },
          ...creados.map((t) => tipoCreado(t, id, "alta_de_pais", quien)),
        ]);
        return { estado: "creado" as const, pais, tipos: creados };
      });
    } catch (error) {
      const campo = campoDuplicado(error);
      if (campo) return { estado: "duplicado", campo };
      throw error;
    }
  }

  /**
   * SLT-46 (design §2.4; R25, R26, R37). Lee el tipo; con los mismos dos nombres no escribe nada.
   * Si su clave es `nivel_1..3`, `pais.update` de las dos columnas de ese nivel: el trigger rehace el
   * upsert de los tipos 1–3 con los mismos valores (y, en un país de 2, sigue sin crear `nivel_3`,
   * R46). Una fila de historial por nombre que cambió, con `detalle.campo`.
   */
  async renombrarTipo(
    tipoId: string,
    nombreSingular: string,
    nombrePlural: string,
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "sin_cambio" | "renombrado"> {
    return this.prisma.$transaction(async (tx) => {
      const tipo = await tx.tipoNivelGeografico.findUnique({
        where: { id: tipoId },
        select: { paisId: true, clave: true, nombreSingular: true, nombrePlural: true },
      });
      if (tipo === null) return "no_existe";

      const cambios = [
        { campo: "singular", anterior: tipo.nombreSingular, nuevo: nombreSingular },
        { campo: "plural", anterior: tipo.nombrePlural, nuevo: nombrePlural },
      ].filter((c) => c.anterior !== c.nuevo);
      if (cambios.length === 0) return "sin_cambio";

      await tx.tipoNivelGeografico.update({ where: { id: tipoId }, data: { nombreSingular, nombrePlural } });
      const profundidad = profundidadDeClave(tipo.clave);
      if (profundidad <= NIVELES_EN_PAIS) {
        await tx.pais.update({
          where: { id: tipo.paisId },
          data: nombresDeNivelEnPais(profundidad, nombreSingular, nombrePlural),
        });
      }

      const congelado = await resolverActorCongelado(tx, actor.usuarioId);
      await appendAccionPlataforma(
        tx,
        cambios.map((c) => ({
          accion: "tipo_nivel_geografico_renombrado",
          entidadTipo: "tipo_nivel_geografico",
          entidadId: tipoId,
          entidadEtiqueta: nombreSingular,
          paisId: tipo.paisId,
          actorUsuarioId: congelado.actorUsuarioId,
          actorNombre: congelado.actorNombre,
          valorAnterior: c.anterior,
          valorNuevo: c.nuevo,
          detalle: { campo: c.campo },
        })),
      );
      return "renombrado";
    });
  }

  /**
   * SLT-46 (design §2.4, P3; R37, R48, R49, R50). Cuenta los tipos del país (P) y crea `nivel_<P+1>`
   * con `create` EXPLÍCITO, también cuando P+1 = 3: así dos altas en paralelo chocan en el único
   * `(pais_id, clave)` (`P2002`, que sube tal cual) en vez de pisarse con el upsert del trigger. Si
   * P+1 = 3, copia los nombres a `pais.nivel_3_*`; el trigger encuentra los tres tipos con esos
   * mismos valores. No toca nodos ni otros tipos.
   */
  async agregarNivel(
    paisId: string,
    nombreSingular: string,
    nombrePlural: string,
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "tope" | TipoNivelDTO> {
    return this.prisma.$transaction(async (tx) => {
      const pais = await tx.pais.findUnique({ where: { id: paisId }, select: { id: true } });
      if (pais === null) return "no_existe";
      const actuales = await tx.tipoNivelGeografico.count({ where: { paisId } });
      if (actuales >= PAIS_NIVELES_MAX) return "tope";

      const profundidad = actuales + 1;
      const creado = await tx.tipoNivelGeografico.create({
        data: {
          paisId,
          clave: claveDeProfundidad(profundidad),
          nombreSingular,
          nombrePlural,
          digitosCodigo: null,
          codigoHeredaPrefijo: false,
        },
        select: SELECT_TIPO,
      });
      let tipo = tipoDTO(creado);
      if (profundidad <= NIVELES_EN_PAIS) {
        await tx.pais.update({
          where: { id: paisId },
          data: nombresDeNivelEnPais(profundidad, nombreSingular, nombrePlural),
        });
        // El upsert del trigger aplica la regla de código de `pais` a ese nivel: se devuelve lo escrito.
        const releido = await tx.tipoNivelGeografico.findUnique({ where: { id: creado.id }, select: SELECT_TIPO });
        if (releido !== null) tipo = tipoDTO(releido);
      }

      const congelado = await resolverActorCongelado(tx, actor.usuarioId);
      await appendAccionPlataforma(tx, [
        tipoCreado(tipo, paisId, "nivel_agregado", {
          actorUsuarioId: congelado.actorUsuarioId,
          actorNombre: congelado.actorNombre,
        }),
      ]);
      return tipo;
    });
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
}

// --- Tipos de nivel (SLT-46) ---

/** `nivel_<k>` → k (P1: el tipo de la profundidad k es el de clave `nivel_<k>`). */
function profundidadDeClave(clave: string): number {
  const m = /^nivel_(\d+)$/.exec(clave);
  if (m === null) throw new Error(`tipo de nivel con clave inesperada: ${clave}`);
  return Number(m[1]);
}

function claveDeProfundidad(k: number): string {
  return `nivel_${k}`;
}

function tipoDTO(t: {
  id: string;
  clave: string;
  nombreSingular: string;
  nombrePlural: string;
  digitosCodigo: number | null;
  codigoHeredaPrefijo: boolean;
}): TipoNivelDTO {
  return { ...t, profundidad: profundidadDeClave(t.clave) };
}

/** Las dos columnas de `pais` del nivel k (1–3), con los nombres del tipo. */
function nombresDeNivelEnPais(k: number, singular: string, plural: string): Prisma.PaisUpdateInput {
  switch (k) {
    case 1:
      return { nivel1Singular: singular, nivel1Plural: plural };
    case 2:
      return { nivel2Singular: singular, nivel2Plural: plural };
    case 3:
      return { nivel3Singular: singular, nivel3Plural: plural };
    default:
      throw new Error(`pais no guarda nombres del nivel ${k}`);
  }
}

/** La fila `tipo_nivel_geografico_creado` de un tipo (design §7): etiqueta = su singular. */
function tipoCreado(
  tipo: TipoNivelDTO,
  paisId: string,
  origen: "alta_de_pais" | "nivel_agregado",
  quien: Pick<EntradaAccionPlataforma, "actorUsuarioId" | "actorNombre">,
): EntradaAccionPlataforma {
  return {
    accion: "tipo_nivel_geografico_creado",
    entidadTipo: "tipo_nivel_geografico",
    entidadId: tipo.id,
    entidadEtiqueta: tipo.nombreSingular,
    paisId,
    ...quien,
    detalle: { origen, profundidad: tipo.profundidad },
  };
}

/**
 * El campo de un P2002. En esta transacción solo `pais` tiene únicos: `pais_nombre_key` (o
 * `target: ["nombre"]` sin adapter) es el nombre, y el otro, `pais_pkey`, el código. No se busca
 * «id» en el texto: el mensaje en español dice «unicidad», que lo contiene.
 */
function campoDuplicado(error: unknown): "id" | "nombre" | null {
  const texto = textoConstraintP2002(error);
  if (!texto) return null;
  return texto.includes("nombre") ? "nombre" : "id";
}
