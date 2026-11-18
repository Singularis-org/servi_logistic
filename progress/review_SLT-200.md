# review SLT-200 «PWA Reparto: buscador, KPI, tarjeta y leyenda del mapa tras Preview»

Reviewer, 2026-11-18. Ruta directa, con review completa a petición del leader (toca compartidos y la siembra demo).
HEAD revisado `594878b3` (= head del PR #226). Diff `origin/dev...HEAD`: 28 archivos.
MCP del grafo no usado: la exploración fue con Grep/Read y git sobre el worktree.

## Checklist

- [x] Ruta: directa. No toca lógica de dinero (el KPI solo pinta; la demo crea una orden con cobro por los servicios
      de la app y su mensajero no entrega), permisos, auth, integraciones ni webhooks. Complexity low.
- [x] Alcance = decisiones de `progress/features/SLT-200.md` (puntos 1-7).
- [x] Tamaño: `node scripts/tamano-pr.mjs` → 25/40 archivos, 281/1000 líneas de producción, 529/3000 de tests.
- [x] Cada punto 1-7 tiene test que fallaba antes y pasa ahora (abajo, repetido por mí en 1, 2, 3, 4, 6 y 7).
- [x] typecheck (`pnpm run typecheck`) exit 0; eslint de los .ts/.tsx tocados exit 0.
- [x] Guardias: 1 archivo rojo, `dependencias-declaradas-presentes.guardia.test.ts`, que está en
      `tests/baseline-rojos.json` (deuda ajena, no es hallazgo). El resto, 356 archivos, en verde.
- [x] Tests de los archivos tocados en HEAD: `Test Files 10 passed · Tests 249 passed`.
- [x] demo-qa (integración, base desechable): `Tests 14 passed (14)`, incluida la segunda ejecución (idempotencia).
- [ ] **Escritorio sin cambios visibles salvo el tooltip: NO se cumple** en la tarjeta Mosaico (B1).
- [ ] **E2E afectados corridos en local: falta `pwa-mensajero-botones-44`** (B2).
- [x] Sin `organizacion_id`/RLS/migraciones/dependencias nuevas. Sin referencias a Ordenex.

## Rojo antes / verde después (repetido por el reviewer)

Método: `git checkout origin/dev -- <fuente>` del arreglo, vitest vía `con-desechable`, y `git checkout HEAD -- <fuente>`
(árbol limpio después, `git status --short` vacío).

1. KPI, Mosaico, «Tú», Recolección sin cámara y tooltip (fuentes `KpisMensajero.tsx`, `PosOrderCardMosaico.tsx`,
   `ruta-mapa-iconos.ts`, `RecoleccionModule.tsx`, `EscanerModal.tsx`, `BuscadorFiltros.tsx` en su versión de dev):
   `Test Files 5 failed (5) · Tests 11 failed | 31 passed (42)`. Caen los 4 de KPI, 3 de Mosaico, el del tooltip
   («al enfocar la cámara sale…»), 2 de la guardia de escaneo y el de «Tú» ≥ 4.5:1.
2. Conmutador (`RepartoModule.tsx`, `RecogerModule.tsx` de dev): `Tests 2 failed` («SLT-200: en el móvil el conmutador
   ocupa su propia línea…» en Reparto y Recoger).
3. Leyenda (`RutaMapaInner.tsx` de dev): `Tests 2 failed | 14 passed` (sin «Gestionada» y anillo ≥ 3:1).
4. Restaurado todo: los 10 archivos en verde (249/249).

El punto 5 (demo) no lo revertí: la bitácora trae rojo de dev y dos mutaciones con su mensaje; yo corrí el archivo
entero en verde.

## Hallazgos

### B1 — BLOQUEANTE: la tarjeta Mosaico cambia de tamaño en escritorio
`app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx`. Todos los cambios del punto 3 van sin
prefijo de ancho:
- guía `font-mono text-xs` → `text-sm font-bold` (sans);
- `text-[10px]`/`text-[11px]`/`text-[0.6875rem]` → `text-xs` en insignia de parada, «Sin posición · peso», chips, producto
  (además deja la mono), intentos, mensajero, dirección, aviso de reserva, «COBRAR» y «VER DETALLE COMPLETO»;
- icono del producto `size-3` → `size-3.5`.

La tarjeta se pinta igual en escritorio: Reparto, Recoger y Recolección (Mosaico es la vista por defecto en todos los
anchos) y **Novedades** (`NovedadesModule.tsx:651`, pantalla de oficina). La decisión de Carlos (punto 3) dice
«tamaños legibles **en móvil**», y su exigencia es que en escritorio todo quede del tamaño de prod.
Además, el test lo fija: en `tests/components/PosOrderCardMosaicoLegible.test.tsx`, el regex `MENORES_DE_12` acepta
cualquier variante (`(?:[a-z-]+:)*`). Así prohíbe también `md:text-[10px]`, y un arreglo que conserve el tamaño de
escritorio daría rojo.

Qué falta:
- en la tarjeta: subir el tamaño solo por debajo de `md`. Una forma es `text-xs md:text-[10px]` (o `md:text-[11px]` /
  `md:font-mono md:text-xs` en la guía, según lo que hubiera). Otra es `max-md:text-xs` sobre la clase de antes;
- en el test: que mire solo las clases base o `max-md:`. Hace falta además un caso que fije que desde `md` quedan los
  tamaños de dev. Si no, el requisito de Carlos no tiene test.

Lo demás de escritorio lo revisé clase a clase y queda como en dev:
- **KPI:** `md:gap-x-3`, `md:row-span-2`, `md:self-end`, `md:col-span-1 md:col-start-2`; la cifra la manda
  `md:text-2xl`, sin conflicto con `text-xl`/`text-lg`/`text-base`/`text-sm`, que son variantes distintas para
  tailwind-merge; `max-md:px-3` solo afecta al móvil.
- **Conmutador:** solo `max-md:`.
- **Tooltip:** permitido.
- **Recolección sin cámara:** es la decisión de Carlos.
- **Leyenda:** cambia en todos los anchos, ver m1.

### B2 — BLOQUEANTE: falta en local el E2E `pwa-mensajero-botones-44`
Ese spec mide la tarjeta Mosaico a 360 px: «Ver detalle completo» ≥ 44 de alto y el (i) del chip de estado
(`e2e/pwa-mensajero-botones-44.spec.ts:97-103`). El diff sube el texto de esos chips y de ese botón. La bitácora solo
corrió `pwa-mensajero-reparto`, `-mapa` y `-recoger-recoleccion` (`docs/perfil-agentes.md > reviewer`: pantallas sin
E2E afectados en local).
Qué falta: tras arreglar B1, correr en local `pwa-mensajero-botones-44` junto con los tres de antes y dejar la salida
en `progress/impl_SLT-200.md`. En CI el proyecto `e2e (reparto)` lo incluye y estaba `pending` al revisar.

### m1 — menor: la leyenda cambia también en escritorio (anillo, `gap-1` → `gap-2`, sin «Gestionada»)
El anillo y la retirada de «Gestionada» son el arreglo pedido, que no es solo del móvil (contraste en claro y oscuro):
aceptable. El `gap-2` no lo pidió nadie. Viene de la guardia `pwa-mensajero-sin-recorte`, que rechazó `gap-1.5`, pero
`gap-1` (el de dev) está en la escala de 4 px. Si se quiere el escritorio idéntico, volver a `gap-1` o dejarlo en
`max-md:gap-2`.

### m2 — menor: el tooltip no llega al lector de pantalla
Con el patrón `ContactoButtons`, el `aria-label` «Escanear con cámara» se conserva; está verificado por test y por
código: `TooltipTrigger render={boton}` mantiene `aria-label` y `onClick`. Base UI no enlaza el contenido con
`aria-describedby`, así que quien usa lector oye «Escanear con cámara» y no «Buscar escaneando la guía». Además, el
texto del tooltip no contiene el nombre accesible: un usuario de control por voz que diga lo que ve en el tooltip no
acierta (WCAG 2.5.3 aplica al rótulo visible; aquí no hay rótulo visible, por eso es menor).
- Se abre con foco de teclado (probado) y con hover. No se abre al tocar: está anotado en «No verificado».
- Opcional: el mismo texto como `title` o como descripción con `aria-describedby`.

### m3 — menor: comentarios con símbolo de moneda
En `KpisMensajero.tsx` («₡12.345.678», «₡99.999»): son la medida que justifica el umbral, no lógica, y la cifra sale de
`formatMonto`/`monedaConfig`. Mejor escribir «un importe de 8 dígitos con separadores (11 caracteres)», sin el
símbolo.

### m4 — menor: el mapa `R → test` de `impl_SLT-200.md` no tiene fila para el punto 5
Está en su sección («Test (punto 5 → test)»). Añadir la fila a la tabla para que la traza quede en un sitio.

### m5 — menor: caída de worker no atribuida en demo-qa
Mi primera corrida de `tests/integration/db/demo-qa.test.ts` acabó con `Worker exited unexpectedly` tras 11/14 en verde.
La segunda, idéntica y con `--reporter=verbose`, dio `14 passed (14)`. No la atribuyo al diff y no la pude reproducir.
Si sale en CI, mirar memoria del worker antes que la receta.

## Puntos que pidió el leader

1. **Rojo→verde de 1-7:** hecho; ver arriba (lo repetí en 1, 2, 3, 4, 6 y 7).
2. **Escritorio:** falla en Mosaico (B1); el resto queda igual (KPI, conmutador) o es el arreglo pedido (leyenda, m1).
3. **Recolección sin `escaneo`:** solo `RecoleccionModule.tsx` lo pierde. La guardia sigue igual de estricta:
   - `CON_ESCANEO` exige `escaneo` en los demás (incluido `RechazosSlaModule`, SLT-194 R949);
   - «ningún otro montaje» compara la lista exacta;
   - hay un caso nuevo con control de no vacuidad que fija que Recolección NO lo lleva.

   Ningún otro test ni E2E dependía de R940-R944 salvo `RecoleccionModule.test.tsx` y el E2E reescrito.
   `RechazosSlaModule` y el resto conservan su cámara; la guardia en verde lo confirma.
4. **Siembra demo:**
   - **No escribe a mano lo que la app deriva.** El peso va por `CorregirDatosClienteService` con
     `corregirDatosClienteSchema.parse`, igual que `lib/actions/corregir-datos-cliente.ts`. La secuencia sale de
     `buildOptimizacionRutaService().ejecutar(m, { motivo: "manual" })`, la fábrica de `lib/actions/ruta-mensajero.ts`.
     El monto entra por `plan(..., MONTO_A_COBRAR)`, como el resto de la receta.
   - **Orden de pasos:** el orden peso → reparto → sincronizar → por recoger respeta la guarda SLT-79 (80 % recogido).
   - **Idempotente:** la segunda ejecución y la «cortada a mitad» pasan en verde.
   - **Otros E2E:** grep sin usos de `DEMO-A-0xx` ni del `mensajero-reposo` en `e2e/`.
   - **Jobs de ruta:** «0 jobs `optimizacion_ruta`» (R22) se mantiene.
5. **Contraste**, con los tokens reales de `app/globals.css`. La leyenda va sobre `bg-background`: sin contenedor en
   la vista normal y `bg-background` a pantalla completa (`RutaMapaInner.tsx:385`).
   - Anillo `ring-foreground` contra el fondo:
     - claro: #111111 sobre #F7F7F5 = **17.60:1**;
     - oscuro: #F7F7F5 sobre #111111 = **17.60:1**;
     - ≥ 3:1 en los dos temas, para los tres puntos sea cual sea su relleno.
   - «Tú» del marcador: #111111 sobre `--color-success` #10b981 = **7.44:1**, calculado por mí (antes, blanco: 2.54:1).
   - El relleno «Pendiente» (#111111) sigue a 1.00:1 en oscuro, pero lo delimita el anillo, que es lo que se pidió.
6. **Accesibilidad:** el `aria-label` está intacto, el tooltip se abre con el foco y el nombre accesible no se toca.
   Las limitaciones están en m2. Con `escaneo` puesto, la ayuda visible bajo el campo sigue ahí.

## Veredicto

**RECHAZADO.** Dos bloqueantes:
- **B1:** la tarjeta Mosaico cambia de tamaño en escritorio (Novedades incluida). El test impide arreglarlo sin
  tocarlo.
- **B2:** falta en local el E2E `pwa-mensajero-botones-44`, que mide esa tarjeta.

Los puntos 1, 2, 4, 5, 6 y 7 están bien hechos y probados. Tras arreglar B1, la vuelta 2 puede ir acotada a su diff y a
la salida de los E2E.

## Vuelta 2 (acotada a b9bd54de..2b1dbab9)

Commits: `db80576a` (wip), `e5c80aa3` (B1-B2, m1-m4), `2b1dbab9` (`flex-wrap` en la cabecera por el CI del #226).
Ningún archivo de `e2e/` cambia en el rango (`git diff --stat b9bd54de..2b1dbab9 -- e2e` vacío).

### Checklist
- [x] **B1 cerrado.** Comparé, con un script, las 43 `className` de `PosOrderCardMosaico.tsx` contra el merge-base con
  dev (`ede99e23`), quitando los tokens `max-md:`. Son idénticas a dev salvo una: la cabecera, que añade `flex-wrap`
  (ver m6). La guía vuelve a `font-mono text-xs font-bold tracking-wide`. Insignia, «Sin posición», intentos, mensajero
  y aviso vuelven a `text-[11px]`. Chips, «Cobrar» y «Ver detalle» vuelven a `text-[10px]`, la dirección a
  `text-[0.6875rem]` y el icono a `size-3`. El móvil sube con `max-md:`. No hay ninguna clase `md:` de tamaño.
- [x] **El test fija el escritorio.** El bloque «desde md, la tarjeta Mosaico como antes» escribe a mano guía 12/mono,
  «Sin posición»/producto/intentos 11, «Cobrar»/«Ver detalle» 10, producto mono, icono `size-3` y ninguna `md:` de
  tamaño. `tamano(…, "escritorio")` ignora `max-md:`, así que un arreglo correcto ya no da rojo. Hueco: m7.
- [x] **B2.** La bitácora registra `--project=reparto`: `48 passed`, con `pwa-mensajero-botones-44` 5/5. Según el
  leader, `e2e (reparto)` de CI pasó en `e5c80aa3`. Yo no lo corrí en local porque necesita `next build`.
- [x] **Guía en un solo nodo; por qué fallaban los E2E.** La cabecera tiene un único `<p>` con la guía. Lo fija el test
  nuevo. Fuera de él, la guía solo sale en el detalle plegado. El proyecto `reparto` de Playwright es
  **Desktop Chrome** (`playwright.config.ts:118-119`). En `b9bd54de` los chips iban a `text-xs` en todos los anchos. En
  la columna estrecha de «Recoger en bodega», la cabecera (`flex` sin `wrap`, chips `shrink-0`, guía `min-w-0`) dejaba
  la guía a 0 px. Por eso `.first()` encontraba el único nodo y Playwright lo veía `hidden`. No era un duplicado.
  - En `e5c80aa3` el escritorio recupera los chips de 10 px, la cabecera vuelve a caber y el CI pasa.
  - `2b1dbab9` añade `flex-wrap` para el móvil, donde los chips siguen a 12 px.
  - La bitácora cuenta que con la tarjeta de `d8bf6e62` el rojo se reprodujo y que con solo `flex-wrap` sale verde.
  - Ningún E2E se tocó para que pase.
- [x] **m1:** la leyenda queda en `gap-1 max-md:gap-2` (`gap-1` es el de dev, `RutaMapaInner.tsx:165` en `ede99e23`).
- [x] **m2:** hay un `useId` y un `<span id sr-only>` con la ayuda. `aria-describedby` solo se pone si hay `ayuda`. El
  `span` se pinta siempre que haya ayuda, así que el id nunca queda colgando. El botón llega por
  `TooltipTrigger render`, que conserva el atributo: el test `toHaveAccessibleDescription("Buscar escaneando la guía")`
  sale verde. El caso del foco busca el tooltip con `:not(.sr-only)`, así que no lo satisface la descripción oculta.
- [x] **m3:** los comentarios de `KpisMensajero.tsx` y de su test ya no llevan el símbolo de moneda.
- [x] **m4:** la fila del punto 5 está en la tabla `R → test` (`impl_SLT-200.md:88`).
- [x] **Clases nuevas sin `max-md:`:** solo dos.
  - `flex-wrap` (m6) no cambia ningún tamaño.
  - `sr-only` del `EscanerModal` no se ve.
  - El resto del rango son comentarios.
- [x] **Tests del rango, corridos por mí** (con `con-desechable`): `PosOrderCardMosaicoLegible`, `KpisMensajero` y
  `buscador-filtros-camara-tooltip` dan **3 files / 21 tests passed**, `EXIT=0`.
- [ ] **CI de `2b1dbab9`:** al revisar, `e2e (reparto)`, `vitest` y `estatico` seguían `pending`
  (run 44412018046).

### Hallazgos

#### m6 — menor: `flex-wrap` va en todos los anchos
`<header className="flex flex-wrap items-start justify-between gap-2">`. Si la cabecera cabe en una línea, `flex-wrap`
no cambia nada: una sola línea flex se reparte igual que con `nowrap`. Eso es lo que pasa en escritorio en los casos de
los E2E, que salen verdes en `e5c80aa3` sin él.
Si en escritorio NO cabe (tarjeta muy estrecha, muchos chips o una guía larga), el resultado cambia:
- en dev, la guía (`wrap-anywhere`) se partía en varias líneas junto a los chips;
- ahora los chips bajan de línea y la guía queda entera.

Es una mejora y es coherente con SLT-156 («la guía no se parte»), pero difiere de prod en ese caso límite. No lo medí
en navegador. Si Carlos quiere el escritorio idéntico, basta `max-md:flex-wrap`, porque el problema solo existe con los
chips a 12 px. Si no, se acepta como está.

#### m7 — menor: el test «desde md» no fija todos los tamaños que dice
El nombre del caso dice «…chip…», pero en `casos` no hay ningún chip. Tampoco están la insignia de parada (11), la
dirección (0.6875rem), el mensajero ni el aviso de reserva (11). Si se cambia la base de uno de ellos (por ejemplo, el
chip a `text-xs`), la suite sigue verde, porque el test del móvil no lo detecta. Hoy el código coincide con dev (lo
comprobé con el script). Conviene añadirlos a `casos`.

#### m8 — menor: el test nuevo no mide el ancho
«la cabecera de la tarjeta envuelve» afirma la clase `flex-wrap` y que la guía tiene un solo `<p>`. jsdom no da anchos,
así que no puede exigir «visible con ancho > 0». Eso lo exige el E2E `mis-asignaciones` (`.first()` + visible, sin
tocar), que es la guarda real. Es aceptable. Lo anoto para que nadie lo tome por una medida.

### Veredicto vuelta 2

**OK.** B1 y B2 están cerrados y m1-m4 arreglados. Los tres hallazgos nuevos son menores (m6-m8). Queda una condición
del gate, no de esta review: que el `gate-completo` de `2b1dbab9` (run 44412018046) termine en verde antes del aviso de
merge.
