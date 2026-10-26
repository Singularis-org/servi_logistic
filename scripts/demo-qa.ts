import { pathToFileURL } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { conConsultasEnSeriePorTransaccion } from "@/lib/db/consultas-en-serie";

import type { ResultadoBorrado } from "./demo-qa/borrar";
import { CANDADO_DE_POSTGRES, type CandadoDemo } from "./demo-qa/candado";
import { decidirDemo } from "./demo-qa/decision-build";
import { enParalelo } from "./demo-qa/paralelo";
import { enPaso } from "./demo-qa/paso";
import { comprobarMarcaDeQa, validarEntornoDemo, type ResultadoMarca } from "./demo-qa/guardia-entorno";
import type { ClaveEmpresaDemo, ComprobacionEmpresaDemo, ResumenEmpresaDemo } from "./demo-qa/receta";
import {
  COMO_DESBLOQUEAR_DEV,
  lineaDeError,
  lineasDelResumen,
  PREFIJO,
  problemasDeComprobacion,
  rastroDelError,
} from "./demo-qa/salida";

// SL-43 (design §1.1 y §10; R1, R2, R25, R29–R33) — LA DEMO DE QA: borra las empresas demo y crea
// dos nuevas, A y B, por los servicios reales.
//
//   tsx scripts/demo-qa.ts --build   paso del build, entre `migrate-deploy.ts` y `next build`
//   pnpm demo:qa                     a mano: local y tests
//
// Pasos, en este orden; uno que falla corta los siguientes:
//   1. solo en `--build`: `decidirDemo`. Omitida → una línea y 0, SIN abrir ninguna conexión (R30);
//   2. la guardia sin conexión (producción, mismo proyecto, contraseña): R2, R4, R25;
//   3. conexión del dueño, candado (R32) y marca de QA de la base (R3);
//   4. slugs (R10); 5. borrado (R7–R9); 6. A y B a la vez (R11–R24);
//   7. comprobación final y resumen sin secretos (R5, R26).
// El tope de 15 min envuelve los pasos 3 a 7 (R33).
//
// La orquestación se exporta como `ejecutarDemo` con sus efectos inyectables, como
// `ejecutarPasoDeBaseDeDatos` de `migrate-deploy.ts`: así «omitida sin conectar» o «el fallo tumba
// el build» se afirman con un test, no leyendo este archivo.

/** Tope duro de la demo (design §10.4). El objetivo son 5 min; 15 queda lejos de los 45 de Vercel. */
export const TOPE_MS = 15 * 60 * 1000;

/**
 * Conexiones del cliente de la app (`DB_POOL_MAX`) en el proceso de la demo. El build de QA va contra
 * una base a ~90 ms por ida y vuelta: A y B, y sus tramos, van a la vez, y con el pool de la app por
 * defecto (3) harían cola. Solo en este proceso: el de la app no lo ve.
 */
export const CONEXIONES_DE_LA_APP = 12;
/** Conexiones del lector (el dueño de la receta): sus consultas son de una ida y vuelta. */
const CONEXIONES_DEL_LECTOR = 4;

/**
 * Tiempos de transacción de los clientes de la demo (el de la app, por `DB_TX_*`, y el dueño y el
 * lector). Los de Prisma por defecto son 2 s esperando conexión (`maxWait`) y 5 s de vida (`timeout`):
 * con 160 ms por ida y vuelta (QA desde fuera de Vercel) la carga masiva de la tienda con bodega, una
 * transacción de 28 consultas, tardó 5,3 s y cayó con P2028 (medido en local con latencia simulada).
 * La transacción más larga de la receta tarda ~6 s a 160 ms: 60 s le dejan diez veces de margen, y
 * una que se cuelga de verdad la sigue cortando el tope de la demo (R33). Solo en este proceso.
 */
export const TRANSACCION_DE_LA_DEMO = { maxWait: 30_000, timeout: 60_000 } as const;

/** Las empresas que crea la demo, a la vez (cada una en su `crearEmpresa`). */
export const CLAVES_DEMO = ["A", "B"] as const;

/** Lo que tarda como mucho, una vez vencido el tope, soltar el candado y cerrar las conexiones. */
const ESPERA_DE_LIMPIEZA_MS = 10_000;

/** Lo único que la demo lee del entorno. Tipado aparte para que un test construya uno determinista. */
export interface EntornoDemoQa {
  VERCEL_ENV?: string;
  MIGRATE_ON_PREVIEW?: string;
  DEMO_ON_PREVIEW?: string;
  DIRECT_URL?: string;
  DATABASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  DEMO_QA_CONTRASENA?: string;
}

