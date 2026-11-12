import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  ActorDeAltaDePais,
  CrearPaisRepoResultado,
  IPaisRepository,
  NivelReordenado,
  NombresDeTipo,
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
   * SLT-46 (design §2.4; R23, R37, R46). En una transacción:
   *   1. `pais.create` con los tipos 1–3 en `nivel_{1,2,3}_*` (con P = 2, `''` en los de nivel 3) y su
   *      `disponible` (R63) →
   *      el trigger crea `nivel_1..min(P,3)` con la regla de código de `pais` (un país nuevo, sin
   *      dígitos);
   *   2. `createMany` de `nivel_4..nivel_P`, sin regla de código;
   *   3. `pais_creado` y una `tipo_nivel_geografico_creado` por tipo (`origen: "alta_de_pais"`).
   * Todo en la MISMA transacción (R33, R37): si el registro falla, el país no queda. Un único violado
   * (otra alta igual que ganó la carrera; en un país nuevo solo puede chocar `pais`) es `duplicado`;
   * cualquier otro error sube tal cual, para que la action lo registre y responda `error` (R36).
   */
  async crear(datos: DatosDeAltaDePais, actor: ActorDeAltaDePais): Promise<CrearPaisRepoResultado> {
    const { id, nombre, tipos, disponible } = datos;
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
            // R63: en el mismo `create` que el país, sin un segundo paso. Sin valor (`undefined`),
            // Prisma no manda la columna y rige su `DEFAULT true`, como antes de R63.
            disponible,
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
   * SLT-46 (design §2.4, §4.7; R25, R26, R37, R61). Lee el `paisId` del tipo, toma el candado del
   * país y vuelve a leer el tipo bajo él: así la comparación con el «antes» ve lo último que commiteó
   * otra escritura de tipos de ese país. Orden de las comprobaciones:
   *   1. los nombres pedidos ya son los actuales → `sin_cambio` (R26: es éxito aunque el «antes» que
   *      trae la pantalla sea viejo; R61 remite a R18);
   *   2. los actuales no son `anterior` → `cambio_concurrente`, sin escribir ni historial (R61).
   * Si su clave es `nivel_1..3`, `pais.update` de las dos columnas de ese nivel: el trigger rehace el
   * upsert de los tipos 1–3 con los mismos valores (y, en un país de 2, sigue sin crear `nivel_3`,
   * R46). Una fila de historial por nombre que cambió, con `detalle.campo`.
   */
  async renombrarTipo(
    tipoId: string,
    nombres: NombresDeTipo,
    anterior: NombresDeTipo,
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "sin_cambio" | "cambio_concurrente" | "renombrado"> {
    const { nombreSingular, nombrePlural } = nombres;
    return this.prisma.$transaction(async (tx) => {
      const delTipo = await tx.tipoNivelGeografico.findUnique({ where: { id: tipoId }, select: { paisId: true } });
      if (delTipo === null) return "no_existe";
      await bloquearPais(tx, delTipo.paisId);
      // Releído bajo el candado: los nombres leídos antes de tomarlo pudieron cambiar.
      const tipo = await tx.tipoNivelGeografico.findUnique({
        where: { id: tipoId },
        select: { paisId: true, clave: true, nombreSingular: true, nombrePlural: true },
      });
      if (tipo === null) return "no_existe";

      const cambios = cambiosDeNombres(tipo, nombres);
      if (cambios.length === 0) return "sin_cambio";
      if (!mismosNombres(tipo, anterior)) return "cambio_concurrente";

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
        cambios.map((c) => tipoRenombrado(tipoId, tipo.paisId, nombreSingular, c, {}, congelado)),
      );
      return "renombrado";
    });
  }

  /**
   * SLT-46 (design §2.4, §4.7, P3; R37, R48, R49, R50, R61). Bajo el candado del país cuenta sus tipos
   * (P): con 10, `tope` (antes que la profundidad: con el máximo, ningún «antes» lo arregla); si P+1
   * no es la `profundidad` que mostró la pantalla, otra persona agregó un nivel → `cambio_concurrente`.
   * Crea `nivel_<P+1>` con `create` EXPLÍCITO, también cuando P+1 = 3: el único `(pais_id, clave)`
   * queda de respaldo (`P2002`, que sube tal cual) en vez de pisarse con el upsert del trigger. Si
   * P+1 = 3, copia los nombres a `pais.nivel_3_*`; el trigger encuentra los tres tipos con esos mismos
   * valores. No toca nodos ni otros tipos.
   */
  async agregarNivel(
    paisId: string,
    nombres: NombresDeTipo,
    profundidadMostrada: number,
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "tope" | "cambio_concurrente" | TipoNivelDTO> {
    const { nombreSingular, nombrePlural } = nombres;
    return this.prisma.$transaction(async (tx) => {
      if (!(await bloquearPais(tx, paisId))) return "no_existe";
      const actuales = await tx.tipoNivelGeografico.count({ where: { paisId } });
      if (actuales >= PAIS_NIVELES_MAX) return "tope";
      const profundidad = actuales + 1;
      if (profundidad !== profundidadMostrada) return "cambio_concurrente";

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
   * SLT-46 (2026-11-09; design §2.4 «Reordenar niveles», §4.7; R46, R55, R56, R57). Reordenar no
   * mueve tipos: el tipo de cada profundidad k (su id, su clave, su regla de código y sus nodos) se
   * queda, y toma los NOMBRES del que quedó en la posición k. Así ningún nodo cambia de tipo (P1: el
   * tipo de un nodo sale de su profundidad) y la copia en `pais.nivel_1..3_*` sigue siendo la de esas
   * profundidades. En una transacción, bajo el candado del país:
   *   1. el conjunto de ids de `niveles` debe ser exactamente el de los tipos del país y cada nombre
   *      el actual de su tipo; si no, `cambio_concurrente` (R57) sin escribir;
   *   2. si ninguna profundidad cambia de nombres, `sin_cambio` (R56);
   *   3. `update` de nombres solo de los tipos que cambian y UN `pais.update` con las columnas de los
   *      niveles 1–3 que cambian; el trigger rehace su upsert con esos mismos valores y, en un país de
   *      2, `nivel_3_*` sigue `''` (R46);
   *   4. una fila `tipo_nivel_geografico_renombrado` por nombre cambiado, `origen: "reordenado"`.
   * Los nombres de tipo no son únicos: el intercambio no choca a mitad de camino.
   */
  async reordenarTipos(
    paisId: string,
    niveles: NivelReordenado[],
    actor: ActorDeAltaDePais,
  ): Promise<"no_existe" | "cambio_concurrente" | "sin_cambio" | "reordenado"> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await bloquearPais(tx, paisId))) return "no_existe";
      const tipos = (await tx.tipoNivelGeografico.findMany({ where: { paisId }, select: SELECT_TIPO }))
        .map(tipoDTO)
        .sort((a, b) => a.profundidad - b.profundidad);

      const porId = new Map(tipos.map((t) => [t.id, t]));
      // Mismo tamaño + ids distintos + todos del país = el mismo conjunto (zod ya rechaza repetidos,
      // pero el repositorio no depende de que lo hayan llamado tras validar).
      const mismoConjunto =
        niveles.length === tipos.length && new Set(niveles.map((n) => n.tipoId)).size === niveles.length;
      const vigentes = niveles.every((n) => {
        const actual = porId.get(n.tipoId);
        return actual !== undefined && mismosNombres(actual, n);
      });
      if (!mismoConjunto || !vigentes) return "cambio_concurrente";

      const renombres = tipos
        .map((tipo, i) => ({ tipo, nuevos: niveles[i], cambios: cambiosDeNombres(tipo, niveles[i]) }))
        .filter((r) => r.cambios.length > 0);
      if (renombres.length === 0) return "sin_cambio";

      let enPais: Prisma.PaisUpdateInput = {};
      for (const { tipo, nuevos } of renombres) {
        await tx.tipoNivelGeografico.update({
          where: { id: tipo.id },
          data: { nombreSingular: nuevos.nombreSingular, nombrePlural: nuevos.nombrePlural },
        });
        if (tipo.profundidad <= NIVELES_EN_PAIS) {
          enPais = { ...enPais, ...nombresDeNivelEnPais(tipo.profundidad, nuevos.nombreSingular, nuevos.nombrePlural) };
        }
      }
      // Un solo `UPDATE pais`: el trigger corre una vez y ve los tres niveles ya en su sitio.
      if (Object.keys(enPais).length > 0) await tx.pais.update({ where: { id: paisId }, data: enPais });

      const congelado = await resolverActorCongelado(tx, actor.usuarioId);
      await appendAccionPlataforma(
        tx,
        renombres.flatMap(({ tipo, nuevos, cambios }) =>
          cambios.map((c) =>
            tipoRenombrado(tipo.id, paisId, nuevos.nombreSingular, c, { origen: "reordenado" }, congelado),
          ),
        ),
      );
      return "reordenado";
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

  async tiposDeLaEmpresa(organizacionId: string): Promise<TipoNivelDTO[] | null> {
    const fila = await this.prisma.organizacion.findUnique({
      where: { id: organizacionId },
      select: { pais: { select: { tiposDeNivel: { select: SELECT_TIPO } } } },
    });
    if (!fila) return null;
    return fila.pais.tiposDeNivel.map(tipoDTO).sort((a, b) => a.profundidad - b.profundidad);
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

type Tx = Prisma.TransactionClient;

/**
 * Candado de las escrituras de tipos de un país (design §2.4 «Candado del país», 2026-11-09):
 * `SELECT … FOR UPDATE` de su fila `pais`. Pone en fila renombrar, agregar y reordenar del mismo país,
 * así la comparación con el «antes» (§4.7) es exacta; sin él, un agregar nivel con P+1 > 3 no toca
 * `pais` y un reordenamiento en paralelo no lo vería. `false` si el país no existe.
 */
async function bloquearPais(tx: Tx, paisId: string): Promise<boolean> {
  const filas = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "pais" WHERE "id" = ${paisId} FOR UPDATE`;
  return filas.length > 0;
}

interface CambioDeNombre {
  campo: "singular" | "plural";
  anterior: string;
  nuevo: string;
}

/** Los nombres de un tipo que cambian al pedir `nuevos` (una entrada por campo, P7). */
function cambiosDeNombres(actual: NombresDeTipo, nuevos: NombresDeTipo): CambioDeNombre[] {
  const todos: CambioDeNombre[] = [
    { campo: "singular", anterior: actual.nombreSingular, nuevo: nuevos.nombreSingular },
    { campo: "plural", anterior: actual.nombrePlural, nuevo: nuevos.nombrePlural },
  ];
  return todos.filter((c) => c.anterior !== c.nuevo);
}

function mismosNombres(a: NombresDeTipo, b: NombresDeTipo): boolean {
  return a.nombreSingular === b.nombreSingular && a.nombrePlural === b.nombrePlural;
}

/**
 * La fila `tipo_nivel_geografico_renombrado` de un nombre cambiado (design §7): etiqueta = el
 * singular nuevo; `detalle.campo` siempre y, en un reordenamiento, `origen: "reordenado"`.
 */
function tipoRenombrado(
  tipoId: string,
  paisId: string,
  singularNuevo: string,
  cambio: CambioDeNombre,
  extra: { origen?: "reordenado" },
  quien: Pick<EntradaAccionPlataforma, "actorUsuarioId" | "actorNombre">,
): EntradaAccionPlataforma {
  return {
    accion: "tipo_nivel_geografico_renombrado",
    entidadTipo: "tipo_nivel_geografico",
    entidadId: tipoId,
    entidadEtiqueta: singularNuevo,
    paisId,
    actorUsuarioId: quien.actorUsuarioId,
    actorNombre: quien.actorNombre,
    valorAnterior: cambio.anterior,
    valorNuevo: cambio.nuevo,
    detalle: { campo: cambio.campo, ...extra },
  };
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
