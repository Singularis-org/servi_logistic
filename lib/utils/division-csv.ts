// SL-20 (design §6; R24–R27) — valida las filas de un CSV de division y las cruza con lo que ya
// hay en la base. PURA: no lee ni escribe; devuelve los errores por linea o el plan que el
// repositorio escribe en una sola transaccion. Todo o nada: con un error no hay plan.
//
// SLT-46 (design §5; R30–R34): el motor va por PROFUNDIDAD (1..P, P = tipos del pais), con la regla
// de codigo de cada tipo (`validarCodigoDeTipo`). La firma de SL-20 (provincia/canton/distrito y
// regla del pais) sigue como sobrecarga que traduce a P = 3 y de vuelta, para que el service y el
// repositorio de hoy no cambien hasta T4. El algoritmo de cruce (§6 de SL-20) no cambia.

import {
  GEO_NOMBRE_MAX,
  GEO_NOMBRE_MIN,
  NIVELES_GEOGRAFICOS,
  normalizarNombreGeografico,
  type NivelGeografico,
} from "@/lib/types/geografia-nodo";
import {
  columnaCodigoNivel,
  columnaNivel,
  columnasDivision,
  DIVISION_PROFUNDIDADES_OBLIGATORIAS,
  type AltaDePlan,
  type ArbolExistente,
  type CodigoACompletarPorProfundidad,
  type ErrorDeLinea,
  type FilaDivision,
  type FilaDivisionPorNiveles,
  type NodoExistente,
  type NodoExistenteConProfundidad,
  type PlanDivision,
  type PlanDivisionPorProfundidad,
  type RefNodo,
  type ResultadoPlanificacion,
  type ResultadoPlanificacionPorProfundidad,
  type TipoDeDivision,
} from "@/lib/types/division-csv";
import {
  tipoDeNivelDePais,
  validarCodigoDeTipo,
  type ReglaDeCodigoDePais,
} from "@/lib/utils/codigo-geografico";
import { rechazoDeNombreDeEtiqueta } from "@/lib/utils/nombre-imprimible-etiqueta";
import { normalizeName } from "@/lib/utils/normalize";

/** Un nodo tal como lo describe el archivo, ya identificado contra la base. */
interface NodoDelArchivo {
  llave: string;
  profundidad: number;
  nombre: string;
  padre: NodoDelArchivo | null;
  /** El de la base, si el nodo ya existe; `null` si es un alta. */
  existente: NodoExistente | null;
  /** Solo en las altas. */
  clave: string | null;
  codigoDeclarado: string | null;
  lineaCodigo: number | null;
}

// ── Cabecera y filas (R30, R34) ─────────────────────────────────────────────────────────────

/**
 * R30, R34: qué columnas obligatorias faltan en la cabecera (ya normalizada) de un pais de `p`
 * tipos, y un aviso por cada columna que no es del formato (decision 4 de SL-20: se ignora y se
 * dice). Para P = 3 son las mismas columnas y el mismo texto de aviso que SL-20.
 */
export function revisarCabeceraDivision(
  cabecera: readonly string[],
  p: number,
): { faltan: string[]; avisos: string[] } {
  const obligatorias = columnasDivision(p);
  const conocidas = new Set(obligatorias);
  return {
    faltan: obligatorias.filter((c) => !cabecera.includes(c)),
    avisos: cabecera
      .filter((h) => !conocidas.has(h))
      .map((h) => `La columna «${h}» no es del formato y se ignoró.`),
  };
}

/** Las celdas de una fila leida (columna → texto) en la forma por profundidad, P entradas. */
export function filaDeRegistro(
  linea: number,
  registro: Readonly<Record<string, string | undefined>>,
  p: number,
): FilaDivisionPorNiveles {
  return {
    linea,
    niveles: Array.from({ length: p }, (_, i) => ({
      nombre: registro[columnaNivel(i + 1)] ?? "",
      codigo: registro[columnaCodigoNivel(i + 1)] ?? "",
    })),
  };
}

// ── Piezas del cruce ────────────────────────────────────────────────────────────────────────

/** El mismo contrato de nombre que el alta a mano (`crearNodoGeograficoSchema`). */
function motivoDeNombre(nombre: string): string | null {
  if (nombre.length < GEO_NOMBRE_MIN) {
    return `El nombre debe tener al menos ${GEO_NOMBRE_MIN} caracteres.`;
  }
  if (nombre.length > GEO_NOMBRE_MAX) {
    return `El nombre no puede superar los ${GEO_NOMBRE_MAX} caracteres.`;
  }
  return rechazoDeNombreDeEtiqueta(nombre)?.nombre?.[0] ?? null;
}

