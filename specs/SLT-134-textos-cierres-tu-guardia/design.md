# SLT-134 «Textos de pantalla de cierres en tú, con guardia» — design

> Requisitos: `requirements.md` (R56, R142-R146 copiados de SLT-103; R390-R394 de esta ficha).
> Contrato de los textos: `specs/SLT-103-dialogos-trato-tu/requirements.md > Anexo A` (filas A1-K4).
> Reglas de detección: `SLT-103 > Definiciones`.

## Lo que ya existe

- **Servidor ya en «tú»** (SLT-133): las filas L1-N1. No se tocan.
- **Guardia de diálogos** `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts` (SLT-103): censo
  propio de seis árboles, detección de imports por regex sobre el código sin comentarios, visor por
  título literal y `function VisorEvidencia`. Sus huecos son D65.
- **Extracción de textos por AST** en `tests/unit/guards/rechazo-nombre-466.guardia.test.ts`
  (`textosVisibles`, con `typescript`, que ya es dependencia del repo): literales, plantillas y texto JSX
  con su línea. No separa los especificadores de `import`.
- **Quitador de comentarios** `tests/fixtures/sin-comentarios.ts`: ya no lo usa ninguna guardia de
  esta ficha (la de diálogos pasó a AST en T3.1); sigue en el repo para otros tests.
- **Regex de voseo con `\p{L}` y bandera `u`** en `tests/unit/utils/cola-propia-vista.test.ts`
  (SLT-138): la idea de los límites se hereda; la lista no (es corta y local).
- **El gate rápido corre siempre las guardias**: `arnes.config.json > gate.siempre = ["guard"]` y
  `scripts/test-rapido.mjs` (l.206) selecciona todo test cuya ruta contiene `guard`. Un archivo en
  `tests/unit/guards/` entra solo. Es lo que faltó en el PR #134: dos tests que leían `.tsx` como texto
  vivían fuera de `guards/` y `vitest related` no los relaciona.

Sin dependencias nuevas. Sin datos, sin esquema, sin migraciones, sin rutas, sin autorización nueva:
esta ficha solo cambia literales de pantalla y tests. Nada depende del país.

## Orden de merge

