# impl_SL-33 — paleta-secundaria

> Bitácora del implementer. Spec: `specs/SL-33-paleta-secundaria/`. Worktree
> `.worktrees/SL-33-paleta-secundaria/`, rama `feature/SL-33-paleta-secundaria`.

## T0 — Traer `dev` (SL-9)

- `git merge origin/dev` sin conflictos (commit de merge `94969c2`).
- Presentes: `scripts/capturas-pwa.mjs`, `specs/SL-9-marca-pwa-capturas-iconos/` y la guardia.
- Nombre real de la guardia: `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts`
  (coincide con «Archivos esperados»; no hace falta corregir la lista).
- Umbral actual: `UMBRAL_MARCA_ANTERIOR = 0.018` (< 1.8 %), con `UMBRAL_MARCA_NUEVA = 0.01`.
- Capturas en `public/screenshots/`: `ingreso-narrow.png`, `inicio-narrow.png`, `inicio-wide.png`
  (mismos nombres que la lista).

## T1 — Guardia nueva, en rojo

Archivo creado: `tests/unit/guards/paleta-secundaria.guardia.test.ts` (54 casos). Lee con
`token()`, `paleta()`, `tokenAlImprimir()` y `reglasDe()` de los fixtures; mide con `contraste()` y
`componer()` de `tests/fixtures/contraste.ts`.

El worktree no tiene `node_modules` enlazado: `pnpm exec vitest` no encuentra el binario. Se corrió
el `vitest`, `tsc` y `eslint` del checkout principal (`node ../../node_modules/...`) con el
worktree como cwd.

Salida (`vitest run tests/unit/guards/paleta-secundaria.guardia.test.ts`):

```
Test Files  1 failed (1)
     Tests  23 failed | 31 passed (54)
```

Rojos, todos por valor:
- R1 (claro, papel, impresión) y R2 (`.dark`, `.tema-sistema`): los 20 `--chart-N` son los viejos.
- R3 claro: 9 pares bajo 3:1 (p. ej. `#84cc16` 1.84). `.dark` y `.tema-sistema`: `#1a56db` 2.76 s/ tarjeta.
- R4 chart-5/7/11/12: no hay `--color-chart-{5,7}-soft` ni `-strong` de esos índices; los de 11/12 no son `componer()`.
- R5: `COLOR_SEGMENTO`/`VARIANTE_CONTADOR` siguen en 6/11/12/13 y `badge.tsx` no tiene `chart5`/`chart7`.
- R7: 23 tokens grises fuera de `stone`. R9: 33 declaraciones con azulados.
- R8: solo las dos filas de la excepción de `asfalto-2` (1.31 y 1.22 frente a 1.26 y 1.17 fijas).
- R11: `asfalto-9` es `#0d2444`. R13: faltan las dos tablas en `docs/marca.md`.
- R17: 17 fallos en `offline.html`. R18: cuerpo y botón (3.18). R19: pin y tramo `#f26419` (2.77 s/ tierra, 1.63 vs ruta).
- R20: 25 archivos con HEX de SL-8 D5.

Verdes reales, legítimos: R6 (los segmentos actuales ya pasan 3:1 sobre la pista), R8 salvo la
excepción (los valores aún no cambian, así que «después ≥ antes» se cumple), R10, R12, R16 y el
suelo del recorrido de R20 (2.866 archivos de texto).

Typecheck (`tsc --noEmit`): exit 0, 0 errores. ESLint sobre el archivo: exit 0.

### Diferencias de cifras, spec frente a fixture

| Dónde | Par | Spec | Fixture |
|---|---|---|---|
| D2 | `--chart-12` oscuro `#facc15` s/ tarjeta `#1C1C1A` | 11.14 | 11.15 |
| D4 | `chart-12` `-strong` oscuro s/ tarjeta | 11.14 | 11.15 |

El resto de cifras de D2, D3, D4, D5 (incluidos los vecinos descartados y las separaciones), D13,
D14, D15 y la alternativa 6 coincide a dos decimales. Ninguna diferencia rompe un requisito.

