# SLT-257 — banner-ambiente-pruebas · requirements.md

> **Zona:** frontend · **Complejidad:** low · **depends_on:** — · **Rama:** feature/SLT-257-banner-ambiente-pruebas
>
> **Alcance.** Una franja fija arriba de todas las pantallas (layout raíz `app/layout.tsx`) con el
> texto «Sandbox», visible solo en el proyecto de Vercel del sandbox. Se enciende con la variable de
> servidor `AMBIENTE_PRUEBAS=true`; sin ella, o con otro valor, no se pinta nada.
>
> **Lo que NO entra.** Crons con horarios propios del sandbox (decisión 2026-11-23: no por ahora).
> Cambios a la guía de integración. Configuración de Vercel y Supabase del sandbox (manual, fuera
> del código). Limpieza de la base del sandbox (no urgente, sin ficha).
>
> Sembrado por `/afinar-feature` el 2026-11-23. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Lo que ya existe

Nada que lo resuelva. Búsqueda del 2026-11-23 (`sandbox`, `AMBIENTE_PRUEBAS`, `ambiente de pruebas`
en el repo, `specs/` y el grafo): solo aparece la mención de «otro ambiente» en
`docs/ayuda/oficina/guia-integracion-api.md`, que la tabla de decisiones ya deja fuera. Piezas que se
reutilizan, no se duplican:
- lectura de variables en `lib/config/*` (patrón de `lib/config/email.ts`: un lector por variable,
  nombre de la variable en un solo sitio);
- colores fijos de marca `bg-brand-light` (`#FFD000`) y `text-brand-dark` (`#111111`), 12.8:1
  (`docs/marca.md > Paleta`), y el fixture `tests/fixtures/contraste.ts`;
- tests que leen el fuente de `app/layout.tsx` (`tests/unit/config/marca-layout.test.ts`,
  `tests/unit/guards/html-lang.guardia.test.ts`) como modelo para comprobar la posición en el layout.

## Requisitos (EARS)

Variable: `AMBIENTE_PRUEBAS`, leída en el servidor. «Encendida» significa que su valor es la cadena
exacta `true` (sin recortar espacios y distinguiendo mayúsculas).

- **R1** — SI `AMBIENTE_PRUEBAS` vale exactamente `true`, ENTONCES el sistema DEBE pintar una franja
  con el texto «Sandbox» en el layout raíz.
- **R2** — SI `AMBIENTE_PRUEBAS` no está definida, está vacía o tiene cualquier otro valor (por
  ejemplo `TRUE`, `True`, `1`, `yes`, `false`, ` true`, `true `), ENTONCES el sistema NO DEBE pintar
  ningún elemento de la franja (ni un contenedor vacío).
- **R3** — El sistema DEBE decidir si pinta la franja solo por `AMBIENTE_PRUEBAS`, sin mirar
  `VERCEL_ENV`: con `VERCEL_ENV=production` y `AMBIENTE_PRUEBAS=true` se pinta; con
  `VERCEL_ENV=preview` o `development` y sin `AMBIENTE_PRUEBAS`, no.
- **R4** — CUANDO la franja se pinta, el sistema DEBE mostrar como único texto «Sandbox», sin botón
  de cerrar ni ningún otro elemento interactivo (ni enlace, ni control enfocable).
- **R5** — CUANDO la franja se pinta, el sistema DEBE colocarla como primer elemento visible dentro
  de `<body>` del layout raíz `app/layout.tsx`, antes de `{children}`, de modo que aparece en todas
  las pantallas: públicas (landing, login, recuperación de contraseña, postulación, rastreo de
  paquete) y autenticadas.
- **R6** — CUANDO la franja se pinta, el sistema DEBE exponer el texto «Sandbox» a las tecnologías
  de asistencia (no `aria-hidden`) sin anunciarlo como alerta (sin `role="alert"` ni `aria-live`
  `assertive`).
- **R7** — CUANDO la franja se pinta, el sistema DEBE usar colores fijos de marca que no giran con el
  tema: texto «Negro Servi» `#111111` sobre «Amarillo Señal» `#FFD000` (contraste ≥ 4.5:1, medido
  con `tests/fixtures/contraste.ts`), en tema claro, oscuro y de sistema. NUNCA texto amarillo sobre
  blanco (`docs/marca.md`).
- **R8** — MIENTRAS la app corre como PWA instalada en iOS con la barra de estado
  `black-translucent`, la franja DEBE reservar arriba el área segura (`env(safe-area-inset-top)`)
  para que el texto «Sandbox» no quede debajo de la barra de estado.
- **R9** — CUANDO la franja se pinta, el sistema DEBE mantenerla a su alto natural dentro del
  `<body>` `min-h-full flex flex-col`: no se estira ni se encoge, y el resto del contenido sigue
  debajo de ella sin solaparse.
- **R10** — El sistema DEBE documentar `AMBIENTE_PRUEBAS` en `.env.example` como `AMBIENTE_PRUEBAS=`
  sin valor, con un comentario que diga que solo se pone `true` en el proyecto Vercel del sandbox
  (lo vigila además `tests/unit/guards/env-example-sin-valores.guardia.test.ts`).
- **R11** — CUANDO la franja se pinta, el sistema DEBE dejarla en el flujo normal del documento: se
  desplaza con el scroll y NO usa `position: sticky` ni `fixed` ni un `z-index` propio, de modo que
  no tapa la barra lateral, las barras pegadas, los `Sheet` ni el aviso de versión nueva.

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| Detección por `AMBIENTE_PRUEBAS` exacto `true`, no `VERCEL_ENV` | R1, R2, R3, R10 |
| Layout raíz, todas las pantallas | R5 |
| No se cierra, fija arriba, también en celular y PWA | R4, R5, R8, R9, R11 |
| Texto «Sandbox», solo eso | R1, R4 |
| La guía de integración no cambia | Fuera de alcance: ningún archivo de `docs/ayuda/` en `## Archivos esperados` |
| Crons sin cambio | Fuera de alcance: ningún archivo de crons en `## Archivos esperados` |
| Sin E2E, test del componente | Tasks T2 y T3 |
| Ruta ligera | Este archivo |