Va **después** de SLT-139 «Pago al mensajero independiente del efectivo: satélite» (PR #149),
SLT-140 «Excel del modelo nuevo: hojas por cierre de mensajeros» y SLT-141 «Excel del modelo nuevo:
hojas por cierre de bodega». Las tres tocan archivos del censo (SLT-139 al menos
`components/private/cierres/cola/cola-cierres-labels.ts`; SLT-140 y SLT-141 aún sin `## Archivos
esperados` publicado) y pueden meter textos nuevos. Por eso:

1. T0 trae `origin/dev` con las tres dentro y repite el censo con la guardia ya escrita: si alguna metió
   voseo, ese texto entra aquí con su fila nueva en `progress/impl_SLT-134.md` (y en el Anexo A como
   anexo de SLT-134, con su texto en «tú» escrito a mano antes de cambiarlo).
2. Si alguna de las tres no está mergeada cuando esta ficha esté lista, la guardia la pondrá en rojo en
   cuanto meta voseo: es el comportamiento buscado (R142), y el leader lo avisa en ese PR.

## Textos (R56, R144)

Cada texto de `requirements.md > Inventario re-censado` se cambia **en su sitio**, por el texto exacto
de la fila del Anexo A. Reglas:

- Se cambia solo la cadena. Ni constantes nuevas, ni exportaciones nuevas, ni renombres, ni cambios de
  qué rama del `if` pinta qué (R146).
- Las plantillas conservan su interpolación (A2 `${moneyTope(INDEMNIZACION_MONTO_MAX)}`, B6 `${faltan}`).
- El texto JSX (A4 en `CierresAdminModule.tsx` l.661 y `ConsolidacionBodegaModule.tsx` l.423) conserva su
  salto de línea y sangría; solo cambian las palabras.
- J3 (`fila-gestion-labels.ts` l.97): «… Escríbele por el chat de la orden.». Se corrige el comentario de
  l.91-94, que dice que el texto es el mismo que el del servidor (P3).
- Los comentarios con voseo no se tocan (no son texto; no entran en el diff).

## Guardia de trato: `tests/unit/guards/cierres-trato-tu.guardia.test.ts`

### Censo (R145, R392)

Viene del fixture nuevo `tests/fixtures/censo-cierres.ts` (R392), que exporta:

- `CENSO_PANTALLA_ARBOLES`: `app/(app)/cierres-admin`, `app/(app)/cierre-dia`,
  `app/(app)/wallet/satelites`, `components/private/cierres`, `components/shared/conciliacion`,
  `components/shared/liquidacion`.
- `CENSO_PANTALLA_SUELTOS`: `components/shared/DesglosePagoField.tsx`,
  `components/shared/EscanerGuiaCard.tsx`.
- `CENSO_LIB`: `lib/constants/bloqueo-mensajero.ts`; los servicios `CierreDiaService`,
  `CierreBodegaService`, `CierresAdminService`, `CierresBodegaAdminService`,
  `ConciliacionSatelitesService`, `LiquidacionService`; las acciones `cierre-dia`, `cierre-bodega`,
  `cierres-admin`, `conciliacion-satelites`, `liquidacion`.
- `censoPantalla()` y `censoModulo()`: rutas relativas con `/`, ordenadas, `.ts`/`.tsx` sin `.d.ts`.
  Un archivo suelto que no existe **falla** (no se salta en silencio): si alguien lo renombra, el censo
  se revisa.
- `textosDeFuente(codigo, ruta)`: `{ linea, texto }[]` por AST (`ts.createSourceFile`, `ScriptKind.TSX`
  para `.tsx`, `TS` para `.ts`). Lee `StringLiteral`, `NoSubstitutionTemplateLiteral`,
  `TemplateHead/Middle/Tail` y `JsxText`. **Excluye** el `moduleSpecifier` de `ImportDeclaration` y
  `ExportDeclaration`, el argumento de `import(...)` y el de `ImportTypeNode`. Los comentarios no son
  nodos: no se leen.

Hoy `censoModulo()` da ~98 archivos (84 de árboles + 2 sueltos + 12 de `lib/`).

### Detección (R142, R143, R394)

Funciones puras exportadas por la guardia (para la contraprueba):

- `palabras(texto)`: `texto.matchAll(/\p{L}+/gu)` con su posición; se compara en minúsculas, **sin
  plegar tildes** («inténtalo» ≠ «intentalo»).
- `formaDeVoseo(palabra)`: las tres reglas de `SLT-103 > Definiciones`:
  1. lista cerrada de presente de vos (con sus variantes sin tilde);
  2. terminación aguda: `/^\p{L}{2,}(?:[áéí]|[áéí]s)$/u`, salvo `/(?:rá|ré|rás|rés)$/u` que solo cuenta si
     está en la lista cerrada de imperativos en `r`; y salvo `EXCEPCIONES`;
  3. lista cerrada de imperativos con pronombre sin tilde.
- `formaDeUsted(palabras, i)`: `usted`/`ustedes`, la lista de imperativos con pronombre, y la de
  imperativos sueltos **solo si abren frase** (primera palabra del texto, o el carácter no blanco anterior
  es `.`, `:`, `!`, `?`, `¿` o `¡`).
- `hallazgos(codigo, ruta)`: `"<ruta>:<línea> <forma> «<texto recortado a 80>»"` por cada forma.
- `EXCEPCIONES: Readonly<Record<string, string>>` = palabra → motivo. Arranca con las 21 palabras de R143
  más `estás`, `estés` (tú, R143) y `esté` (subjuntivo de «estar»: está en comentarios del censo y es
  frecuente en avisos). Solo afectan a la regla 2. Una excepción que haga falta al correr la guardia se
  añade con su motivo; si la lista llegara a 41, se para y se pregunta (R143).

Nada de esto mira tildes que faltan ni `su`/`sus` (R394): no hay léxico sin tilde ni regla de posesivos,
y la contraprueba lo fija.

### Casos (describe «SLT-134 · trato tú en cierres»)

| Caso | R |
|---|---|
| ningún texto del censo tiene voseo ni «usted» (`expect(hallazgos).toEqual([])`, con la lista en el mensaje) | R56, R142 |
| control positivo: `censoModulo().length > 60`; contiene `CierreDiaModule.tsx`, `CierresAdminModule.tsx`, `conciliacion-labels.ts`, `CierreDiaService.ts` | R145 |
| contraprueba por forma: `it.each` sobre las tres listas de voseo y la de «usted» (imperativos sueltos dentro de `"<Forma> el número."`); cada una da exactamente un hallazgo con su forma | R145 |
| contraprueba de terminación aguda: «Buscá por folio», «Usá los filtros», «Escaneá de nuevo», «volvé a intentarlo» marcan; «Busca por folio», «Usa los filtros» no | R142 |
| `hallazgos` de una muestra nombra ruta, línea y forma (`"muestra.tsx:3 intentá «…»"`) | R142 |
| la misma muestra comentada (`//` y `/* */`) y como especificador (`import x from "./tenés"`; `import("./podés")`) no da hallazgos | R142 |
| nada de R143 marca: formas de «tú», futuros, subjuntivos en mitad de frase (`"lo verá quien revise el comprobante"`) y las 21 palabras | R143 |
| `EXCEPCIONES`: cada motivo no vacío y `Object.keys(EXCEPCIONES).length <= 40` | R143 |
| sin tilde y posesivos no marcan: `"Esta gestion ya esta en el catalogo"`, `"su comprobante y sus fotos"` | R394 |
| la ruta de este archivo casa con un patrón de `arnes.config.json > gate.siempre` (lee el JSON; `__filename` relativo con `/`) | R393 |
| Anexo A (describe aparte): por cada fila A1-K4, el texto **escrito a mano en el test** aparece en `textosDeFuente` del archivo de hoy el número de veces que dice la fila | R144 |

**Anexo A en el test.** Los 40 textos van como literales en el test (memoria «Aserción contra su propia
fuente»: nunca importados de la constante que los produce). Para comparar:
- se colapsan los blancos (`/\s+/g → " "`, `trim`), por el texto JSX partido en líneas;
- las plantillas se comparan por tramos: la fila guarda sus tramos fijos (A2: `["El monto no puede
  superar ", " (10 dígitos y 2 decimales). Revisa si sobra un dígito."]`) y el test exige cada tramo, en
  orden, en tramos consecutivos de la misma plantilla.

### Mutaciones de la guardia (evidencia en `progress/impl_SLT-134.md`)

1. Devolver «Intentá» a `CierreDiaModule.tsx` l.212 → 1 hallazgo con ruta y línea.
2. «Escribile» en `fila-gestion-labels.ts` → hallazgo regla 3.
3. Quitar la bandera `u` o los límites `\p{L}` → la contraprueba de «Buscá» se pone roja.
4. Borrar `"esté"` de `EXCEPCIONES` → si hay `esté` en algún texto, hallazgo; si no, anotarlo.
5. Quitar `CierreDiaService.ts` del censo → control positivo rojo.
6. Mover la guardia a `tests/unit/utils/` (en local, sin commitear) → el caso de R393 rojo.

## Guardia de diálogos: cierre de D65 (R390-R392)

Cambios en `tests/unit/guards/cierres-dialogos-modal.guardia.test.ts`:

- **Censo (R392):** `ARBOLES` y `listar` locales se sustituyen por `censoPantalla()` del fixture. El
  control positivo pasa a exigir, además de lo de hoy, `app/(app)/wallet/satelites/_components/ConciliacionSatelite.tsx`,
  `components/shared/liquidacion/RegistrarPagoDialog.tsx`, `components/shared/DesglosePagoField.tsx` y
  `components/shared/EscanerGuiaCard.tsx`. Se mantiene `> 40`.
- **Imports (R390):** por AST, no por regex. Se recogen los especificadores de `ImportDeclaration`,
  `ExportDeclaration` con `moduleSpecifier` y `import(...)`. Es diálogo prohibido si es
  `@/components/ui/(alert-dialog|dialog|sheet)`, `@radix-ui/react-(alert-)?dialog`, o una ruta relativa
  que termina en `/ui/(alert-dialog|dialog|sheet)`. `EXCEPCIONES_UI_DIALOG` sigue igual (y su caso de
  «la excepción sigue usando ui/dialog» también).
- **Visor (R391):**
  - título: se pliegan las concatenaciones `+` de literales (y plantillas sin interpolaciones) en un solo
    texto antes de buscar «Evidencia de la gestión»; fuera de `dialogos-labels.ts`, 0 apariciones;
  - `VISOR_EVIDENCIA_TEXTO.titulo` (`PropertyAccessExpression` y `ElementAccessExpression` con
    `"titulo"`): solo en `VisorEvidencia.tsx`;
  - declaración: `FunctionDeclaration` llamada `VisorEvidencia`, o `VariableDeclaration` llamada
    `VisorEvidencia` cuyo inicializador es `ArrowFunction` o `FunctionExpression`: solo en
    `VisorEvidencia.tsx`, y allí exactamente una.
- **Contraprueba:** la de hoy, más una muestra por cada vía nueva (`ui/sheet`, `@radix-ui/react-dialog`,
  `"../../ui/dialog"`, `export { Dialog } from "@/components/ui/dialog"`, título partido
  `"Evidencia " + "de la gestión"`, `VISOR_EVIDENCIA_TEXTO.titulo`, `const VisorEvidencia = () => …`).
  Cada una detectada; comentada, ninguna.

`quitarComentarios` deja de hacer falta en la guardia de diálogos (el AST ignora comentarios); se quita
el import si ya no se usa.

## Tests que cambian con el texto

Los 17 archivos de `requirements.md > Inventario re-censado` se actualizan **a mano** con el texto nuevo:
cada literal viejo por el del Anexo A, y nada más (ni nuevas aserciones ni cambios de flujo). Los
comentarios de test que citan el texto viejo como historia (p. ej. `CierreDiaModule.test.tsx` l.1503,
`CierresAdminConfirmacionFisica.test.tsx` l.409) se pueden dejar: no son aserciones.

Ningún E2E afirma un texto del inventario (Grep sobre `e2e/`, 2026-11-12).

## Verificación de lo que ve el usuario (Preview)

Lista para Carlos (memoria «Aprobar en Preview antes de prod»), cada uno con el texto esperado escrito:
- `/cierres-admin` › Mensajero, sin zona asignada (A4); rechazar un cierre (A11); confirmación física
  con una guía sin número (B3) y faltando paquetes (B5/B6); indemnización con monto inválido (A3).
- `/cierres-admin` › Descargar gestiones sin mensajeros (E2).
- `/cierre-dia`: «Devolver a gestión» deshabilitado en una gestión de la tienda (J3, en el `title` y el
  nombre accesible).
- Conciliación de bodega con monto inválido (K1).

## Alternativas descartadas

1. **Regex sobre el fuente sin comentarios** (como la guardia de diálogos de hoy) en vez de AST. Más
   corta, pero no distingue un especificador de `import` (`"@/lib/auth/resolve-actor"` contiene
   `resolve`, que es voseo de la regla 3) de un texto, ni da la línea del literal partido. R142 exige
   no marcar especificadores: con regex haría falta un segundo quitador. Descartada.
2. **Mover `textosVisibles` de `rechazo-nombre-466.guardia.test.ts` al fixture** y que las dos guardias
   lo compartan. Más limpio, pero toca una guardia ajena a la ficha y suma un archivo cuando el tamaño
   está al 80 %. Se deja anotado: el fixture nuevo es el sitio al que podría mudarse después.
3. **Guardia por renderizado** (montar cada pantalla y leer `textContent`, como
   `wallet-sin-uuid.guardia.test.tsx`). Solo ve las ramas que el test pinta: un toast de error o un
   `forbidden` no sale sin preparar cada caso. El censo de fuente ve todos los literales. Descartada.
4. **Una lista de palabras prohibidas** (como `cola-propia-vista.test.ts`). No ve formas nuevas
   («Ampliá», «Vaciá» no estaban en ninguna lista). La regla 2 (terminación aguda) sí. Descartada.
5. **Un disparador nuevo en `gate.disparadores`** para que corra la guardia al tocar `app/(app)/cierre*`.
   No hace falta: `gate.siempre` ya corre toda ruta con `guard`, y R393 lo deja comprobado.
