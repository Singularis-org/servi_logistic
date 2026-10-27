import type { PrismaPg } from "@prisma/adapter-pg";

// SL-43 (medición del build de QA, 2026-10-26) — UNA CONSULTA A LA VEZ POR TRANSACCIÓN.
//
// Prisma 7.8 resuelve un `include` con varios hijos lanzándolos a la vez (`Promise.all` sobre
// `t.args.children` en el intérprete del runtime). Fuera de una transacción cada consulta toma su
// conexión del pool; DENTRO, todas van a la MISMA conexión de `pg`, y `pg` las encola él mismo
// avisando `DeprecationWarning: Calling client.query() when the client is already executing a
// query`: en `pg@9` esa cola desaparece. Y aquí casi todo corre en transacción: la extensión de
// empresa envuelve cada operación en `$transaction([set_config, operación])` (`extension-empresa.ts`).
//
// La cola se hace aquí, en el adaptador, en el mismo orden en que `pg` las habría encolado: el
// resultado de cada consulta no cambia, solo deja de pedírsele a `pg` algo que va a dejar de hacer.
// Fuera de transacción no se toca nada: allí cada consulta ya va por su conexión.

type Adaptador = Awaited<ReturnType<PrismaPg["connect"]>>;
type Transaccion = Awaited<ReturnType<Adaptador["startTransaction"]>>;

/** Una cola FIFO: cada trabajo empieza cuando terminó el anterior, haya ido bien o mal. */
export function crearSerie(): <T>(trabajo: () => Promise<T>) => Promise<T> {
  let ultimo: Promise<unknown> = Promise.resolve();
  return <T>(trabajo: () => Promise<T>): Promise<T> => {
    const resultado = ultimo.then(trabajo);
    ultimo = resultado.catch(() => undefined);
    return resultado;
  };
}

/** Las consultas de `tx` pasan de una en una. `createSavepoint` y compañía usan `executeRaw`: también. */
export function serializarTransaccion<T extends Pick<Transaccion, "queryRaw" | "executeRaw">>(tx: T): T {
  const enSerie = crearSerie();
  const queryRaw = tx.queryRaw.bind(tx);
  const executeRaw = tx.executeRaw.bind(tx);
  tx.queryRaw = (consulta) => enSerie(() => queryRaw(consulta));
  tx.executeRaw = (consulta) => enSerie(() => executeRaw(consulta));
  return tx;
}

/** El mismo `PrismaPg`, con las transacciones que abra serializadas. Ver la cabecera. */
export function conConsultasEnSeriePorTransaccion(fabrica: PrismaPg): PrismaPg {
  const conectar = fabrica.connect.bind(fabrica);
  fabrica.connect = async () => {
    const adaptador = await conectar();
    const empezar = adaptador.startTransaction.bind(adaptador);
    adaptador.startTransaction = async (aislamiento) => serializarTransaccion(await empezar(aislamiento));
    return adaptador;
  };
  return fabrica;
}
