# SL-33 — paleta-secundaria · requirements.md

> **Zona** frontend · **Complejidad** medium · **depends_on** SL-8 · **Rama** `feature/SL-33-paleta-secundaria`
>
> **Alcance.** Retirar la paleta secundaria de la marca anterior de `app/globals.css`, en el tema
> claro, en `.dark` y en `.tema-sistema`:
> - los 20 `--chart-*` pasan a la paleta de gráficas aprobada (tabla en «Decisiones cerradas»), con
>   sus `-soft` derivados;
> - los grises azulados (`--secondary`, `--muted`, `--muted-foreground`, `--border`, `--input`,
>   `--color-asfalto-*`, `--color-kraft-inset`) pasan a la escala `stone` de Tailwind;
> - los títulos de sección de la landing dejan de salir en navy.
>
> Al final se regeneran las capturas de la PWA de SL-9 y se baja el umbral de su guardia.
>
> **Lo que NO entra.**
> - Renombrar `asfalto-*` ni `kraft-inset`: cambian los valores, no los nombres.
> - Los colores de marca ya fijados por SL-8 (negro, amarillo, fondo, tema oscuro de `docs/marca.md`).
> - Los colores semánticos de estado (éxito, error, aviso), salvo que sean literalmente el naranja o
>   el navy de la marca anterior.
>
> Sembrado por `/afinar-feature` el 2026-10-28. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

«Tema claro» es el bloque `:root, .tema-claro`. «Tema oscuro» es `.dark` y, hex a hex, `.tema-sistema`
bajo `prefers-color-scheme: dark`. «Bloques de impresión» son los dos `@media print` que repiten el
tema claro: `.papel-al-imprimir` y `html .dark, … html .tema-sistema`. Las cifras de contraste se
miden con `contraste()` y `componer()` de `tests/fixtures/contraste.ts`.

### Paleta de gráficas

- **R1.** El sistema DEBE declarar cada `--chart-N` (N = 1…20) en el tema claro y en los dos bloques
  de impresión con el HEX de la columna «Claro» de la tabla «Paleta de gráficas aprobada».
- **R2.** El sistema DEBE declarar cada `--chart-N` (N = 1…20) en `.dark` y en `.tema-sistema` con el
  HEX de la columna «Oscuro» de esa tabla.
- **R3.** El sistema DEBE dar a cada `--chart-N` un contraste de 3:1 o más sobre `--background` y
  sobre `--card` de su mismo tema, en claro y en oscuro.
- **R4.** El sistema DEBE dar a cada par de gráfica del `Badge` un `-soft` que sea
  `componer(--chart-N claro, #FFFFFF, 0.15)`. El `-strong` DEBE medir 4.5:1 o más en estos casos:
  - en claro, sobre `--card`, `--background` y su `-soft`;
  - en oscuro, sobre `--card`, `--background` y `--chart-N/15` compuesto sobre `--card`.
- **R5.** CUANDO el tablero del día pinta la barra de composición, el sistema DEBE pintar cada
  contador sin color semántico propio con el `--chart-N` de su familia de la maqueta:
  - `devueltas`, violeta;
  - `incidentes`, marrón;
  - `sinRecoger`, gris;
  - `enReparto`, azul.

  La tarjeta de cada contador DEBE llevar la variante de `Badge` del mismo `--chart-N` que su
  segmento.
- **R6.** El sistema DEBE dar a cada segmento `--chart-N` de la barra de composición un contraste de
  3:1 o más sobre la pista (`--muted`), en claro y en oscuro.

### Grises cálidos

- **R7.** El sistema DEBE declarar con un HEX de la escala `stone` de Tailwind estos tokens:
  - del tema claro: `--secondary`, `--muted`, `--muted-foreground`, `--border` e `--input`;
  - de `@theme`: `--color-asfalto-{0,1,2,4,5,7,9}` y `--color-kraft-inset`.

  El mapeo token → `stone-N` es el de `design.md > D5`. Los bloques de impresión DEBEN repetir los
  mismos valores que el tema claro.
