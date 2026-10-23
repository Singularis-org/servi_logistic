import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { conEmpresa } from "@/lib/db/contexto-empresa";
import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import {
  crearOrganizacion,
  datosDeOrganizacionDePrueba,
  fijarEmpresa,
} from "../../fabricas/organizaciones";

/**
 * Feature 169 — utilidades para los pocos tests que NECESITAN un Postgres de verdad.
 *
 * Por que hacen falta: casi toda `tests/integration/db/**` verifica migraciones por REGEX
 * sobre el SQL, y para lo de esta feature eso no alcanza. Que `num_guia::text` sea
 * admisible en una columna generada, que `extensions.gin_trgm_ops` resuelva, y sobre todo
 * que la normalizacion de Postgres y la de Node produzcan EL MISMO texto, son hechos del
 * motor: una regex no puede demostrarlos y una aserción de código todavía menos.
 *
 * NO es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge.
 *
 * Si no hay base alcanzable, los tests que dependen de esto se SALTAN (no fallan): la
 * suite tiene que seguir siendo verde en una maquina sin Postgres levantado.
 */

/** `DATABASE_URL`, cargando `.env` si el proceso no la trae (vitest no lo lee solo). */
export function urlDeBaseDeDatos(): string | undefined {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile();
    } catch {
      // sin .env: se usa lo que ya haya en process.env
    }
  }
  return process.env.DATABASE_URL;
}

export const HAY_BASE_DE_DATOS = urlDeBaseDeDatos() !== undefined;

/**
 * Cliente propio del test, con el MISMO `omit` global que produccion: los tests de R28 no
 * valdrian nada si el cliente del test estuviera configurado distinto al real.
 */
export function crearPrismaDeTest(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 2 }),
    omit: PRISMA_OMIT,
  }) as unknown as PrismaClient;
}

/**
 * Feature 196 — cliente cuyas consultas de MODELO (`prisma.x.create()`, `findUnique`, …) se
 * dirigen a `esquema` en vez de a `public`.
 *
 * POR QUE NO BASTA EL `search_path`: Prisma CUALIFICA la tabla en el SQL que genera
 * (`INSERT INTO "public"."ranking_snapshot_dia" …`). Medido, no supuesto: con un
 * `SET LOCAL search_path` a un esquema temporal, la API de modelo sigue yendo a `public` y
 * falla con P2021 «no existe la relacion public.ranking_snapshot_dia». El unico punto donde
 * ese prefijo se puede cambiar es `PrismaPgOptions.schema` del driver adapter, que es lo que
 * hace esta funcion.
 *
 * Para que sirve: probar el DDL REAL de una migracion —y el comportamiento del repositorio
 * que lo usa— por la API publica de Prisma, en un esquema desechable, SIN aplicar la
 * migracion a `public` ni tocar `_prisma_migrations`. Quien la use es responsable de crear
 * el esquema, de aplicar ahi el DDL y de soltarlo (`DROP SCHEMA … CASCADE`) al terminar.
 */
export function crearPrismaDeTestEnEsquema(esquema: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 2 }, { schema: esquema }),
    omit: PRISMA_OMIT,
  }) as unknown as PrismaClient;
}

/**
 * Feature 169 / T4.2 — una consulta tal y como Prisma la mando al servidor.
 *
 * `params` viene serializado a JSON por Prisma y con los numericos convertidos a string;
 * `parametrosDe` lo devuelve a la forma que espera `$queryRawUnsafe`.
 */
export interface EventoSqlDeTest {
  query: string;
  params: string;
  duration: number;
}

export function parametrosDe(evento: EventoSqlDeTest): unknown[] {
  return (JSON.parse(evento.params) as unknown[]).map((v) =>
    typeof v === "string" && /^-?\d+$/.test(v) ? Number.parseInt(v, 10) : v,
  );
}

/**
 * Cliente que ADEMAS apunta cada consulta que emite. Es la unica forma de comprobar el PLAN
 * de la consulta REAL: si el test escribiera el SQL a mano, demostraria que un SQL inventado
 * usa el indice, no que lo use el que emite el repositorio (que es lo que corre en produccion
 * y lo que puede cambiar sin avisar al actualizar Prisma).
 *
 * Mismo `omit` que `crearPrismaDeTest`: sin el, el `SELECT` traeria `busqueda_texto` y el SQL
 * medido no seria el de produccion.
 */
