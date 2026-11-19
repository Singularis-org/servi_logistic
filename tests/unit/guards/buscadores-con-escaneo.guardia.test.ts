import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

/**
 * SLT-160 «Buscar escaneando en los listados» (R609, D1) — GUARDIA: la prop `escaneo` de
 * `BuscadorFiltros` la pasan SOLO los buscadores con guía B1-B8, y los ocho la pasan. B7 y B8
 * comparten montaje (`EstadoCuenta`), así que son siete archivos. `/cierres-admin` (B9) busca por
 * folio, que no se imprime en ningún código: no la lleva.
 *
 * SLT-205 «Guardias rotas: dependencias-declaradas-presentes y buscadores-con-escaneo» (m2 de
 * SLT-194): la guardia daba por buena `escaneo={false}`, que APAGA la cámara. Ahora:
 * - cuenta como escaneo solo `escaneo` suelto o `escaneo={true}`; `escaneo={false}` o cualquier
 *   otra expresión no cuenta (una expresión no se puede probar leyendo el texto);
 * - TODO buscador de `app/` y `components/` escanea, salvo los de la lista explícita
 *   `SIN_ESCANEO`; un buscador nuevo que no esté en ninguna de las dos listas pone esto en rojo;
 * - en los archivos de `CON_ESCANEO`, escanean TODOS sus buscadores, no basta con uno.
 * Un montaje con `buscador={false}` no tiene campo de búsqueda: solo pinta pastillas, y no entra.
 */

const RAIZ = path.resolve(__dirname, "../../..");

const CON_ESCANEO = [
  "app/(app)/ordenes/_components/OrdenesListado.tsx", // B1
  "app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx", // B2
  "app/(app)/novedades/_components/NovedadesFiltrosBarra.tsx", // B3
  "app/(app)/historico/conversaciones/_components/HistoricoFiltrosBar.tsx", // B4
  "app/(app)/historico/acciones/_components/HistorialAccionesFiltrosBar.tsx", // B5
  "app/(app)/wallet/_components/LibroCajaBarra.tsx", // B6
  "components/shared/estado-cuenta/EstadoCuenta.tsx", // B7 y B8
  "app/(app)/novedades/_components/RechazosSlaModule.tsx", // SLT-194 (R949): Rechazos por plazo vencido
];

const CIERRES_ADMIN = "app/(app)/cierres-admin/_components/FiltrosCierresBarra.tsx";

/**
 * SLT-200 «PWA Reparto: buscador, KPI, tarjeta y leyenda del mapa tras Preview», punto 6: Recolección
 * deja de llevar cámara en el buscador (decisión de Carlos, 2026-11-18, «quitar la camarita»). SLT-194
 * (R940) se la había puesto. El único escáner de la pantalla es «Escanear o escribir guía», el que
 * recolecta.
 */
const RECOLECCION = "app/(app)/recoleccion/_components/RecoleccionModule.tsx";

/** Motivo común de los buscadores que nunca llevaron cámara: no están entre B1-B8 de SLT-160. */
const FUERA_DE_B1_B8 = "fuera de los buscadores con guía B1-B8 de SLT-160 (R609, D1)";

/**
 * EXCEPCIONES EXPLÍCITAS: buscadores que van SIN `escaneo`. Añadir uno aquí es una decisión que se
 * escribe con su motivo; la guardia no adivina.
 */
