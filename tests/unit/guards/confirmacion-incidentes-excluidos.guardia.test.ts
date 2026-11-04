import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// GUARDIA DE LA FEATURE 238 (T1.2, R3/R5) — «QUE VUELVE A BODEGA» SE DECLARA EN UN SOLO SITIO.
//
// El riesgo que vigila no es estetico. La exclusion de los `incidente` es una DECISION HUMANA
// FIRMADA (2026-08-19): el paquete perdido, robado o danado no vuelve, se indemniza. Esa decision
// vive en `RETORNA_A_BODEGA` con su comentario y su razon. En el momento en que otro archivo
// escriba su propia lista —`["devuelta","rechazada","reprogramada"]` suelto en un servicio, en un
// componente o en un WHERE—, pasan las dos cosas malas a la vez:
//
//   (a) la decision se puede cambiar en un sitio y no en el otro, y entonces la pantalla pide
//       escanear un conjunto distinto del que el servidor exige cubrir: bodega escanea todo lo
//       que ve y el boton sigue bloqueado, sin decir por que;
//   (b) un `resultado` NUEVO del enum entra en el `Record` (que no compila sin el) pero NO en la
//       copia, que sigue verde para siempre.
//
// Por eso el censo es de LISTA REGISTRADA y no de «no aparezca nunca»: hay UNA coincidencia
// legitima en el arbol —`RESULTADOS_QUE_CUENTAN_COMO_INTENTO` (215)— cuyos tres valores son los
// mismos POR CASUALIDAD y cuya regla es OTRA. Registrarla con su motivo es lo que impide que
// alguien la confunda con esta y «reuse» la equivocada.
//
// AUTOCOMPROBACION (obligatoria, `docs/verification.md`): el ultimo bloque demuestra que el
// detector se pone rojo ante la lista plantada y que NO ladra ante la lista de los cinco valores
// del enum. Una guardia que no se sabe romper no protege nada.

const RAIZ = path.resolve(__dirname, "../../..");

/** El modulo que ES la regla. Todo lo demas la importa de aqui. */
const PUNTO_UNICO = "lib/types/gestion-retorno.ts";

/**
 * Donde SI puede aparecer una lista con esos tres valores, con el motivo. Cualquier archivo
 * fuera de esta lista que declare la suya es un hallazgo: o esta copiando la regla de la 238
 * (y entonces tiene que importar `RESULTADOS_QUE_VUELVEN`), o esta declarando una regla NUEVA
 * que coincide en valores y merece decirlo aqui en voz alta.
 */
const PERMITIDOS: Record<string, string> = {
  [PUNTO_UNICO]: "la regla de la 238: la lista se DERIVA de RETORNA_A_BODEGA",
  // COINCIDENCIA, NO COPIA. `RESULTADOS_QUE_CUENTAN_COMO_INTENTO` (feature 215) responde a otra
  // pregunta —«¿esta visita cuenta como intento de entrega?»— y su lista blanca se decide por
  // motivos propios (adelantar el escalado del SLA cuesta dinero mal cobrado). Que hoy coincida
  // en los tres valores es casualidad: si manana un resultado nuevo contara como intento pero no
  // volviera a bodega, las dos listas tendrian que divergir. NO se fusionan.
  "lib/types/orden-historial.ts":
    "RESULTADOS_QUE_CUENTAN_COMO_INTENTO (215): OTRA regla que coincide en valores",
};

/** Arboles de PRODUCCION que se recorren. `tests/` queda fuera: un test PUEDE nombrarlos. */
const ARBOLES = ["lib", "app", "components", "hooks"];

function* archivos(dir: string): Generator<string> {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entradas) {
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      yield* archivos(completo);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      yield completo;
    }
  }
}

function relativo(absoluto: string): string {
  return path.relative(RAIZ, absoluto).split(path.sep).join("/");
}

/**
 * ¿Este codigo declara SU PROPIA lista de «lo que vuelve a bodega»?
 *
 * Se busca un literal entre corchetes que nombre los TRES retornables y NO nombre `entregada` ni
 * `incidente`. Las dos exclusiones son las que separan una COPIA DE LA REGLA de una enumeracion
 * de los cinco valores del enum (que es legitima y aparece en varios sitios): lo que hace
 * peligrosa a la copia es justamente que decide, en silencio, que los incidentes quedan fuera.
 *
 * Se escribe EN UN ARCHIVO DE TEST y nunca por `node -e`: alli el `\b` de un regex llega como
 * backspace y el censo miente en verde.
 */
export function declaraSuPropiaLista(fuente: string): boolean {
  for (const literal of fuente.match(/\[[^\][]{0,400}\]/g) ?? []) {
    if (
      literal.includes("novedad") &&
      literal.includes("devolucion_a_origen_por_rechazo") &&
      literal.includes("reprogramado") &&
      !literal.includes("entregado") &&
      !literal.includes("incidente")
    ) {
      return true;
    }
  }
  return false;
}

const declaran = new Set<string>();
for (const arbol of ARBOLES) {
  for (const archivo of archivos(path.join(RAIZ, arbol))) {
    if (declaraSuPropiaLista(readFileSync(archivo, "utf8"))) declaran.add(relativo(archivo));
  }
}