export function crearPrismaDeTestConEspia(): {
  prisma: PrismaClient;
  eventos: EventoSqlDeTest[];
} {
  const eventos: EventoSqlDeTest[] = [];
  const cliente = new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 2 }),
    omit: PRISMA_OMIT,
    log: [{ emit: "event", level: "query" }],
  });
  (cliente as unknown as { $on: (e: "query", cb: (v: EventoSqlDeTest) => void) => void }).$on(
    "query",
    (e) => eventos.push(e),
  );
  return { prisma: cliente as unknown as PrismaClient, eventos };
}

/** El cliente que `enTransaccionRevertida` entrega al test: la tx interactiva de Prisma. */
export type TxDeTest = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * FICHA 327 — el cliente de la tx del test, MAS un `$transaction` que no abre nada.
 *
 * POR QUE HACE FALTA. `Prisma.TransactionClient` **no tiene `$transaction`** (esta en la
 * `ITXClientDenyList`). En cuanto un repositorio abre su propia transaccion por dentro —lo que
 * hace `OrdenRepository.corregirDatosCliente` desde la 327, para que el encolado del job comparta
 * transaccion con la escritura (OUTBOX, feature 91/R7)— ejercerlo con el `tx` pelado revienta con
 * «tx.$transaction is not a function», y ese rojo no dice nada del codigo.
 *
 * QUE SE PIERDE Y QUE NO. El pass-through NO abre un savepoint: la «transaccion interna» es la
 * misma del test. Lo que se sigue midiendo intacto es lo que estas suites existen para medir —el
 * SQL REAL contra Postgres: el `WHERE` de la ventana, las columnas que cambian, las filas que
 * aparecen o no en otras tablas—. La atomicidad del outbox NO se afirma con esto: se afirma
 * comprobando que el encolado recibe EL MISMO cliente que la escritura (4.º argumento), que es la
 * propiedad de la que depende el invariante.
 *
 * El `bind` es necesario: las funciones del cliente Prisma (`$queryRaw`, `$executeRawUnsafe`, ...)
 * necesitan su `this`, y devolverlas desatadas del proxy las rompe en silencio.
 */
export function clienteConTransaccionAnidada(tx: TxDeTest): PrismaClient {
  const proxy = new Proxy(tx as object, {
    get(target, prop) {
      if (prop === "$transaction") {
        return async (fn: (t: unknown) => unknown) => fn(proxy);
      }
      const valor = Reflect.get(target, prop) as unknown;
      return typeof valor === "function" ? valor.bind(target) : valor;
    },
  });
  return proxy as unknown as PrismaClient;
}

/**
 * FICHA 373 — el cliente de la tx del test MAS un `$transaction` que abre un SAVEPOINT REAL.
 *
 * DIFERENCIA CON `clienteConTransaccionAnidada`, y es la que decide si un test miente: aquel es un
 * PASO A TRAVES —no abre nada—, asi que un `throw` dentro del repositorio NO revierte lo que el
 * repositorio ya escribio, y un test de «si falla, no queda nada» pasaria en verde por accidente.
 * Este abre un savepoint de verdad y hace `ROLLBACK TO` al fallar, que es lo que Postgres hace con
 * una transaccion abortada.
 *
 * Tecnica tomada de `historial-accion-atomicidad.test.ts` (ficha 362), donde nacio.
 *
 * `romperRegistro` sustituye `historialAccion.createMany` por una funcion que LANZA. Nada mas se
 * toca: la mutacion, el `where`, el congelado del actor y la etiqueta son los reales. Es la unica
 * forma de medir «si el registro falla, la accion no persiste» sin tocar codigo de produccion.
 *
 * El `bind` es necesario: las funciones del cliente Prisma necesitan su `this`, y devolverlas
 * desatadas del proxy las rompe en silencio.
 */
