import type { PrismaPg } from "@prisma/adapter-pg";

// SLT-65 (design §10, paso 1; T6.1) — LAS CONSULTAS QUE EMITE PRISMA, CAPTURADAS EN EL ADAPTADOR.
//
// Donde las expone Prisma 7.8 (verificado en `@prisma/adapter-pg@7.8.0/dist/index.mjs`): toda
// consulta pasa por `queryRaw(consulta)` o `executeRaw(consulta)` de `PgQueryable`, la clase de la
// que heredan el adaptador (fuera de transaccion) y `PgTransaction` (dentro). `consulta` es un
// `SqlQuery`: `{ sql, args, argTypes }`, el SQL con `$1..$n` y los parametros con su tipo, antes de
// que `performIO` los convierta para `pg`. Tambien pasan por ahi el `BEGIN` del adaptador y el
// `COMMIT`/`ROLLBACK` que manda el gestor de transacciones del cliente (`sql: "COMMIT"`).
//
// Se envuelve igual que `conConsultasEnSeriePorTransaccion` (`lib/db/consultas-en-serie.ts`): sobre
// `connect` del `PrismaPg` y sobre `startTransaction` del adaptador. Con los tipos del adaptador y
// no con el evento `query` del cliente: el evento trae los parametros serializados a JSON, sin su
// tipo, y repetirlos exigiria adivinarlo (`convertirParametro` de `bench-busqueda-ordenes.ts`).
//
// Lo que guarda vive en memoria y no se imprime nunca: el SQL y los parametros pueden llevar datos
// de una orden (R24). Lo que sale de aqui son tiempos y conteos de nodos del plan.

type Adaptador = Awaited<ReturnType<PrismaPg["connect"]>>;
type Transaccion = Awaited<ReturnType<Adaptador["startTransaction"]>>;
type Consulta = Parameters<Transaccion["queryRaw"]>[0];
type Ejecutor = Pick<Transaccion, "queryRaw" | "executeRaw">;

/** Una consulta de una lectura, con lo que hace falta para repetirla igual. */
export interface ConsultaCapturada {
  consulta: Consulta;
  /** Los `set_config` y `SET ... ROLE` que la transaccion de la consulta corrio antes que ella. */
  contexto: Consulta[];
  /** Donde corrio, sin la envoltura: la transaccion (o el adaptador) de Prisma. */
  origen: Ejecutor;
}

/** Lo que sale del plan de una consulta: lo unico que el script mira y cuenta. */
export interface PlanMedido {
  /** `Execution Time` del `EXPLAIN ANALYZE`, en milisegundos. */
  tiempoMs: number;
  /** Nodos `Seq Scan` cuya relacion es `orden`. */
  seqScanSobreOrden: number;
}

/**
 * Donde se repite cada consulta como `EXPLAIN`:
 * - `transaccion-nueva` (el script): una transaccion propia del adaptador, con el contexto de la
 *   original repetido (la empresa y el rol de la RLS, o ninguno en plataforma) y un `ROLLBACK`.
 * - `su-transaccion` (el test): la misma transaccion en la que corrio, que sigue abierta. Es la unica
 *   que ve el fixture, que vive en la transaccion revertida del test.
 */
export type ModoDeRepeticion = "transaccion-nueva" | "su-transaccion";

export interface Captura {
  /** El mismo `PrismaPg`, con sus consultas capturadas. Va DEBAJO de la serializacion. */
  envolver(fabrica: PrismaPg): PrismaPg;
  /** Corre `fn` y devuelve lo que devolvio y las consultas que emitio, sin las de control. */
  grabar<T>(fn: () => Promise<T>): Promise<{ valor: T; consultas: ConsultaCapturada[] }>;
  /** `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` de una consulta capturada. */
  explicar(c: ConsultaCapturada): Promise<PlanMedido>;
}

const SIN_ARGUMENTOS = { args: [], argTypes: [] };

