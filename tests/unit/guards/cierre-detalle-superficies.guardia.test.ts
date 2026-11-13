import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

/**
 * Feature 264 (Q1/R30) — GUARDIA: **toda** superficie que renderice el comprobante detallado de
 * un cierre pasa la lista de órdenes sin gestionar Y su marca de registro.
 *
 * FICHA 425 (R14, `tasks.md` F3) — y AHORA TAMBIÉN la lista de rechazos de tienda. Es el mismo
 * defecto con otro nombre: `rechazosDeTienda` es opcional en el tipo por los mismos dobles, así
 * que una pantalla que se la deje compila, y quien aprueba ese cierre no se entera de que hay
 * paquetes que separar, que es justo lo que D1 dice que el cierre tiene que contar. Se AÑADE a la
 * lista: ninguna de las dos props de la 264 deja de exigirse.
 *
 * ── POR QUÉ HACE FALTA UNA GUARDIA Y NO BASTA EL TYPECHECK
 * `ordenesSinGestion` y `sinGestionRegistrado` son **opcionales** en
 * `CierreFacturaDetalleProps`, y lo son por una razón buena: una docena de dobles de test montan
 * la hoja con lo mínimo y obligarles a inventar una lista vacía no probaría nada. El precio es
 * que **el compilador no dice ni una palabra** si una pantalla de producción se las deja. El
 * resultado sería la hoja pintando la sección en el detalle del admin y callándosela en el del
 * mensajero: exactamente el arreglo a medias que corrigió la 263, y con el agravante de que la
 * pantalla del mensajero es la de quien tiene el cierre bloqueado por esas mismas órdenes.
 *
 * ── POR QUÉ RECORRE ARCHIVOS Y NO IMPORTA NADA
 * No hay nada que importar: lo que se vigila es una AUSENCIA en un JSX. Ninguna selección por
 * grafo de imports traería este archivo al ejecutar un cambio en `CierreDiaModule.tsx`
 * (`docs/verification.md`), y por eso las guardias de este repo se ejecutan SIEMPRE, también en
 * el gate rápido.
 *
 * ── LO QUE NO AFIRMA
 * Que las props lleven el valor CORRECTO. Aquí se comprueba que se pasan y de dónde salen —del
 * resultado del servidor, no de un literal—; que ese resultado traiga la lista de ESE cierre lo
 * sostienen `cierre-sin-gestion-sql-real.test.ts` (el `WHERE`) y los tests de servicio.
 */

const RAIZ = path.resolve(__dirname, "../../..");
const APP = path.join(RAIZ, "app");

/** El componente vigilado, por su nombre de etiqueta JSX. */
const COMPONENTE = "CierreFacturaDetalle";

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

/** Un uso concreto del componente: el archivo y el texto de su etiqueta de apertura. */
interface Uso {
  archivo: string;
  etiqueta: string;
}

/**
 * Los usos de `<CierreFacturaDetalle …>` en `app/**`, con la prosa ya fuera (quitador
 * compartido, feature 209): un ejemplo dentro de un comentario no es una superficie.
 *
 * La etiqueta se corta en el primer `/>` o `>` de nivel superior, contando llaves para no
 * partirla dentro de una expresión con `{}` (las props de esta hoja las llevan casi todas).
 */
function usosEnApp(componente: string = COMPONENTE): Uso[] {
  const usos: Uso[] = [];
  for (const archivo of tsxDeApp()) {
    // El archivo que DECLARA el componente no lo renderiza: se salta por ruta, no por heurística.
    if (path.basename(archivo) === "cierre-factura.tsx") continue;
    const fuente = quitarComentarios(readFileSync(archivo, "utf8"));

    let desde = buscarEtiqueta(fuente, componente, 0);
    while (desde !== -1) {
      let llaves = 0;
      let i = desde;
      for (; i < fuente.length; i += 1) {
        const c = fuente[i];
        if (c === "{") llaves += 1;
        else if (c === "}") llaves -= 1;
        else if (c === ">" && llaves === 0) break;
      }
      usos.push({
        archivo: path.relative(RAIZ, archivo).replaceAll("\\", "/"),
        etiqueta: fuente.slice(desde, i + 1),
      });
      desde = buscarEtiqueta(fuente, componente, i);
    }
  }
  return usos;
}

/** La próxima `<Componente` como etiqueta completa (no el prefijo de otro nombre). */
function buscarEtiqueta(fuente: string, componente: string, desde: number): number {
  const patron = new RegExp(`<${componente}(?![\\w$])`, "g");
  patron.lastIndex = desde;
  return patron.exec(fuente)?.index ?? -1;
}

const USOS = usosEnApp();

