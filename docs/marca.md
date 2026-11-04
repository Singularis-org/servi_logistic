# Marca — Servi Logistic

> Recibida del humano el 2026-10-21. Los originales están en `public/brand/`; el zip de entrada
> sigue en `_trabajo/marca/`, fuera de git.

## Paleta

| Rol | HEX | Uso |
| --- | --- | --- |
| Primario («Negro Servi») | `#111111` | Texto principal, botones primarios, logo sobre fondo claro. 18.9:1 sobre blanco. |
| Acento («Amarillo Señal») | `#FFD000` | Franjas, bloques y fondos oscuros. **Nunca texto amarillo sobre blanco.** 12.8:1 sobre negro. |
| Fondo claro | `#F7F7F5` | Fondo de la app. El negro sobre este fondo da 17.6:1. |
| Oscuro (barras) | `#1C1C1A` | Sidebar y barras. 17.1:1 sobre blanco. |

> **Amarillo sobre blanco: ≈ 1.47:1** (y ≈ 1.37:1 sobre el fondo claro `#F7F7F5`). Muy por debajo
> del 4.5:1 de texto y del 3:1 de un indicador: por eso la regla es absoluta. En la interfaz,
> `text-brand` y `bg-brand` giran con el tema (negro en claro, amarillo en oscuro), y el amarillo
> fijo (`brand-light`, `sidebar-primary`) solo va sobre superficies oscuras fijas.

## Tipografía (Google Fonts)

- Interfaz del SaaS: **Archivo**, en ancho normal.
- Solo en el logo:
  - «SERVI»: Saira, 800, itálica, `font-stretch: 125%`.
  - «LOGISTIC»: Archivo, 800, ancho 125, mayúsculas y `letter-spacing` de unos 0.37em.

## Reglas de uso

- Sobre fondo claro va `logo-horizontal-fondo-claro.svg`, en negro. Sobre fondo oscuro va
  `logo-horizontal-fondo-oscuro.svg`, con el bloque amarillo y «LOGISTIC» en blanco.
- No pongas el logo sobre amarillo ni sobre gris medio.
- Las letras de «SERVI» son huecos: sobre una foto, la foto se ve a través. Usa siempre un fondo liso.
- Por debajo de 140 px de ancho no uses el logo horizontal: usa el isotipo.
- Para el favicon usa `isotipo-16px.svg`, con una sola franja, porque a 16 px las dos franjas se empastan.

## Dónde quedó cada archivo (hecho el 2026-10-21)

| Archivo | Origen |
| --- | --- |
| `public/icons/icon-512.png` | `isotipo-512.png` |
| `public/icons/icon-192.png` | `isotipo-512.png` reducido con LANCZOS (el paquete no traía 192 «any») |
| `public/icons/icon-192-maskable.png`, `icon-512-maskable.png` | `android-maskable-192/512.png` |
| `public/icons/icon-180.png` (apple-touch) | `apple-touch-icon-180.png` |
| `public/icons/badge-72.png` | `badge-notificaciones-72.png` |
| `public/icons/fuente/icon-any.svg`, `icon-maskable.svg` | `isotipo.svg`, `isotipo-maskable.svg` |
| `app/icon.png` (favicon) | `favicon-48.png` |
| `public/brand/` | todos los SVG, los logos horizontales en PNG y los favicons |
| `public/manifest.json` | name/short_name «Servi Logistic», theme `#111111`, background `#F7F7F5` |
| `app/layout.tsx` | `theme-color` `#111111` |

## Tema oscuro

Lo define SL-8 (`specs/SL-8-marca-logo-paleta-fuente/design.md > D4`). Va en `.dark` y, hex a hex,
en `.tema-sistema` de `app/globals.css`. Cada hex de esta tabla es el valor del token en ese archivo.
Las mezclas son `componer(color, fondo, α)` de `tests/fixtures/contraste.ts`, y las cifras salen de
su `contraste()`.