/** La conexión única del dueño, el lector de la receta y el cierre de todo lo que la demo abrió. */
export interface ConexionDemo {
  /** Una sola conexión: lleva el candado (de sesión) y el borrado. */
  dueno: PrismaClient;
  /**
   * El dueño con varias conexiones, para lo que hacen A y B a la vez: leer lo que dejan los servicios
   * y las escrituras de D5.3. En la conexión única del candado, sus lecturas harían cola.
   */
  lector: PrismaClient;
  /** `$disconnect` del dueño, del lector y del cliente de la app. No lanza. */
  cerrar(): Promise<void>;
}

/**
 * Los pasos con base de datos. Los reales se cargan con `import()` cuando ya toca correr: un build
 * que omite la demo no carga la receta ni la app. Un test inyecta dobles.
 */
export interface PasosDemo {
  comprobarMarca(dueno: PrismaClient): Promise<ResultadoMarca>;
  /** R10: lanza si una empresa real usa un slug de la demo. */
  comprobarSlugs(dueno: PrismaClient): Promise<void>;
  /** `lector` solo lee (las rutas de Storage); el borrado de filas va por `dueno`. */
  borrar(dueno: PrismaClient, lector?: PrismaClient): Promise<ResultadoBorrado>;
  crearEmpresa(dueno: PrismaClient, clave: ClaveEmpresaDemo, contrasena: string): Promise<ResumenEmpresaDemo>;
  comprobarEmpresa(
    dueno: PrismaClient,
    organizacionId: string,
    estadosPorDecision: readonly string[],
  ): Promise<ComprobacionEmpresaDemo>;
  empresasDemo(dueno: PrismaClient): Promise<string[]>;
  /** El valor de `NOVEDAD_INTERNA_CON_CORTE_DE_MANANA` de la receta, para que la salida lo diga. */
  novedadInternaConCorteDeManana: boolean;
}

export interface SalidaDemo {
  log(linea: string): void;
  error(linea: string): void;
}

export interface EfectosDemo {
  /** `["--build"]` en el build; vacío a mano. */
  argumentos: readonly string[];
  env: EntornoDemoQa;
  /** Abre el cliente dueño (`max: 1`) sobre la URL del dueño. Un test lo espía: R2, R4, R25, R30. */
  conectar(env: EntornoDemoQa): Promise<ConexionDemo>;
  cargarPasos(): Promise<PasosDemo>;
  candado: CandadoDemo;
  salida: SalidaDemo;
  /** Fija el código de salida. En producción, `process.exitCode`: stdout y stderr terminan de escribirse. */
  salir(codigo: 0 | 1): void;
  /** Reloj en ms, para las duraciones. */
  ahora(): number;
  esperar(ms: number): Promise<void>;
  /** Arma el tope (R33): `vencido` se resuelve al cumplirse `ms`. */
  armarTope(ms: number): { vencido: Promise<void>; desarmar(): void };
  topeMs: number;
}

export interface ResultadoDemo {
  codigo: 0 | 1;
  /** Venció el tope: queda trabajo colgado y el entrypoint mata el proceso. */
  topeVencido: boolean;
}

/** Un error de la comprobación que ya trae su texto, sin datos (estados, tipos, recuentos). */
class FalloDeComprobacion extends Error {
  constructor(texto: string) {
    super(`${PREFIJO} ${texto}`);
    this.name = "FalloDeComprobacion";
  }
}

/** La URL del dueño: `DIRECT_URL`, o en local `DATABASE_URL` (la guardia ya exigió eso en remoto). */
function urlDelDueno(env: EntornoDemoQa): string | undefined {
  return env.DIRECT_URL?.trim() ? env.DIRECT_URL : env.DATABASE_URL;
}

/**
 * Los pasos reales de la demo. Exportados para que el test los envuelva (cada paso que escribe
 * usuarios y empresas, bajo el lock de escritura de los tests) sin copiarlos.
 */
