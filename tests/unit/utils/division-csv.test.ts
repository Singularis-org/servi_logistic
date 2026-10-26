import { describe, it, expect } from "vitest";
import { planificarDivision } from "@/lib/utils/division-csv";
import type {
  ArbolExistente,
  ErrorDeLinea,
  FilaDivision,
  NodoExistente,
  PlanDivision,
} from "@/lib/types/division-csv";
import type { ReglaDeCodigoDePais } from "@/lib/utils/codigo-geografico";

// SL-20 T3.3 (design §6; R24–R27) — `planificarDivision` valida un CSV de division y lo cruza con
// lo que ya hay. Todo o nada: con un error no hay plan (R25). Una fila repetida cuenta una vez y dos
// filas contradictorias son invalidas (R27). Un nodo existente no cambia salvo el codigo vacio (R26).

const CON_REGLA: ReglaDeCodigoDePais = {
  digitosCodigoNivel1: 1,
  digitosCodigoNivel2: 3,
  digitosCodigoNivel3: 5,
};
const SIN_REGLA: ReglaDeCodigoDePais = {
  digitosCodigoNivel1: null,
  digitosCodigoNivel2: null,
  digitosCodigoNivel3: null,
};

const VACIO: ArbolExistente = { provincia: [], canton: [], distrito: [] };

/** Una fila con sus seis celdas en el orden de la cabecera. La linea 1 es la cabecera. */
function fila(linea: number, ...c: string[]): FilaDivision {
  const [nivel1 = "", codigoNivel1 = "", nivel2 = "", codigoNivel2 = "", nivel3 = "", codigoNivel3 = ""] = c;
  return { linea, nivel1, codigoNivel1, nivel2, codigoNivel2, nivel3, codigoNivel3 };
}

function nodo(id: string, nombre: string, padreId: string | null, extra: Partial<NodoExistente> = {}): NodoExistente {
  return { id, nombre, padreId, codigo: null, activo: true, ...extra };
}

function plan(r: ReturnType<typeof planificarDivision>): PlanDivision {
  if ("errores" in r) throw new Error(`se esperaba plan y hubo errores: ${JSON.stringify(r.errores)}`);
  return r.plan;
}

function errores(r: ReturnType<typeof planificarDivision>): ErrorDeLinea[] {
  if ("plan" in r) throw new Error("se esperaban errores y hubo plan");
  return r.errores;
}

describe("R24 — un CSV valido sobre un pais vacio produce las altas por nivel", () => {
  it("crea los tres niveles con su codigo y cuenta por nivel; el ejemplo de §6 entra entero", () => {
    const p = plan(
      planificarDivision(
        [
          fila(2, "San José", "1", "San José", "101", "Carmen", "10101"),
          fila(3, "San José", "1", "Escazú", "102", "San Antonio", "10202"),
          fila(4, "Alajuela", "2", "Río Cuarto", "216", "", ""),
        ],
        VACIO,
        CON_REGLA,
      ),
    );

    expect(p.resumen).toEqual({
      creados: { provincia: 2, canton: 3, distrito: 2 },
      existentes: 0,
      codigosCompletados: 0,
    });
    expect(p.altas.provincia.map((a) => [a.nombre, a.codigo, a.padre])).toEqual([
      ["San José", "1", null],
      ["Alajuela", "2", null],
    ]);
    expect(p.codigosACompletar).toEqual([]);
  });

  it("un padre nuevo del mismo archivo es el padre de sus hijos, por su clave", () => {
    const p = plan(planificarDivision([fila(2, "Depto A", "", "Muni B", "", "Barrio C", "")], VACIO, SIN_REGLA));

    const [prov] = p.altas.provincia;
    const [cant] = p.altas.canton;
    const [dist] = p.altas.distrito;
    expect(cant.padre).toEqual({ tipo: "nuevo", clave: prov.clave });
    expect(dist.padre).toEqual({ tipo: "nuevo", clave: cant.clave });
    // Las claves son unicas en todo el plan: el repositorio las traduce a ids.
    expect(new Set([prov.clave, cant.clave, dist.clave]).size).toBe(3);
  });

  it("los nombres se guardan recortados y con espacios colapsados, sin perder mayusculas ni acentos", () => {
    const p = plan(planificarDivision([fila(2, "  San   José ", "", "Escazú", "")], VACIO, SIN_REGLA));
    expect(p.altas.provincia[0].nombre).toBe("San José");
  });
});

