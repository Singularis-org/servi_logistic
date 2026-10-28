// SL-20 (design §6; R24–R27) — valida las filas de un CSV de division y las cruza con lo que ya
// hay en la base. PURA: no lee ni escribe; devuelve los errores por linea o el plan que el
// repositorio escribe en una sola transaccion. Todo o nada: con un error no hay plan.

import {
  GEO_NOMBRE_MAX,
  GEO_NOMBRE_MIN,
  NIVELES_GEOGRAFICOS,
  normalizarNombreGeografico,
  type NivelGeografico,
} from "@/lib/types/geografia-nodo";
import type {
  AltaDePlan,
  ArbolExistente,
  CodigoACompletar,
  ColumnaDivision,
  ErrorDeLinea,
  FilaDivision,
  NodoExistente,
  PlanDivision,
  RefNodo,
  ResultadoPlanificacion,
} from "@/lib/types/division-csv";
import { validarCodigo, type ReglaDeCodigoDePais } from "@/lib/utils/codigo-geografico";
import { rechazoDeNombreDeEtiqueta } from "@/lib/utils/nombre-imprimible-etiqueta";
import { normalizeName } from "@/lib/utils/normalize";

/** Un nodo tal como lo describe el archivo, ya identificado contra la base. */
interface NodoDelArchivo {
  llave: string;
  nivel: NivelGeografico;
  nombre: string;
  padre: NodoDelArchivo | null;
  /** El de la base, si el nodo ya existe; `null` si es un alta. */
  existente: NodoExistente | null;
  /** Solo en las altas. */
  clave: string | null;
  codigoDeclarado: string | null;
  lineaCodigo: number | null;
}

const COLUMNAS_DEL_NIVEL: Record<NivelGeografico, { nombre: ColumnaDivision; codigo: ColumnaDivision }> = {
  provincia: { nombre: "nivel_1", codigo: "codigo_nivel_1" },
  canton: { nombre: "nivel_2", codigo: "codigo_nivel_2" },
  distrito: { nombre: "nivel_3", codigo: "codigo_nivel_3" },
};

function celdasDeFila(fila: FilaDivision): Record<NivelGeografico, { nombre: string; codigo: string }> {
  return {
    provincia: { nombre: fila.nivel1, codigo: fila.codigoNivel1 },
    canton: { nombre: fila.nivel2, codigo: fila.codigoNivel2 },
    distrito: { nombre: fila.nivel3, codigo: fila.codigoNivel3 },
  };
}

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