describe("Feature 238 (R3/R5) — «lo que vuelve a bodega» se declara UNA sola vez", () => {
  it("AUTOCOMPROBACION del censo: encuentra al menos el punto unico", () => {
    // Sin esto, un recorrido roto (arbol mal resuelto, extension mal filtrada) daria cero
    // hallazgos y la guardia pasaria en verde sin haber mirado un solo archivo.
    expect(declaran.has(PUNTO_UNICO)).toBe(true);
  });

  it("ningun archivo de produccion fuera del registro declara su propia lista", () => {
    const intrusos = [...declaran].filter((r) => !(r in PERMITIDOS)).sort();
    expect(
      intrusos,
      "Estos archivos declaran su propia lista de resultados que vuelven a bodega.\n" +
        "Importa `RESULTADOS_QUE_VUELVEN` de `lib/types/gestion-retorno.ts`: una segunda copia\n" +
        "puede excluir los incidentes por su cuenta, y esa exclusion es una decision FIRMADA que\n" +
        "vive en UN sitio. Si de verdad es otra regla, registrala arriba con su motivo.",
    ).toEqual([]);
  });

  it("el registro no tiene entradas muertas", () => {
    // Un registro que sobrevive al archivo que describia deja de proteger nada y empieza a
    // mentir sobre el estado del arbol.
    const muertas = Object.keys(PERMITIDOS)
      .filter((r) => !declaran.has(r))
      .sort();
    expect(muertas).toEqual([]);
  });

  it("R5: el punto unico conserva la red de compilacion (`satisfies Record<...>`)", () => {
    // Sin el `satisfies` el mapa deja de ser exhaustivo: un sexto resultado del enum entraria
    // como `undefined` -> falsy -> excluido del bloqueo EN SILENCIO. La red no se ve en ningun
    // test de runtime, asi que se vigila su presencia aqui.
    const fuente = readFileSync(path.join(RAIZ, PUNTO_UNICO), "utf8");
    expect(fuente).toMatch(/as const satisfies Record<GestionResultado, boolean>/);
  });
});