### Hallazgo para D12

`docs/marca.md:106` (nota «Hecho en SL-9») lleva `#0d2444` y no está en el inventario de D12. T6
edita ese archivo. `KpisMensajero.tsx` ya no lleva `#10203a`: D12 lo listaba, pero tras T0 no aparece.

## T2, T3, T4, T6 — tokens, monitoreo, grises y `docs/marca.md` (hechas)

- `app/globals.css`: 20 `--chart-N` en los 5 bloques; pares `chart-{5,7,11,12}` `-soft`/`-strong`;
  grises a `stone`, con `asfalto-2` a `stone-200` (P1).
- `components/ui/badge.tsx`: variantes `chart5`, `chart7`, `chart11` y `chart12`.
- `app/(app)/monitoreo/_components/contadores.ts`: `COLOR_SEGMENTO`, `VARIANTE_CONTADOR` y comentarios.
- `docs/marca.md`: tablas «Paleta de gráficas» y «Grises cálidos» con las cifras del fixture; se
  quita «No cambian con la marca…»; la nota «Hecho en SL-9» se reescribe sin `#0d2444`.
- `design.md`: 11.14 → 11.15 en D2 y D4 (vale el fixture); D8 ampliado; entrada `docs/marca.md:106` en D12.
- R8: ninguna cifra del fixture rompe el «como mínimo».

## T5 — cifras de guardias (BLOQUEADA en un caso)

Cambios de literales (antes → después):
- `contraste-tokens.guardia`: `PARES_CHART` 6/11/12/13 → 5/7/11/12. `SUELO` del Badge cambia de clave
  porque los pares son otros (D4/D8): claro 5.98/6.38/9.45/8.49 → 5.28/5.44/6.06/5.46; oscuro
  7.24/7.21/8.92/6.89 → 5.20/5.04/7.98/7.88 (son suelos menores con el mismo `toBeGreaterThanOrEqual`;
  los prescribe D4/D8 y `AA_TEXTO` 4.5 no cambia; para el reviewer). Suben: `SUELO_ANILLO.claro`
  3.33→3.45, `SUELO_RING.claro` 16.7→17.31, `claro:icono` 6.8→9.42, `claro:anillo` 16.7→17.31,
  `landing:icono` 6.99→9.42, `landing:anillo` 17.15→17.31.
- `factura-contraste.guardia` (suben todos): P2 17.15→17.31, P3 18.2→18.25, P4 18.06→18.09,
  P5 7.7→10.27, P6 6.99→9.42, P7 7.42→9.93, P8 7.36→9.84, P24 7.18→9.58, P25 16.7→17.31.
- `impresion-sin-dark.guardia`: F4 11.39→15.17 (y el texto del CSS), P23 `antes` 17.78→17.66.
- `impresion-tokens.guardia`: T6 7.7→10.27; P3/P4 1.23→1.26; roles `chart-6/13-strong` → `chart-5/7-strong`.
- `marca-texto-amarillo.guardia`: dos `medido` 10.55→11.89.
- Ningún `it` borrado.

**Bloqueo (decisión humana):** `contraste-tokens.guardia.test.ts` > «la alternativa descartada
(hover con capa `danger/20`) sigue sin cumplir: por eso es opaco». Con `--secondary` en `stone-100`,
`danger/20` mide 4.62 sobre `--secondary` (antes 4.44): ya cumple AA en todas las superficies
(mín. claro 4.62, oscuro 4.54). El test dice que en ese caso «hay que releer la decisión, no
heredarla»; cambiar `toEqual(["claro/secondary"])` a `[]` invertiría lo que protege. Queda en rojo.
Opciones: mantener el hover opaco con otro argumento y reescribir el caso, o reabrir la decisión de
la feature 222.

Pendiente menor fuera de alcance: `components/ui/button.tsx:27` comenta «16.70 / 10.68 y
`ring-destructive` 3.33 / 5.68»; en claro ahora son 17.31 y 3.45. No está en «Archivos esperados».

## T6a, T6b, T6c — estáticos, mapas, comentarios y maquetas (hechas)