function indexarPorNivel(
  arbol: ArbolExistente,
  llaveDe: (n: NodoExistente) => string | null,
): Record<NivelGeografico, Map<string, NodoExistente>> {
  const indice = {} as Record<NivelGeografico, Map<string, NodoExistente>>;
  for (const nivel of NIVELES_GEOGRAFICOS) {
    const mapa = new Map<string, NodoExistente>();
    for (const nodo of arbol[nivel]) {
      const llave = llaveDe(nodo);
      // El primero gana: la base ya garantiza unicidad por padre y por codigo dentro del pais.
      if (llave !== null && !mapa.has(llave)) mapa.set(llave, nodo);
    }
    indice[nivel] = mapa;
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
 * Valida y cruza (§6). `filas` llegan sin cabecera, con su `linea`; `arbolActual` es la geografia
 * del pais que se carga; `pais` aporta la regla de codigo (R17).
 */
export function planificarDivision(
  filas: readonly FilaDivision[],
  arbolActual: ArbolExistente,
  pais: ReglaDeCodigoDePais,
): ResultadoPlanificacion {
  const hijosEnBase = indexarPorNivel(arbolActual, (n) => llaveDeHijo(n.padreId, n.nombre));
  const codigosEnBase = indexarPorNivel(arbolActual, (n) => n.codigo);

  const nodos = new Map<string, NodoDelArchivo>();
  const codigosEnArchivo = {} as Record<NivelGeografico, Map<string, NodoDelArchivo>>;
  for (const nivel of NIVELES_GEOGRAFICOS) codigosEnArchivo[nivel] = new Map();
  const errores: ErrorDeLinea[] = [];
  let siguienteClave = 1;

  function resolverNodo(
    nivel: NivelGeografico,
    nombre: string,
    padre: NodoDelArchivo | null,
  ): NodoDelArchivo {
    const llave = `${nivel}|${padre?.llave ?? ""}|${normalizeName(nombre)}`;
    const visto = nodos.get(llave);
    if (visto) return visto;

    // Un padre que es alta no tiene hijos en la base: todo lo que cuelga de el es alta tambien.
    const puedeExistir = padre === null || padre.existente !== null;
    const existente = puedeExistir
      ? (hijosEnBase[nivel].get(llaveDeHijo(padre?.existente?.id ?? null, nombre)) ?? null)
      : null;
    const nodo: NodoDelArchivo = {
      llave,
      nivel,
      nombre,
      padre,
      existente,
      clave: existente === null ? `${nivel}-${siguienteClave++}` : null,
      codigoDeclarado: null,
      lineaCodigo: null,
    };
    nodos.set(llave, nodo);
    return nodo;
  }

  /** Las contradicciones del codigo, dentro del archivo y contra la base (R26, R27). */
  function declararCodigo(nodo: NodoDelArchivo, codigo: string, linea: number): string | null {
    if (nodo.codigoDeclarado !== null) {
      if (nodo.codigoDeclarado === codigo) return null;
      return `«${nodo.nombre}» ya tiene el código «${nodo.codigoDeclarado}» en la línea ${nodo.lineaCodigo}.`;
    }
    const duenoEnArchivo = codigosEnArchivo[nodo.nivel].get(codigo);
    if (duenoEnArchivo !== undefined && duenoEnArchivo !== nodo) {
      return `el código «${codigo}» ya es de «${duenoEnArchivo.nombre}» en la línea ${duenoEnArchivo.lineaCodigo}.`;
    }
    const duenoEnBase = codigosEnBase[nodo.nivel].get(codigo);
    if (duenoEnBase !== undefined && duenoEnBase.id !== nodo.existente?.id) {
      return `el código «${codigo}» ya es de «${duenoEnBase.nombre}».`;
    }
    const codigoActual = nodo.existente?.codigo ?? null;
    if (codigoActual !== null && codigoActual !== codigo) {
      return `«${nodo.nombre}» ya tiene el código «${codigoActual}».`;
    }
    nodo.codigoDeclarado = codigo;
    nodo.lineaCodigo = linea;
    codigosEnArchivo[nodo.nivel].set(codigo, nodo);
    return null;
  }

  for (const fila of filas) {
    let padre: NodoDelArchivo | null = null;
    const celdas = celdasDeFila(fila);
    for (const nivel of NIVELES_GEOGRAFICOS) {
      const { nombre: columnaNombre, codigo: columnaCodigo } = COLUMNAS_DEL_NIVEL[nivel];
      const nombreCrudo = celdas[nivel].nombre.trim();
      const codigo = celdas[nivel].codigo.trim();
      const error = (mensaje: string) => errores.push({ linea: fila.linea, mensaje });

      if (nombreCrudo === "") {
        if (codigo !== "") error(`${columnaCodigo}: hay código pero falta ${columnaNombre}.`);
        else if (nivel !== "distrito") error(`${columnaNombre}: es obligatorio.`);
        break;
      }
      const nombre = normalizarNombreGeografico(nombreCrudo);
      const motivo = motivoDeNombre(nombre);
      if (motivo !== null) {
        error(`${columnaNombre}: ${motivo}`);
        break;
      }
      const nodo = resolverNodo(nivel, nombre, padre);
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
    const motivo = validarCodigo(pais, nodo.nivel, codigo, codigoEfectivo(nodo.padre));
    if (motivo !== null) {
      errores.push({
        linea: nodo.lineaCodigo as number,
        mensaje: `${COLUMNAS_DEL_NIVEL[nodo.nivel].codigo}: ${motivo}`,
      });
    }
  }

  if (errores.length > 0) {
    return { errores: [...errores].sort((a, b) => a.linea - b.linea) };
  }
  return { plan: armarPlan(nodos.values()) };
}

function armarPlan(nodos: Iterable<NodoDelArchivo>): PlanDivision {
  const altas: Record<NivelGeografico, AltaDePlan[]> = { provincia: [], canton: [], distrito: [] };
  const codigosACompletar: CodigoACompletar[] = [];
  let existentes = 0;

  // `nodos` conserva el orden de insercion, y un padre siempre se inserta antes que sus hijos.
  for (const nodo of nodos) {
    if (nodo.existente === null) {
      altas[nodo.nivel].push({
        clave: nodo.clave as string,
        nombre: nodo.nombre,
        codigo: nodo.codigoDeclarado,
        padre: nodo.padre === null ? null : refDe(nodo.padre),
      });
      continue;
    }
    existentes++;
    if (nodo.existente.codigo === null && nodo.codigoDeclarado !== null) {
      codigosACompletar.push({ nivel: nodo.nivel, id: nodo.existente.id, codigo: nodo.codigoDeclarado });
    }
  }

  return {
    altas,
    codigosACompletar,
    resumen: {
      creados: {
        provincia: altas.provincia.length,
        canton: altas.canton.length,
        distrito: altas.distrito.length,
      },
      existentes,
      codigosCompletados: codigosACompletar.length,
    },
  };
}
