# SL-8 — Diseño: logo, paleta y fuente de Servi Logistic

## Lo que ya existe

Búsqueda hecha en el board (`feature_list.json`, todos los estados), en `specs/` y en el código. El MCP
del grafo no estaba disponible en esta sesión, así que el código se buscó con Grep. Términos: `marca`,
`logo`, `paleta`, `fuente`, `tipografía`, `Servi Logistic`, `rebrand`, `components/shared/Logo` y
`lib/config/marca`.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | SL-9 `marca-pwa-capturas-iconos` (depende de SL-8) | Sin solape: capturas e iconos `icono_*` son de SL-9. |
| Board / spec | SL-15 `nombre-ordenex-codigo`. Su `design.md` §3 define `lib/config/marca.ts` (`MARCA`, `EMPRESA`) y deja abierto, en su pregunta 5, quién lo crea | SL-8 crea el módulo con `MARCA`. `EMPRESA` se copia literal de SL-15 solo si su término de transición ya está fijado (D8, T0). SL-15 reutiliza el módulo. SL-15 excluye login, layout y landing. |
| Board | SL-14 `dominio-a-configuracion` | SL-14 cede los comentarios con el dominio de Ordenex de `LandingNav.tsx`, `primitivas.tsx`, `app/page.tsx` y `globals.css` (D11). El resto sigue siendo suyo. |
| Board / spec | SL-10 `gate-verde-heredado`, R10: fija `theme_color #111111` y `background_color #F7F7F5` en `pwa-manifiesto-atajos.guardia.test.ts` | Ya son los colores de la marca. SL-8 no los cambia ni toca ese test (R29). No hay archivos en común con SL-10. |
| Board | SL-11 (fuera seeds de Ordenex) y SL-32 (rol superadmin) | Sin dependencia: SL-11 no crea usuarios y superadmin no es `maestro`. El `admin` de las capturas lo crea la verificación (D9). |
| `specs/` | `86-landing-publica`, `23-dashboard-maestro`, `153-order-status-en-reparto` (historia de Ordenex) | Solo historia. `Logo.tsx` nació en la 86 como wordmark compartido. Se reutiliza ese punto único: se cambia el componente, no se crea otro. |
| Código | `components/shared/Logo.tsx`: wordmark textual «Orden»+«ex» con `text-brand` | Se reescribe por dentro (D1). Sus 9 llamadas se ajustan (D2). |
| Código | `public/brand/`: los SVG y PNG de la marca, ya en el repo | Se usan tal cual. |
| Código | `app/layout.tsx`: ya usa `next/font/google` (`Poppins`, `JetBrains_Mono`) y `theme-color #111111` | `Poppins` se cambia por `Archivo` (D7). |
| Código | `tests/fixtures/contraste.ts` (`contraste`, `componer`, `token`, `paleta`, `tokenAlImprimir`) y las guardias de contraste y de espejo | Se reutilizan. No se escribe otra aritmética. |

## Censo medido (Grep, 2026-10-21, worktree de SL-8)

**Paleta de Ordenex en `.tsx`.** Las utilidades `brand*`, `navy*`, `asfalto-*`, `kraft-*`, `hivis` e
`ink-blue*` aparecen **210 veces en 68 archivos**.
- Con texto: 37 en código.
- `bg-brand` opaco con `text-white`:
  - en el portal, 4 sitios: `PosNavBlock.tsx:37`, `PosOrderCardDetalle.tsx:93`,
    `OrdenesCargaPreview.tsx:218` y `OrdenesCargaMasivaButton.tsx:83`;
  - en la landing, 6 sitios.

**`text-brand-dark` sin `dark:` en el portal.** Son 5 sitios:
- `RankingPodio.tsx:183` y `:192`;
- `OrdenesCargaMasivaButton.tsx:84`, sobre `bg-brand-soft`;
- `OrdenesCargaPreview.tsx:219` (`hover:`);
- `components/private/analytics/jerarquia.ts:60`.

**`Logo`.** Hay 9 llamadas en 7 archivos:
- `app/login/page.tsx`, `app/recuperar-contrasena/page.tsx` y `app/postulacion/page.tsx`: 2 cada uno;
- `app/paquete/[numGuia]/page.tsx`, `LandingNav.tsx`, `LandingFooter.tsx` y `Sidebar.tsx`: 1 cada uno.

**Degradado naranja en línea** (`rgba(242,100,25,0.16)`). Está en `login/page.tsx:37`,
`recuperar-contrasena/page.tsx:45`, `postulacion/page.tsx:66` y `LandingHero.tsx:79`.

**«ordenex» (sin distinguir mayúsculas) en los archivos de código que SL-8 toca.**

