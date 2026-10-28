# SL-33 — paleta-secundaria · design.md

## Lo que ya existe

Busqué `paleta de gráficas`, `grises cálidos`, `stone`, `chart`, `asfalto`, `kraft-inset` y
`TituloSeccion` en tres sitios:
- en `feature_list.json`, por nombre y descripción;
- en `specs/` con grep;
- en el código, con el grafo (`search_graph`) y con Grep.

Esto es lo que apareció:

| Dónde | Qué | Qué se hace |
|---|---|---|
| `specs/SL-8-marca-logo-paleta-fuente/requirements.md` D8 y D9 | SL-8 dejó fuera, a propósito, `--chart-1/2` y los grises fríos: «van a una ficha aparte». | Esta es esa ficha. No hay solape: SL-8 no los tocó. |
| `app/globals.css`, feature 292 | Los cuatro pares `-soft`/`-strong` de `--chart-6/11/12/13`, la variante del `Badge` y la barra del monitoreo. | Se reutiliza su forma (D3, D4); cambian los valores y los índices. |
| `tests/fixtures/contraste.ts` | `contraste()`, `componer()`, `token()`, `paleta()`. | Es la única aritmética que se usa. No se escribe otra. |
| `components/private/analytics/paleta.ts` | Los 20 `--chart-N` por índice, con respaldo `var(--chart-1)`. | No cambia: solo cambian los valores de los tokens. |
| `scripts/capturas-pwa.mjs` y la guardia de SL-9 | Capturas de la PWA y umbral de «marca anterior». | Se reutilizan tal cual (D11). Hoy **no están en esta rama**: llegan en T0. |

Nada de esto es la misma feature ni la resuelve ya.

## Contexto: dónde viven los tokens (verificado)

Las referencias de línea del leader no coincidían. Son estas, en `app/globals.css` a 2026-10-28:

| Bloque | Líneas | Qué tiene que tocar SL-33 |
|---|---|---|
| `@theme inline` | 104–238 | `--color-asfalto-*` (182–188), los `-soft` de la 292 (219–222) y `--color-kraft-inset` (237) |
| `:root, .tema-claro` | 274–352 | grises (287–295), `--chart-1..20` (305–324) y `--chart-N-strong` (348–351) |
| `@media print` › `.papel-al-imprimir` | 430–488 | lo mismo que el tema claro, hex a hex (lo exige `tema-encendido.guardia`) |
| `@media print` › `html .dark … html .tema-sistema` | 811–871 | lo mismo que el tema claro, hex a hex (lo exige `impresion-tokens.guardia`) |
| `.dark, body:has(> .dark)` | 889–956 | solo `--chart-1..20` y `--chart-N-strong` |
| `@media (prefers-color-scheme: dark)` › `.tema-sistema` | 977–1035 | lo mismo que `.dark`, hex a hex |

`.dark` y `.tema-sistema` **no** redefinen grises azulados ni `asfalto-*`. Sus grises son las mezclas
de SL-8 (`#232323`, `#B2B2B1`, `#2D2D2C`, `#363635`) y no se tocan (R12). `asfalto-*` y
`kraft-inset` son de valor fijo en `@theme`: no giran.

## D1 — Paleta de gráficas: los 20 valores, en los seis sitios

Los HEX son los de la tabla aprobada, sin tocar. Se escriben en minúsculas, como el resto de
tokens del bloque. El orden es el de siempre, 1…20, porque `paleta.ts` asigna por índice.

- Tema claro, `.papel-al-imprimir` y bloque de impresión de la 224 → columna «Claro».
- `.dark` y `.tema-sistema` → columna «Oscuro».

`analytics-paleta.test.ts` sigue exigiendo que los 20 existan en `:root` y en `.dark`. Comprueba que
existan, no su valor, así que no cambia.

## D2 — Contraste de las 40 (R3)

Calculado a mano con la aritmética de `tests/fixtures/contraste.ts`: fondo claro `#F7F7F5`, tarjeta
clara `#ffffff`, fondo oscuro `#111111` y tarjeta oscura `#1C1C1A`. La guardia nueva lo recalcula
con el fixture. Si alguna cifra difiere en la segunda decimal, manda el fixture y se corrige aquí y
en `docs/marca.md`.