const SIN_ESCANEO: Record<string, string> = {
  [CIERRES_ADMIN]: "B9: busca por folio, que no se imprime en ningún código (SLT-160)",
  [RECOLECCION]: "SLT-200 punto 6: sin cámara en el buscador (decisión de Carlos, 2026-11-18)",
  "app/(app)/_components/FiltrosEntregas.tsx": FUERA_DE_B1_B8,

  "app/(app)/cierre-dia/_components/FiltrosColaPropiaBarra.tsx": FUERA_DE_B1_B8,
  "app/(app)/configuracion/_components/UsuariosModule.tsx": FUERA_DE_B1_B8,
  "app/(app)/mis-asignaciones/_components/RecogerModule.tsx": FUERA_DE_B1_B8,
  "app/(app)/mis-asignaciones/_components/RepartoModule.tsx": FUERA_DE_B1_B8,
  "app/(app)/ranking/_components/RankingModule.tsx": FUERA_DE_B1_B8,
  "app/(app)/wallet/mensajeros/_components/CuentasPorPagarTable.tsx": FUERA_DE_B1_B8,
  "app/(app)/wallet/tiendas/_components/SaldosTiendasTable.tsx": FUERA_DE_B1_B8,
  "components/private/cierres/fila/GestionesCierre.tsx": FUERA_DE_B1_B8,
};

/** Mensaje con el que la guardia se niega a juzgar un montaje con `{...props}` (m1 de la review). */
const CON_SPREAD = "no se puede verificar escaneo con spread";

/**
 * Los nombres con los que la fuente monta `BuscadorFiltros`: el propio y los alias de
 * `import { BuscadorFiltros as X }` (m1 de la review de SLT-205).
 */
function nombresDelBuscador(codigo: string): string[] {
  const nombres = ["BuscadorFiltros"];
  for (const m of codigo.matchAll(/\bBuscadorFiltros\s+as\s+([A-Za-z_$][\w$]*)/g)) nombres.push(m[1]);
  return nombres;
}

/**
 * Índice del cierre de un literal que abre en `desde` (`"`, `'` o `` ` ``). Si no cierra, LANZA:
 * un literal sin cerrar no se resuelve dando vueltas (B2 de la review: bucle infinito).
 */
function finDeLiteral(texto: string, desde: number): number {
  const fin = texto.indexOf(texto[desde], desde + 1);
  if (fin < 0) {
    throw new Error(`literal sin cerrar en la etiqueta: ${texto.slice(desde, desde + 60)}`);
  }
  return fin;
}

/** Índice de la `}` que cierra la `{` de `desde`, saltando los literales de dentro. */
function finDeLlaves(texto: string, desde: number): number {
  let profundidad = 0;
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"' || c === "'" || c === "`") i = finDeLiteral(texto, i);
    else if (c === "{") profundidad++;
    else if (c === "}" && --profundidad === 0) return i;
  }
  throw new Error(`llave sin cerrar en la etiqueta: ${texto.slice(desde, desde + 60)}`);
}

/**
 * Las etiquetas de apertura `<BuscadorFiltros …>` (o de su alias) de una fuente. El `>` de cierre
 * es el primero FUERA de llaves y de literales: `=>` y `title="guia -> tienda"` van dentro.
 */
function aperturasDeBuscador(fuente: string): string[] {
  const codigo = quitarComentarios(fuente);
  const aperturas: string[] = [];
  const marca = new RegExp(`<(?:${nombresDelBuscador(codigo).join("|")})(?![\w$])`, "g");
  let m: RegExpExecArray | null;
  while ((m = marca.exec(codigo)) !== null) {
    let i = m.index + m[0].length;
    for (; i < codigo.length; i++) {
      const c = codigo[i];
      if (c === '"' || c === "'") i = finDeLiteral(codigo, i);
      else if (c === "{") i = finDeLlaves(codigo, i);
      else if (c === ">") break;
    }
    if (i >= codigo.length) throw new Error(`etiqueta sin cerrar: ${codigo.slice(m.index, m.index + 60)}`);
    aperturas.push(codigo.slice(m.index, i + 1));
  }
  return aperturas;
}

/**
 * Las props de primer nivel de una apertura: nombre -> valor crudo (`true` si va suelta, el texto
 * entre llaves, ya recortado, si es `{…}`, el literal si es `"…"`). Un `{...props}` LANZA con
 * `CON_SPREAD`: lo que trae dentro no se ve leyendo el texto.
 */