export function clienteConSavepoint(tx: TxDeTest, romperRegistro = false): PrismaClient {
  const proxy: unknown = new Proxy(tx as object, {
    get(objetivo, prop) {
      if (romperRegistro && prop === "historialAccion") {
        return {
          createMany: () => {
            throw new RegistroCaido();
          },
        };
      }
      if (prop === "$transaction") {
        return async (fn: (t: unknown) => unknown) => {
          const punto = `sp_${randomUUID().replace(/-/g, "")}`;
          await tx.$executeRawUnsafe(`SAVEPOINT ${punto}`);
          try {
            const salida = await fn(proxy);
            await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${punto}`);
            return salida;
          } catch (error) {
            await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${punto}`);
            throw error;
          }
        };
      }
      const valor = Reflect.get(objetivo, prop) as unknown;
      return typeof valor === "function" ? valor.bind(objetivo) : valor;
    },
  });
  return proxy as PrismaClient;
}

/** El error con el que `clienteConSavepoint(tx, true)` fuerza el fallo del registro. */
export class RegistroCaido extends Error {
  constructor() {
    super("fallo PROVOCADO del registro de acciones");
    this.name = "RegistroCaido";
  }
}

/** Portador del valor: se lanza para forzar el ROLLBACK sin perder lo que se calculo. */
class Revertir extends Error {
  constructor(readonly valor: unknown) {
    super("rollback deliberado del test");
    this.name = "Revertir";
  }
}

/**
 * Ejecuta `fn` dentro de una transaccion que SIEMPRE se revierte, y devuelve lo que `fn`
 * calculo. Es la unica forma honesta de insertar ordenes de prueba en la base de
 * desarrollo: si el test pasa, si falla o si el proceso muere a mitad, no queda ni una
 * fila. Un `afterAll` que borre lo insertado no da esa garantia (no corre si el runner se
 * cae, y borra por un criterio que hay que mantener a mano).
 *
 * SL-17 (design §9.1, R33): toda fila de negocio lleva `organizacion_id NOT NULL`, y su `DEFAULT`
 * sale de `app.organizacion_id`. Por eso la transaccion nace con una empresa fijada: la de
 * `opciones.organizacionId` o, si no la pasan, una creada aqui dentro (el rollback se la lleva,
 * como al resto). Los tests que ya existian insertan sin saber nada de empresas.
 *
 * `fn` corre ademas dentro de `conEmpresa` con esa misma empresa, para que el codigo bajo test que
 * lea el contexto (`contextoActual`) vea la del test y no «sin empresa». No se usa
 * `comoPlataforma`: un test de negocio no es un camino de plataforma, y lo taparia todo.
 *
 * Lo que esto NO cambia: el `tx` sigue siendo el del cliente BASE, con el rol de la conexion (dueno
 * de las tablas), asi que la RLS no actua. Para probarla, `comoApp` de `tests/fabricas/organizaciones`.
 *
 * La empresa por defecto nace tras un SAVEPOINT: ver `serializarEscriturasReales`, que la deshace y
 * la rehace despues del lock para no reabrir el deadlock de la feature 227.
 */