| Archivo | Apariciones |
|---|---|
| `app/layout.tsx` | 3 |
| `app/globals.css` | 2 |
| `app/page.tsx` | 1 |
| `app/(app)/_components/Sidebar.tsx` | 1 |
| `components/shared/Logo.tsx` | 1 |
| `app/_landing/LandingNav.tsx` | 2 |
| `app/_landing/LandingPostular.tsx` | 3 |
| `app/_landing/LandingFooter.tsx` | 1 |
| `app/_landing/LandingPoliticas.tsx` | 1, un comentario que nombra `lib/utils/ingreso-ordenex.ts` |
| `app/_landing/primitivas.tsx` | 1 |

El resto de los archivos de código de la lista tiene **0**.

En los archivos de tests y docs que SL-8 toca:

| Archivo | Apariciones |
|---|---|
| `tests/components/Logo.test.tsx` | 2 |
| `tests/components/LandingPage.test.tsx` | 2 |
| `tests/unit/guards/factura-contraste.guardia.test.ts` | 3 |
| `docs/marca.md` | varias, en «Pendiente» |

Fuera de la lista quedan, por diseño:
- `cierre-factura.tsx`, con 12 apariciones, incluidos identificadores que renombra el glosario de
  SL-15;
- `GestionarOrdenPanel.tsx`, con 1.

## Contraste: cifras de `docs/marca.md` y cifras nuevas

Cifras de `docs/marca.md`:

| Par | Cifra |
|---|---|
| `#111111` sobre blanco | 18.9:1 |
| `#111111` sobre `#F7F7F5` | 17.6:1 |
| `#FFD000` sobre negro | 12.8:1 |
| `#1C1C1A` sobre blanco | 17.1:1 |

Cifras nuevas, calculadas con la fórmula de `tests/fixtures/contraste.ts`:
- `#FFD000` sobre blanco ≈ 1.47:1 y sobre `#F7F7F5` ≈ 1.37:1. De ahí la regla absoluta (R15).
- El resto está en la tabla de D4.
- La guardia y la tarea de documentación recalculan todas con el fixture. Si alguna difiere en la
  segunda cifra decimal, vale la del fixture.

## Modelo de datos, autorización y país

No aplica:
- no hay tablas, RLS, migraciones ni `organizacion_id`;
- no hay autorización nueva ni módulo que encender;
- nada depende del país. El pie de la landing pierde «Costa Rica» por decisión del humano (D10), no
  por limpieza de país.

## Decisiones

### D1 — `Logo`: imagen de `public/brand/` por fondo y ancho (R1–R5)

```ts
interface LogoProps {
  fondo: "claro" | "oscuro"; // obligatorio: el typecheck obliga a cada llamada a decidirlo (R6)
  ancho: number;             // px; >= 140 horizontal, < 140 isotipo
  className?: string;
}
```

La elección está en `archivoDeLogo(fondo, ancho)`, una función pura exportada, junto con
`ANCHO_MINIMO_HORIZONTAL = 140`:

| fondo | ancho ≥ 140 | ancho < 140 |
|---|---|---|
| claro | `/brand/logo-horizontal-fondo-claro.svg` | `/brand/isotipo.svg` |
| oscuro | `/brand/logo-horizontal-fondo-oscuro.svg` | `/brand/isotipo-mono-blanco.svg` |

El componente pinta un `<img>`:
- `alt={MARCA.nombre}`;
- `width={ancho}`;
- `height`: `Math.round(ancho * 214 / 733)` en el horizontal (su `viewBox` es `8 6 733 214`) y `ancho`
  en el isotipo.

Usa `<img>` y no `next/image` porque el SVG no se optimiza; `Sidebar.tsx` ya usa `<img>`. Si el lint
marca `@next/next/no-img-element`, se desactiva en una línea con su porqué.

### D2 — Llamadas a `Logo` (R6, R7, R8)

| Archivo | Superficie | Llamada |
|---|---|---|
| `login`, `recuperar-contrasena`, `postulacion` (panel de escritorio) | `bg-navy` → `#1C1C1A` | `fondo="oscuro" ancho={200}` |
| las mismas (cabecera móvil) | `bg-background`, claro: estas páginas no giran con el tema | `fondo="claro" ancho={160}` |
| `paquete/[numGuia]` | `bg-background` | `fondo="claro" ancho={140}` |
| `LandingNav.tsx` | `bg-navy-deep/95` → `#111111` | `fondo="oscuro"`; horizontal desde `md`; a 360 px, isotipo si no cabe junto a los botones (R8) |
| `LandingFooter.tsx` | `bg-navy-deep` | `fondo="oscuro" ancho={180}` |
| `Sidebar.tsx` expandido | `--sidebar` `#1C1C1A`; ancho útil 232 px (`16rem` − `px-3`) | `fondo="oscuro" ancho={160}` |
| `Sidebar.tsx` colapsado | carril de `3rem` | `fondo="oscuro" ancho={32}`, isotipo mono blanco |

