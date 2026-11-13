import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

/**
 * 💰 FICHA 393 (2026-09-08) — GUARDIA: **«Para la central» se ve en LAS DOS pantallas donde
 * aparece la tarjeta de un cierre de bodega, y en NINGUNA otra superficie del comprobante.**
 *
 * ── LA RED PERENNE DE R38, Y POR QUÉ HACE FALTA
 * El número que la bodega satélite necesita para operar —lo que le entrega a la central— vive en
 * la TARJETA, porque la satélite **sólo ve la tarjeta**: su módulo de consolidación monta el
 * listado de cierres solicitados sin acción de abrir detalle. Hoy las tres superficies que montan
 * `<CierreBodegaFacturaResumen>` le pasan la fila entera del servidor, así que la cascada les
 * llega por construcción. Lo que esta guardia impide es que **una cuarta nazca sin ella**: si
 * alguien montara la tarjeta con un objeto compuesto a mano, el compilador se lo exigiría campo a
 * campo… y quien lo escriba rellenará `paraLaCentral: "0.00"` para que compile. Un cero inventado
 * en una pantalla de dinero es peor que no tener el número.
 *
 * ── LA OTRA MITAD: R21/R39
 * El comprobante lo comparten CUATRO superficies. La prop `cascadaCentral` es **opcional** —tiene
 * que serlo: las otras tres no tienen cierre de bodega del que hablar— y por eso el typecheck no
 * dice ni una palabra si alguien se la pasa al comprobante del cierre de mensajero o al del
 * `cierre_dia` consolidable. El resultado sería una cascada de bodega en una pantalla que no es
 * de bodega, con los rótulos de otra cosa.
 *
 * ── LO QUE NO AFIRMA
 * Que el VALOR sea correcto. Aquí se comprueba de dónde sale el dato —del servidor, no de un
 * literal—; que ese dato sea la resta correcta lo sostienen `cascadas-cierre-bodega.test.ts` (la
 * aritmética), `cierre-bodega-repository.test.ts` (que las ocho lecturas lo traen igual) y
 * `DineroIdentidadesEnPantalla` (que la resta cierra en pantalla).
 */

const RAIZ = path.resolve(__dirname, "../../..");
const APP = path.join(RAIZ, "app");

/** El archivo que DECLARA los cuatro comprobantes: no es una superficie, se salta por ruta. */
const DECLARANTE = "cierre-factura.tsx";

/** El comprobante que SÍ lleva la cascada. */
const TARJETA_DE_BODEGA = "CierreBodegaFacturaResumen";

/** Los tres que NO pueden recibirla nunca (R21/R39). */
const COMPROBANTES_AJENOS = [
  "CierreFacturaResumen",
  "CierreFacturaResumenPropio",
  "CierreConsolidableFacturaResumen",
] as const;

/** Todos los `.tsx` de `app/**`, recursivo. */
function tsxDeApp(dir: string = APP): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completa = path.join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...tsxDeApp(completa));
    else if (entrada.name.endsWith(".tsx")) salida.push(completa);
  }
  return salida;
}

interface Uso {
  archivo: string;
  componente: string;
  etiqueta: string;
}

/**
 * Los usos de un componente por su etiqueta JSX, con la prosa ya fuera: un ejemplo dentro de un
 * comentario no es una superficie.
 *
 * El nombre se exige COMPLETO —el carácter siguiente no puede ser parte de un identificador—, y
 * no es un detalle: `<CierreFacturaResumen` es prefijo de `<CierreFacturaResumenPropio`, así que
 * un `indexOf` a secas contaría el segundo como el primero y los dos casos de abajo se estarían
 * mintiendo el uno al otro.
 */
function usosDe(componente: string): Uso[] {
  const usos: Uso[] = [];
  for (const archivo of tsxDeApp()) {
    if (path.basename(archivo) === DECLARANTE) continue;
    const fuente = quitarComentarios(readFileSync(archivo, "utf8"));
    usos.push(...usosEnFuente(path.relative(RAIZ, archivo).replaceAll("\\", "/"), fuente, componente));
  }
  return usos;
}