// El control de la transaccion: ni cuenta ni es contexto. `-- Implicit "COMMIT"` es el que el
// cliente manda cuando el adaptador usa la consulta fantasma.
const CONTROL = /^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET\s+TRANSACTION|--\s*Implicit)\b/i;
// El contexto de la RLS: `fijarEmpresa` de la extension (`set_config('app.organizacion_id', ...)` y
// `set_config('role', 'servi_app', ...)`) y los `SET LOCAL ROLE` de los tests.
const CONTEXTO = /set_config\s*\(|^\s*SET\s+(LOCAL\s+)?ROLE\b/i;
// Lo unico que se repite con `ANALYZE`: una lectura. `EXPLAIN ANALYZE` EJECUTA la sentencia.
const LECTURA = /^\s*(SELECT|WITH)\b/i;

export function esDeControl(sql: string): boolean {
  return CONTROL.test(sql);
}

export function esDeContexto(sql: string): boolean {
  return !esDeControl(sql) && CONTEXTO.test(sql);
}

/** Recorre el plan JSON de Postgres: el tiempo de ejecucion y los Seq Scan sobre `orden`. */
export function leerPlan(json: unknown): PlanMedido {
  const raiz = (Array.isArray(json) ? json[0] : json) as { "Execution Time"?: unknown; Plan?: unknown } | undefined;
  const tiempo = raiz?.["Execution Time"];
  if (typeof tiempo !== "number") throw new Error("el plan no trae «Execution Time»");
  let seqScanSobreOrden = 0;
  const pendientes: unknown[] = [raiz?.Plan];
  while (pendientes.length > 0) {
    const nodo = pendientes.pop() as { "Node Type"?: unknown; "Relation Name"?: unknown; Plans?: unknown } | undefined;
    if (nodo === undefined || nodo === null) continue;
    if (nodo["Node Type"] === "Seq Scan" && nodo["Relation Name"] === "orden") seqScanSobreOrden++;
    if (Array.isArray(nodo.Plans)) pendientes.push(...(nodo.Plans as unknown[]));
  }
  return { tiempoMs: tiempo, seqScanSobreOrden };
}

/** La celda del `EXPLAIN (FORMAT JSON)`: `pg` puede darla como texto o ya parseada. */
function planDeLaFila(filas: unknown[][]): unknown {
  const celda = filas[0]?.[0];
  return typeof celda === "string" ? (JSON.parse(celda) as unknown) : celda;
}

export function crearCaptura(modo: ModoDeRepeticion): Captura {
  let grabadas: ConsultaCapturada[] | null = null;
  // `startTransaction` del adaptador SIN envolver: la transaccion propia de `explicar` no se captura.
  let empezarSinCaptura: Adaptador["startTransaction"] | null = null;

  /** Las consultas de `ejecutor` pasan por aqui; `contexto` es el de su transaccion (o ninguno). */
  function envolverEjecutor<E extends Ejecutor>(ejecutor: E, enTransaccion: boolean): E {
    const original: Ejecutor = {
      queryRaw: ejecutor.queryRaw.bind(ejecutor),
      executeRaw: ejecutor.executeRaw.bind(ejecutor),
    };
    const contexto: Consulta[] = [];
    const anotar = (consulta: Consulta): void => {
      if (esDeControl(consulta.sql)) return;
      if (esDeContexto(consulta.sql)) {
        // Fuera de transaccion un `set_config(..., true)` dura una sentencia: no es contexto de nada.
        if (enTransaccion) contexto.push(consulta);
        return;
      }
      grabadas?.push({ consulta, contexto: [...contexto], origen: original });
    };
    ejecutor.queryRaw = (consulta) => {
      anotar(consulta);
      return original.queryRaw(consulta);
    };
    ejecutor.executeRaw = (consulta) => {
      anotar(consulta);
      return original.executeRaw(consulta);
    };
    return ejecutor;
  }

  async function explicarEnTransaccionNueva(c: ConsultaCapturada, explain: Consulta): Promise<unknown> {
    if (empezarSinCaptura === null) throw new Error("captura: el cliente todavia no se conecto");
    const tx = await empezarSinCaptura();
    try {
      for (const ctx of c.contexto) await tx.executeRaw(ctx);
      return planDeLaFila((await tx.queryRaw(explain)).rows);
    } finally {
      // El gestor de transacciones del cliente es quien manda el `ROLLBACK`; `rollback()` del
      // adaptador solo devuelve la conexion al pool.
      try {
        await tx.executeRaw({ sql: "ROLLBACK", ...SIN_ARGUMENTOS });
      } finally {
        await tx.rollback();
      }
    }
  }

  return {
    envolver(fabrica) {
      const conectar = fabrica.connect.bind(fabrica);
      fabrica.connect = async () => {
        const adaptador = envolverEjecutor(await conectar(), false);
        const empezar = adaptador.startTransaction.bind(adaptador);
        empezarSinCaptura = empezar;
        adaptador.startTransaction = async (aislamiento) => envolverEjecutor(await empezar(aislamiento), true);
        return adaptador;
      };
      return fabrica;
    },

    async grabar(fn) {
      if (grabadas !== null) throw new Error("captura: ya hay una grabacion en curso");
      grabadas = [];
      try {
        const valor = await fn();
        return { valor, consultas: grabadas };
      } finally {
        grabadas = null;
      }
    },

    async explicar(c) {
      if (!LECTURA.test(c.consulta.sql)) throw new Error("captura: solo se explican lecturas (SELECT o WITH)");
      const explain: Consulta = { ...c.consulta, sql: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${c.consulta.sql}` };
      const plan =
        modo === "su-transaccion"
          ? planDeLaFila((await c.origen.queryRaw(explain)).rows)
          : await explicarEnTransaccionNueva(c, explain);
      return leerPlan(plan);
    },
  };
}