describe("SLT-108 — el comprobante (`CierreFacturaDetalle`) ya no se monta en ninguna pantalla (R161)", () => {
  /**
   * Autocomprobación. Sin esto, una ruta mal resuelta o un `readdirSync` sobre una carpeta vacía
   * darían CERO usos y el caso de abajo pasaría en verde sin haber mirado nada — que es el modo de
   * fallo que este repo ya se ha comido varias veces. El extractor se prueba contra un componente
   * que SÍ se monta (`DetalleCierre`, abajo) para que «cero» signifique cero.
   */
  it("el censo recorre de verdad `app/**` y el extractor encuentra etiquetas", () => {
    expect(
      tsxDeApp().length,
      "el barrido de `app/**` no encontró apenas archivos: está midiendo un árbol vacío",
    ).toBeGreaterThan(50);
    expect(usosEnApp("DetalleCierre").length, "el extractor no encontró ni el detalle único").toBeGreaterThanOrEqual(2);
  });

  it("ninguna pantalla monta `<CierreFacturaDetalle>`", () => {
    // SLT-100 quitó el del admin; SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero»,
    // el de `/cierre-dia`. Las secciones sin dinero (264/R30, 425/R14) las vigila ahora el
    // `describe` del detalle único, de abajo.
    expect(
      [...new Set(USOS.map((u) => u.archivo))],
      "alguien volvió a montar el comprobante: el detalle de un cierre es el detalle único (R1 de SLT-95, R161)",
    ).toEqual([]);
  });
});

/**
 * SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» — la superficie NUEVA del detalle
 * del cierre de mensajero: el detalle único, montado por quien lo abre. Sus pestañas «Gestiones» y
 * «Rechazados por la tienda» pintan las mismas tres listas sin dinero, con piezas propias:
 * `SeccionSinGestion` (órdenes y marca de registro, 264/R30) y `RechazosDeTiendaCierre` (425/R14).
 * Mismo defecto que vigila el `describe` de arriba: una superficie que no se las pase compila.
 */
const PIEZAS_DETALLE_UNICO = [
  { componente: "SeccionSinGestion", props: ["ordenes", "registrado"] },
  { componente: "RechazosDeTiendaCierre", props: ["rechazos"] },
] as const;

/** Los archivos de `app/**` que montan el detalle único de un cierre de MENSAJERO. */
const SUPERFICIES_DETALLE_UNICO = usosEnApp("DetalleCierre")
  .filter((u) => /tipo="mensajero"/.test(u.etiqueta))
  .map((u) => u.archivo);

describe("SLT-100 — el detalle único del cierre de mensajero pinta las tres listas sin dinero (264/R30, 425/R14)", () => {
  it("el censo encuentra la superficie del detalle único (autocomprobación)", () => {
    // SLT-108: `/cierre-dia` es la segunda superficie (el cierre pasado del mensajero).
    expect([...new Set(SUPERFICIES_DETALLE_UNICO)].sort()).toEqual([
      "app/(app)/cierre-dia/_components/CierreDiaModule.tsx",
      "app/(app)/cierres-admin/_components/CierresAdminModule.tsx",
    ]);
  });

  it.each([...new Set(SUPERFICIES_DETALLE_UNICO)].map((archivo) => [archivo] as const))(
    "%s monta las dos piezas y les pasa sus props desde el detalle del servidor",
    (archivo) => {
      for (const { componente, props } of PIEZAS_DETALLE_UNICO) {
        const usos = usosEnApp(componente).filter((u) => u.archivo === archivo);
        expect(usos.length, `${archivo} monta el detalle único sin \`<${componente}>\``).toBeGreaterThan(0);
        for (const uso of usos) {
          for (const prop of props) {
            const valor = uso.etiqueta.match(new RegExp(`${prop}=\\{([^}]*)\\}`))?.[1];
            expect(valor, `${archivo} monta <${componente}> sin \`${prop}\``).toBeTruthy();
            if (esLiteralPermitido(archivo, componente, prop, (valor ?? "").trim())) continue;
            expect(
              (valor ?? "").trim(),
              `${archivo} pasa \`${prop}\` con un literal en vez del dato del servidor (R28)`,
            ).toMatch(/^[A-Za-z_$][\w$]*(?:\.[\w$]+)+$/);
          }
        }
      }
    },
  );

  it("SLT-109 (PA3): el único literal permitido es el `[]` de «Rechazados por la tienda» del cierre en curso, y una sola vez", () => {
    // El cierre de HOY aún no tiene rechazos de tienda: se vinculan al solicitarlo y el servidor no
    // da los pendientes del día (PA3 de SLT-109, aceptada por Carlos el 2026-11-12). La pestaña se ve
    // con su estado vacío (D11). La excepción es de UNA etiqueta: un segundo `[]` en el archivo —por
    // ejemplo en el rechazado o el vencido, que SÍ tienen su lista del servidor— la pone roja.
    for (const { archivo, componente, prop, valor } of LITERALES_PERMITIDOS) {
      const usos = usosEnApp(componente).filter((u) => u.archivo === archivo);
      const conLiteral = usos.filter((u) => u.etiqueta.match(new RegExp(`${prop}=\\{([^}]*)\\}`))?.[1]?.trim() === valor);
      expect(conLiteral, `${archivo}: <${componente} ${prop}={${valor}}>`).toHaveLength(1);
    }
  });
});

/** Literales que una superficie puede pasar en vez del dato del servidor, con su motivo escrito. */
const LITERALES_PERMITIDOS = [
  {
    archivo: "app/(app)/cierre-dia/_components/CierreDiaModule.tsx",
    componente: "RechazosDeTiendaCierre",
    prop: "rechazos",
    valor: "[]",
  },
] as const;

function esLiteralPermitido(archivo: string, componente: string, prop: string, valor: string): boolean {
  return LITERALES_PERMITIDOS.some(
    (l) => l.archivo === archivo && l.componente === componente && l.prop === prop && l.valor === valor,
  );
}