/**
 * SLT-115 «Retirar los componentes de cierre sustituidos»: el extractor, sobre UNA fuente ya sin
 * comentarios. Separado de `usosDe` para poder probarlo con fuentes de muestra ahora que ninguna
 * pantalla de `app/` monta los comprobantes (R409) y el barrido real sale vacío.
 */
function usosEnFuente(archivo: string, fuente: string, componente: string): Uso[] {
  const usos: Uso[] = [];
  {
    let desde = fuente.indexOf(`<${componente}`);
    while (desde !== -1) {
      const siguiente = fuente[desde + componente.length + 1] ?? "";
      let llaves = 0;
      let i = desde;
      for (; i < fuente.length; i += 1) {
        const c = fuente[i];
        if (c === "{") llaves += 1;
        else if (c === "}") llaves -= 1;
        else if (c === ">" && llaves === 0) break;
      }
      if (!/[\w$]/.test(siguiente)) {
        usos.push({
          archivo,
          componente,
          etiqueta: fuente.slice(desde, i + 1),
        });
      }
      desde = fuente.indexOf(`<${componente}`, i);
    }
  }
  return usos;
}

/**
 * El CUERPO de una función exportada, contando llaves desde el `) {` que lo abre.
 *
 * No vale cortar «hasta la siguiente `export function`»: entre dos comprobantes exportados vive
 * `HojaResumen`, que NO se exporta y que sí menciona la prop. Un corte por texto la metería
 * dentro del comprobante anterior y este archivo denunciaría a quien no es.
 */
function cuerpoDeFuncion(fuente: string, nombre: string): string {
  const desde = fuente.indexOf(`export function ${nombre}(`);
  expect(desde, `${nombre} desapareció del comprobante`).toBeGreaterThanOrEqual(0);
  const abre = fuente.indexOf(") {", desde);
  let llaves = 0;
  let visto = false;
  let i = abre === -1 ? desde : abre;
  for (; i < fuente.length; i += 1) {
    const c = fuente[i];
    if (c === "{") {
      llaves += 1;
      visto = true;
    } else if (c === "}") {
      llaves -= 1;
      if (visto && llaves === 0) break;
    }
  }
  return fuente.slice(desde, i + 1);
}

const USOS_BODEGA = usosDe(TARJETA_DE_BODEGA);
const USOS_AJENOS = COMPROBANTES_AJENOS.flatMap((c) => usosDe(c));