describe("Feature 238 — AUTOCOMPROBACION: el detector se sabe romper", () => {
  it("se pone ROJO ante la lista plantada en otro archivo", () => {
    expect(declaraSuPropiaLista(`const VUELVEN = ["novedad", "devolucion_a_origen_por_rechazo", "reprogramado"];`)).toBe(
      true,
    );
    // Y en las formas que de verdad aparecerian: multilinea, con `as const`, o dentro de un WHERE.
    expect(
      declaraSuPropiaLista(`
        const RETORNABLES = [
          "novedad",
          "devolucion_a_origen_por_rechazo",
          "reprogramado",
        ] as const;
      `),
    ).toBe(true);
    expect(
      declaraSuPropiaLista(
        `where: { cierreId, resultado: { in: ["novedad", "devolucion_a_origen_por_rechazo", "reprogramado"] } },`,
      ),
    ).toBe(true);
  });

  it("NO ladra ante una enumeracion de los CINCO valores del enum", () => {
    // Eso no es una copia de la regla: no decide nada sobre los incidentes, los nombra.
    expect(
      declaraSuPropiaLista(
        `const TODOS = ["entregado", "reprogramado", "novedad", "devolucion_a_origen_por_rechazo", "incidente"];`,
      ),
    ).toBe(false);
  });

  it("NO ladra ante un archivo que IMPORTA la regla en vez de copiarla", () => {
    expect(
      declaraSuPropiaLista(`
        import { RESULTADOS_QUE_VUELVEN } from "@/lib/types/gestion-retorno";
        where: { resultado: { in: [...RESULTADOS_QUE_VUELVEN] } },
      `),
    ).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FICHA 451 / SLT-72 (T1.3, R4) — EL SEGUNDO EJE: «que ORIGEN de paquete vuelve» tambien se
// declara en UN solo sitio.
//
// Desde la 451 el punto unico cubre dos origenes —la gestion y la orden BARRIDA sin gestionar— con
// `RETORNO_POR_ORIGEN`. El riesgo es el mismo de arriba aplicado al eje nuevo: que un servicio, un
// componente o un WHERE decida por su cuenta si la barrida vuelve (`barrida: true`, un
// `origen === "barrida" ? ...` suelto) y la pantalla pida un conjunto distinto del que el servidor
// exige. El detector busca la palabra `barrida` (como literal o como clave) con un IDENTIFICADOR
// de «vuelve/retorna/retorno» declarado, asignado o llamado cerca. Los usos legitimos de la regla
// —llamar a `vuelveABodegaElPaquete(...)` o leer `RETORNO_POR_ORIGEN.barrida`— se neutralizan
// antes, porque CONSULTAN la regla en vez de escribir otra.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Solo el punto unico puede declarar la regla de origen. Sin coincidencias registradas: no hay ninguna. */
const PERMITIDOS_ORIGEN: Record<string, string> = {
  [PUNTO_UNICO]: "la regla de la 451: RETORNO_POR_ORIGEN",
};

function quitarComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/**
 * ¿Este codigo declara SU PROPIA regla de «el paquete barrido vuelve / no vuelve»?
 *
 * Escrito EN UN ARCHIVO DE TEST, nunca por `node -e` (el `\b` llega como backspace alli).
 */
export function declaraSuPropiaReglaDeOrigen(fuente: string): boolean {
  const codigo = quitarComentarios(fuente)
    .replace(/vuelveABodegaElPaquete\s*\(/g, "(")
    .replace(/RETORNO_POR_ORIGEN\.(?:barrida|gestion)/g, "");
  const identificadorDeRegla = /[A-Za-z_]*(?:vuelve|retorna(?!ble)|retorno)[A-Za-z_]*\s*(?:=(?!=)|:|\()/i;
  for (const m of codigo.matchAll(/["'`]barrida["'`]|\bbarrida\s*:/g)) {
    const i = m.index ?? 0;
    const ventana = codigo.slice(Math.max(0, i - 120), i + 120);
    if (identificadorDeRegla.test(ventana)) return true;
  }
  return false;
}

const declaranOrigen = new Set<string>();
for (const arbol of ARBOLES) {
  for (const archivo of archivos(path.join(RAIZ, arbol))) {
    if (declaraSuPropiaReglaDeOrigen(readFileSync(archivo, "utf8"))) declaranOrigen.add(relativo(archivo));
  }
}

describe("Ficha 451 (R4) — «que ORIGEN vuelve a bodega» se declara UNA sola vez", () => {
  it("AUTOCOMPROBACION del censo: encuentra al menos el punto unico", () => {
    expect(declaranOrigen.has(PUNTO_UNICO)).toBe(true);
  });

  it("ningun archivo de produccion fuera del punto unico declara su propia regla de origen", () => {
    const intrusos = [...declaranOrigen].filter((r) => !(r in PERMITIDOS_ORIGEN)).sort();
    expect(
      intrusos,
      "Estos archivos deciden por su cuenta si una orden barrida vuelve a bodega.\n" +
        "Usa `vuelveABodegaElPaquete` / `RETORNO_POR_ORIGEN` de `lib/types/gestion-retorno.ts`:\n" +
        "una segunda regla puede divergir y dejar la pantalla pidiendo otro conjunto que el servidor.",
    ).toEqual([]);
  });

  it("R3: el punto unico conserva la red del eje nuevo (`satisfies Record<OrigenDelPaquete,`)", () => {
    // Sin el `satisfies`, un tercer origen entraria sin que nadie decidiera si su paquete vuelve.
    const fuente = readFileSync(path.join(RAIZ, PUNTO_UNICO), "utf8");
    expect(fuente).toMatch(/as const satisfies Record<OrigenDelPaquete, "siempre" \| "nunca" \| "segun_resultado">/);
  });
});

describe("Ficha 451 — AUTOCOMPROBACION: el detector de reglas de origen se sabe romper", () => {
  it("se pone ROJO ante una regla de origen plantada", () => {
    expect(
      declaraSuPropiaReglaDeOrigen(`
        const VUELVE_POR_ORIGEN = {
          gestion: "segun_resultado",
          barrida: "siempre",
        };
      `),
    ).toBe(true);
    expect(declaraSuPropiaReglaDeOrigen(`const barridaVuelve = origen === "barrida";`)).toBe(true);
    expect(
      declaraSuPropiaReglaDeOrigen(`function retornaElPaquete(o: string) { return o === "barrida"; }`),
    ).toBe(true);
  });

  it("y ante la tabla del punto unico, aunque se copie en otro archivo", () => {
    expect(
      declaraSuPropiaReglaDeOrigen(`
        export const RETORNO_POR_ORIGEN = { gestion: "segun_resultado", barrida: "siempre" } as const;
      `),
    ).toBe(true);
  });

  it("NO ladra ante quien CONSULTA la regla en vez de escribirla", () => {
    expect(declaraSuPropiaReglaDeOrigen(`const ok = vuelveABodegaElPaquete({ origen: "barrida" });`)).toBe(false);
    expect(declaraSuPropiaReglaDeOrigen(`if (RETORNO_POR_ORIGEN.barrida === "siempre") hacer();`)).toBe(false);
  });

  it("NO ladra ante el discriminante del borde ni ante el servicio que lee las dos fuentes", () => {
    expect(
      declaraSuPropiaReglaDeOrigen(`
        z.object({ origen: z.literal("barrida"), ordenId: z.string().uuid() }),
      `),
    ).toBe(false);
    expect(
      declaraSuPropiaReglaDeOrigen(`
        const gestiones = await this.repo.findGestionesRetornablesDelCierre(cierreId, alcance);
        if (entrada.origen === "barrida") porClave.get(entrada.ordenId);
      `),
    ).toBe(false);
  });

  it("NO ladra ante un texto de pantalla que dice que el paquete vuelve", () => {
    expect(
      declaraSuPropiaReglaDeOrigen(`
        {fila.origen === "barrida" ? <Badge>Sin gestionar</Badge> : null}
        <p>Estos paquetes vuelven a bodega con el mensajero.</p>
      `),
    ).toBe(false);
  });
});