En `Sidebar.tsx` colapsado, el `<Logo>` sustituye al `<img src="/icons/icon-192.png" alt="Ordenex">` y
conserva el cruce por opacidad.

En las cuatro páginas con degradado, el `rgba(242,100,25,0.16)` pasa a `rgba(255,208,0,0.16)`: amarillo
decorativo sobre oscuro, `aria-hidden`.

Los anchos son de partida y se ajustan mirando la captura. El umbral de 140 px no se mueve.

### D3 — Tema claro (R9, R13, R14)

**Regla de derivación.** Todo valor es un color de la paleta o `componer(color, fondo, α)` de dos
colores de la paleta, con el α escrito aquí. La guardia lo recalcula.

**Pieza central: `brand` gira con el tema.** `--color-brand` deja de ser un hex y pasa a
`var(--primary)`, y se añade `--color-brand-foreground: var(--primary-foreground)`. Queda así:
- en claro, `brand` es `#111111` y su tinta `#ffffff`;
- en oscuro, `#FFD000` y `#111111`.

Así, cada `text-brand`, `bg-brand`, `border-brand` y `ring-brand` del portal pasa a ser negro en claro y
amarillo en oscuro **sin editar el archivo**, y nunca hay amarillo sobre blanco por token. El amarillo
en claro queda solo en utilidades de valor fijo (`brand-light`, `sidebar-primary`), que la guardia
censa (D6). Ver la Alternativa A.

`@theme inline`. Los nombres se conservan:

| Token | Antes | Después | Origen |
|---|---|---|---|
| `--color-brand` | `#f26419` | `var(--primary)` | gira con el tema |
| `--color-brand-foreground` | — (nuevo) | `var(--primary-foreground)` | tinta sobre `bg-brand` |
| `--color-brand-light` | `#ffaa6b` | `#FFD000` | acento fijo: solo texto o relleno sobre oscuro |
| `--color-brand-dark` | `#d4530d` | `#111111` | tinta fija sobre claro |
| `--color-brand-soft` | `#fff0e8` | `#FFF8D9` = `componer(#FFD000, #FFFFFF, 0.15)` | D12 |
| `--color-navy` | `#0b2545` | `#1C1C1A` | oscuro (barras) |
| `--color-navy-deep` | `#0d2444` | `#111111` | primario |
| `--color-kraft-canvas` | `#f7f8fc` | `#F7F7F5` | fondo claro |
| `--color-primary-strong` | `var(--chart-11-strong)` | `var(--primary)` | tinta de enlace por tema |

`:root, .tema-claro`. Los mismos valores se copian, hex a hex, a `.papel-al-imprimir` y al bloque de
impresión `html .dark, …`:

| Token | Antes | Después | Contraste |
|---|---|---|---|
| `--background` | `#f7f8fc` | `#F7F7F5` | — |
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground` | `#12233f` / `#17233b` | `#111111` | 17.6 sobre el fondo; 18.9 sobre la tarjeta |
| `--primary` | `#f26419` | `#111111` | — |
| `--primary-foreground` | `#ffffff` | sin cambio | 18.9 |
| `--accent` | `#fff0e8` | `#FFF8D9` | `#111111` encima: 17.7 |
| `--accent-foreground` | `#d4530d` | `#111111` | 17.7 |
| `--ring` | `#d4530d` | `#111111` | ≥ 16 en las seis superficies (R19) |
| `--sidebar` | `#0d2444` | `#1C1C1A` | — |
| `--sidebar-foreground` | `#aab6d2` | `#C0C0BE` = `componer(#F7F7F5, #1C1C1A, 0.75)` | 9.4 sobre la barra |
| `--sidebar-primary` | `#f26419` | `#FFD000` | 11.6 sobre la barra |
| `--sidebar-primary-foreground` | `#ffffff` | `#111111` | 12.8 |
| `--sidebar-accent` | `#14294a` | `#2E2E2C` = `componer(#FFFFFF, #1C1C1A, 0.08)` | blanco encima: 13.6; `--sidebar-foreground` encima: 7.5 |
| `--sidebar-accent-foreground` | `#ffffff` | sin cambio | 13.6 |
| `--sidebar-border` | `#1f3a63` | `#373735` = `componer(#FFFFFF, #1C1C1A, 0.12)` | — |
| `--sidebar-ring` | `#f26419` | `#FFD000` | 11.6 |