describe("393 — autocomprobación: el censo encuentra de verdad las superficies", () => {
  it("el barrido ve `app/**`, y no una carpeta vacía", () => {
    expect(
      tsxDeApp().length,
      "el barrido de `app/**` no encontró apenas archivos: está midiendo un árbol vacío",
    ).toBeGreaterThan(50);
  });

  it("las DOS superficies que montan la tarjeta de bodega están, y son éstas", () => {
    const archivos = [...new Set(USOS_BODEGA.map((u) => u.archivo))].sort();
    expect(
      archivos,
      "o apareció una superficie nueva —y entonces hay que revisarla a mano y añadirla aquí— o " +
        "una de las dos desapareció y esta guardia se quedó vigilando un nombre muerto.",
    ).toEqual([
      // SLT-115 «Retirar los componentes de cierre sustituidos» (R409): las dos listas que la
      // montaban (resueltos de la central, solicitados de la satélite) se borraron; las sustituye
      // `ColaCierres`. Mientras la tarjeta siga declarada en `cierre-factura.tsx`, ninguna pantalla
      // la monta: si una vuelve, aparece aquí y hay que revisarla a mano.
    ]);
  });

  it("y el extractor distingue los cuatro comprobantes, que comparten prefijo", () => {
    // Sin esto, `<CierreFacturaResumenPropio>` contaría como `<CierreFacturaResumen>` y el caso
    // de R21 estaría midiendo otra cosa.
    expect(usosDe("CierreFacturaResumen").every((u) => u.componente === "CierreFacturaResumen")).toBe(
      true,
    );
    // Censo EXPLÍCITO de los ajenos: cada montaje con su componente. Si el extractor confundiera
    // `<CierreFacturaResumenPropio>` con `<CierreFacturaResumen>`, la primera fila saldría con el
    // nombre del otro (o duplicada) y esta lista no cuadraría.
    const ajenos = USOS_AJENOS.map((u) => `${u.archivo} · ${u.componente}`).sort();
    expect(
      ajenos,
      "o un comprobante ajeno se monta en una superficie nueva —revísala a mano y añádela aquí— o " +
        "el extractor está confundiendo dos nombres que comparten prefijo.",
    ).toEqual([
      // SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» (R166): `/cierre-dia` ya no
      // monta `<CierreFacturaResumenPropio>` (lo sustituye `ColaCierres` con rol mensajero). El
      // componente sigue declarado sin montar hasta que lo retire SLT-115; si alguien lo vuelve a
      // montar, su fila reaparece aquí y la guardia lo pide revisar.
      // SLT-115 (R409): el histórico de cierres de mensajero del admin (`CierresAdminHistoricoLista`)
      // se borró; lo sustituye `ColaCierres`. Ya no monta `<CierreFacturaResumen>` ninguna pantalla.
      // SLT-106 «Bodega satélite: A consolidar con la cola única»: `ConsolidacionBodegaModule` ya
      // no monta `<CierreConsolidableFacturaResumen>` (R204: la sustituye `ColaCierres`). El
      // componente sigue declarado sin montar hasta que lo retire SLT-115.
    ]);
    // SLT-137 (R166): el comprobante propio ya no se monta en ninguna pantalla. El extractor
    // sigue sin confundirlo con `<CierreFacturaResumen>`: lo afirma el primer `expect` de este caso.
    const propio = USOS_AJENOS.filter((u) => u.componente === "CierreFacturaResumenPropio");
    expect(propio, "/cierre-dia volvió a montar el comprobante propio del mensajero").toEqual([]);
  });
});

/**
 * SLT-115 «Retirar los componentes de cierre sustituidos» (R409): las comprobaciones de R38 y de
 * R21/R39 como funciones que devuelven los problemas de UN uso. Antes eran `it.each` sobre el
 * barrido; con cero pantallas montando los comprobantes, un `it.each` vacío no registra ningún caso
 * y la regla dejaría de existir sin un rojo. Ahora se afirman sobre el barrido (vacío hoy: verde
 * por la lista de arriba, que exige `[]`) Y sobre fuentes de muestra, que prueban que siguen mordiendo.
 */
function problemasR38(uso: Uso): string[] {
  const { archivo, etiqueta } = uso;
  if (etiqueta.length <= 20) return [`no se pudo aislar la etiqueta de <${TARJETA_DE_BODEGA}> en ${archivo}`];
  if (!etiqueta.includes("cierre=")) {
    return [`${archivo} monta la tarjeta del cierre de bodega SIN pasarle \`cierre\`.`];
  }
  const valor = etiqueta.match(/cierre=\{([^}]*)\}/)?.[1];
  if (!valor) return [`\`cierre\` en ${archivo} no se pasa como expresión`];
  if (!/^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/.test(valor.trim())) {
    return [
      `${archivo} compone el \`cierre\` a mano en vez de pasar la fila del servidor. El ` +
        "compilador exigiría `paraLaCentral` campo a campo, y quien lo escriba pondrá un " +
        "«0.00» para que compile: un cero inventado en una pantalla de dinero es peor que no " +
        "tener el número.",
    ];
  }
  return [];
}

function problemasR21(uso: Uso): string[] {
  return uso.etiqueta.includes("cascadaCentral")
    ? [
        `${uso.archivo} · <${uso.componente}> recibe la cascada del cierre de bodega. La prop es ` +
          "OPCIONAL —tiene que serlo, esas superficies no tienen cierre de bodega del que hablar— así " +
          "que el typecheck no caza este error: pintaría «Para la central» en el comprobante de un mensajero.",
      ]
    : [];
}

const MUESTRA = "app/(app)/muestra/Muestra.tsx";