| Token | Claro | s/ fondo | s/ tarjeta | Oscuro | s/ fondo | s/ tarjeta |
|---|---|---|---|---|---|---|
| `--chart-1` | `#111111` | 17.60 | 18.88 | `#ffd000` | 12.84 | 11.60 |
| `--chart-2` | `#a16207` | 4.59 | 4.92 | `#fde68a` | 15.16 | 13.70 |
| `--chart-3` | `#0f766e` | 5.10 | 5.47 | `#2dd4bf` | 10.14 | 9.17 |
| `--chart-4` | `#b91c1c` | 6.03 | 6.47 | `#f87171` | 6.83 | 6.17 |
| `--chart-5` | `#1d4ed8` | 6.25 | 6.70 | `#60a5fa` | 7.43 | 6.71 |
| `--chart-6` | `#15803d` | 4.68 | 5.02 | `#4ade80` | 10.84 | 9.79 |
| `--chart-7` | `#7e22ce` | 6.51 | 6.98 | `#c084fc` | 7.15 | 6.46 |
| `--chart-8` | `#be185d` | 5.63 | 6.04 | `#f472b6` | 7.13 | 6.44 |
| `--chart-9` | `#0369a1` | 5.53 | 5.93 | `#38bdf8` | 8.81 | 7.97 |
| `--chart-10` | `#4d7c0f` | 4.66 | 4.99 | `#a3e635` | 12.52 | 11.32 |
| `--chart-11` | `#57534e` | 7.11 | 7.63 | `#d6d3d1` | 12.68 | 11.46 |
| `--chart-12` | `#854d0e` | 6.39 | 6.85 | `#facc15` | 12.33 | 11.14 |
| `--chart-13` | `#0d9488` | 3.49 | 3.74 | `#99f6e4` | 14.98 | 13.54 |
| `--chart-14` | `#dc2626` | 4.50 | 4.83 | `#fecaca` | 13.05 | 11.80 |
| `--chart-15` | `#2563eb` | 4.82 | 5.17 | `#bfdbfe` | 13.29 | 12.01 |
| `--chart-16` | `#16a34a` | **3.07** | 3.30 | `#bbf7d0` | 15.58 | 14.08 |
| `--chart-17` | `#9333ea` | 5.02 | 5.38 | `#e9d5ff` | 13.87 | 12.54 |
| `--chart-18` | `#db2777` | 4.29 | 4.60 | `#fbcfe8` | 13.66 | 12.35 |
| `--chart-19` | `#0284c7` | 3.82 | 4.10 | `#bae6fd` | 14.23 | 12.86 |
| `--chart-20` | `#78716c` | 4.47 | 4.80 | `#a8a29e` | 7.49 | 6.77 |

Las 40 llegan a 3:1. La más justa es `--chart-16` sobre el fondo claro: 3.07.

## D3 — Pares del monitoreo: se reasignan los índices (R5, R6)

La 292 eligió `chart-6/11/12/13` porque eran los colores de la maqueta: morado, marrón, gris y
azul oscuro. Con la paleta nueva, esos índices pasan a ser verde, piedra, ocre profundo y
petróleo claro. Si se quedaran:
- `devueltas` saldría verde, junto a `entregadas` (`success`, verde);
- `sinRecoger` saldría ocre, junto a `reprogramadas` (`warning`, ámbar).

Es justo la confusión que la 292 cerró. Se reasigna por familia:

| Contador | Antes | Ahora | Familia |
|---|---|---|---|
| `devueltas` | `chart-6` | `chart-7` | violeta |
| `incidentes` | `chart-11` | `chart-12` | marrón (ocre profundo) |
| `sinRecoger` | `chart-12` | `chart-11` | gris (piedra) |
| `enReparto` | `chart-13` | `chart-5` | azul |

Esto cambia tres cosas:
- `COLOR_SEGMENTO` y `VARIANTE_CONTADOR` en `contadores.ts`;
- las variantes de `Badge`: `chart6` pasa a `chart7` y `chart13` a `chart5`; `chart11` y `chart12`
  siguen, con consumidor cruzado;
- los tokens `--color-chart-{5,7,11,12}-soft` y `--chart-{5,7,11,12}-strong`, que sustituyen a los
  de 6, 11, 12 y 13.