- **R8.** Para cada par (tinta o línea, superficie) en el que se usa un token de R7, censado en
  `design.md > D5`, el sistema DEBE dar un contraste mayor o igual que el que daba con el valor
  anterior. Única excepción pendiente: la de la pregunta abierta P1.
- **R9.** El sistema NO DEBE declarar en ningún token de `app/globals.css` ninguno de los HEX
  azulados anteriores: `#eef1f8`, `#f1f4fb`, `#4a5368`, `#e3e8f2`, `#f2f5fb`, `#e9edf6`, `#dde1ee`,
  `#8a94ad`, `#1f3a63` y `#0d2444`.
- **R10.** El sistema DEBE seguir declarando `--color-asfalto-{0,1,2,4,5,7,9}` y
  `--color-kraft-inset` con esos mismos nombres.
- **R11.** CUANDO la landing renderiza un `TituloSeccion`, el sistema DEBE pintar el título con un
  color de la escala `stone` y NO DEBE usar ningún HEX de la marca anterior (lista de
  `specs/SL-8-marca-logo-paleta-fuente/design.md > D5`).
- **R12.** El sistema NO DEBE cambiar en el tema oscuro ningún token que no sea `--chart-N` ni
  `--chart-N-strong`.

### Documentación, guardias y capturas

- **R13.** `docs/marca.md` DEBE documentar dos tablas:
  - la paleta de gráficas: 20 tokens, claro y oscuro, con su contraste sobre fondo y tarjeta;
  - los grises cálidos: token, `stone-N`, HEX y contraste antes y después.

  Cada HEX de esas tablas DEBE coincidir con el de `app/globals.css`.
- **R14.** SI una guardia o un test existente fija una cifra medida o un HEX de un token que esta
  feature cambia, ENTONCES el sistema DEBE actualizar esa cifra a la nueva medida. NO DEBE relajar
  ningún umbral ni retirar ningún caso.
- **R15.** CUANDO se ejecuta `scripts/capturas-pwa.mjs` con la paleta nueva, el sistema DEBE
  regenerar `public/screenshots/`. La guardia de SL-9 DEBE pasar en verde con su umbral de la marca
  anterior bajado al valor medido y con las huellas nuevas
  (`specs/SL-9-marca-pwa-capturas-iconos/design.md > D2`).
- **R16.** El sistema NO DEBE contener el texto «Ordenex» en ningún archivo que esta feature cree o
  modifique. Los valores de color DEBEN salir solo de `docs/marca.md`, de la tabla aprobada, de la
  escala `stone` o de `componer()` sobre ellos.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| Paleta de gráficas: los 20 con la tabla aprobada | R1, R2, R4, R5 |
| Contraste de las gráficas, 3:1 sobre fondo y tarjeta | R3, R6 |
| Grises de `stone`, sin perder contraste y documentados | R7, R8, R9, R13 |
| No se renombran `asfalto-*` ni `kraft-inset` | R10 |
| Se regeneran las capturas de SL-9 y se baja el umbral | R15 |
| Fuente de la marca | R13, R16 |
| «Ordenex» desaparece | R16 |
| (Alcance) Los títulos de la landing dejan el navy | R11 |
| (Lo que NO entra) Los colores de SL-8 no cambian | R12 |

## Preguntas abiertas

- **P1. `asfalto-2` no cabe en un solo `stone` sin perder algo.** Hoy hace tres papeles:
  - texto claro con alfa sobre superficies oscuras (pie, hero, banda, políticas);
  - superficie del premio del 2.º puesto, con `asfalto-9` encima;
  - línea de borde sobre blanco (tarjetas de la landing, `DataTable`, `EstadoInfo`).

  `stone-200` conserva o sube el texto y la superficie, pero la línea baja de 1.31 a 1.26 sobre
  blanco y de 1.22 a 1.17 sobre el fondo. Es decorativa, no tiene mínimo WCAG y queda igual que
  `--border`. `stone-300` conserva la línea, pero baja el texto sobre oscuro de 14.46 a 12.68 y el
  premio de 11.88 a 11.74.

  **Propuesta: `stone-200`**, con esa línea como única excepción de R8. ¿Se acepta, o se prefiere
  `stone-300`, o separar los papeles cambiando clases?