## Tasks

- [x] **T1** — `lib/config/ambiente.ts`: `ambienteDePruebas(): boolean`, que devuelve
  `process.env.AMBIENTE_PRUEBAS === "true"` y nada más (sin `VERCEL_ENV`, sin `trim`, sin
  minúsculas). El nombre de la variable vive solo aquí. **Hecho:** test unitario
  `tests/unit/config/ambiente-config.test.ts` en verde, con un caso por valor de R2, el `true`
  de R1 y las combinaciones con `VERCEL_ENV` de R3; restaura `process.env` tras cada caso.
- [x] **T2** (depende de T1) — `components/shared/BannerAmbientePruebas.tsx`, Server Component
  (sin `"use client"`): si `ambienteDePruebas()` es `false` devuelve `null`; si no, una franja con
  el texto «Sandbox», colores fijos `bg-brand-light text-brand-dark`, `shrink-0`, centrada, sin
  controles, y `padding-top` que incluye `env(safe-area-inset-top)`. **Hecho:**
  `tests/components/BannerAmbientePruebas.test.tsx` (`// @vitest-environment jsdom`) en verde:
  R1 (se pinta con `true`), R2 (con cada valor de la lista, `container` vacío), R3, R4 (texto
  exacto «Sandbox», cero `button`/`a`/elementos enfocables), R6 (sin `aria-hidden`, sin
  `role="alert"` ni `aria-live="assertive"`), R7 (clases fijas, sin `text-brand-light` ni
  `text-brand`, y `contraste("#111111", "#FFD000") >= 4.5`), R8 (el estilo contiene
  `env(safe-area-inset-top)`), R9 (`shrink-0`), R11 (sin clases `sticky`, `fixed` ni `z-*`).
- [x] **T3** (depende de T2) — `app/layout.tsx`: `<BannerAmbientePruebas />` como primer hijo de
  `<body>`, antes de `<ZodEnEspanol />` y de `{children}`, con un comentario `SLT-257`. **Hecho:**
  `tests/unit/config/banner-ambiente-layout.test.ts` en verde: lee el fuente del layout (como
  `marca-layout.test.ts`) y comprueba que la etiqueta está dentro de `<body` y antes de
  `{children}` (R5); `pnpm run typecheck` y `pnpm run lint` en verde.
- [x] **T4** [P] — `.env.example`: bloque comentado y `AMBIENTE_PRUEBAS=` sin valor (R10).
  **Hecho:** `tests/unit/config/ambiente-config.test.ts` incluye un caso que encuentra la línea
  `AMBIENTE_PRUEBAS=` en `.env.example`, y `pnpm run test:guardias` en verde (incluida
  `env-example-sin-valores` y `marca-texto-amarillo`).
- [ ] **T5** (depende de T3 y T4) — `./init.sh` en verde. Nota para el PR: el layout raíz puede
  prerenderizarse en el build, así que encender o apagar la variable en Vercel pide un redeploy.
  La comprobación de R8 en un iPhone con la PWA instalada es manual y va descrita en el PR (sin
  E2E, por decisión).

## Archivos esperados

- `lib/config/ambiente.ts`
- `components/shared/BannerAmbientePruebas.tsx`
- `app/layout.tsx`
- `.env.example`
- `tests/unit/config/ambiente-config.test.ts`
- `tests/components/BannerAmbientePruebas.test.tsx`
- `tests/unit/config/banner-ambiente-layout.test.ts`

## Tamaño

7 archivos (tope 40). Producción ≈ 40 líneas; tests ≈ 150 líneas.

## Preguntas abiertas

Ninguna. P1 (pegada o con el scroll) la cerró el humano el 2026-11-23: se va con el scroll (R11).

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-23 | ¿Cómo se detecta el sandbox? | Variable `AMBIENTE_PRUEBAS`, solo con el valor exacto `true`. No `VERCEL_ENV`: el sandbox es un proyecto Vercel aparte con `prod` como rama de producción y ahí `VERCEL_ENV=production`. |
| 2026-11-23 | ¿Dónde va? | Layout raíz `app/layout.tsx`: todas las pantallas, con y sin sesión, incluidas las públicas. |
| 2026-11-23 | ¿Se puede cerrar? | No. Franja fija arriba, siempre visible, también en el celular y en la PWA. |
| 2026-11-23 | ¿Qué texto lleva? | «Sandbox», solo eso. |
| 2026-11-23 | ¿Cambia la guía de integración? | No: ya contempla otro ambiente (`docs/ayuda/oficina/guia-integracion-api.md:270`). |
| 2026-11-23 | ¿Crons más espaciados en el sandbox? | No por ahora. Se revisa el costo en Usage de Vercel tras una semana. |
| 2026-11-23 | ¿E2E? | No: no es un flujo crítico. Test del componente: con `true` se pinta; sin la variable o con otro valor, no. |
| 2026-11-23 | ¿Ruta? | Ligera: un solo `requirements.md` con EARS, tasks y archivos esperados. |
| 2026-11-23 | ¿La franja queda pegada al desplazar o se va con el scroll? (P1 de `spec_author`) | Se va con el scroll: en el flujo, sin `sticky`/`fixed`, no tapa nada ni toca componentes compartidos (R11). |
