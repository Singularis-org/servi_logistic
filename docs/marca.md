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

No cambian con la marca: `--destructive`, los `--chart-*` y los `*-strong`.

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
- El título de servicios de la landing (`TituloSeccion`, `text-asfalto-9` = `#0d2444`) sigue cerca
  del navy de la marca anterior. Lo corrige SL-33, y cuando SL-33 cierre hay que volver a correr el
  script de capturas. Mientras tanto, la guardia de capturas admite hasta un 1.8 % de píxeles de la
  marca anterior.