export async function enTransaccionRevertida<T>(
  prisma: PrismaClient,
  fn: (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => Promise<T>,
  opciones?: { organizacionId?: string },
): Promise<T> {
  try {
    await prisma.$transaction(
      async (tx) => {
        let organizacionId = opciones?.organizacionId;
        if (organizacionId === undefined) {
          await tx.$executeRawUnsafe(`SAVEPOINT ${SAVEPOINT_EMPRESA_POR_DEFECTO}`);
          organizacionId = (await crearOrganizacion(tx)).id;
          empresaPorDefectoAntesDelLock.set(tx, organizacionId);
        }
        await fijarEmpresa(tx, organizacionId);
        const id = organizacionId;
        throw new Revertir(await conEmpresa(id, () => fn(tx)));
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  } catch (error) {
    if (error instanceof Revertir) return error.valor as T;
    throw error;
  }
  throw new Error("la transaccion termino sin revertirse: imposible");
}

/**
 * Feature 227 — clave del lock de aviso que SERIALIZA a los tests que escriben en las tablas
 * REALES de `public` (`usuario`, `orden`, y el DDL que las referencia por FK).
 *
 * POR QUE HACE FALTA. Varios archivos de test corren EN PARALELO (vitest usa un worker por
 * archivo) y cada uno abre una transaccion larga que inserta en `public."usuario"` y
 * `public."orden"` y ejecuta DDL cuyas FK apuntan ahi. Cada transaccion toma los mismos locks
 * (los `KEY SHARE` de las FK sobre los catalogos, y el `SHARE ROW EXCLUSIVE` que un
 * `ADD CONSTRAINT ... REFERENCES public."usuario"` toma sobre la tabla referenciada) pero en
 * ORDEN DISTINTO. Eso es la receta exacta de un deadlock, y Postgres mata a una de las dos con
 * `40P01`. Medido: en aislado cada archivo pasa siempre; los tres juntos fallaban 2 de cada 3
 * corridas, y al reventar el `beforeAll` vitest marcaba los tests como SKIPPED —es decir, la
 * evidencia de varios requisitos dejaba de ejecutarse y la suite parecia casi verde.
 *
 * POR QUE ESTE REMEDIO Y NO UN REINTENTO. Reintentar un deadlock lo esconde. Serializar las
 * secciones criticas lo ELIMINA: si nunca hay dos de estas transacciones a la vez, no hay ciclo
 * de espera posible. Y no toca la fidelidad de lo que se mide: las FK siguen apuntando a las
 * tablas REALES, el DDL sigue siendo el REAL y el rollback sigue siendo el mismo.
 *
 * POR QUE `pg_advisory_xact_lock` Y NO UN `LOCK TABLE`. El lock de aviso no bloquea a la
 * aplicacion ni a ningun otro test que no lo pida (los demas siguen corriendo en paralelo), y
 * se suelta SOLO al terminar la transaccion —incluido el rollback y la muerte del proceso—, sin
 * un `finally` que mantener.
 */
export const CLAVE_LOCK_ESCRITURA_REAL = 227_0815_00;

/**
 * Toma el lock de aviso. DEBE ser la PRIMERA sentencia de la transaccion: si se toma despues de
 * haber tocado ya una tabla, la transaccion habra adquirido locks antes de serializarse y el
 * ciclo vuelve a ser posible.
 *
 * SL-17: `enTransaccionRevertida` ya inserto la empresa por defecto antes de que el test llegue
 * aqui, y ese `INSERT` deja un `ROW EXCLUSIVE` sobre `organizacion` que choca con el
 * `SHARE ROW EXCLUSIVE` que el DDL de otro test serializado toma al crear o soltar una FK hacia
 * ella (todas las tablas de negocio la tienen). Medido: con el `INSERT` antes del lock, de 6 a 8
 * archivos morian con `40P01` en cada corrida de los 85 de integracion. Por eso, si lo unico
 * escrito es esa empresa, se vuelve al SAVEPOINT (que suelta sus locks), se toma el lock y se
 * rehace con el mismo id.
 */
export async function serializarEscriturasReales(tx: {
  $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<number>;
}): Promise<void> {
  const pendiente = empresaPorDefectoAntesDelLock.get(tx);
  empresaPorDefectoAntesDelLock.delete(tx);
  const deshacer = pendiente !== undefined && (await soloSeEscribioLaEmpresa(tx));
  if (deshacer) await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${SAVEPOINT_EMPRESA_POR_DEFECTO}`);
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
  if (deshacer) {
    const { nombre, slug } = datosDeOrganizacionDePrueba();
    await tx.$executeRawUnsafe(
      `INSERT INTO "organizacion" ("id", "nombre", "slug") VALUES ($1, $2, $3)`,
      pendiente,
      nombre,
      slug,
    );
    await fijarEmpresa(tx, pendiente);
  }
}

const SAVEPOINT_EMPRESA_POR_DEFECTO = "sl17_empresa_por_defecto";

/** La empresa que `enTransaccionRevertida` creo en ese `tx`, mientras no se haya serializado. */
const empresaPorDefectoAntesDelLock = new WeakMap<object, string>();

// Volver al SAVEPOINT deshace TODO lo de despues, no solo la empresa. Si el test ya escribio algo
// (incumpliendo «primera sentencia»), deshacerlo le quitaria datos en silencio: se deja como esta y
// solo se toma el lock. La señal son los locks de escritura de esta sesion fuera de `organizacion`.
// Solo se descuenta la de `public`: un esquema temporal de otro test con una tabla de igual nombre
// es una escritura del test, no la empresa por defecto.
async function soloSeEscribioLaEmpresa(tx: object): Promise<boolean> {
  if (typeof (tx as Partial<ClienteDeSqlCrudo>).$queryRawUnsafe !== "function") return false;
  const filas = await (tx as ClienteDeSqlCrudo).$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n
       FROM pg_locks l
       JOIN pg_class c ON c.oid = l.relation
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE l.pid = pg_backend_pid()
        AND l.locktype = 'relation'
        AND l.mode NOT IN ('AccessShareLock', 'RowShareLock')
        AND NOT (n.nspname = 'public'
                 AND c.relname IN ('organizacion', 'organizacion_pkey', 'organizacion_slug_key'))`,
  );
  return filas[0]?.n === 0;
}

/**
 * SL-17 T4.3b — corre `fn` con el lock de la 227 tomado EN SESION, en una conexion propia que solo
 * lo sostiene. Es para lo que commitea FUERA de una transaccion revertida: la siembra y la limpieza
 * de `usuario`/`organizacion` de los tests de dos empresas, y el DDL de esquemas desechables.
 *
 * POR QUE HACE FALTA. Los `down.sql` reales que corren serializados (familia `notificacion`)
 * toman AccessExclusiveLock sobre tablas hijas de `usuario` y `organizacion`, y en su caso sobre
 * las padres. Un `DELETE FROM organizacion` o `usuario` commiteado recorre sus hijas por las
 * FK (cascada y comprobaciones RI) en un orden que no es el del down: medido en la suite completa,
 * 40P01. Un `INSERT INTO usuario` es lo mismo en pequeño (usuario primero, luego `KEY SHARE` en
 * `organizacion`/`rol`). Y un `DROP SCHEMA` a mitad de un down que recorre `pg_indexes` con
 * `pg_get_indexdef` le borra el OID bajo los pies (XX000). Serializar con el mismo lock lo elimina.
 *
 * POR QUE EN SESION Y EN OTRA CONEXION, y no un `pg_advisory_xact_lock` dentro de `$transaction`:
 * asi vale tambien para lo que va por el cliente EXTENDIDO (cada operacion abre su propia
 * transaccion en el pool, donde no se puede meter el lock) y para la conexion fija de un test con
 * `search_path` propio. Un lock de sesion y uno de transaccion con la misma clave se excluyen.
 * Si el proceso muere, la conexion se cierra y el lock se va con ella.
 *
 * ⚠️ `fn` NO puede pedir este mismo lock por otra conexion: esperaria a esta, que espera a `fn`,
 * y Postgres no lo ve como deadlock (la espera de en medio es de Node). Se colgaria.
 */
export async function bajoLockDeEscrituraReal<T>(fn: () => Promise<T>): Promise<T> {
  const soltar = await tomarLockDeEscrituraReal();
  try {
    return await fn();
  } finally {
    await soltar();
  }
}

/**
 * La misma pieza que `bajoLockDeEscrituraReal`, pero abierta: toma el lock y devuelve con que
 * soltarlo. Es para los archivos que COMMITEAN filas en `notificacion` (avisos de sus acciones y
 * crons) y las dejan vivas hasta su `afterAll`: un `down.sql` historico de la familia `notificacion`
 * reconstruye el enum sin los valores posteriores y su `ALTER COLUMN ... TYPE` muere con 22P02 si ve
 * una de esas filas (medido: `cierre_dia_rechazado` de `aislamiento-cierres`). Serializar cada
 * escritura no basta, porque la fila sigue ahi despues; lo que hay que serializar es su VIDA: se toma
 * en el `beforeAll`, antes de sembrar, y se suelta en el `afterAll`, despues de limpiar.
 *
 * Mismo aviso que arriba: mientras se sostiene, nada del archivo puede pedir este lock por otra
 * conexion (`serializarEscriturasReales`, `bajoLockDeEscrituraReal`, un `pg_advisory_xact_lock`).
 */
export async function tomarLockDeEscrituraReal(): Promise<() => Promise<void>> {
  const adaptador = await new PrismaPg({ connectionString: urlDeBaseDeDatos() as string, max: 1 }).connect();
  const pool = adaptador.underlyingDriver() as unknown as PoolDelDriver;
  const conexion = await pool.connect();
  const cerrar = async () => {
    conexion.release();
    await pool.end();
  };
  try {
    await conexion.query(`SELECT pg_advisory_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
  } catch (error) {
    await cerrar();
    throw error;
  }
  let suelto = false;
  return async () => {
    if (suelto) return;
    suelto = true;
    try {
      await conexion.query(`SELECT pg_advisory_unlock(${CLAVE_LOCK_ESCRITURA_REAL})`);
    } finally {
      // Cerrar la conexion tambien lo suelta: si el `unlock` fallara, el lock no se queda tomado.
      await cerrar();
    }
  };
}

/** Lo minimo del `pg.Pool` que hay debajo del driver adapter (sin dependencia nueva). */
interface PoolDelDriver {
  connect(): Promise<{ query(texto: string): Promise<unknown>; release(): void }>;
  end(): Promise<void>;
}

/**
 * FICHA 410 — deja la base como estaria en el MOMENTO REAL de revertir un `down.sql` HISTORICO del
 * enum `notificacion_evento`.
 *
 * ⚠️ POR QUE HACE FALTA, Y ES UNA TRAMPA NUEVA DE VERDAD. Esos `down.sql` recrean el tipo:
 * `RENAME TO ..._old` -> `CREATE TYPE` -> `ALTER COLUMN "notificacion"."evento" TYPE ...` ->
 * `DROP TYPE ..._old`. Funcionaban porque `notificacion.evento` era la UNICA columna del esquema que
 * usaba ese tipo. Desde la 410 hay una segunda: `push_envio_dia.evento`. Con ella viva, el
 * `DROP TYPE` muere con `2BP01` («otros objetos dependen de el») — medido en el gate del 2026-09-10,
 * doce archivos rojos de golpe.
 *
 * EN UN ROLLBACK REAL ESO NO PASA, y por eso NO se toca ni un `down.sql` anterior: `db:rollback` va
 * de la ULTIMA migracion hacia atras, y la de `push_suscripcion` (20260912120000) es POSTERIOR a
 * todas las que recrean este enum. Cuando les llega el turno, la tabla ya no existe. Lo que estos
 * tests hacen —ejecutar un down historico contra la base de HOY— es una simulacion, y esta funcion
 * le pone la unica pieza que le faltaba.
 *
 * ⚠️ LO QUE ESTO **NO** TAPA, y hay que escribirlo donde se lea: el `down.sql` de una migracion
 * FUTURA que anada un valor a `notificacion_evento` —y que por tanto sea POSTERIOR a la 410— SI
 * tendra que retipar las DOS columnas. Si se olvida, fallara RUIDOSAMENTE con el mismo `2BP01`, que
 * es el modo de fallo correcto. Queda dicho tambien en `db/schema.prisma`, junto al modelo.
 *
 * Todo esto corre DENTRO de la transaccion revertida del test: la tabla vuelve al hacer rollback.
 *
 * SL-17 T4.3 — se suelta la COLUMNA y no la tabla, y antes se toma `notificacion`. Desde M2
 * (`20261022130100_organizacion_id_en_negocio`) `push_envio_dia` tiene FK a `organizacion` ademas
 * de a `usuario`, y `DROP TABLE` pide AccessExclusiveLock sobre las DOS tablas padre: la primera la
 * tienen en RowExclusive casi todas las transacciones de test abiertas (su empresa por defecto), y
 * la segunda los `deleteMany` de limpieza que commitean fuera del lock de la 227. Medido en la suite
 * completa (log del servidor): `DROP TABLE "push_envio_dia"` esperaba a `usuario` mientras un
 * `DELETE FROM usuario` esperaba a `push_envio_dia` por su ON DELETE CASCADE: 40P01. Para el enum da
 * igual tabla que columna (solo `evento` depende de el); `DROP COLUMN` solo bloquea `push_envio_dia`,
 * que es lo que bloquean los down posteriores a la 410 al retiparla.
 *
 * El orden importa: ese `DELETE` en cascada llega a `notificacion` antes que a `push_envio_dia` (sus
 * triggers RI se disparan por nombre, y el de `notificacion` es mas antiguo). Tomando `notificacion`
 * primero —el down la va a reescribir igual con AccessExclusiveLock, y es el orden de los down
 * posteriores a la 410— esta transaccion espera a ese `DELETE` en vez de cerrarle el paso a mitad.
 * Un `DELETE FROM organizacion` commiteado recorre sus hijas en el orden CONTRARIO (M2 creo antes la
 * FK de `push_envio_dia`): contra ese no hay orden que valga; el remedio es que no corra fuera del
 * lock de la 227.
 */
export async function soltarDependientesPosterioresDelEnumDeEventos(tx: {
  $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<number>;
}): Promise<void> {
  await tx.$executeRawUnsafe(`LOCK TABLE "notificacion" IN ACCESS EXCLUSIVE MODE`);
  await tx.$executeRawUnsafe(`ALTER TABLE "push_envio_dia" DROP COLUMN IF EXISTS "evento"`);
}

/** FKs obligatorias de `orden`, tomadas de una fila existente. `null` si la tabla esta vacia. */
export interface FksDeOrden {
  estatusId: string;
  tiendaId: string;
  zonaId: string;
  provinciaId: string;
  cantonId: string;
}

export async function fksDeOrden(prisma: PrismaClient): Promise<FksDeOrden | null> {
  const fila = await prisma.orden.findFirst({
    select: {
      estatusId: true,
      tiendaId: true,
      zonaId: true,
      provinciaId: true,
      cantonId: true,
    },
  });
  return fila ?? null;
}

/**
 * FICHA 421 — las etiquetas de un enum de Postgres, en su orden, **y solo las de `public`**.
 *
 * ⚠️ POR QUE EXISTE ESTA FUNCION EN VEZ DE LA CONSULTA A PELO. Los catalogos de Postgres
 * (`pg_enum`, `pg_type`, `pg_class`, `pg_indexes`, …) son GLOBALES A LA BASE: no los filtra el
 * `search_path`. Y varios archivos de esta carpeta se aislan CREANDO UN ESQUEMA TEMPORAL en el que
 * clonan este mismo enum (`push-cupo-carrera.test.ts` lo hace explicitamente, porque el cliente de
 * Prisma cualifica el tipo con el esquema del adaptador). Con `maxWorkers` > 1 y doce archivos
 * tocando `notificacion_evento`, dos coinciden en el tiempo y una consulta que filtre solo por
 * `typname` suma LOS DOS TIPOS.
 *
 * No es una hipotesis: el 2026-09-11 puso el gate de release en rojo con «esperado 11, recibido
 * 23 — cada etiqueta duplicada» (`progress/flake_enum_esquema_2026-09-11.md`). Un enum de Postgres
 * no admite etiquetas repetidas, asi que 23 solo puede significar dos tipos.
 *
 * El `JOIN` a `pg_namespace` es el arreglo. NO se usa `::regtype`: eso resuelve por `search_path`,
 * o sea que devuelve UN tipo pero cual depende de un estado global que el test no fija.
 */
export const SQL_ETIQUETAS_DE_ENUM = `SELECT e.enumlabel AS etiqueta
     FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = $1 AND n.nspname = 'public'
    ORDER BY e.enumsortorder`;

/** Cualquier cliente capaz de mandar SQL crudo: el `PrismaClient` o el `tx` de un test. */
export interface ClienteDeSqlCrudo {
  $queryRawUnsafe: <T = unknown>(sql: string, ...args: unknown[]) => Promise<T>;
}

export async function etiquetasDeEnum(
  cliente: ClienteDeSqlCrudo,
  tipo: string,
): Promise<string[]> {
  const filas = await cliente.$queryRawUnsafe<{ etiqueta: string }[]>(SQL_ETIQUETAS_DE_ENUM, tipo);
  return filas.map((f) => f.etiqueta);
}
