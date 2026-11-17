# impl SLT-191 «Cierre del día del mensajero según el canvas» — frontend_dev

Ruta ligera. Spec: `specs/SLT-191-cierre-dia-segun-canvas/requirements.md` (R810-R824). T1-T3 [x];
T4: E2E escrito, **sin correr** (orden del leader: sin dev server ni build). Grafo no usado (Grep/Read).

## Commits
- `5d1de9a6` feat T1 — tarjeta de gestión del mensajero
- `0903e28f` feat T2 — rechazos desplegables
- `caa83a75` feat T3 — Cierres solicitados + barra fija
- `5feec4e3` test T4 — E2E (sin correr)

## Archivos
Producción: `components/private/cierres/fila/FilaGestion.tsx` (prop `tarjetaMensajero`, `TarjetaMensajero`,
disparador estirado, «Devolver» al pie del desplegado), `fila/GestionesCierre.tsx` (la pasa con
`esMovil && audiencia === "mensajero"`), `detalle/RechazosDeTiendaCierre.tsx` (prop `desplegableMovil`,
`FilaRechazoDesplegable`), `app/(app)/cierre-dia/_components/CierreDiaModule.tsx` (prop en sus 3 usos),
`cola/TablaColaPropia.tsx` (columnas móviles, `detallePropioMovil(c, acciones)` solo con «Ver»),
`cola/ColaCierres.tsx` (envoltorio de barra con `BARRA_FIJA` si `propios` y móvil; `data-barra-cola`),
`cola/cola-propia-vista.ts` (comentario).
Tests: `tests/components/GestionesCierreMovil.test.tsx`, `CierreRechazosDeTienda.test.tsx`,
`CierreDiaColaPropia.test.tsx` (2 casos reescritos, no borrados), `ColaCierres.test.tsx` (mock de
`useIsMobile` por defecto escritorio + 2 casos), `e2e/pwa-mensajero-cierre-dia.spec.ts` (ya registrado).

## Mapa R → test
| R | Test |
|---|---|
| R810 | GestionesCierreMovil «R810: a la izquierda guía…» y «R810: sin guía «—»…»; E2E (a) orden vertical |
| R811 | GestionesCierreMovil «R811: plegada NO muestra…» y «R811 (R244)…»; E2E (a) |
| R812 | GestionesCierreMovil «R812: el disparador… estirado…»; E2E (a) toque en el texto |
| R813 | GestionesCierreMovil «R813: la información del resultado… ningún botón dentro de otro» |
| R814 | GestionesCierreMovil «R814: en escritorio…» y «R814: la administración en el teléfono…»; FilaGestion.test (sin prop, sin cambios) |
| R815 | CierreRechazosDeTienda «R815: plegada…», «R815: sin guía y sin motivo…», «`CierreDiaModule`: los tres usos llevan la prop» |
| R816 | CierreRechazosDeTienda «R816: toda la fila es un botón…» |
| R817 | CierreRechazosDeTienda «R817: la nota…», «R817: en escritorio…», «R817: fuera de /cierre-dia…», «`CierresAdminModule`: ningún uso la lleva» |
| R818 | CierreDiaColaPropia «SLT-191 R818: dos columnas…»; E2E (b) |
| R819 | CierreDiaColaPropia «SLT-191 R819: la fila plegada no trae «Ver»…»; E2E (b) |
| R820 | CierreDiaColaPropia «SLT-191 R820: al desplegar, solo «Ver»…»; E2E (b) |
| R821 | CierreDiaColaPropia «en escritorio, las ocho columnas de hoy…» (+ Recaudado/Pago/Ver); ColaCierres «central: la cola no lleva el desplegable…» |
| R822 | CierreDiaColaPropia «R822: en el teléfono, el envoltorio… `sticky top-0`»; E2E (b) estilo calculado |
| R823 | CierreDiaColaPropia «R823: en escritorio, la barra no queda fija»; ColaCierres «central y satélite: la barra no queda fija» |
| R824 | este mapa y `progress/features/SLT-191.md` |

## Mutaciones (commiteado antes; restauradas con `git checkout --`, sin stash)
| # | Mutación | Rojo |
|---|---|---|
| M1 | sin `absolute inset-0` en el disparador | R812 |
| M2 | `tarjetaMensajero={esMovil}` (admin afectado) | R814 admin |
| M3 | «Devolver» en la tarjeta plegada | R811 (2 casos) |
| M4 | fila de rechazo no desplegable | R815, R816 |
| M5 | `CierreDiaModule` sin la prop en un uso | composición (3 usos) |
| M6 | tienda en la fila plegada del rechazo | R815 |
| M7 | folio fuera de la fila de la cola | R818 |
| M8 | «Recaudado» de vuelta en el desplegado | R820 |
| M9 | barra fija también en la administración | R823 (ColaCierres) |
| M10 | barra no fija en el teléfono | R822 |

