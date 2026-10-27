import type { ResultadoBorrado } from "./borrar";
import type { ComprobacionEmpresaDemo, ResumenEmpresaDemo } from "./receta";

// SL-43 (design §7; R5, R15, R22, R26) — lo que la demo escribe en el log del build.
//
// Funciones puras que devuelven líneas: el entrypoint decide si van a stdout o a stderr, y un test
// puede afirmar qué dicen sin capturar la consola. Toda línea lleva el prefijo `[demo-qa]`.
//
// NUNCA entra aquí una URL, la clave de Storage, la contraseña de los usuarios demo, un hash ni el
// secreto de una API key (R5). Los resúmenes de la receta no los traen, y estas funciones solo leen
// campos con nombre: perfiles, correos, recuentos y duraciones. Un error sale con su nombre y su
// código, nunca con el mensaje de la base, que puede nombrar el host o un dato (`rastroDelError`).

export const PREFIJO = "[demo-qa]";

/** La salida de emergencia de `design.md > D10.3`: lo que tiene que leer quien ve el build rojo. */
export const COMO_DESBLOQUEAR_DEV =
  `${PREFIJO} el build de QA queda en rojo mientras la demo falle. Para desplegar dev sin la demo, ` +
  "quita DEMO_ON_PREVIEW en Vercel (Preview, rama dev): el siguiente build la omite.";

export interface DatosDelResumen {
  borrado: ResultadoBorrado;
  empresas: readonly ResumenEmpresaDemo[];
  duracionTotalMs: number;
  novedadInternaConCorteDeManana: boolean;
}

function segundos(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function conteos(registro: Readonly<Record<string, number>>): string {
  const partes = Object.entries(registro)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, n]) => `${clave} ${n}`);
  return partes.length === 0 ? "ninguno" : partes.join(", ");
}