export async function cargarPasosReales(): Promise<PasosDemo> {
  const borrar = await import("./demo-qa/borrar");
  const receta = await import("./demo-qa/receta");
  return {
    comprobarMarca: (dueno) => comprobarMarcaDeQa(dueno),
    comprobarSlugs: (dueno) => borrar.comprobarSlugs(dueno),
    borrar: (dueno, lector) => borrar.borrarEmpresasDemo(dueno, { lector }),
    crearEmpresa: (dueno, clave, contrasena) => receta.crearEmpresaDemo({ dueno }, clave, { contrasena }),
    comprobarEmpresa: (dueno, organizacionId, estadosPorDecision) =>
      receta.comprobarEmpresaDemo({ dueno }, organizacionId, { estadosPorDecision }),
    empresasDemo: (dueno) => borrar.empresasDemo(dueno),
    novedadInternaConCorteDeManana: receta.NOVEDAD_INTERNA_CON_CORTE_DE_MANANA,
  };
}

/**
 * La conexión real de la demo: el dueño (una conexión, el candado), el lector y los ajustes del cliente
 * de la app para este proceso (pool y tiempos de transacción). Exportada para que un test compruebe
 * esos ajustes sin abrir ninguna conexión: Prisma no conecta hasta la primera consulta.
 */
export async function conectarDemo(env: EntornoDemoQa): Promise<ConexionDemo> {
  // El cliente de la app (`getPrismaClient`) lee DATABASE_URL. En local puede faltar y la guardia
  // lo admite: se cae a la del dueño, como la siembra de `migrate-deploy.ts`.
  if (!process.env.DATABASE_URL?.trim() && env.DIRECT_URL) process.env.DATABASE_URL = env.DIRECT_URL;
  // Antes del primer `getPrismaClient()`: el pool y los tiempos de transacción se fijan al construirse.
  process.env.DB_POOL_MAX = String(CONEXIONES_DE_LA_APP);
  const { ENV_TX_MAX_WAIT_MS, ENV_TX_TIMEOUT_MS } = await import("@/lib/db/prisma-client");
  process.env[ENV_TX_MAX_WAIT_MS] = String(TRANSACCION_DE_LA_DEMO.maxWait);
  process.env[ENV_TX_TIMEOUT_MS] = String(TRANSACCION_DE_LA_DEMO.timeout);
  const dueno = new PrismaClient({
    transactionOptions: TRANSACCION_DE_LA_DEMO,
    adapter: new PrismaPg({
      connectionString: urlDelDueno(env),
      // Una sola conexión: el candado es de sesión y el borrado corre en ella (design §4.2).
      max: 1,
      // 0 = nunca se cierra por ociosa. Si el pool la cerrara a mitad de la receta, el
      // candado se soltaría en silencio y otro build podría entrar.
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 30_000,
    }),
  });
  const lector = new PrismaClient({
    transactionOptions: TRANSACCION_DE_LA_DEMO,
    adapter: conConsultasEnSeriePorTransaccion(
      new PrismaPg({ connectionString: urlDelDueno(env), max: CONEXIONES_DEL_LECTOR, connectionTimeoutMillis: 30_000 }),
    ),
  });
  return {
    dueno,
    lector,
    cerrar: async () => {
      const { getPrismaClient } = await import("@/lib/db/prisma-client");
      await Promise.allSettled([dueno.$disconnect(), lector.$disconnect(), getPrismaClient().$disconnect()]);
    },
  };
}

function efectosReales(): EfectosDemo {
  return {
    argumentos: process.argv.slice(2),
    // Explícito y no `process.env` entero: deja a la vista lo que la demo lee.
    env: {
      VERCEL_ENV: process.env.VERCEL_ENV,
      MIGRATE_ON_PREVIEW: process.env.MIGRATE_ON_PREVIEW,
      DEMO_ON_PREVIEW: process.env.DEMO_ON_PREVIEW,
      DIRECT_URL: process.env.DIRECT_URL,
      DATABASE_URL: process.env.DATABASE_URL,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      DEMO_QA_CONTRASENA: process.env.DEMO_QA_CONTRASENA,
    },
    conectar: conectarDemo,
    cargarPasos: cargarPasosReales,
    candado: CANDADO_DE_POSTGRES,
    salida: { log: (l) => console.log(l), error: (l) => console.error(l) },
    salir: (codigo) => {
      process.exitCode = codigo;
    },
    ahora: () => Date.now(),
    esperar: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
    armarTope: (ms) => {
      let temporizador: NodeJS.Timeout | undefined;
      const vencido = new Promise<void>((resolver) => {
        temporizador = setTimeout(resolver, ms);
      });
      return { vencido, desarmar: () => clearTimeout(temporizador) };
    },
    topeMs: TOPE_MS,
  };
}