- `public/offline.html` con los 7 valores de D13; `app/global-error.tsx` fondo `#111111`, botón
  `#111111` sobre `#FFD000`, comentario l. 22-26 reescrito.
- Pin (`UbicacionMapaInner.tsx`) y tramo (`RutaMapaInner.tsx`) en `#111111`; comentarios «Negro Servi».
- Comentarios sin HEX: `tabs.tsx`, `EstatusBadge.tsx`, `ProductosTabla.tsx`. `KpisMensajero.tsx` no
  se toca (ya no lleva `#10203a` tras T0). `DESIGN.md:14` corregido. 15 maquetas: solo HEX.
- D12 dice «133 apariciones»: son 155 apariciones en 133 líneas.
- Desviaciones de rol en maquetas (D12):
  - el cuadrado del logo de la barra lateral en `design-whatsapp/{Formulario,Historial,Main}` va en
    `#FFD000` (par `--sidebar-primary`, 11.60), no `#111111` (≈1.1:1 sobre `#1C1C1A`, invisible);
  - en `design-notificaciones/Push.dc.html` los cuadrados de icono quedan `#111111` con glifo blanco
    (18.88), pero su borde casi no se separa de la tarjeta translúcida: a revisar en T7;
  - la regla `a { color }` de esa maqueta queda `#111111` sobre oscuro; no hay ningún `<a>`.
- Cifras D13–D15 cuadran con el fixture (17.60, 9.58, 4.47, 18.88, 12.84, 16.45, 3.65).

## Salidas (corridas de los subagentes y del implementer)

- Implementer, `vitest run paleta-secundaria.guardia + contraste-tokens.guardia`:
  `Test Files 1 failed | 1 passed (2) · Tests 1 failed | 104 passed (105)`; el único rojo es el caso
  `danger/20` del bloqueo. `paleta-secundaria.guardia`: 54/54.
- `vitest run tests/unit/guards/ color-contador TableroDiaComposicion analytics-paleta`:
  `Tests 9 failed | 3198 passed | 4 skipped (3211)`. Rojos: el caso `danger/20`; 5 de
  `dependencias-declaradas-presentes` (entorno: el worktree no tiene `node_modules`); y timeouts por
  carga en `factura-contraste`, `impresion-flujo`, `sin-estados-retirados` y `filtros-url-r25`
  (corridos aparte: verdes salvo `sin-estados-retirados`, por tiempo y ajeno a colores).
- Tests de los «Hecho» de T6a–T6c, todos verdes: `RedDeErrores` 27, `html-lang` 3, `marca-estaticos` 16,
  `pwa-servida-sin-sesion` 11, `RutaMapaInner` 3, `UbicacionMapa` 3, `primitivas` 33,
  `sin-integrador-de-ordenex` 7, `docs-marca-heredada` 42, `notifications-bell-tokens` 7,
  `sin-nombre-heredado` 14.
- `vitest related` de `badge.tsx`/`contadores.ts`: `Tests 2 failed | 4280 passed`; los 2 de
  `wallet-page.test.tsx` pasan 19/19 aparte (carga). `related` de los .tsx de T6a–c: 6 rojos por
  timeout en `DetalleMensajeroPanel` (28/28 aparte), `CierresDescargaColumnas`,
  `ControlDescargaTransversal` y `BajoRiesgoPaginacion`; en esos .tsx solo cambiaron comentarios.
- `tsc --noEmit`: exit 0. `eslint` sobre los archivos tocados: exit 0.

## T5 — cierre del caso `danger/20` (decisión humana 2026-10-28)

El hover destructivo sigue opaco; no se reabre la 222. En `contraste-tokens.guardia.test.ts` el caso
pasa a «la alternativa descartada (hover con capa `danger/20`) cumple AA por márgenes mínimos y el
hover opaco le saca un orden de magnitud: por eso sigue opaco». Argumento: una primitiva no sabe
dónde la montan y no puede fiarse del alfa. Aserciones, por tema y en la peor superficie:
`margenAlternativa <= TOPE_MARGEN_ALTERNATIVA` (0.12) y `margenOpaco > 10 * margenAlternativa`.