La regla de la 292 se mantiene: la variante se llama como el token de su segmento, y la vigila
`color-contador.guardia.test.tsx`.

Lo que **no** se resuelve: en oscuro, `chart-12` (`#facc15`) queda cerca del `warning` fijo
(`#f59e0b`). Con la paleta anterior pasaba lo mismo entre `chart-11` (`#fdba74`) y `warning`. No
empeora, pero tampoco se arregla.

Contraste del segmento sobre la pista `bg-muted` (R6). Claro `stone-100`, oscuro `#232323`:

| Segmento | Claro | Oscuro |
|---|---|---|
| `chart-5` | 6.14 | 6.18 |
| `chart-7` | 6.40 | 5.95 |
| `chart-11` | 6.99 | 10.55 |
| `chart-12` | 6.28 | 10.26 |

Las cifras de `TableroDiaComposicion.test.tsx` («9.41 claro · 8.03 oscuro» de `chart-13`) pasan a
las de `chart-5`.

## D4 — `-soft` y `-strong` de los cuatro pares (R4)

- **`-soft` (solo claro).** Es `componer(--chart-N claro, #FFFFFF, 0.15)`, con la misma α que
  `--color-brand-soft`. Lo reproduce `componer()`, así que la guardia lo recalcula y no hace falta
  una tabla aparte.
- **`-strong`.** Es el propio color del segmento, en claro y en oscuro: los ocho pasan AA con
  margen. Así no hay un tono que no esté en la paleta aprobada.

| Par | `-soft` | `-strong` claro | s/ tarjeta · fondo · `-soft` | `-strong` oscuro | s/ fondo · tarjeta · `/15` sobre tarjeta |
|---|---|---|---|---|---|
| `chart-5` | `#dde4f9` | `#1d4ed8` | 6.70 · 6.25 · 5.28 | `#60a5fa` | 7.43 · 6.71 · 5.20 (`#26313c`) |
| `chart-7` | `#ecdef8` | `#7e22ce` | 6.98 · 6.51 · 5.44 | `#c084fc` | 7.15 · 6.46 · 5.04 (`#352c3c`) |
| `chart-11` | `#e6e5e4` | `#57534e` | 7.63 · 7.11 · 6.06 | `#d6d3d1` | 12.68 · 11.46 · 7.98 (`#383735`) |
| `chart-12` | `#ede4db` | `#854d0e` | 6.85 · 6.39 · 5.46 | `#facc15` | 12.33 · 11.14 · 7.88 (`#3d3619`) |

El más justo es `chart-7` en oscuro: 5.04. Está por encima del borde de 4.5 que la 292 consideró
insuficiente (4.69 y 4.89).

## D5 — Grises cálidos: mapeo a `stone` y cifras (R7, R8)

**Método.** Cada token se mide en los pares en que se usa de verdad, censados con Grep sobre
`app/` y `components/`:
- si hace de **tinta**, tinta sobre su superficie;
- si hace de **superficie**, la tinta que lleva encima sobre él;
- si hace de **línea**, la línea contra la superficie de al lado.

R8 exige que ningún par baje. La separación entre dos superficies, por ejemplo un fondo de hover
contra blanco, no es un par de contraste de WCAG: se anota abajo, pero no gobierna la elección.

En cada token se elige el `stone-N` más cercano al valor anterior que no baja ningún par.