/** Una promesa que nunca tarda más de `ms`: la limpieza tras el tope no puede colgar el build. */
async function conLimite(efectos: EfectosDemo, ms: number, trabajo: Promise<unknown>): Promise<void> {
  await Promise.race([trabajo.catch(() => undefined), efectos.esperar(ms)]);
}

/** Pasos 3 a 7, ya con la conexión abierta. Lanza ante cualquier fallo. */
async function pasosConConexion(
  efectos: EfectosDemo,
  conexion: ConexionDemo,
  contrasena: string,
  cancelado: () => boolean,
  marcarCandado: (tomado: boolean) => void,
): Promise<void> {
  const { salida } = efectos;
  const { dueno } = conexion;
  const inicio = efectos.ahora();

  const tomado = await efectos.candado.tomar(dueno, {
    esperar: efectos.esperar,
    avisar: salida.log,
    cancelado,
  });
  marcarCandado(tomado);
  if (!tomado) return; // el tope venció esperando: lo dice quien lo armó

  const pasos = await efectos.cargarPasos();

  // 3. La marca de QA, lo primero con la conexión abierta y antes de leer nada de negocio (R3).
  const marca = await pasos.comprobarMarca(dueno);
  if (!marca.ok) throw new FalloDeComprobacion(`la base no es la de QA: ${marca.motivo}. No se escribió nada.`);

  // 4. Una empresa real con un slug demo para todo antes de borrar (R10).
  await pasos.comprobarSlugs(dueno);

  // 5. Storage y después la base, de las empresas demo anteriores (R7–R9).
  salida.log(`${PREFIJO} borrando las empresas demo anteriores…`);
  const borrado = await enPaso("borrado", () => pasos.borrar(dueno, conexion.lector));

  // 6. A y B a la vez, cada una por su lado: el candado es de la ejecución, no de la empresa. Si una
  //    falla, se espera a la otra antes de seguir: nada queda escribiendo mientras se cierran las
  //    conexiones. Un tipo de job que nadie esperaba corta aquí (R23): la receta ya lo cerró sin
  //    ejecutarlo, pero alguien tiene que decidir qué hace la demo con él.
  salida.log(`${PREFIJO} creando las empresas demo ${CLAVES_DEMO.join(" y ")} a la vez…`);
  const empresas: ResumenEmpresaDemo[] = await enParalelo(
    CLAVES_DEMO.map((clave) => enPaso(`empresa ${clave}`, () => pasos.crearEmpresa(conexion.lector, clave, contrasena))),
  );
  for (const resumen of empresas) {
    if (resumen.tiposNoEsperados.length > 0) {
      throw new FalloDeComprobacion(
        `${resumen.slug} encoló jobs de un tipo no esperado: ${resumen.tiposNoEsperados.join(", ")}. ` +
          "Se cerraron sin ejecutar; añádelos a TIPOS_DE_JOB_ESPERADOS solo si no llaman a un proveedor.",
      );
    }
  }

  // 7. Comprobación final, ya con las dos creadas: la de B no puede haber estropeado la de A.
  for (const e of empresas) {
    const comprobacion = await enPaso(`comprobación final de ${e.slug}`, () =>
      pasos.comprobarEmpresa(conexion.lector, e.organizacionId, e.comprobacion.estadosFaltantesPorDecision),
    );
    const problemas = problemasDeComprobacion(comprobacion);
    if (problemas.length > 0) throw new FalloDeComprobacion(`${e.slug} no quedó lista: ${problemas.join("; ")}`);
    e.comprobacion = comprobacion;
  }
  const demo = await pasos.empresasDemo(dueno);
  if (demo.length !== empresas.length) {
    throw new FalloDeComprobacion(`quedaron ${demo.length} empresas demo; se esperaban ${empresas.length}`);
  }

  for (const linea of lineasDelResumen({
    borrado,
    empresas,
    duracionTotalMs: efectos.ahora() - inicio,
    novedadInternaConCorteDeManana: pasos.novedadInternaConCorteDeManana,
  })) {
    salida.log(linea);
  }
}