Sin cambio, por D8 y D9: `--card`, `--popover`, `--destructive`, `--secondary`, `--muted`,
`--muted-foreground`, `--border`, `--input`, todos los `--chart-*`, los `*-strong`, los `-soft`
semánticos, `asfalto-*`, `ink-blue*` y `hivis`.

### D4 — Tema oscuro (R10, R11)

Lo define este spec (D7). Va en `.dark, body:has(> .dark)` y, hex a hex, en `.tema-sistema`. Las
cifras salen de la fórmula del fixture, que las recalcula en T12.

| Token | Antes | Después | Origen | Contraste |
|---|---|---|---|---|
| `--background` | `#0a1524` | `#111111` | primario | — |
| `--card`, `--popover` | `#10203a` | `#1C1C1A` | oscuro (barras) | — |
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground` | `#e6ecf8` | `#F7F7F5` | fondo claro | 17.6 sobre el fondo; 15.9 sobre la tarjeta |
| `--primary` | `#ff7a33` | `#FFD000` | acento | 12.8 sobre el fondo; 11.6 sobre la tarjeta |
| `--primary-foreground` | `#0a1524` | `#111111` | primario | 12.8 sobre `--primary` |
| `--secondary`, `--muted` | `#16294a` | `#232323` = `componer(#F7F7F5, #111111, 0.08)` | mezcla | `--foreground` encima: 14.7 |
| `--muted-foreground` | `#9fadc9` | `#B2B2B1` = `componer(#F7F7F5, #111111, 0.70)` | mezcla | 8.9 sobre el fondo; 8.0 sobre la tarjeta; 7.4 sobre `--muted` |
| `--accent` | `#2a1710` | `#352E0E` = `componer(#FFD000, #111111, 0.15)` | mezcla | — |
| `--accent-foreground` | `#ffb27f` | `#FFD000` | acento | 9.2 sobre `--accent` |
| `--border` | `#22345a` | `#2D2D2C` = `componer(#F7F7F5, #111111, 0.12)` | mezcla | 1.4 sobre el fondo; línea, no texto |
| `--input` | `#26406e` | `#363635` = `componer(#F7F7F5, #111111, 0.16)` | mezcla | 1.6 sobre el fondo; el de antes tampoco llegaba a 3 |
| `--ring` | `#ff7a33` | `#FFD000` | acento | 12.8 / 11.6 (R19) |
| `--sidebar*` | navy | los mismos valores de D3 | la barra es la misma superficie en los dos temas | las de D3 |

Sin cambio: `--destructive`, los `--chart-*` y los `*-strong`. Estos últimos se vuelven a medir.
Fondo y tarjeta nuevos son algo más oscuros que los de antes (luminancia 0.0056 contra 0.0073, y
0.0115 contra 0.0145), así que la tinta clara gana contraste.

### D5 — Hex de Ordenex que no pueden quedar en los tokens de identidad (R13)

**Naranja:** `#f26419`, `#d4530d`, `#ffaa6b`, `#fff0e8`, `#ff7a33`, `#ffb27f`, `#2a1710` y
`rgba(242,100,25,…)`.

**Navy:** `#0b2545`, `#0d2444`, `#12233f`, `#17233b`, `#14294a`, `#1f3a63`, `#aab6d2`, `#0a1524`,
`#071627`, `#10203a`, `#e6ecf8`, `#16294a`, `#22345a` y `#26406e`.

Se comprueba sobre los tokens de D3 y D4, no sobre el CSS entero: `--chart-1` y `--chart-2` siguen con
`#f26419` y `#0b2545` hasta su ficha (D8).

### D6 — Nunca amarillo sobre claro; tinta correcta sobre la marca (R15, R16, R17)

Como `brand` gira con el tema (D3), los consumidores del portal no se editan, salvo dos grupos:

- **`bg-brand` opaco con `text-white`** (R16). En oscuro sería blanco sobre amarillo: 1.47:1. Pasa a
  `text-brand-foreground` en `PosNavBlock.tsx:37`, `PosOrderCardDetalle.tsx:93`,
  `OrdenesCargaPreview.tsx:218` y `OrdenesCargaMasivaButton.tsx:83`.
- **`text-brand-dark` sin `dark:`** (R17). En los 5 sitios del censo:
  - lleva `dark:text-brand-light`; o
  - entra en el censo de la guardia como texto sobre un fondo claro fijo, con su cifra. Es el caso de
    `bg-brand-soft text-brand-dark` en `OrdenesCargaMasivaButton.tsx:84`.