| Token | Antes | Ahora | Pares (antes → después) |
|---|---|---|---|
| `--secondary` | `#eef1f8` | `stone-100` `#f5f5f4` | `#111111` encima 16.70 → 17.31 · anillo `destructive` encima 3.33 → 3.45 |
| `--muted` | `#f1f4fb` | `stone-100` `#f5f5f4` | `#111111` encima 17.15 → 17.31 · `--muted-foreground` encima 6.99 → 9.42 |
| `--muted-foreground` | `#4a5368` | `stone-700` `#44403c` | s/ tarjeta 7.70 → 10.27 · s/ fondo 7.18 → 9.58 · s/ `--muted` 6.99 → 9.42 |
| `--border`, `--input` | `#e3e8f2` | `stone-200` `#e7e5e4` | línea s/ tarjeta 1.23 → 1.26 · s/ fondo 1.15 → 1.17 |
| `asfalto-0` | `#f2f5fb` | `stone-100` `#f5f5f4` | sin uso en el árbol · `#111111` encima 17.29 → 17.31 |
| `asfalto-1` | `#e9edf6` | `stone-200` `#e7e5e4` | `asfalto-7` encima (podio 2.º) 9.71 → 12.08 · anillo `asfalto-4` 2.59 → 3.82 · línea s/ `kraft-inset` 1.07 → 1.15 · s/ blanco 1.17 → 1.26 |
| `asfalto-2` | `#dde1ee` | `stone-200` `#e7e5e4` | texto s/ `#111111` (opaco) 14.46 → 15.04 · premio `asfalto-9` encima 11.88 → 13.93 · línea en oscuro s/ `#1C1C1A` 13.07 → 13.59 · **línea s/ blanco 1.31 → 1.26 y s/ fondo 1.22 → 1.17 (P1)** |
| `asfalto-4` | `#8a94ad` | `stone-500` `#78716c` | placeholder s/ blanco 3.03 → 4.80 · s/ fondo 2.83 → 4.47 · anillo s/ `asfalto-1` 2.59 → 3.82 |
| `asfalto-5` | `#4a5368` | `stone-700` `#44403c` | s/ blanco 7.70 → 10.27 · s/ `kraft-inset` 6.99 → 9.42 · s/ fondo 7.18 → 9.58 |
| `asfalto-7` | `#1f3a63` | `stone-800` `#292524` | s/ blanco (papel, F4) 11.39 → 15.17 · s/ `kraft-inset` 10.35 → 13.90 · s/ `asfalto-1` 9.71 → 12.08 |
| `asfalto-9` | `#0d2444` | `stone-900` `#1c1917` | s/ blanco 15.52 → 17.49 · s/ fondo 14.47 → 16.30 · `#FFD000` encima 10.55 → 11.89 · blanco encima 15.52 → 17.49 |
| `kraft-inset` | `#f1f4fb` | `stone-100` `#f5f5f4` | `asfalto-7` encima 10.35 → 13.90 · `asfalto-5` encima 6.99 → 9.42 |

Los vecinos que se descartaron, por el par que bajaba:

| Token | Vecino | Par que baja |
|---|---|---|
| `--muted-foreground` y `asfalto-5` | `stone-600` | 7.63 sobre blanco, frente a 7.70. Le faltan 0.07, pero la regla es «como mínimo». |
| `asfalto-7` | `stone-700` | 10.27, frente a 11.39. |
| `asfalto-4` | `stone-400` | 2.52, frente a 3.03. |
| `--secondary` y `--muted` | `stone-200` | `#111111` encima da 15.04, frente a 16.70 y 17.15. |

`asfalto-0`, `--secondary`, `--muted` y `kraft-inset` quedan en el mismo `stone-100`;
`asfalto-1`, `asfalto-2`, `--border` e `--input`, en `stone-200`.

**Cuesta tres cosas, dichas para que el humano las vea:**
1. `stone-100` (`#f5f5f4`) es casi el fondo `#F7F7F5`. La separación de `--secondary` contra el
   fondo baja de 1.05 a 1.02, y la del hover `kraft-inset` sobre blanco, de 1.10 a 1.09. Un botón
   `secondary` sin borde sobre el fondo de la página se distinguirá menos. La única salida dentro de
   `stone` es `stone-200`, que baja la tinta y R8 lo prohíbe.
2. `--muted-foreground` sube de 7.70 a 10.27: el texto secundario queda más oscuro y se separa menos
   del principal (18.88). Lo fuerza R8 (ver `stone-600` arriba).
3. `asfalto-2` (P1).

**Por qué los HEX de Tailwind v3.** Tailwind 4 declara `stone` en `oklch()`. Este archivo declara
todos los tokens en HEX y `contraste.ts` solo lee HEX. Además, la tabla aprobada ya usa `stone` en
HEX de v3: `#57534E`, `#D6D3D1`, `#78716C` y `#A8A29E`. Se usan esos valores, escritos a mano. No
se usa `var(--color-stone-N)` de Tailwind: el lector de tokens no lo resolvería y las guardias
medirían en vacío.

## D6 — Comentarios con cifras dentro de `app/globals.css`