| Token | HEX | Origen | Contraste |
| --- | --- | --- | --- |
| `--background` | `#111111` | Primario | — |
| `--card` | `#1C1C1A` | Oscuro (barras) | — |
| `--popover` | `#1C1C1A` | Oscuro (barras) | — |
| `--foreground` | `#F7F7F5` | Fondo claro | 17.60 sobre el fondo; 15.91 sobre la tarjeta |
| `--card-foreground` | `#F7F7F5` | Fondo claro | 15.91 sobre la tarjeta |
| `--popover-foreground` | `#F7F7F5` | Fondo claro | 15.91 sobre el popover |
| `--secondary-foreground` | `#F7F7F5` | Fondo claro | 14.65 sobre `--secondary` |
| `--primary` | `#FFD000` | Acento | 12.84 sobre el fondo; 11.60 sobre la tarjeta |
| `--primary-foreground` | `#111111` | Primario | 12.84 sobre `--primary` |
| `--secondary` | `#232323` | `componer(#F7F7F5, #111111, 0.08)` | `--foreground` encima: 14.65 |
| `--muted` | `#232323` | `componer(#F7F7F5, #111111, 0.08)` | `--foreground` encima: 14.65 |
| `--muted-foreground` | `#B2B2B1` | `componer(#F7F7F5, #111111, 0.70)` | 8.90 sobre el fondo; 8.04 sobre la tarjeta; 7.41 sobre `--muted` |
| `--accent` | `#352E0E` | `componer(#FFD000, #111111, 0.15)` | — |
| `--accent-foreground` | `#FFD000` | Acento | 9.22 sobre `--accent` |
| `--border` | `#2D2D2C` | `componer(#F7F7F5, #111111, 0.12)` | 1.37 sobre el fondo; línea, no texto |
| `--input` | `#363635` | `componer(#F7F7F5, #111111, 0.16)` | 1.56 sobre el fondo; línea, no texto |
| `--ring` | `#FFD000` | Acento | 12.84 sobre el fondo; 11.60 sobre la tarjeta; 10.68 sobre `--muted`; 9.22 sobre `--accent` |
| `--sidebar` | `#1C1C1A` | Oscuro (barras) | — |
| `--sidebar-foreground` | `#C0C0BE` | `componer(#F7F7F5, #1C1C1A, 0.75)` | 9.37 sobre la barra; 7.47 sobre `--sidebar-accent` |
| `--sidebar-primary` | `#FFD000` | Acento | 11.60 sobre la barra |
| `--sidebar-primary-foreground` | `#111111` | Primario | 12.84 sobre `--sidebar-primary` |
| `--sidebar-accent` | `#2E2E2C` | `componer(#FFFFFF, #1C1C1A, 0.08)` | — |
| `--sidebar-accent-foreground` | `#ffffff` | Blanco | 13.61 sobre `--sidebar-accent` |
| `--sidebar-border` | `#373735` | `componer(#FFFFFF, #1C1C1A, 0.12)` | 1.43 sobre la barra; línea, no texto |
| `--sidebar-ring` | `#FFD000` | Acento | 11.60 sobre la barra |

La barra lateral es la misma en los dos temas: los `--sidebar*` valen lo mismo en claro y en oscuro.

## Paleta de gráficas

La aprobó el humano el 2026-10-28 (`specs/SL-33-paleta-secundaria/requirements.md > Paleta de
gráficas aprobada`). La columna «Claro» va en el tema claro y en los dos bloques de impresión; la
«Oscuro», en `.dark` y, hex a hex, en `.tema-sistema`. Cada hex es el valor del token en
`app/globals.css`. Las cifras son el `contraste()` de `tests/fixtures/contraste.ts` sobre el fondo y
la tarjeta de su tema: `#F7F7F5` y `#ffffff` en claro, `#111111` y `#1C1C1A` en oscuro. Las 40
llegan a 3:1; la más justa es `--chart-16` sobre el fondo claro, 3.07.

| Token | Claro | s/ fondo | s/ tarjeta | Oscuro | s/ fondo | s/ tarjeta |
| --- | --- | --- | --- | --- | --- | --- |
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
| `--chart-12` | `#854d0e` | 6.39 | 6.85 | `#facc15` | 12.33 | 11.15 |
| `--chart-13` | `#0d9488` | 3.49 | 3.74 | `#99f6e4` | 14.98 | 13.54 |
| `--chart-14` | `#dc2626` | 4.50 | 4.83 | `#fecaca` | 13.05 | 11.80 |
| `--chart-15` | `#2563eb` | 4.82 | 5.17 | `#bfdbfe` | 13.29 | 12.01 |
| `--chart-16` | `#16a34a` | 3.07 | 3.30 | `#bbf7d0` | 15.58 | 14.08 |
| `--chart-17` | `#9333ea` | 5.02 | 5.38 | `#e9d5ff` | 13.87 | 12.54 |
| `--chart-18` | `#db2777` | 4.29 | 4.60 | `#fbcfe8` | 13.66 | 12.35 |
| `--chart-19` | `#0284c7` | 3.82 | 4.10 | `#bae6fd` | 14.23 | 12.86 |
| `--chart-20` | `#78716c` | 4.47 | 4.80 | `#a8a29e` | 7.49 | 6.77 |

Los cuatro pares del `Badge` que acompañan a la barra del monitoreo son `chart-5`, `chart-7`,
`chart-11` y `chart-12`. Su `-soft` es `componer(--chart-N claro, #FFFFFF, 0.15)` y su `-strong`, el
propio color del segmento; los ocho miden 4.5:1 o más (`specs/SL-33-paleta-secundaria/design.md >
D4`).

## Grises cálidos (tema claro)