describe("nivel_3 vacio — la fila solo asegura los dos primeros niveles", () => {
  it("con nivel_3 y su codigo vacios no se crea distrito ni hay error", () => {
    const p = plan(planificarDivision([fila(2, "Alajuela", "2", "Río Cuarto", "216", "", "")], VACIO, CON_REGLA));
    expect(p.resumen.creados).toEqual({ provincia: 1, canton: 1, distrito: 0 });
  });

  it("un codigo_nivel_3 sin nivel_3 es un error de esa linea", () => {
    const e = errores(planificarDivision([fila(2, "Alajuela", "2", "Río Cuarto", "216", "", "21601")], VACIO, CON_REGLA));
    expect(e).toEqual([{ linea: 2, mensaje: expect.stringMatching(/^codigo_nivel_3: hay código pero falta nivel_3/) }]);
  });
});

describe("R25 — una fila invalida: ningun plan, y cada error con su linea y su motivo", () => {
  it("nivel_1 y nivel_2 son obligatorios; un codigo sin su nombre es un error", () => {
    const e = errores(
      planificarDivision(
        [fila(2, "", "", "Escazú", ""), fila(3, "San José", "", "", ""), fila(4, "", "1", "", "")],
        VACIO,
        SIN_REGLA,
      ),
    );
    expect(e).toEqual([
      { linea: 2, mensaje: "nivel_1: es obligatorio." },
      { linea: 3, mensaje: "nivel_2: es obligatorio." },
      { linea: 4, mensaje: expect.stringMatching(/^codigo_nivel_1: hay código pero falta nivel_1/) },
    ]);
  });

  it("aplica el contrato de nombre del alta a mano: 2–80 caracteres e imprimible en la etiqueta", () => {
    const e = errores(
      planificarDivision(
        [fila(5, "A", "", "Bb", ""), fila(6, "Cc", "", "x".repeat(81), ""), fila(7, "Dd", "", "Ee 🚚", "")],
        VACIO,
        SIN_REGLA,
      ),
    );
    expect(e.map((x) => x.linea)).toEqual([5, 6, 7]);
    expect(e[0].mensaje).toMatch(/^nivel_1: El nombre debe tener al menos 2/);
    expect(e[1].mensaje).toMatch(/^nivel_2: El nombre no puede superar los 80/);
    expect(e[2].mensaje).toMatch(/^nivel_2: /);
  });

  it("aplica R17 con la regla del pais y cita la columna del codigo", () => {
    const e = errores(
      planificarDivision([fila(2, "San José", "1", "Escazú", "202", "San Antonio", "1")], VACIO, CON_REGLA),
    );
    expect(e).toEqual([
      { linea: 2, mensaje: expect.stringMatching(/^codigo_nivel_2: .*empezar por .*«1»/) },
      { linea: 2, mensaje: expect.stringMatching(/^codigo_nivel_3: .*5 dígitos/) },
    ]);
  });

  it("el codigo del padre declarado en una linea POSTERIOR sirve para validar al hijo", () => {
    const p = plan(
      planificarDivision(
        [fila(2, "San José", "", "Escazú", "102"), fila(3, "San José", "1", "Santa Ana", "103")],
        VACIO,
        CON_REGLA,
      ),
    );
    expect(p.altas.canton.map((a) => a.codigo)).toEqual(["102", "103"]);
  });

  it("los errores salen ordenados por linea aunque se detecten en dos pasadas", () => {
    const e = errores(
      planificarDivision(
        [fila(2, "San José", "1", "Escazú", "999"), fila(3, "", "", "", "")],
        VACIO,
        CON_REGLA,
      ),
    );
    expect(e.map((x) => x.linea)).toEqual([2, 3]);
  });

  it("basta un error entre muchas filas buenas para que no haya plan", () => {
    const filas = Array.from({ length: 50 }, (_, i) => fila(i + 2, `Prov ${i}`, "", "Cant", ""));
    filas.push(fila(52, "Prov 0", "", "", ""));
    const r = planificarDivision(filas, VACIO, SIN_REGLA);
    expect("plan" in r).toBe(false);
    expect(errores(r)).toEqual([{ linea: 52, mensaje: "nivel_2: es obligatorio." }]);
  });
});