function propsDeApertura(apertura: string): Map<string, string> {
  const props = new Map<string, string>();
  const cuerpo = apertura.replace(/^<[A-Za-z_$][\w$]*/, "").replace(/\/?>$/, "");
  let i = 0;
  while (i < cuerpo.length) {
    const c = cuerpo[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "{") throw new Error(`${CON_SPREAD}: ${apertura.slice(0, 80)}`);
    const nombre = /^[A-Za-z_$][\w$-]*/.exec(cuerpo.slice(i));
    if (!nombre) throw new Error(`prop ilegible en la etiqueta: ${cuerpo.slice(i, i + 60)}`);
    i += nombre[0].length;
    if (cuerpo[i] !== "=") {
      props.set(nombre[0], "true");
      continue;
    }
    i++;
    if (cuerpo[i] === "{") {
      const fin = finDeLlaves(cuerpo, i);
      props.set(nombre[0], cuerpo.slice(i + 1, fin).trim());
      i = fin + 1;
    } else if (cuerpo[i] === '"' || cuerpo[i] === "'") {
      const fin = finDeLiteral(cuerpo, i);
      props.set(nombre[0], cuerpo.slice(i + 1, fin));
      i = fin + 1;
    } else {
      throw new Error(`valor de prop ilegible en la etiqueta: ${cuerpo.slice(i - 1, i + 60)}`);
    }
  }
  return props;
}

/** ¿El montaje tiene campo de búsqueda? `buscador={false}` solo pinta pastillas. */
function esBuscador(apertura: string): boolean {
  return propsDeApertura(apertura).get("buscador") !== "false";
}

/** ¿El montaje enciende la cámara? Solo `escaneo` suelto o `escaneo={true}`. */
function escanea(apertura: string): boolean {
  return propsDeApertura(apertura).get("escaneo") === "true";
}

/**
 * ¿El montaje deja la cámara APAGADA sin lugar a dudas? Solo si no pasa `escaneo` o pasa el
 * literal `escaneo={false}`. Cualquier otra expresión (`escaneo={x || true}`) no se puede probar
 * leyendo el texto y cuenta como cámara posible (B1 de la review de SLT-205).
 */
function apagado(apertura: string): boolean {
  const valor = propsDeApertura(apertura).get("escaneo");
  return valor === undefined || valor === "false";
}

/** Los montajes con campo de búsqueda de una fuente. */
function buscadores(fuente: string): string[] {
  return aperturasDeBuscador(fuente).filter(esBuscador);
}

/** ¿Algún buscador de la fuente enciende la cámara? */
function pasaEscaneo(fuente: string): boolean {
  return buscadores(fuente).some(escanea);
}

/** ¿TODOS los buscadores de la fuente encienden la cámara? (y hay al menos uno) */
function escaneanTodos(fuente: string): boolean {
  const lista = buscadores(fuente);
  return lista.length > 0 && lista.every(escanea);
}

/** ¿TODOS los buscadores de la fuente dejan la cámara apagada sin lugar a dudas? (y hay al menos uno) */
function ningunoEscanea(fuente: string): boolean {
  const lista = buscadores(fuente);
  return lista.length > 0 && lista.every(apagado);
}