Los grises del tema claro y de la paleta fija salen de la escala `stone` de Tailwind, escrita en
HEX (los de Tailwind v3). Cada hex de la columna «Ahora» es el del token en `app/globals.css`; los
bloques de impresión repiten los del tema claro. Los nombres (`asfalto-*`, `kraft-inset`) no
cambian. Cada par es «antes → después» con el `contraste()` del fixture. Ninguno baja salvo la línea
de `asfalto-2`, única excepción aceptada por el humano el 2026-10-28.

| Token | Antes | Ahora | Pares (antes → después) |
| --- | --- | --- | --- |
| `--secondary` | `#eef1f8` | `stone-100` `#f5f5f4` | `#111111` encima 16.70 → 17.31 · anillo `destructive` encima 3.33 → 3.45 |
| `--muted` | `#f1f4fb` | `stone-100` `#f5f5f4` | `#111111` encima 17.15 → 17.31 · `--muted-foreground` encima 6.99 → 9.42 |
| `--muted-foreground` | `#4a5368` | `stone-700` `#44403c` | s/ tarjeta 7.70 → 10.27 · s/ fondo 7.18 → 9.58 · s/ `--muted` 6.99 → 9.42 |
| `--border`, `--input` | `#e3e8f2` | `stone-200` `#e7e5e4` | línea s/ tarjeta 1.23 → 1.26 · s/ fondo 1.15 → 1.17 |
| `asfalto-0` | `#f2f5fb` | `stone-100` `#f5f5f4` | `#111111` encima 17.29 → 17.31 |
| `asfalto-1` | `#e9edf6` | `stone-200` `#e7e5e4` | `asfalto-7` encima 9.71 → 12.08 · anillo `asfalto-4` 2.59 → 3.82 · línea s/ `kraft-inset` 1.07 → 1.15 · s/ blanco 1.17 → 1.26 |
| `asfalto-2` | `#dde1ee` | `stone-200` `#e7e5e4` | texto s/ `#111111` 14.46 → 15.04 · `asfalto-9` encima 11.88 → 13.93 · línea en oscuro s/ `#1C1C1A` 13.07 → 13.59 · **línea s/ blanco 1.31 → 1.26 y s/ fondo 1.22 → 1.17 (excepción aceptada)** |
| `asfalto-4` | `#8a94ad` | `stone-500` `#78716c` | s/ blanco 3.03 → 4.80 · s/ fondo 2.83 → 4.47 · anillo s/ `asfalto-1` 2.59 → 3.82 |
| `asfalto-5` | `#4a5368` | `stone-700` `#44403c` | s/ blanco 7.70 → 10.27 · s/ `kraft-inset` 6.99 → 9.42 · s/ fondo 7.18 → 9.58 |
| `asfalto-7` | azul de la marca anterior | `stone-800` `#292524` | s/ blanco 11.39 → 15.17 · s/ `kraft-inset` 10.35 → 13.90 · s/ `asfalto-1` 9.71 → 12.08 |
| `asfalto-9` | navy de la marca anterior | `stone-900` `#1c1917` | s/ blanco 15.52 → 17.49 · s/ fondo 14.47 → 16.30 · `#FFD000` encima 10.55 → 11.89 · blanco encima 15.52 → 17.49 |
| `kraft-inset` | `#f1f4fb` | `stone-100` `#f5f5f4` | `asfalto-7` encima 10.35 → 13.90 · `asfalto-5` encima 6.99 → 9.42 |

Los dos HEX «antes» de `asfalto-7` y `asfalto-9` no se escriben aquí: son de la marca anterior y el
repo ya no los lleva fuera de `tests/`, `specs/` y `progress/` (están en
`specs/SL-8-marca-logo-paleta-fuente/design.md > D5`).

## Hecho en SL-8

- `components/shared/Logo.tsx` pinta el SVG de `public/brand/`, con la variante clara u oscura según
  el fondo y el isotipo por debajo de 140 px.
- Los tokens de color de `app/globals.css` usan esta paleta, en tema claro y en tema oscuro, sin
  texto amarillo sobre blanco.
- La interfaz usa la fuente Archivo (`next/font/google`).

## Hecho en SL-9

- Las capturas de `public/screenshots/` las genera `node scripts/capturas-pwa.mjs`, con la app
  servida en local y su URL en `CAPTURAS_URL`. Hay que volver a generarlas cuando cambien `/` o
  `/login`.
- Los indicadores del mensajero usan iconos de `lucide-react` sobre `--accent`. Los
  `public/icons/icono_*.png` se borraron.
- El brillo de esas tarjetas es `brand-soft` en tema claro.
- El título de servicios de la landing (`TituloSeccion`, `text-asfalto-9`) salía en el navy de la
  marca anterior. SL-33 lo corrige: `asfalto-9` pasa a `stone-900` (ver «Grises cálidos»). Cuando
  SL-33 cierre hay que volver a correr el script de capturas. Mientras tanto, la guardia de capturas
  admite hasta un 1.8 % de píxeles de la marca anterior.
