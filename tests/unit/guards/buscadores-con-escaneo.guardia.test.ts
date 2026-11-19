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

/** Las etiquetas de apertura `<BuscadorFiltros …>` de una fuente, contando llaves (`=>` va dentro). */
function aperturasDeBuscador(fuente: string): string[] {
  const codigo = quitarComentarios(fuente);
  const aperturas: string[] = [];
  const marca = /<BuscadorFiltros\b/g;
  let m: RegExpExecArray | null;
  while ((m = marca.exec(codigo)) !== null) {
    let profundidad = 0;
    let i = m.index + m[0].length;
    for (; i < codigo.length; i++) {
      const c = codigo[i];
      if (c === "{") profundidad++;
      else if (c === "}") profundidad--;
      else if (c === ">" && profundidad === 0) break;
    }
    aperturas.push(codigo.slice(m.index, i + 1));
  }
  return aperturas;
}

/**
 * Las props de primer nivel de una apertura: nombre -> valor crudo (`true` si va suelta, el texto
 * entre llaves si es `{…}`, el literal si es `"…"`). Lo que va dentro de llaves anidadas no es prop.
 */
function propsDeApertura(apertura: string): Map<string, string> {
  const props = new Map<string, string>();
  const cuerpo = apertura.replace(/^<BuscadorFiltros\b/, "").replace(/\/?>$/, "");
  let i = 0;
  while (i < cuerpo.length) {
    if (cuerpo[i] === "{") {
      // `{...resto}`: un bloque suelto no es una prop con nombre; se salta entero.
      let profundidad = 0;
      for (; i < cuerpo.length; i++) {
        if (cuerpo[i] === "{") profundidad++;
        else if (cuerpo[i] === "}" && --profundidad === 0) break;
      }
      i++;
      continue;
    }
    const nombre = /^\s*([A-Za-z_][\w-]*)/.exec(cuerpo.slice(i));
    if (!nombre) {
      i++;
      continue;
    }
    i += nombre[0].length;
    if (cuerpo[i] !== "=") {
      props.set(nombre[1], "true");
      continue;
    }
    i++;
    if (cuerpo[i] === "{") {
      let profundidad = 0;
      const inicio = i;
      for (; i < cuerpo.length; i++) {
        if (cuerpo[i] === "{") profundidad++;
        else if (cuerpo[i] === "}" && --profundidad === 0) break;
      }
      props.set(nombre[1], cuerpo.slice(inicio + 1, i).trim());
      i++;
    } else if (cuerpo[i] === '"' || cuerpo[i] === "'") {
      const fin = cuerpo.indexOf(cuerpo[i], i + 1);
      props.set(nombre[1], cuerpo.slice(i + 1, fin));
      i = fin + 1;
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
    expect(buscadores(fuente).length).toBeGreaterThan(0); // no vacuidad
    expect(pasaEscaneo(fuente)).toBe(false);
  });

  it("SLT-200: `/recoleccion` monta `BuscadorFiltros` sin `escaneo` (sin cámara en el buscador)", () => {
    const fuente = leer(RECOLECCION);
    expect(buscadores(fuente).length).toBeGreaterThan(0); // no vacuidad
    expect(pasaEscaneo(fuente)).toBe(false);
  });

  it.each(Object.keys(SIN_ESCANEO))("excepción %s: tiene buscador y ninguno escanea", (archivo) => {
    const fuente = leer(archivo);
    expect(buscadores(fuente).length, `${archivo} ya no tiene buscador: sácalo de SIN_ESCANEO`).toBeGreaterThan(0);
    expect(pasaEscaneo(fuente), `${archivo} escanea: pásalo a CON_ESCANEO`).toBe(false);
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
    const conCamara = encontrados.filter((archivo) => pasaEscaneo(readFileSync(path.join(RAIZ, archivo), "utf8")));
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
});
