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