Se reescriben las cifras que cambian. No se añade historia nueva: la cifra anterior queda entre
paréntesis, como ya hace el archivo.
- l. 51–60, la fila mixta F4: `asfalto-7` `#1f3a63` 11.39 pasa a `#292524` 15.17, y «18.88 → 11.39»
  a «18.88 → 15.17». `impresion-sin-dark.guardia` busca ese texto (R14).
- l. 296–303, el anillo de foco: el peor de los seis pasa a ser `--secondary` y `--muted`, con 17.31.
- l. 208–218 y 343–351, y l. 946–955 en oscuro: los pares de la 292 con los índices y las cifras de
  D4.
- l. 753, `--muted-foreground` en papel: 2.12 → 10.27.
- l. 773, `--border`/`--input` en papel: → 1.26.

## D7 — El navy de la landing (R11)

`TituloSeccion` (`app/_landing/primitivas.tsx:80`) pinta `text-asfalto-9`. Al pasar `asfalto-9` a
`stone-900` (D5), el título deja el navy sin tocar el componente. Con él cambian, por el mismo
token, el resto de usos de `text-asfalto-9` y `bg-asfalto-9`. Están en Servicios, Postular, Cómo
funciona, Políticas, Nav, Rastreo, `EstadoInfo`, `app/page.tsx` y el podio.

## D8 — Guardias y tests existentes que fijan cifras o nombres (R14)

Se actualiza la cifra o el nombre. Ningún umbral se relaja y no se retira ningún caso.

| Archivo | Qué cambia |
|---|---|
| `tests/unit/guards/contraste-tokens.guardia.test.ts` | `PARES_CHART` y las ocho cifras de l. 74–81 pasan a D4. También el anillo sobre `--secondary` (l. 662 y 739) y el caso de la landing `asfalto-5`/`kraft-inset` (l. 818). |
| `tests/unit/guards/impresion-tokens.guardia.test.ts` | Las claves `--chart-N` y `--chart-N-strong` de la clasificación (l. 613–647). P3 y P4 pasan a `despues: 1.26`. |
| `tests/unit/guards/impresion-sin-dark.guardia.test.ts` | F4: 11.39 → 15.17. |
| `tests/unit/guards/factura-contraste.guardia.test.ts` | P2, P5–P8, P24 y P25 (tinta `--muted-foreground` y superficies `--muted`/`--secondary`, y sus composiciones). |
| `tests/unit/guards/marca-texto-amarillo.guardia.test.ts` | `CENSO_AMARILLO` sobre `asfalto-9`: 10.55 → 11.89. |
| `tests/unit/tablero-dia/color-contador.guardia.test.tsx` | Los nombres de familia del caso sintético (l. 125–142) y la concordancia real. |
| `tests/components/TableroDiaComposicion.test.tsx` | `chart-13` → `chart-5` y sus cifras (D3). |
| Guardia de SL-9 | Umbral y huellas (D11). |

`tema-encendido.guardia` y la parte de espejo de `impresion-tokens.guardia` no llevan cifras:
comprueban que los bloques coinciden hex a hex, y pasan si los seis sitios se editan juntos.

Puede aparecer alguna cifra más al correr los tests relacionados. Se trata igual: la nueva medida,
nunca un umbral más laxo.

## D9 — Guardia nueva: `tests/unit/guards/paleta-secundaria.guardia.test.ts`

Una sola guardia lleva la trazabilidad de la feature. Lee el CSS con `token()`, `paleta()` y
`tokenAlImprimir()` del fixture, nunca con un parser propio:
- **R1, R2:** compara los 20 `--chart-N` de claro, oscuro y papel con la tabla aprobada, copiada
  como literal y comentada con su origen.
- **R3:** 40 × 2 contrastes ≥ 3.
- **R4:** el `-soft` es `componer(chart, #FFFFFF, 0.15)`; los ocho `-strong` cumplen ≥ 4.5 en sus
  tres superficies.
- **R5:** `COLOR_SEGMENTO` y `VARIANTE_CONTADOR` dan la familia de D3 para los cuatro contadores.
- **R6:** los segmentos `chart-*` sobre `--muted`, ≥ 3, en los dos temas.
- **R7:** cada token gris vale el HEX `stone` de D5, también en papel.
- **R8:** la tabla de pares de D5 como literal: antes, superficie y tinta. Exige `después >= antes`
  salvo la fila marcada como P1.