/** La orquestación entera. Fija el código con `salir` y lo devuelve. Ver `EfectosDemo`. */
export async function ejecutarDemo(parciales: Partial<EfectosDemo> = {}): Promise<ResultadoDemo> {
  const efectos: EfectosDemo = { ...efectosReales(), ...parciales };
  const { env, salida } = efectos;
  const enBuild = efectos.argumentos.includes("--build");

  const fallar = (lineas: readonly string[], topeVencido = false): ResultadoDemo => {
    for (const l of lineas) salida.error(l);
    // R31: en el build, `exitCode = 1` corta el `&&` y `next build` no corre. Quien ve el build rojo
    // tiene que saber cómo desbloquear `dev` sin tocar código.
    if (enBuild) salida.error(COMO_DESBLOQUEAR_DEV);
    efectos.salir(1);
    return { codigo: 1, topeVencido };
  };

  // 1. La decisión del build, antes de todo: omitida no abre ninguna conexión (R30).
  if (enBuild) {
    const decision = decidirDemo(env);
    if (!decision.correr) {
      salida.log(`${PREFIJO} OMITIDA — ${decision.motivo}`);
      efectos.salir(0);
      return { codigo: 0, topeVencido: false };
    }
  }

  // 2. La guardia sin conexión (R2, R4, R25). Su motivo nombra variables, nunca valores (R5).
  const guardia = validarEntornoDemo(env as Readonly<Record<string, string | undefined>>);
  if (!guardia.ok) return fallar([`${PREFIJO} NO se corre la demo: ${guardia.motivo}. No se abrió ninguna conexión.`]);
  // La guardia ya exigió una contraseña válida.
  const contrasena = env.DEMO_QA_CONTRASENA as string;

  // 3–7, dentro del tope (R33).
  salida.log(`${PREFIJO} recreando las empresas demo (tope ${Math.round(efectos.topeMs / 60_000)} min)…`);
  let cancelado = false;
  let candadoTomado = false;
  let conexion: ConexionDemo | undefined;
  const tope = efectos.armarTope(efectos.topeMs);

  const trabajo = (async () => {
    conexion = await efectos.conectar(env);
    await pasosConConexion(
      efectos,
      conexion,
      contrasena,
      () => cancelado,
      (t) => {
        candadoTomado = t;
      },
    );
  })();

  let resultado: { tipo: "ok" } | { tipo: "error"; error: unknown } | { tipo: "tope" };
  try {
    resultado = await Promise.race([
      trabajo.then(() => ({ tipo: "ok" as const })),
      tope.vencido.then(() => ({ tipo: "tope" as const })),
    ]);
  } catch (error) {
    resultado = { tipo: "error", error };
  } finally {
    tope.desarmar();
  }

  if (resultado.tipo === "tope") {
    cancelado = true;
    // El trabajo sigue colgado: que su rechazo tardío no salga como «unhandled».
    trabajo.catch(() => undefined);
  }

  // Soltar el candado y cerrar, también en error. Tras el tope, con límite: lo que esté colgado
  // (una base que no responde) no puede colgar también la limpieza. Cerrar la conexión suelta el
  // candado de todas formas: es de sesión.
  const limpiar = async () => {
    if (conexion === undefined) return;
    if (candadoTomado) await efectos.candado.soltar(conexion.dueno);
    await conexion.cerrar();
  };
  if (resultado.tipo === "tope") await conLimite(efectos, ESPERA_DE_LIMPIEZA_MS, limpiar());
  else await limpiar().catch(() => undefined);

  if (resultado.tipo === "tope") {
    return fallar(
      [
        `${PREFIJO} ABORTADA: la demo superó su tope de ${Math.round(efectos.topeMs / 60_000)} min ` +
          `(${candadoTomado ? "a mitad de los pasos" : "esperando el candado de otra ejecución"}). ` +
          "Las empresas demo a medias están marcadas y el siguiente build las borra.",
      ],
      true,
    );
  }
  if (resultado.tipo === "error") return fallar([lineaDeError(resultado.error)]);

  efectos.salir(0);
  return { codigo: 0, topeVencido: false };
}

async function main(): Promise<void> {
  // Como `migrate-deploy.ts`: en Vercel las variables ya están en `process.env`; en local, en `.env`.
  try {
    process.loadEnvFile();
  } catch {
    // sin .env: se usan las variables ya presentes en process.env
  }
  const { topeVencido } = await ejecutarDemo();
  // Tras el tope queda trabajo colgado que mantendría vivo el proceso: se corta aquí.
  if (topeVencido) process.exit(1);
}

// Solo corre cuando este archivo es el entrypoint; un test que lo importa no abre ninguna conexión.
const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  main().catch((error: unknown) => {
    console.error(`${PREFIJO} FALLÓ la demo (${rastroDelError(error)}).`);
    if (process.argv.includes("--build")) console.error(COMO_DESBLOQUEAR_DEV);
    process.exit(1);
  });
}