/** Suma dos recuentos por tipo. */
function sumar(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Record<string, number> {
  const total: Record<string, number> = { ...a };
  for (const [k, n] of Object.entries(b)) total[k] = (total[k] ?? 0) + n;
  return total;
}

/** La tabla `empresa · perfil · correo` (R26), con columnas alineadas. */
function tablaDeUsuarios(empresas: readonly ResumenEmpresaDemo[]): string[] {
  const filas = empresas.flatMap((e) => e.usuarios.map((u) => [e.slug, u.perfil, u.correo] as const));
  const ancho = [0, 1].map((i) => Math.max(i === 0 ? "empresa".length : "perfil".length, ...filas.map((f) => f[i].length)));
  const linea = (a: string, b: string, c: string) => `${PREFIJO}   ${a.padEnd(ancho[0])} · ${b.padEnd(ancho[1])} · ${c}`;
  return [linea("empresa", "perfil", "correo"), ...filas.map(([a, b, c]) => linea(a, b, c))];
}

/** El resumen de una ejecución que terminó bien (design §7). */
export function lineasDelResumen(datos: DatosDelResumen): string[] {
  const { borrado, empresas } = datos;
  const lineas: string[] = [
    `${PREFIJO} borradas ${borrado.empresas.length} empresa(s) demo anteriores: ` +
      `${borrado.base.filas} filas en ${borrado.base.pasadas} pasada(s), ${borrado.base.usuarios} usuario(s), ` +
      `${borrado.storage.rutas} archivo(s) y ${borrado.storage.temporales} temporal(es) de Storage`,
    `${PREFIJO} usuarios demo (la contraseña es la de DEMO_QA_CONTRASENA; el código de acceso sale en los logs de Vercel):`,
    ...tablaDeUsuarios(empresas),
  ];

  for (const e of empresas) {
    lineas.push(`${PREFIJO} ${e.slug} — órdenes por estado: ${conteos(e.comprobacion.ordenesPorEstado)}`);
    if (e.recortada || e.comprobacion.estadosFaltantesPorDecision.length > 0) {
      const faltan = e.comprobacion.estadosFaltantesPorDecision;
      lineas.push(
        `${PREFIJO} ${e.slug} — ${e.recortada ? "recortada por tiempo de build (D19); " : ""}` +
          `estados sin órdenes por decisión: ${faltan.length === 0 ? "ninguno" : faltan.join(", ")}`,
      );
    }
  }

  const completados = empresas.reduce<Record<string, number>>((t, e) => sumar(t, e.jobsCerrados.completados), {});
  const sinEjecutar = empresas.reduce<Record<string, number>>((t, e) => sumar(t, e.jobsCerrados.sinEjecutar), {});
  lineas.push(`${PREFIJO} jobs cerrados como hechos al ubicar: ${conteos(completados)}`);
  lineas.push(`${PREFIJO} jobs cerrados sin ejecutar (QA no procesa la cola): ${conteos(sinEjecutar)}`);

  if (datos.novedadInternaConCorteDeManana) {
    lineas.push(
      `${PREFIJO} novedad_interna se produce con el corte diario del servicio a reloj de mañana, ` +
        "solo en las empresas demo (NOVEDAD_INTERNA_CON_CORTE_DE_MANANA encendida)",
    );
  }

  lineas.push(
    `${PREFIJO} duración: ${segundos(datos.duracionTotalMs)} en total` +
      empresas.map((e) => `, ${e.slug} ${segundos(e.duracionMs)}`).join(""),
  );
  return lineas;
}

/** Lo que una comprobación final encontró mal (R15, R21, R22, R24). Vacío si la empresa está limpia. */
export function problemasDeComprobacion(c: ComprobacionEmpresaDemo): string[] {
  const problemas: string[] = [];
  if (c.estadosFaltantes.length > 0) problemas.push(`estados sin órdenes: ${c.estadosFaltantes.join(", ")}`);
  if (c.noAsignables > 0) problemas.push(`${c.noAsignables} orden(es) asignables a las que el gate no da asignable`);
  if (Object.keys(c.jobsAbiertos).length > 0) problemas.push(`jobs pendientes: ${conteos(c.jobsAbiertos)}`);
  if (Object.keys(c.tablasConFilas).length > 0) problemas.push(`tablas que debían estar vacías: ${conteos(c.tablasConFilas)}`);
  if (problemas.length === 0 && !c.limpia) problemas.push("ninguna orden en un estado asignable");
  return problemas;
}

/**
 * Nombre y código de un error, sin su mensaje: el de la base o el de Storage pueden llevar el host,
 * la URL o un dato (patrón de `scripts/arranque-superadmin.ts`).
 */
export function rastroDelError(error: unknown): string {
  if (!(error instanceof Error)) return "error desconocido";
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  const codigo = [e.code, e.cause?.code].find((c): c is string => typeof c === "string" && /^[A-Z0-9_]{1,12}$/.test(c));
  const tiempo = codigo === "P2028" ? tiempoVencido(error) : undefined;
  return `${error.name}${codigo === undefined ? "" : ` ${codigo}`}${tiempo === undefined ? "" : `, ${tiempo}`}`;
}

/**
 * De un P2028 (error de transacción de Prisma), cuál de sus dos tiempos venció. Se lee del mensaje,
 * que no se imprime: solo se busca en él una de dos frases fijas del runtime de Prisma 7. Medido en
 * el build de QA: sin esto, «P2028» no distingue una base lenta (`timeout`) de un pool lleno (`maxWait`).
 */
export function tiempoVencido(error: Error): string | undefined {
  const mensajes = [error.message, error.cause instanceof Error ? error.cause.message : ""].join("\n");
  if (/Unable to start a transaction in the given time/.test(mensajes)) {
    return "maxWait de la transacción (esperando conexión)";
  }
  if (/cannot be executed on an expired transaction/.test(mensajes)) return "timeout de la transacción";
  return undefined;
}

/**
 * La línea de un error de la demo. Los errores que escribe la propia demo empiezan por `[demo-qa]`
 * y su texto es fijo o lleva solo nombres de tabla, de paso o de estado: se imprimen. Cualquier otro
 * (Prisma, `pg`, Storage, un servicio) sale solo con su rastro.
 */
export function lineaDeError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith(PREFIJO)) {
    // El de un paso (`paso.ts`) ya trae en su texto la ruta y el rastro de la causa.
    if (error.name === "FalloDePaso") return error.message;
    return `${error.message} (${rastroDelError(error)})`;
  }
  return `${PREFIJO} FALLÓ la demo (${rastroDelError(error)}). El detalle no se imprime: puede llevar datos de la base.`;
}