- **R9:** ningún HEX de la lista aparece como valor de token. Se lee sin comentarios, porque los
  comentarios citan los valores viejos a propósito.
- **R10:** los ocho nombres siguen declarados en `@theme`.
- **R11:** `TituloSeccion` usa `text-asfalto-9`, y `asfalto-9` es `stone-900` y no está en la lista
  D5 de SL-8.
- **R12:** los tokens de `.dark` que no son `chart` coinciden con la tabla `docs/marca.md > Tema
  oscuro`.
- **R13:** cada HEX de las dos tablas nuevas de `docs/marca.md` es el del CSS.
- **R16:** los archivos de producción y docs de `tasks.md > Archivos esperados` no contienen
  «Ordenex».

Cada bloque lleva un caso sintético en rojo, como el resto de guardias del repo, para que no pase
en vacío.

## D10 — `docs/marca.md` (R13)

- Se quita la línea «No cambian con la marca: … los `--chart-*` …».
- Se añaden dos secciones después de «Tema oscuro»:
  - «Paleta de gráficas» con la tabla de D2;
  - «Grises cálidos (tema claro)» con la tabla de D5, con `stone-N`, HEX y pares.

## D11 — Capturas de SL-9 (R15)

SL-9 está en `dev` (PR #31), pero esta rama salió antes: hoy no tiene `scripts/capturas-pwa.mjs`, ni
la guardia, ni `specs/SL-9-*`. **T0 trae `origin/dev`**. Los nombres exactos de la guardia y del
umbral se confirman entonces. El leader los da como
`tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts` y «marca anterior < 1.8 %».

Procedimiento, con la decisión humana de SL-9:
1. Servidor con `pnpm dev -p 3044` y solo la `DATABASE_URL` local, sin el `.env` del worktree
   principal.
2. `node scripts/capturas-pwa.mjs`, que regenera `public/screenshots/*.png`.
3. Se mide y el umbral de la guardia baja al valor medido, redondeado hacia arriba a la décima.
   Se actualizan las huellas.

Va al final, cuando la paleta ya está cerrada: si la paleta cambia, las capturas se rehacen.

## Lo que no aplica (perfil `spec_author`)

- Sin modelo de datos, sin `organizacion_id`, sin RLS, sin migraciones ni `down.sql`: solo CSS y
  presentación.
- Sin autorización ni módulos: no hay rutas, acciones ni endpoints nuevos.
- Sin datos por país: el color no depende de moneda, geografía, impuestos ni métodos de pago.
- **Sin dependencias nuevas.** `stone` se escribe como HEX; no se instala nada.

## Verificación

- El gate lo corre CI (`gate-completo`). En local, por tanda:
  - `pnpm exec vitest related --run <archivos>`;
  - `pnpm run test:guardias`;
  - `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`.

  `./init.sh` no se pide.
- **Se mira en el navegador, no solo con tests** (como en SL-8), en `pnpm dev -p 3044`, claro y
  oscuro:
  - `/analitica` (series);
  - `/monitoreo` (barra y tarjetas);
  - `/ranking` (podio);
  - la landing `/`.

  Las capturas van a `progress/impl_SL-33.md`.

## Alternativas descartadas

1. **Dejar los pares del monitoreo en `chart-6/11/12/13`** y solo cambiar valores. Es menos diff,
   pero pone dos verdes y dos ámbar juntos en la barra (D3). Deshace lo que la 292 cerró.
2. **`var(--color-stone-N)` de Tailwind en vez de HEX.** No hay duplicado, pero el lector de tokens
   solo entiende HEX y todas las guardias de contraste medirían en vacío. Además, los valores
   `oklch` de v4 no son los de la tabla aprobada (D5).
3. **`stone-600` para `--muted-foreground` y `asfalto-5`.** Conserva la jerarquía visual, pero baja
   0.07 sobre blanco (7.63 frente a 7.70) y la decisión cerrada dice «como mínimo».
4. **Renombrar `asfalto-*` a `stone-*` o `piedra-*`.** Es explícitamente «Lo que NO entra».
5. **`-soft` como el `-100` de Tailwind de cada familia**, como hizo la 292. Mete cuatro HEX que no
   salen de la tabla aprobada. `componer()` los deriva y la guardia los recalcula.