function indexarPorProfundidad(
  nodos: readonly NodoExistenteConProfundidad[],
  p: number,
  llaveDe: (n: NodoExistente) => string | null,
): Map<string, NodoExistente>[] {
  const indice = Array.from({ length: p }, () => new Map<string, NodoExistente>());
  for (const nodo of nodos) {
    const mapa = indice[nodo.profundidad - 1];
    if (mapa === undefined) continue;
    const llave = llaveDe(nodo);
    // El primero gana: la base ya garantiza unicidad por padre y por codigo dentro del pais.
    if (llave !== null && !mapa.has(llave)) mapa.set(llave, nodo);
  }
  return indice;
}

function llaveDeHijo(padreId: string | null, nombre: string): string {
  return `${padreId ?? ""}|${normalizeName(nombre)}`;
}

function codigoEfectivo(nodo: NodoDelArchivo | null): string | null {
  if (nodo === null) return null;
  return nodo.existente?.codigo ?? nodo.codigoDeclarado;
}

function refDe(nodo: NodoDelArchivo): RefNodo {
  return nodo.existente !== null
    ? { tipo: "existente", id: nodo.existente.id }
    : { tipo: "nuevo", clave: nodo.clave as string };
}

/**
 * Los tipos ordenados por profundidad. Un pais con un hueco o un repetido en sus tipos es un dato
 * roto (las claves `nivel_1..nivel_P` son contiguas por construccion): fallar es mejor que validar
 * codigos con la regla de otra profundidad.
 */
function tiposEnOrden(tipos: readonly TipoDeDivision[]): TipoDeDivision[] {
  const ordenados = [...tipos].sort((a, b) => a.profundidad - b.profundidad);
  ordenados.forEach((t, i) => {
    if (t.profundidad !== i + 1) {
      throw new Error(
        `tipos de nivel del pais no contiguos: profundidades ${ordenados.map((x) => x.profundidad).join(",")}`,
      );
    }
  });
  return ordenados;
}

/** R32: la primera columna llena por debajo de `k`, o `null` si la fila acaba en `k - 1`. */
function primeraColumnaLlenaDesde(fila: FilaDivisionPorNiveles, k: number, p: number): string | null {
  for (let j = k; j <= p; j++) {
    const celda = fila.niveles[j - 1];
    if ((celda?.nombre ?? "").trim() !== "") return columnaNivel(j);
    if ((celda?.codigo ?? "").trim() !== "") return columnaCodigoNivel(j);
  }
  return null;
}

// ── planificarDivision ──────────────────────────────────────────────────────────────────────

/**
 * SLT-46: valida y cruza a P profundidades. `filas` llegan sin cabecera, con su `linea`; `nodos`
 * son los del pais que se carga (con su profundidad); `tipos`, los suyos de 1 a P (R17).
 */
export function planificarDivision(
  filas: readonly FilaDivisionPorNiveles[],
  nodos: readonly NodoExistenteConProfundidad[],
  tipos: readonly TipoDeDivision[],
): ResultadoPlanificacionPorProfundidad;
/**
 * SL-20: la forma por provincia/canton/distrito y regla del pais. Traduce a P = 3 y da el mismo
 * resultado que antes de SLT-46 (R31). Se retira en T4, cuando ningun llamador la use.
 */
export function planificarDivision(
  filas: readonly FilaDivision[],
  arbolActual: ArbolExistente,
  pais: ReglaDeCodigoDePais,
): ResultadoPlanificacion;
export function planificarDivision(
  filas: readonly FilaDivisionPorNiveles[] | readonly FilaDivision[],
  segundo: readonly NodoExistenteConProfundidad[] | ArbolExistente,
  tercero: readonly TipoDeDivision[] | ReglaDeCodigoDePais,
): ResultadoPlanificacionPorProfundidad | ResultadoPlanificacion {
  if (Array.isArray(tercero)) {
    return planificarPorProfundidad(
      filas as readonly FilaDivisionPorNiveles[],
      segundo as readonly NodoExistenteConProfundidad[],
      tercero as readonly TipoDeDivision[],
    );
  }
  return planificarPorNivel(
    filas as readonly FilaDivision[],
    segundo as ArbolExistente,
    tercero as ReglaDeCodigoDePais,
  );
}