describe("393 — la cascada a la central llega a la tarjeta de bodega (R38)", () => {
  it("toda pantalla que monte la tarjeta le pasa el `cierre` del servidor, no un literal", () => {
    expect(USOS_BODEGA.flatMap(problemasR38)).toEqual([]);
  });

  it("contraprueba: sobre fuentes de muestra, el extractor la encuentra y la regla muerde", () => {
    const bien = usosEnFuente(MUESTRA, `<CierreBodegaFacturaResumen cierre={fila.cierre} onAbrir={abrir} />`, TARJETA_DE_BODEGA);
    expect(bien).toHaveLength(1);
    expect(bien.flatMap(problemasR38)).toEqual([]);

    const literal = usosEnFuente(
      MUESTRA,
      `<CierreBodegaFacturaResumen cierre={{ ...c, paraLaCentral: "0.00" }} onAbrir={abrir} />`,
      TARJETA_DE_BODEGA,
    );
    expect(literal.flatMap(problemasR38)).toHaveLength(1);

    const sinCierre = usosEnFuente(MUESTRA, `<CierreBodegaFacturaResumen onAbrir={abrir} rotulo={x} />`, TARJETA_DE_BODEGA);
    expect(sinCierre.flatMap(problemasR38)).toHaveLength(1);
  });
});

describe("393 — y NO se cuela en las otras tres superficies (R21/R39)", () => {
  it("ninguna pantalla pasa `cascadaCentral` a un comprobante ajeno", () => {
    expect(USOS_AJENOS.flatMap(problemasR21)).toEqual([]);
  });

  it("contraprueba: el extractor distingue los prefijos y la regla muerde", () => {
    const fuente =
      `<CierreFacturaResumen cierre={c} cascadaCentral={x} />\n` +
      `<CierreFacturaResumenPropio cierre={c} />`;
    const usos = COMPROBANTES_AJENOS.flatMap((c) => usosEnFuente(MUESTRA, fuente, c));
    expect(usos.map((u) => u.componente).sort()).toEqual(["CierreFacturaResumen", "CierreFacturaResumenPropio"]);
    expect(usos.flatMap(problemasR21)).toHaveLength(1);
  });

  it("dentro del archivo que los declara, sólo la tarjeta de bodega pasa la prop", () => {
    const declarante = quitarComentarios(
      readFileSync(path.join(APP, "(app)", "cierres-admin", "_components", DECLARANTE), "utf8"),
    );
    // SIETE menciones, y cada una tiene su sitio (medido el 2026-09-08, con la prosa fuera):
    //   1 · la prop en `HojaResumenProps`
    //   2 · la desestructuración de `HojaResumen`
    //   3 · el `=== undefined` que decide si la columna es «Ajustes» o la cascada
    //   4 · el importe del resultado
    //   5 · el `esMontoNegativo(...)` que enciende la nota del negativo
    //   6 · el `efectivoCubreDescuentos` que enciende la nota del efectivo
    //   7 · el paso desde `CierreBodegaFacturaResumen`
    // Una octava es que alguien la pasó desde otro comprobante. Es una FOTO a propósito: se
    // actualiza a mano, y ese rojo es el momento de mirar dónde está cada una.
    const apariciones = declarante.match(/cascadaCentral/g) ?? [];
    expect(
      apariciones.length,
      "cambió el número de menciones de `cascadaCentral` en el comprobante. Si es un refactor " +
        "legítimo, actualiza este número A MANO después de mirar dónde está cada una.",
    ).toBe(7);

    // Y las otras tres superficies siguen sin mencionarla en su propio cuerpo.
    for (const ajeno of COMPROBANTES_AJENOS) {
      const cuerpo = cuerpoDeFuncion(declarante, ajeno);
      expect(cuerpo.length, `${ajeno} salió cortado a nada`).toBeGreaterThan(200);
      expect(cuerpo, `${ajeno} pasa \`cascadaCentral\``).not.toContain("cascadaCentral");
    }
    // Y la que SÍ la pasa, la pasa: si esto fallara, los tres casos de arriba estarían pasando
    // por vacío —midiendo un archivo donde la prop no existe— en vez de por corrección.
    expect(cuerpoDeFuncion(declarante, TARJETA_DE_BODEGA)).toContain("cascadaCentral");
  });
});