- **`components/ui/sidebar.tsx`.** Sus `hover:bg-brand/8` y similares (l. 478, 482 y 682) pasan a
  `hover:bg-sidebar-accent`. Si no, en claro el hover sería negro al 8 % sobre la barra `#1C1C1A`, y no
  se vería.

**La landing** es clara fija (`.tema-claro`), así que allí `brand` es negro. Se recorre archivo por
archivo:
- Texto o botón sobre claro: `text-brand` o `bg-brand text-white` (negro y blanco) valen tal cual.
- Botón o acento sobre `navy-deep`, que ahora es `#111111` (barra, pie, héroe): pasa al acento fijo
  `bg-brand-light text-brand-dark`, `hover:bg-brand-light/90`. Si no, sería un botón negro sobre negro.
- Texto amarillo sobre oscuro (`text-brand-light`): se queda y entra en el censo.

`cierre-factura.tsx` y `GestionarOrdenPanel.tsx` **no se tocan**:
- el wordmark de la factura (`text-brand`, l. 899) pasa solo a negro en claro y en papel, y a amarillo
  en oscuro;
- su texto «Ordenex» y sus identificadores son de SL-15.

**Guardia nueva:** `tests/unit/guards/marca-texto-amarillo.guardia.test.ts`. Su nombre contiene
`guard`, así que la corre `pnpm run test:guardias`. Tiene siete partes:

1. Calcula con `contraste()` que `#FFD000` mide menos de 4.5 sobre `#FFFFFF` y sobre
   `token("claro","background")`. Si no, la regla habría caducado.
2. Barre `app/` y `components/` sin comentarios (`tests/fixtures/sin-comentarios.ts`). Toda clase sin
   `dark:` que resuelva a amarillo en claro (`text-brand-light` y `text-sidebar-primary`) tiene que
   estar en `CENSO_AMARILLO`, con `{ archivo, clase, superficie, medido }` y la superficie oscura fija.
   Una aparición fuera del censo, o una fila del censo que ya no aparece, es rojo (R15).
3. En una lista de clases con `bg-brand` o `bg-brand-light` opacos, toda `text-*` tiene que dar 4.5 o
   más contra ese fondo en los dos temas. Se resuelve con `token()` y `paleta()`. Hace falta un
   resolutor de `var(--primary)` para `brand`, que se añade al fixture (R16).
4. En `app/(app)/` y `components/`, `text-brand-dark` sin `dark:text-*` en la misma lista tiene que
   estar en `CENSO_NEGRO_FIJO` (R17).
5. Ningún token de D3 o D4 tiene un hex de D5 (R13). `brand` y `brand-foreground` son
   `var(--primary)` y `var(--primary-foreground)`, y en claro y oscuro valen lo de R14.
6. El `theme_color` y el `background_color` de `public/manifest.json`, y el `theme-color` de
   `app/layout.tsx`, son iguales a `token("claro","primary")` y `token("claro","background")` (R29).
7. La tabla «Tema oscuro» de `docs/marca.md` se parsea, y cada hex es igual al `token("oscuro", …)` del
   CSS (R11).

Cada parte lleva un texto sintético que tiene que dar rojo y otro que tiene que dar verde.

### D7 — Fuente Archivo (R20, R21)

```ts
import { Archivo, JetBrains_Mono } from "next/font/google";
const sans = Archivo({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
```

- Archivo es variable en peso, así que no lleva `weight`. Ancho normal, sin eje `wdth`: el 125 es solo
  del logo, que va en el SVG.
- `--font-heading` ya es `var(--font-sans)`.
- **Dependencia: ninguna nueva.** `next/font/google` es un módulo de `next` 16.2.10, aprobada en
  `docs/dependencias.md`, y el repo ya lo usa.
- Test: un caso de `marca-texto-amarillo.guardia` lee `app/layout.tsx` sin comentarios. Exige
  `Archivo` de `next/font/google` con `variable: "--font-sans"` y prohíbe `Poppins`. En ejecución lo
  verifica `e2e/marca.spec.ts`.

### D8 — `lib/config/marca.ts` y los textos (R22–R25)

**Servi Logistic es solo la plataforma** (decisión del humano). `MARCA` es lo único que SL-8 fija
por su cuenta:

```ts
/** La plataforma: lo que se instala, el nombre de la app, la marca de la landing. Nunca la empresa usuaria. */
export const MARCA = { nombre: "Servi Logistic" } as const;
```

**`EMPRESA` no lo decide SL-8.** Su valor de transición hasta SL-17 lo fija el spec de SL-15, que se
está revisando. La versión en disco
(`.worktrees/SL-15-nombre-ordenex-codigo/specs/SL-15-nombre-ordenex-codigo/design.md` §3) propone el
término neutro:

```ts
export const EMPRESA = {
  enFrase: "la empresa",
  alInicio: "La empresa",
  membrete: null as string | null,
} as const;
```

La regla es T0 de `tasks.md`:
- Si al implementar el spec de SL-15 está aprobado con ese término, SL-8 copia `EMPRESA` **literal**
  de allí.
- Si no lo está, SL-8 crea solo `MARCA`, y `EMPRESA` lo añade SL-15.

En ningún caso `EMPRESA` vale `MARCA.nombre` ni contiene «Servi Logistic». El test
`tests/unit/config/marca.test.ts` afirma:
- el literal `MARCA.nombre === "Servi Logistic"` como contrato;
- si existe `EMPRESA`, que ninguno de sus valores es `MARCA.nombre` ni contiene «Servi Logistic».

Usos:
- `app/layout.tsx`:
  - `title: MARCA.nombre`;
  - `description: \`Plataforma de logística y entregas ${MARCA.nombre}\``;
  - `apple-mobile-web-app-title`: `MARCA.nombre`.
- `Logo.tsx`: `alt={MARCA.nombre}`.
- `LandingNav.tsx`: `aria-label={\`${MARCA.nombre} — inicio\`}`.
- `LandingFooter.tsx`: `© 2026 · ${MARCA.nombre}`, sin «Costa Rica» ni «S.A.» (D10).
- `LandingPostular.tsx`: la postulación es a la **empresa que opera**, no a la plataforma.

  **Evidencia del flujo:**
  - **Los textos de las tarjetas:**
    - el vehículo se pone «a trabajar… con nuestra operación»;
    - la bodega se suma «a nuestra red logística»;
    - la persona quiere «ser parte del equipo».

    Hablan de flota, bodegas y personal: de quien reparte.
  - **«Quiero postularme»** va a `/postulacion`, que es «el alta real de mensajero» (comentario de
    `LandingPostular.tsx:62-66`). `postularMensajero` (`lib/actions/postulacion-mensajero.ts`) crea un
    mensajero pendiente sin sesión.
  - **Vehículo y bodega** van por `postularRecurso` (`lib/actions/postulacion-recurso.ts`).
  - **Quién decide:** aprueban o rechazan los roles `maestro` y `admin` del portal
    (`ROLES_APROBADORES` en `lib/services/AprobacionPostulacionService.ts:20`), es decir, la operación
    de la empresa. Los recursos los atiende `atencion-postulaciones-recurso.ts`. Nada del flujo es de
    la plataforma: no hay alta de empresas usuarias ni de clientes del software.

  Por la regla de SL-15 §3 (quien reparte, tiene equipo u oficina es `EMPRESA`), los tres textos van
  con `EMPRESA`, y nunca con `MARCA`.

  **Con `EMPRESA` (T0 cumplido):**
  - `` `…Ponelo a trabajar con ${EMPRESA.enFrase} y generá ingresos con nuestra operación.` ``;
  - `` `…querés ser parte del equipo de ${EMPRESA.enFrase}? Postulate y conversemos.` ``;
  - el rótulo `` `Sumate a ${EMPRESA.enFrase}` ``.

  **Sin `EMPRESA` (T0 no cumplido):** el nombre se quita y no se sustituye por la marca:
  - «Ponelo a trabajar con nosotros y generá ingresos con nuestra operación.»;
  - «¿…o querés ser parte del equipo? Postulate y conversemos.»;
  - el rótulo «Sumate al equipo».

  En los dos casos «Servi Logistic» no aparece en esa sección, y el voseo se queda. El texto exacto
  de la variante con `EMPRESA` se ajusta a cómo lea en la captura (T13), sin salir de esas formas.

  **Límite conocido:** la landing es pública y anterior a SL-17, así que «la empresa» no dice cuál.
  Es el mismo término neutro que SL-15 acepta como transición. Cuando SL-17 dé el nombre de la
  organización, estos textos lo toman sin editarse.

### D9 — Verificación en el navegador (R27, R28)

`e2e/marca.spec.ts` (Playwright, aprobada). Corre en local a demanda y en CI en el PR a `prod`.

| Pantalla | Viewport | Tema |
|---|---|---|
| `/`: barra y héroe; pie con scroll | 1280 y 360 | claro fijo |
| `/login` | 1280 y 360 | claro |
| `/dashboard` con sesión, barra expandida y colapsada | 1280 | claro y oscuro (cookie de tema) |

Por pantalla hace seis cosas:

1. Captura a `_trabajo/capturas/SL-8/<pantalla>-<ancho>-<tema>.png`. Va fuera de git: el repo es
   público y la captura del portal lleva el nombre del usuario.