## Salidas
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit -p .` → `TSC_EXIT=0`, sin salida.
- `pnpm run lint` → `LINT_EXIT=0`, `0 errors, 248 warnings` (ninguno en archivos tocados).
- `pnpm exec vitest run` (9 archivos: los 6 de la ficha + ContrasteBrandSoftOscuro + guardias
  estado-con-info y pwa-mensajero-sin-recorte) → `Test Files 9 passed (9)`, `Tests 373 passed (373)`.
- `pnpm exec vitest run` (54 tests de componente que importan los módulos tocados) →
  `Test Files 54 passed (54)`, `Tests 1050 passed (1050)`.

## Abierto
- T4: el E2E no se ha corrido (ni `./init.sh`). El leader lo corre en base desechable antes del PR.
- E2E (b): con un solo cierre la cola no da para desplazar; la barra fija se comprueba por
  `position: sticky; top: 0px`, no midiendo tras un scroll.
- Sin chevron visible en la tarjeta de gestión ni en la fila de rechazo (el canvas no lo pinta).

Veredicto: T1-T3 hechos y verificados (tsc 0, lint 0 errores, 373+1050 tests verdes, 10 mutaciones en rojo); falta correr el E2E.

## Fix E2E (a) del PR #196 — la tarjeta no se desplegaba en Chromium (2026-11-17)
Rojo de CI: `e2e (dinero)`, `pwa-mensajero-cierre-dia.spec.ts` (a) a 360 y 414 px, `aria-expanded` seguía
en "false" tras el toque en el texto.

**Causa (por el código; Playwright no se pudo correr aquí):** el E2E tocaba con `page.mouse.click(x, y)`
usando la caja del destinatario SIN desplazar antes. `page.mouse.click` no hace scroll ni comprueba qué
elemento recibe el punto (a diferencia de `locator.click`). La tarjeta del destinatario largo está en una
ventana de 780 px por debajo de la cabecera del detalle, las cifras, las pestañas y la barra, y el
pie fijo «Solicitar cierre del día» tapa los ~76 px de abajo: el punto caía fuera de la ventana o sobre
el pie, nunca sobre la tarjeta. El apilado de antes (disparador `absolute` primero en el DOM, contenido
`relative` encima con `pointer-events-none`) sí dejaba pasar el toque al disparador en un navegador: no
era la causa, pero dependía solo de la herencia de `pointer-events`.

**Cambio:**
- E2E (mal escrito, se corrige): centra el texto en la ventana (`scrollIntoView({ block: "center" })`),
  comprueba con `document.elementFromPoint` que el punto lo recibe el disparador estirado y solo
  entonces hace el clic. Si vuelve a fallar, el mensaje dice QUÉ tapa el punto.
- Pantalla (robustez): el disparador va ENCIMA del contenido (`z-10`); la información del resultado,
  encima de él (`relative z-20`); la tarjeta es su propio contexto de apilado (`isolate`), para que esos
  `z-` no pasen por encima de la barra fija (`BARRA_FIJA`, `z-20`) al desplazar. El contenido sigue con
  `pointer-events-none`. Se quita el `hover:bg-muted/40` del disparador (ahora estaría encima del texto).

**Por qué ahora el clic llega al botón:** en el punto (x, y) del texto, el hit-testing de Chromium recorre
de arriba abajo el contexto de apilado de la tarjeta: lo primero es el disparador (`z-10`, posicionado,
cubre `inset-0`); el texto está debajo (orden `z-auto`) y además no capta. Solo el botón de información
(`z-20`, `pointer-events: auto`) está por encima, y ocupa únicamente su icono. Y el punto está dentro de la
ventana y lejos del pie porque el texto se centró antes.

**Test:** `GestionesCierreMovil.test.tsx` «R812, R813: orden de apilado…» (clases `isolate`, `z-10`, `z-20`
y ningún otro `z-` dentro de la tarjeta).

## Segundo rojo del E2E (a), run 44027473005 sobre d1ba1cc5 (2026-11-17)
Rojo: `pwa-mensajero-cierre-dia.spec.ts:135` «el punto del texto lo recibe el disparador estirado» → false,
a 360 y 414 px y en el reintento. Artefacto `e2e-dinero` bajado a
`C:/Users/ArqDev/AppData/Local/Temp/claude/aab05f6b97f87a08/0a929361-2ad4-41de-8647-ae84c49c1ab6/scratchpad/slt191-e2e/run44027473005/`.

**Evidencia:**
- El `error-context.md` (snapshot accesible) muestra la tarjeta bien formada: es la PRIMERA de «Órdenes del
  cierre». El botón «Detalle de la orden … · Ana María …» es el primer hijo y le siguen el bloque de
  guía, destinatario y tienda y el de resultado, «Ganancia» y monto. El snapshot no dice qué elemento
  recibe un punto: con él no se puede afirmar qué lo tapaba.
- `app/globals.css:1057-1060`: `html { scroll-behavior: smooth }` (si no hay `prefers-reduced-motion`,
  como en el Chromium del CI). Por eso `el.scrollIntoView({ block: "center" })` sin `behavior` ANIMA el
  desplazamiento. El test medía la caja (`boundingBox`) y luego, en otra llamada,
  `elementFromPoint` mientras la página seguía moviéndose. El punto de la caja ya no caía sobre el texto:
  caía en otra parte de la página (otra tarjeta, la barra o lo que pasara por ahí en ese instante).
  Encaja con los dos rojos: en d1ba1cc5 el `closest(...)` daba falso, y en 4fb7ade8, sin scroll, el
  punto caía bajo el pliegue de 780 px o bajo el pie fijo.
- En la pantalla no hay causa a la vista: el disparador es `absolute inset-0 z-10` dentro de una tarjeta
  `relative isolate`, y por encima solo está la información (`relative z-20`). Con el texto centrado,
  la barra fija (arriba) y el pie fijo (abajo) quedan lejos del punto.

**Cambio (solo el E2E):** el scroll es `behavior: "instant"`. Medir el punto y preguntar
`document.elementFromPoint` se hace en el MISMO `evaluate`, sin que el navegador desplace entre medias. Se
compara con el disparador de ESTA tarjeta (`:scope > button` de su `[data-tarjeta-mensajero]`), no con
cualquiera. Si falla, el rojo dice qué recibe el punto: etiqueta, clases, `aria-label` y texto corto, o
«ninguno (fuera de la ventana)». Además se comprueba que el punto está dentro de la ventana.
Si el próximo CI vuelve a dar rojo, ese mensaje identifica al elemento y el arreglo pasa a la pantalla.