function planificarPorProfundidad(
  filas: readonly FilaDivisionPorNiveles[],
  nodosEnBase: readonly NodoExistenteConProfundidad[],
  tiposDelPais: readonly TipoDeDivision[],
): ResultadoPlanificacionPorProfundidad {
  const tipos = tiposEnOrden(tiposDelPais);
  const p = tipos.length;
  const hijosEnBase = indexarPorProfundidad(nodosEnBase, p, (n) => llaveDeHijo(n.padreId, n.nombre));
  const codigosEnBase = indexarPorProfundidad(nodosEnBase, p, (n) => n.codigo);

  const nodos = new Map<string, NodoDelArchivo>();
  const codigosEnArchivo = Array.from({ length: p }, () => new Map<string, NodoDelArchivo>());
  const errores: ErrorDeLinea[] = [];
  let siguienteClave = 1;

  function resolverNodo(k: number, nombre: string, padre: NodoDelArchivo | null): NodoDelArchivo {
    const llave = `${k}|${padre?.llave ?? ""}|${normalizeName(nombre)}`;
    const visto = nodos.get(llave);
    if (visto) return visto;

    // Un padre que es alta no tiene hijos en la base: todo lo que cuelga de el es alta tambien.
    const puedeExistir = padre === null || padre.existente !== null;
    const existente = puedeExistir
      ? (hijosEnBase[k - 1].get(llaveDeHijo(padre?.existente?.id ?? null, nombre)) ?? null)
      : null;
    const nodo: NodoDelArchivo = {
      llave,
      profundidad: k,
      nombre,
      padre,
      existente,
      clave: existente === null ? `${columnaNivel(k)}-${siguienteClave++}` : null,
      codigoDeclarado: null,
      lineaCodigo: null,
    };
    nodos.set(llave, nodo);
    return nodo;
  }

  /** Las contradicciones del codigo, dentro del archivo y contra la base (R26, R27 de SL-20). */
  function declararCodigo(nodo: NodoDelArchivo, codigo: string, linea: number): string | null {
    if (nodo.codigoDeclarado !== null) {
      if (nodo.codigoDeclarado === codigo) return null;
      return `«${nodo.nombre}» ya tiene el código «${nodo.codigoDeclarado}» en la línea ${nodo.lineaCodigo}.`;
    }
    const enArchivo = codigosEnArchivo[nodo.profundidad - 1];
    const duenoEnArchivo = enArchivo.get(codigo);
    if (duenoEnArchivo !== undefined && duenoEnArchivo !== nodo) {
      return `el código «${codigo}» ya es de «${duenoEnArchivo.nombre}» en la línea ${duenoEnArchivo.lineaCodigo}.`;
    }
    const duenoEnBase = codigosEnBase[nodo.profundidad - 1].get(codigo);
    if (duenoEnBase !== undefined && duenoEnBase.id !== nodo.existente?.id) {
      return `el código «${codigo}» ya es de «${duenoEnBase.nombre}».`;
    }
    const codigoActual = nodo.existente?.codigo ?? null;
    if (codigoActual !== null && codigoActual !== codigo) {
      return `«${nodo.nombre}» ya tiene el código «${codigoActual}».`;
    }
    nodo.codigoDeclarado = codigo;
    nodo.lineaCodigo = linea;
    enArchivo.set(codigo, nodo);
    return null;
  }

  for (const fila of filas) {
    let padre: NodoDelArchivo | null = null;
    for (let k = 1; k <= p; k++) {
      const columnaNombre = columnaNivel(k);
      const columnaCodigo = columnaCodigoNivel(k);
      const celda = fila.niveles[k - 1];
      const nombreCrudo = (celda?.nombre ?? "").trim();
      const codigo = (celda?.codigo ?? "").trim();
      const error = (mensaje: string) => errores.push({ linea: fila.linea, mensaje });

      if (nombreCrudo === "") {
        if (codigo !== "") {
          error(`${columnaCodigo}: hay código pero falta ${columnaNombre}.`);
        } else if (k <= DIVISION_PROFUNDIDADES_OBLIGATORIAS) {
          error(`${columnaNombre}: es obligatorio.`);
        } else {
          // R32: un nivel opcional vacio cierra el camino; si la fila sigue mas abajo, colgaria el
          // nodo profundo de un padre que no existe.
          const siguiente = primeraColumnaLlenaDesde(fila, k + 1, p);
          if (siguiente !== null) {
            error(`${columnaNombre}: está vacío pero la fila sigue en ${siguiente}; no se puede saltar un nivel.`);
          }
        }
        break;
      }
      const nombre = normalizarNombreGeografico(nombreCrudo);
      const motivo = motivoDeNombre(nombre);
      if (motivo !== null) {
        error(`${columnaNombre}: ${motivo}`);
        break;
      }
      const nodo = resolverNodo(k, nombre, padre);
      if (codigo !== "") {
        const contradiccion = declararCodigo(nodo, codigo, fila.linea);
        if (contradiccion !== null) {
          error(`${columnaCodigo}: ${contradiccion}`);
          break;
        }
      }
      padre = nodo;
    }
  }

  // La regla del codigo (R17) va en una segunda pasada: el codigo del padre puede declararse en
  // una linea POSTERIOR a la del hijo, y validarlo fila a fila daria un falso «el padre no tiene
  // codigo». Solo se valida lo que se va a escribir: los codigos que ya estan en la base no se tocan.
  for (const nodo of nodos.values()) {
    const codigo = nodo.codigoDeclarado;
    if (codigo === null || nodo.existente?.codigo === codigo) continue;
    const motivo = validarCodigoDeTipo(tipos[nodo.profundidad - 1], codigo, codigoEfectivo(nodo.padre));
    if (motivo !== null) {
      errores.push({
        linea: nodo.lineaCodigo as number,
        mensaje: `${columnaCodigoNivel(nodo.profundidad)}: ${motivo}`,
      });
    }
  }

  if (errores.length > 0) {
    return { errores: [...errores].sort((a, b) => a.linea - b.linea) };
  }
  return { plan: armarPlan(nodos.values(), p) };
}

