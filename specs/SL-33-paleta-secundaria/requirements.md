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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

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