describe("R27 — filas repetidas y contradictorias", () => {
  it("una fila repetida (o que repite su provincia) se cuenta una sola vez", () => {
    const p = plan(
      planificarDivision(
        [
          fila(2, "San José", "1", "San José", "101", "Carmen", "10101"),
          fila(3, "San José", "1", "San José", "101", "Carmen", "10101"),
          fila(4, "san jose", "1", "SAN  JOSÉ", "101", "Merced", "10102"),
        ],
        VACIO,
        CON_REGLA,
      ),
    );
    expect(p.resumen.creados).toEqual({ provincia: 1, canton: 1, distrito: 2 });
    // Guarda el nombre de la primera aparicion.
    expect(p.altas.provincia[0].nombre).toBe("San José");
  });

  it("mismo nodo con dos codigos distintos: error en la segunda linea citando la primera", () => {
    const e = errores(
      planificarDivision([fila(2, "San José", "1", "Escazú", ""), fila(7, "San José", "2", "Santa Ana", "")], VACIO, CON_REGLA),
    );
    expect(e).toEqual([
      { linea: 7, mensaje: "codigo_nivel_1: «San José» ya tiene el código «1» en la línea 2." },
    ]);
  });

  it("mismo codigo, en el mismo nivel, para dos nodos distintos: error en la segunda linea", () => {
    const e = errores(
      planificarDivision([fila(2, "San José", "1", "Escazú", ""), fila(3, "Alajuela", "1", "Grecia", "")], VACIO, CON_REGLA),
    );
    expect(e).toEqual([
      { linea: 3, mensaje: "codigo_nivel_1: el código «1» ya es de «San José» en la línea 2." },
    ]);
  });

  it("el mismo codigo en niveles distintos no es contradiccion (sin regla de pais)", () => {
    const p = plan(planificarDivision([fila(2, "Norte", "N", "Centro", "N")], VACIO, SIN_REGLA));
    expect(p.resumen.creados).toEqual({ provincia: 1, canton: 1, distrito: 0 });
  });

  it("dos hermanos con el mismo nombre bajo padres distintos son nodos distintos", () => {
    const p = plan(
      planificarDivision([fila(2, "San José", "", "Centro", ""), fila(3, "Alajuela", "", "Centro", "")], VACIO, SIN_REGLA),
    );
    expect(p.resumen.creados.canton).toBe(2);
  });
});