2. Un `page.evaluate` recorre los nodos de texto visibles. Toma el color computado y el fondo efectivo:
   el primer ancestro con `background-color` opaco o, sobre foto, el color del degradado que la cubre.
   Falla con `rgb(255, 208, 0)` sobre fondo de luminancia mayor de 0.5 y devuelve el recuento.
3. Comprueba que la primera familia de `fontFamily`, en `body` y en un `h1`/`h2`, contiene «Archivo»,
   y que `document.fonts` tiene esa familia en `loaded`.
4. Comprueba que `document.body.innerText` no contiene «Ordenex».
5. Comprueba que el `src` del logo visible es el de R2 a R4.
6. A 360 px, comprueba `document.documentElement.scrollWidth <= 360` (R8).

**Sesión.** No viene de variables de entorno ni de un usuario previo. Si falta la base, el caso falla
con un mensaje explícito; no se salta.
- El usuario lo crea la propia verificación, como un fixture de E2E (D13):
  - En el `beforeAll` de `e2e/marca.spec.ts`, un helper inserta un usuario `admin` activo en la base
    local migrada de la feature (`DATABASE_URL` del worktree).
  - El correo es único por corrida (`sl8-<timestamp>@example.com`) y la contraseña aleatoria. Se usan
    para entrar por `/login`.
  - En el `afterAll` el usuario se borra.
  - No se escribe en ningún seed ni script versionado, y no se usa `maestro` ni superadmin (SL-32).
- La base local se reconoce por su `DATABASE_URL`. Si apunta a un proyecto de Ordenex
  (`docs/perfil-agentes.md`), el spec aborta antes de escribir.
- Si no hay base local migrada, T13 queda BLOQUEADA y se reporta así.

Antes de medir: un solo dev server y el `.next` limpio (`docs/verification.md`).

### D10 — Tests que cambian como contrato

Por cada uno, `progress/impl_SL-8.md` dice qué contrato tenía y cuál tiene ahora.

| Test | Hoy | Pasa a |
|---|---|---|
| `tests/components/Logo.test.tsx` | `textContent` «Ordenex», `font-heading`, «ex» en `text-brand` | Reescrito para R1 a R5: cuatro combinaciones, límite 139/140, `alt` igual a `MARCA.nombre`, proporción. Sin «Ordenex». |
| `tests/components/LandingPage.test.tsx` (l. 17-24) | wordmark «Ordenex» | Logo `img` de fondo oscuro en barra y pie; textos de R25. El caso R4 (`.bg-navy-deep`, `.bg-brand`) sigue igual. |
| `tests/unit/guards/contraste-tokens.guardia.test.ts` | «`--ring` en claro ya no es el naranja» (`ring = brand-dark`, `ring ≠ primary`) y «los dos motivos del arreglo» (naranja opaco < 3 en 3 superficies) | Los dos casos se escribieron para caer si la paleta cambiaba. Con `--primary #111111` el motivo de la 226 caduca: se reescriben a «`--ring` ≥ 3:1 en las seis superficies» (R19). Los `SUELO*` se re-miden con la regla de R18. |
| `tests/unit/guards/impresion-sin-dark.guardia.test.ts` | `paleta("brand")` (l. 264), que lee un hex | `brand` ya no es hex: pasa a `token(tema, "primary")`. Se re-miden las filas de `brand-outline` y de «en reparto». |
| `tests/unit/guards/enlace-contraste-458.guardia.test.ts` | el histórico `#f26419` ≈ 2.99 y el alias de `chart-11-strong` | El alias pasa a `var(--primary)`. La medición histórica se queda con el fondo antiguo como literal, o se retira con su porqué. |
| `tests/unit/guards/impresion-tokens.guardia.test.ts` | los 6 tokens que bajan al imprimir desde oscuro | Censo recalculado. Por ejemplo, `--sidebar-primary-foreground` es `#111111` en los dos temas y deja de bajar. |
| `tests/unit/guards/factura-contraste.guardia.test.ts` | pares medidos (`P21` naranja/blanco…) y 3 menciones del wordmark «Ordenex» | Se re-mide. Las menciones pasan a «el wordmark de la marca» (R26). |
| `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` | `#111111` / `#F7F7F5` (lo fija SL-10) | **No se toca** (R29). |

**Regla de R18 para los suelos.** El fondo claro pasa de `#f7f8fc` a `#F7F7F5`, con luminancia 0.9394
→ 0.9289. Todo par de tinta oscura sobre el fondo baja un 1.1 %, por ejemplo `warning-strong`: 6.68 →
≈ 6.61. Esa bajada se acepta y se escribe con su cifra. Cualquier otra bajada, o una que deje un par
bajo AA, es un fallo de D3/D4.