function armarPlan(nodos: Iterable<NodoDelArchivo>, p: number): PlanDivisionPorProfundidad {
  const altas: Record<number, AltaDePlan[]> = {};
  for (let k = 1; k <= p; k++) altas[k] = [];
  const codigosACompletar: CodigoACompletarPorProfundidad[] = [];
  let existentes = 0;

  // `nodos` conserva el orden de insercion, y un padre siempre se inserta antes que sus hijos.
  for (const nodo of nodos) {
    if (nodo.existente === null) {
      altas[nodo.profundidad].push({
        clave: nodo.clave as string,
        nombre: nodo.nombre,
        codigo: nodo.codigoDeclarado,
        padre: nodo.padre === null ? null : refDe(nodo.padre),
      });
      continue;
    }
    existentes++;
    if (nodo.existente.codigo === null && nodo.codigoDeclarado !== null) {
      codigosACompletar.push({
        profundidad: nodo.profundidad,
        id: nodo.existente.id,
        codigo: nodo.codigoDeclarado,
      });
    }
  }

  const creados: Record<number, number> = {};
  for (let k = 1; k <= p; k++) creados[k] = altas[k].length;
  return {
    altas,
    codigosACompletar,
    resumen: { creados, existentes, codigosCompletados: codigosACompletar.length },
  };
}

// ── La forma de SL-20, traducida (R31) ──────────────────────────────────────────────────────

function nivelDeProfundidad(k: number): NivelGeografico {
  return NIVELES_GEOGRAFICOS[k - 1];
}

/** `nivel_2-7` → `canton-7`: la clave que daba SL-20, para que el plan sea identico al de antes. */
function claveDeSL20(clave: string): string {
  return clave.replace(/^nivel_(\d+)-/, (_, k: string) => `${nivelDeProfundidad(Number(k))}-`);
}

function refDeSL20(ref: RefNodo | null): RefNodo | null {
  if (ref === null || ref.tipo === "existente") return ref;
  return { tipo: "nuevo", clave: claveDeSL20(ref.clave) };
}

function planificarPorNivel(
  filas: readonly FilaDivision[],
  arbolActual: ArbolExistente,
  pais: ReglaDeCodigoDePais,
): ResultadoPlanificacion {
  const tipos = NIVELES_GEOGRAFICOS.map((nivel, i) => ({
    profundidad: i + 1,
    ...tipoDeNivelDePais(pais, nivel),
  }));
  const nodos = NIVELES_GEOGRAFICOS.flatMap((nivel, i) =>
    arbolActual[nivel].map((n) => ({ ...n, profundidad: i + 1 })),
  );
  const filasPorNiveles = filas.map(
    (f): FilaDivisionPorNiveles => ({
      linea: f.linea,
      niveles: [
        { nombre: f.nivel1, codigo: f.codigoNivel1 },
        { nombre: f.nivel2, codigo: f.codigoNivel2 },
        { nombre: f.nivel3, codigo: f.codigoNivel3 },
      ],
    }),
  );

  const r = planificarPorProfundidad(filasPorNiveles, nodos, tipos);
  if ("errores" in r) return r;
  return { plan: planDeSL20(r.plan) };
}

function planDeSL20(plan: PlanDivisionPorProfundidad): PlanDivision {
  const altas = {} as PlanDivision["altas"];
  const creados = {} as PlanDivision["resumen"]["creados"];
  NIVELES_GEOGRAFICOS.forEach((nivel, i) => {
    altas[nivel] = plan.altas[i + 1].map((a) => ({
      ...a,
      clave: claveDeSL20(a.clave),
      padre: refDeSL20(a.padre),
    }));
    creados[nivel] = plan.resumen.creados[i + 1];
  });
  return {
    altas,
    codigosACompletar: plan.codigosACompletar.map((c) => ({
      nivel: nivelDeProfundidad(c.profundidad),
      id: c.id,
      codigo: c.codigo,
    })),
    resumen: { ...plan.resumen, creados },
  };
}