function fuentesTsx(carpeta: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = path.join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...fuentesTsx(ruta));
    else if (ruta.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

const leer = (relativa: string) => readFileSync(path.join(RAIZ, relativa), "utf8");

/** Todos los archivos de `app/` y `components/` con al menos un buscador (relativos, con `/`). */
function archivosConBuscador(): string[] {
  return [...fuentesTsx(path.join(RAIZ, "app")), ...fuentesTsx(path.join(RAIZ, "components"))]
    .filter((ruta) => buscadores(readFileSync(ruta, "utf8")).length > 0)
    .map((ruta) => path.relative(RAIZ, ruta).split(path.sep).join("/"))
    .sort();
}

describe("SLT-160 — guardia: buscadores con `escaneo` (R609)", () => {
  it.each(CON_ESCANEO)("%s monta TODOS sus `BuscadorFiltros` con `escaneo`", (archivo) => {
    const fuente = leer(archivo);
    expect(buscadores(fuente).length).toBeGreaterThan(0);
    expect(escaneanTodos(fuente)).toBe(true);
  });

  it("`/cierres-admin` monta `BuscadorFiltros` sin `escaneo`", () => {
    const fuente = leer(CIERRES_ADMIN);
    expect(ningunoEscanea(fuente)).toBe(true);
  });

  it("SLT-200: `/recoleccion` monta `BuscadorFiltros` sin `escaneo` (sin cámara en el buscador)", () => {
    const fuente = leer(RECOLECCION);
    expect(ningunoEscanea(fuente)).toBe(true);
  });

  it.each(Object.keys(SIN_ESCANEO))("excepción %s: tiene buscador y ninguno escanea", (archivo) => {
    const fuente = leer(archivo);
    expect(buscadores(fuente).length, `${archivo} ya no tiene buscador: sácalo de SIN_ESCANEO`).toBeGreaterThan(0);
    expect(
      ningunoEscanea(fuente),
      `${archivo} pasa «escaneo» distinto de «{false}»: quítalo o pásalo a CON_ESCANEO`,
    ).toBe(true);
  });

  it("SLT-205: todo buscador de `app/` o `components/` escanea, salvo las excepciones explícitas", () => {
    const encontrados = archivosConBuscador();
    // Control positivo: el recorrido ve el inventario completo (8 con cámara + 11 excepciones).
    expect(encontrados.length, "SLT-205: archivos con buscador").toBe(
      CON_ESCANEO.length + Object.keys(SIN_ESCANEO).length,
    );
    const sinCamaraNoDeclarados = encontrados.filter(
      (archivo) => !(archivo in SIN_ESCANEO) && !escaneanTodos(readFileSync(path.join(RAIZ, archivo), "utf8")),
    );
    expect(sinCamaraNoDeclarados).toEqual([]);
    const conCamara = encontrados.filter((archivo) => !ningunoEscanea(readFileSync(path.join(RAIZ, archivo), "utf8")));
    expect(conCamara).toEqual([...CON_ESCANEO].sort());
  });

  // SLT-160 (R772, DC2): el nombre accesible propio de B1 y B2 (B3-B7 ya lo tenían).
  it.each([
    ["app/(app)/ordenes/_components/OrdenesListado.tsx", "Buscar órdenes"],
    ["app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx", "Buscar órdenes de la bodega"],
  ])("R772: %s nombra su campo «%s»", (archivo, nombre) => {
    const aperturas = aperturasDeBuscador(leer(archivo));
    expect(aperturas).toHaveLength(1);
    expect(aperturas[0]).toContain(`label="${nombre}"`);
  });

  it("contraprueba: el detector ve y no ve `escaneo` donde toca", () => {
    const con = `<BuscadorFiltros\n  escaneo\n  onChange={(t) => f(t > 1)}\n/>`;
    const sin = `<BuscadorFiltros\n  onChange={(t) => f({ escaneo: t })}\n/>`;
    const otroComponente = `<Otro escaneo />\n<BuscadorFiltros onChange={f} />`;
    expect(pasaEscaneo(con)).toBe(true);
    expect(pasaEscaneo(sin)).toBe(false);
    expect(pasaEscaneo(otroComponente)).toBe(false);
  });

  // SLT-205 (m2 de SLT-194): `escaneo={false}` apaga la cámara; no puede contar como escaneo.
  it("SLT-205: `escaneo={false}` NO cuenta como escaneo", () => {
    expect(pasaEscaneo(`<BuscadorFiltros\n  escaneo={false}\n  onChange={f}\n/>`)).toBe(false);
    expect(pasaEscaneo(`<BuscadorFiltros escaneo={ false } />`)).toBe(false);
  });

  it("SLT-205: contraprueba de las formas de `escaneo` y del archivo con dos buscadores", () => {
    expect(pasaEscaneo(`<BuscadorFiltros escaneo={true} onChange={f} />`)).toBe(true);
    expect(pasaEscaneo(`<BuscadorFiltros escaneo label="Buscar" />`)).toBe(true);
    // Una expresión no se puede probar leyendo el texto: no cuenta.
    expect(pasaEscaneo(`<BuscadorFiltros escaneo={conCamaraZx9} />`)).toBe(false);
    // `escaneo` como valor de otra prop no es la prop.
    expect(pasaEscaneo(`<BuscadorFiltros label="escaneo" />`)).toBe(false);
    // Dos buscadores, uno sin cámara: alguno escanea, pero no todos.
    const mixto = `<BuscadorFiltros escaneo onChange={f} />\n<BuscadorFiltros onChange={g} />`;
    expect(pasaEscaneo(mixto)).toBe(true);
    expect(escaneanTodos(mixto)).toBe(false);
    // Un montaje sin campo de búsqueda no es un buscador.
    expect(buscadores(`<BuscadorFiltros buscador={false} onChange={f}>x</BuscadorFiltros>`)).toHaveLength(0);
    expect(escaneanTodos(`<BuscadorFiltros buscador={false} onChange={f} />`)).toBe(false);
  });

  // B1 de la review: en una excepción, `escaneo` falta o es el literal `{false}`; nada más.
  it("SLT-205: en una excepción, `escaneo={x || true}` NO pasa por apagado", () => {
    expect(ningunoEscanea(`<BuscadorFiltros escaneo={debounceZq7 || true} onChange={f} />`)).toBe(false);
    expect(ningunoEscanea(`<BuscadorFiltros escaneo={conCamaraZx9} />`)).toBe(false);
    expect(ningunoEscanea(`<BuscadorFiltros escaneo />`)).toBe(false);
    expect(ningunoEscanea(`<BuscadorFiltros escaneo={ false } onChange={f} />`)).toBe(true);
    expect(ningunoEscanea(`<BuscadorFiltros onChange={f} />`)).toBe(true);
  });

  // B2 de la review: un `>` dentro de un literal colgaba la guardia. El timeout NO puede cortar un
  // bucle síncrono (bloquea el hilo de vitest): la protección real es que el parser salta los
  // literales y LANZA si uno no cierra. El timeout se queda como aviso si alguien lo rompe.
  it("SLT-205: un `>` dentro de un literal no corta la etiqueta ni cuelga", { timeout: 2000 }, () => {
    expect(pasaEscaneo(`<BuscadorFiltros title="guia -> tienda" escaneo onChange={f} />`)).toBe(true);
    expect(pasaEscaneo(`<BuscadorFiltros placeholder='Guía > tienda' onChange={f} />`)).toBe(false);
    expect(pasaEscaneo(`<BuscadorFiltros onChange={() => g("a > b")} escaneo />`)).toBe(true);
    // Un literal sin cerrar da un error con nombre, no un bucle infinito.
    expect(() => pasaEscaneo(`<BuscadorFiltros title="sin cerrar escaneo />`)).toThrow(/literal sin cerrar/);
  });

  // m1 de la review: el alias se ve, y un spread pone la guardia en rojo (hoy no hay ninguno).
  it("SLT-205: el import con alias se cuenta como buscador", () => {
    const alias = `import { BuscadorFiltros as CajaZq7 } from "@/components/shared/BuscadorFiltros";
`;
    expect(buscadores(`${alias}<CajaZq7 onChange={f} />`)).toHaveLength(1);
    expect(pasaEscaneo(`${alias}<CajaZq7 escaneo onChange={f} />`)).toBe(true);
    expect(ningunoEscanea(`${alias}<CajaZq7 escaneo={x || true} />`)).toBe(false);
  });

  it("SLT-205: un `{...props}` en la apertura da rojo: no se puede verificar", () => {
    expect(() => pasaEscaneo(`<BuscadorFiltros {...resto} onChange={f} />`)).toThrow(CON_SPREAD);
    expect(() => buscadores(`<BuscadorFiltros onChange={f} {...{ escaneo: true }} />`)).toThrow(CON_SPREAD);
  });
});