`button.test.tsx`, `EstatusBadge*`, `DataTable`, `EfectividadHeroe`, `Modal` y
`fuente-unica-nombre-estado` siguen en verde sin tocarse, porque los nombres de clase se conservan. Si
alguno cae, el diff lo explica.

### D11 — «Ordenex» fuera de los archivos tocados (R26)

En cada archivo de `tasks.md > Archivos esperados` se quita toda aparición de «ordenex», sin distinguir
mayúsculas:
- comentarios que citan el dominio de Ordenex: `LandingNav.tsx:10`, `primitivas.tsx:7`, `app/page.tsx:12` y
  `globals.css:156`. Se describe lo que hace la pieza, sin la URL;
- el comentario de `LandingPoliticas.tsx:30`: se cita «la utilidad de ingreso del flete de
  `lib/utils/`» sin su nombre de archivo, que SL-15 renombra;
- las 3 menciones de `factura-contraste.guardia.test.ts`;
- las de `docs/marca.md > Pendiente`.

Se comprueba con:

```bash
git diff --name-only dev...HEAD | xargs grep -il ordenex
```

La salida tiene que ser vacía, y se pega en `progress/impl_SL-8.md`. Además, la guardia de marca
afirma 0 en las rutas fijas del alcance: `app/_landing/`, `app/page.tsx`, `app/layout.tsx`,
`app/login/`, `components/shared/Logo.tsx`, `lib/config/marca.ts`, `app/globals.css` y
`app/(app)/_components/Sidebar.tsx`.

Por esto SL-8 no edita `cierre-factura.tsx`, `GestionarOrdenPanel.tsx` ni
`docs/perfil-agentes.md`. Este último nombra a Ordenex en reglas que tienen que quedarse. Su línea
«ABIERTO: la marca…» la retira el leader al integrar.

### D12 — Sección nueva de `docs/marca.md` (R11)

La tarea T12 añade una sección `## Tema oscuro` con la tabla de D4: token, hex, origen (color de la
paleta o mezcla con su α) y contraste, con las cifras recalculadas por el fixture. Debajo, una línea
dice que la barra lateral es la misma en los dos temas.

En la misma pasada:
- «Pendiente» se reescribe: se tacha lo hecho y queda lo de SL-9, sin el nombre Ordenex;
- se añade una nota a «Paleta»: el amarillo sobre blanco da ≈ 1.47:1.

## Alternativas descartadas

- **A. `brand` amarillo fijo y re-apuntar cada `text-brand` sobre claro.** Era la primera versión de
  este spec. Obliga a editar unos 15 sitios del portal, y uno es `cierre-factura.tsx`. Ese archivo
  tiene 12 «Ordenex» con identificadores de SL-15 (`TotalesIngresoOrdenex`, `ingreso-ordenex`), y por
  R26 SL-8 tendría que renombrarlos y pisar el glosario de SL-15. Con `brand` girando con el tema el
  resultado es el mismo para el usuario: tinta negra en claro y amarilla en oscuro. Además, ningún
  token puede dar amarillo sobre blanco.
- **B. Renombrar las utilidades a nombres nuevos** (`text-acento`, `bg-negro`…) en 68 archivos. Choca
  en archivos con SL-15 (241 archivos) y cambia unos 20 tests de clases. Queda como deuda, para después
  de SL-15.
- **C. Incrustar el SVG como JSX, o importarlo con SVGR.** Duplica la fuente de verdad, y SVGR sería
  una dependencia nueva.
- **D. Elegir horizontal o isotipo con *container queries* o `ResizeObserver`.** jsdom no calcula
  layout, así que el umbral no se podría probar en un test de componente. Además,
  `container-type: inline-size` encoge el logo a 0 dentro de una cabecera `flex`.
- **E. Textos de la landing escritos a mano.** El humano pidió que salgan de `lib/config/marca.ts`
  (D14), y SL-15 ya fijó su forma.

## Riesgos

- **Sesión del portal.** Necesita una base local migrada (D13). Si no la hay, T13 queda BLOQUEADA y se
  reporta así.
- **Muchas guardias con suelos.** T1 corre todas antes de tocar nada, para no confundir un rojo nuevo
  con uno heredado (baseline de SL-10).
- **CRLF.** Las guardias leen `globals.css` y `docs/marca.md`: se editan en LF.
- **Resolver `brand` en el fixture.** `paleta("brand")` deja de encontrar un hex. Las guardias que lo
  usan cambian a `token(tema, "primary")` en el mismo PR, o el gate se pone rojo con un error del
  fixture, no con una medición.