| Tema | `danger/20` peor (secondary/muted) | Hover opaco |
|---|---|---|
| Claro | 4.6171, margen 0.117 | 6.47, margen 1.97 |
| Oscuro | 4.5408, margen 0.041 | 6.1702, margen 1.67 |

El tope 0.12 es el máximo medido (0.117) redondeado hacia arriba. `button.tsx` no se toca. D8 lo anota.

## Entorno del worktree

- `pnpm install --frozen-lockfile` (aprobado por el humano el 2026-10-28) sin dependencias nuevas.
- `prisma generate` con una `DATABASE_URL` ficticia de localhost: solo lee el esquema y no se conecta.

## Salidas finales (implementer, binarios del worktree)

- `pnpm exec vitest run` de los 11 tests de la feature (paleta-secundaria, contraste-tokens,
  impresion-tokens, impresion-sin-dark, factura-contraste, marca-texto-amarillo, tema-encendido,
  color-contador, TableroDiaComposicion, analytics-paleta, marca-pwa-capturas-iconos):
  `Test Files 11 passed (11) · Tests 320 passed (320)`.
- `pnpm run test:guardias`: `Test Files 1 failed | 316 passed | 2 skipped (319) · Tests 4 failed |
  4457 passed | 20 skipped (4481)`. El único archivo rojo es `dependencias-declaradas-presentes`,
  listado en `tests/baseline-rojos.json` e idéntico a `origin/dev` (`init.sh`, el verificador y el test):
  no es de esta feature.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `pnpm exec eslint` sobre los `.ts`/`.tsx` del diff: exit 0.
- Grep de «Ordenex» (T9): vacío en los archivos de código, docs, maquetas y tests del diff. Solo
  aparece en `specs/SL-33-*/` y en esta bitácora, como nombre de la regla (R16, «Decisiones
  cerradas», la tarea T9 y el nombre de la guardia `sin-integrador-de-ordenex`), no como recurso.

## Mapa R → test

| R | Test | Estado |
|---|---|---|
| R1, R2, R3 | `tests/unit/guards/paleta-secundaria.guardia.test.ts` (bloques R1–R3), `tests/unit/components/analytics-paleta.test.ts` | verde |
| R4 | `paleta-secundaria.guardia` (R4), `tests/unit/guards/contraste-tokens.guardia.test.ts` (`PARES_CHART`, `SUELO`) | verde |
| R5 | `paleta-secundaria.guardia` (R5), `tests/unit/tablero-dia/color-contador.guardia.test.tsx` | verde |
| R6 | `paleta-secundaria.guardia` (R6), `tests/components/TableroDiaComposicion.test.tsx` | verde |
| R7, R8, R9, R10, R11 | `paleta-secundaria.guardia` (R7–R11; R8 con la excepción de `asfalto-2` a cifra exacta) | verde |
| R12 | `paleta-secundaria.guardia` (R12), `tests/unit/guards/tema-encendido.guardia.test.ts` | verde |
| R13 | `paleta-secundaria.guardia` (R13, tablas de `docs/marca.md` con cifras del fixture) | verde |
| R14 | Guardias de D8 con literales nuevos: `contraste-tokens`, `factura-contraste`, `impresion-tokens`, `impresion-sin-dark`, `marca-texto-amarillo`; el diff de umbrales está en «T5» arriba | verde |
| R15 | `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts` (`UMBRAL_MARCA_ANTERIOR` 0.018 → 0.001, capturas regeneradas en T8) | verde |
| R16 | `paleta-secundaria.guardia` (R16) | verde |
| R17 | `paleta-secundaria.guardia` (R17), `marca-estaticos.guardia` | verde |
| R18 | `paleta-secundaria.guardia` (R18), `tests/components/RedDeErrores.test.tsx` | verde |
| R19 | `paleta-secundaria.guardia` (R19: pin y tramo `#111111`, contraste contra `TIERRA_OSM` y contra la ruta) | verde; la captura del mapa sobre OSM es verificación manual del humano, pendiente |
| R20 | `paleta-secundaria.guardia` (R20, barrido sin exclusiones añadidas) | verde |