- **P2 (no bloquea; fuera del alcance).** Siguen quedando restos de la marca anterior fuera de
  `app/globals.css`:
  - `public/offline.html` (`#0d2444`, `#12233f`, `#f26419`);
  - `app/global-error.tsx` (`#0d2444`, `#f26419`);
  - el pin y la ruta de los mapas del mensajero (`#f26419` en `UbicacionMapaInner.tsx` y
    `RutaMapaInner.tsx`).

  Esta ficha no los toca. ¿Ficha aparte?

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-28 | ¿Qué sustituye a los `--chart-*`? | Se rehacen los 20 con la paleta aprobada por el humano tras ver la propuesta en HTML en claro y oscuro (`_trabajo/SL-33/paleta-graficas.html`, fuera de git). Se usan los valores de la tabla de abajo. |
| 2026-10-28 | Contraste de las gráficas | Cada `--chart-N` llega a 3:1 o más sobre `--background` y sobre `--card` de su tema (WCAG 1.4.11). |
| 2026-10-28 | ¿De dónde salen los grises cálidos? | Escala `stone` de Tailwind (sin dependencia nueva). Cada token sustituido mantiene, como mínimo, el contraste que tenía. Se documentan en `docs/marca.md`. |
| 2026-10-28 | ¿Se renombran `asfalto-*` y `kraft-inset`? | No: solo cambian sus valores. |
| 2026-10-28 | ¿Se regeneran las capturas de SL-9? | Sí: SL-9 está en `dev` (PR #31). Se corre `scripts/capturas-pwa.mjs` y se baja el umbral de la marca anterior de su guardia a lo que dé la medida (`specs/SL-9-marca-pwa-capturas-iconos/design.md > D2`). |
| 2026-10-28 | Fuente de la marca | `docs/marca.md` y `public/brand/`; nunca recursos de Ordenex (heredada de SL-8, D6). |
| 2026-10-28 | «Ordenex» en lo que se toca | Desaparece del todo (heredada de SL-8, D16). |

### Paleta de gráficas aprobada (2026-10-28)

| Token | Nombre | Claro | Oscuro |
|---|---|---|---|
| `--chart-1` | Negro Servi / Amarillo Señal | `#111111` | `#FFD000` |
| `--chart-2` | Ocre | `#A16207` | `#FDE68A` |
| `--chart-3` | Petróleo | `#0F766E` | `#2DD4BF` |
| `--chart-4` | Rojo | `#B91C1C` | `#F87171` |
| `--chart-5` | Azul | `#1D4ED8` | `#60A5FA` |
| `--chart-6` | Verde | `#15803D` | `#4ADE80` |
| `--chart-7` | Violeta | `#7E22CE` | `#C084FC` |
| `--chart-8` | Magenta | `#BE185D` | `#F472B6` |
| `--chart-9` | Celeste | `#0369A1` | `#38BDF8` |
| `--chart-10` | Oliva | `#4D7C0F` | `#A3E635` |
| `--chart-11` | Piedra | `#57534E` | `#D6D3D1` |
| `--chart-12` | Ocre profundo | `#854D0E` | `#FACC15` |
| `--chart-13` | Petróleo claro | `#0D9488` | `#99F6E4` |
| `--chart-14` | Rojo claro | `#DC2626` | `#FECACA` |
| `--chart-15` | Azul claro | `#2563EB` | `#BFDBFE` |
| `--chart-16` | Verde claro | `#16A34A` | `#BBF7D0` |
| `--chart-17` | Violeta claro | `#9333EA` | `#E9D5FF` |
| `--chart-18` | Magenta claro | `#DB2777` | `#FBCFE8` |
| `--chart-19` | Celeste claro | `#0284C7` | `#BAE6FD` |
| `--chart-20` | Piedra clara | `#78716C` | `#A8A29E` |