describe("R26 — cruce con la base: existente, codigo completado, retirado", () => {
  const sanJose = nodo("p1", "San José", null, { codigo: "1" });
  const escazu = nodo("c1", "Escazú", "p1", { codigo: null });
  const carmen = nodo("d1", "Carmen", "c1", { codigo: "10201", activo: false });
  const ARBOL: ArbolExistente = { provincia: [sanJose], canton: [escazu], distrito: [carmen] };

  it("un nodo que ya existe (por nombre normalizado bajo el mismo padre) no se crea ni se toca", () => {
    const p = plan(planificarDivision([fila(2, "SAN JOSE", "1", "escazu", "")], ARBOL, CON_REGLA));
    expect(p.altas).toEqual({ provincia: [], canton: [], distrito: [] });
    expect(p.codigosACompletar).toEqual([]);
    expect(p.resumen).toEqual({ creados: { provincia: 0, canton: 0, distrito: 0 }, existentes: 2, codigosCompletados: 0 });
  });

  it("a un nodo existente sin codigo se le completa el de la fila, y solo eso", () => {
    const p = plan(planificarDivision([fila(2, "San José", "1", "Escazú", "102")], ARBOL, CON_REGLA));
    expect(p.codigosACompletar).toEqual([{ nivel: "canton", id: "c1", codigo: "102" }]);
    expect(p.resumen.codigosCompletados).toBe(1);
    expect(p.resumen.existentes).toBe(2);
  });

  it("un nodo existente con otro codigo es un error, no un cambio de codigo", () => {
    const e = errores(planificarDivision([fila(4, "San José", "2", "Escazú", "")], ARBOL, CON_REGLA));
    expect(e).toEqual([{ linea: 4, mensaje: "codigo_nivel_1: «San José» ya tiene el código «1»." }]);
  });

  it("un codigo que en la base ya es de otro nodo es un error que nombra a su dueño", () => {
    const e = errores(planificarDivision([fila(3, "Alajuela", "1", "Grecia", "")], ARBOL, CON_REGLA));
    expect(e).toEqual([{ linea: 3, mensaje: "codigo_nivel_1: el código «1» ya es de «San José»." }]);
  });

  it("un codigo de la base en un nodo de mismo nombre pero otro padre es un error", () => {
    // Sin regla de pais, para que el unico motivo sea el dueño del codigo y no el prefijo.
    const arbol: ArbolExistente = { ...ARBOL, canton: [nodo("c1", "Escazú", "p1", { codigo: "E-1" })] };
    const e = errores(planificarDivision([fila(2, "Alajuela", "", "Escazú", "E-1")], arbol, SIN_REGLA));
    expect(e).toEqual([{ linea: 2, mensaje: "codigo_nivel_2: el código «E-1» ya es de «Escazú»." }]);
  });

  it("un nodo retirado sigue retirado: cuenta en existentes y no entra en el plan", () => {
    const p = plan(
      planificarDivision([fila(2, "San José", "1", "Escazú", "", "Carmen", "")], ARBOL, CON_REGLA),
    );
    expect(p.resumen.existentes).toBe(3);
    expect(p.altas.distrito).toEqual([]);
    // El plan no tiene ningun campo que reactive: solo altas y codigos que completar.
    expect(Object.keys(p).sort()).toEqual(["altas", "codigosACompletar", "resumen"]);
  });

  it("un hijo nuevo bajo un padre existente cuelga de su id", () => {
    const p = plan(
      planificarDivision([fila(2, "San José", "1", "Escazú", "", "San Rafael", "")], ARBOL, CON_REGLA),
    );
    expect(p.altas.distrito).toEqual([
      { clave: expect.any(String), nombre: "San Rafael", codigo: null, padre: { tipo: "existente", id: "c1" } },
    ]);
  });

  it("los codigos que ya estan en la base no se re-validan (solo lo que se va a escribir)", () => {
    // `10201` no empieza por el codigo de Escazú (que no tiene): datos heredados que la carga no toca.
    const p = plan(planificarDivision([fila(2, "San José", "", "Escazú", "", "Carmen", "10201")], ARBOL, CON_REGLA));
    expect(p.resumen.existentes).toBe(3);
  });

  it("la provincia se busca solo entre las provincias del arbol dado (el del pais que se carga)", () => {
    const p = plan(planificarDivision([fila(2, "Heredia", "4", "Barva", "")], ARBOL, CON_REGLA));
    expect(p.resumen.creados.provincia).toBe(1);
  });
});