## T7 — Verificación en el navegador (alcance reducido, decisión humana 2026-10-28)

Montaje: `pnpm dev -p 3044` con un entorno vacío más la `DATABASE_URL` local (host `localhost`,
autorizada por el humano; no se escribe en ningún archivo). Sin Supabase ni dobles de sesión.
Servidor apagado al terminar (el árbol de procesos entero); el 3044 queda libre y el 3000 no se tocó.

Capturas en `_trabajo/SL-33/` (fuera de git), en claro y en oscuro:
- `/`: bien. Los títulos de servicios, «Cómo funciona» y «Trabajá con nosotros» salen en `#1c1917`
  (`stone-900`): **ya no son navy**.
- `/login`: bien; botón principal `#111111` con texto blanco.
- `/offline.html`: bien; fondo `#F7F7F5`, título `#111111`, texto `stone-700`, icono `stone-500`.
- `global-error` (forzado con un `throw` temporal en `app/layout.tsx`, ya revertido; `app/` sin
  cambios): fondo `#111111`, texto blanco, botón `#FFD000` con tinta negra.
- `design-whatsapp/Main.dc.html`: legible; barra `#1C1C1A`, texto `#C0C0BE`, ítem activo `#2E2E2C`.
- `design-notificaciones/Push.dc.html`: legible. El cuadrado de icono `#111111` sobre la tarjeta
  (`#343433`) no lleva borde y su contorno queda en ≈1.5:1: se distingue, pero es más tenue que con el
  naranja de antes. El glifo blanco mide 18.9:1. Se anota y no se trata como fallo.
- Claro y oscuro dan la misma imagen en estas pantallas: la landing y `/login` fijan `tema-claro`,
  `offline.html` y las maquetas no tienen variante oscura y `global-error` usa estilos en línea.
- **D5, punto 1:** no aplica en lo público. Ni `/` ni `/login` muestran un botón `secondary`, y esa
  variante solo se usa en el área privada.

**Verificación manual del humano, pendiente:** `/analitica` (series distinguibles), `/monitoreo`
(barra y tarjetas concuerdan), `/ranking` (podio), los dos mapas de `/mis-asignaciones` (pin y tramo
sobre el mapa) y el color real de la tierra de OSM. `TIERRA_OSM` queda como está (`#f2efe9`).

## T8 — Capturas de la PWA

`CAPTURAS_URL=http://localhost:3044 node scripts/capturas-pwa.mjs`: exit 0 y las 3 capturas
regeneradas. No pidió sesión. Medida con el método de la guardia (`sharp`, distancia RGB ≤ 24 al
naranja y al navy de SL-8 D5); el naranja da 0 % en todas.

| Captura | Marca anterior, antes (SL-9) | Ahora | Marca nueva, antes | Ahora |
|---|---|---|---|---|
| inicio-narrow | 1.289 % | 0.039 % | 18.509 % | 19.748 % |
| ingreso-narrow | 0.015 % | 0.015 % | 4.197 % | 4.197 % |
| inicio-wide | 0.836 % | 0.020 % | 23.020 % | 23.829 % |

Umbral: `UMBRAL_MARCA_ANTERIOR` 0.018 → **0.001** (< 0.1 %), con el criterio de SL-9 D2. El máximo
medido (0.039 %), redondeado hacia arriba a la décima, da 0.1 %. Las capturas de la marca anterior
miden como mínimo 2.283 %: el hueco es claro, unas 23 veces el umbral, y además el umbral nuevo
pondría en rojo las capturas de SL-9 con el título navy. El navy que queda son píxeles sueltos de
suavizado. La guardia solo guarda las huellas prohibidas de la marca anterior y no hay huellas de
las capturas actuales que actualizar.

Salida (implementer): `vitest run marca-pwa-capturas-iconos.guardia + capturas-pwa + paleta-secundaria.guardia`:
`Test Files 3 passed (3) · Tests 95 passed (95)`.
