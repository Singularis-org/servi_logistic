<!-- perfil: revisado=2026-10-21 por=Carlos Restrepo -->
# docs/dependencias.md — Registro de dependencias aprobadas

> Perfil del proyecto. `tests/guards/guard-dependencias-aprobadas.test.ts` exige una fila por cada paquete
> de `package.json`. Reglas y los cuatro checks: `docs/architecture.md > Dependencias de terceros`.

## Cómo se añade una fila
1. El `design.md` de la feature propone la librería con sus cuatro checks.
2. El humano (Carlos) aprueba el spec, y con él la dependencia.
3. El leader añade la fila aquí.

## Estados
`aprobada` · `pendiente-de-aprobar` · `retirada`

## Registro

Las 58 filas iniciales vienen del `package.json` heredado de Ordenex y las aprobó Carlos en
bloque el 2026-10-21 (`/arnes-init`). Sus cuatro checks NO se re-verificaron en ese momento: una
fila que se toque por otra razón se re-verifica entonces.

| Paquete | Para qué | Checks (mantenimiento · adopción · licencia · seguridad) | Aprobación | Estado |
| --- | --- | --- | --- | --- |
| `@base-ui/react` | primitivas de UI headless (base de shadcn) | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@daypicker/react` | selector de fechas | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@playwright/test` | E2E | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@prisma/adapter-pg` | adaptador pg de Prisma | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@prisma/client` | cliente ORM | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@supabase/ssr` | Supabase en SSR | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@supabase/supabase-js` | cliente Supabase (storage) | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@tailwindcss/postcss` | Tailwind en PostCSS | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@testing-library/jest-dom` | matchers DOM | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@testing-library/react` | tests de componentes | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@testing-library/user-event` | interacción en tests | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@types/leaflet` | tipos | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@types/node` | tipos | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@types/nodemailer` | tipos | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@types/qrcode` | tipos | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@types/react` | tipos | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@types/react-dom` | tipos | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `@types/web-push` | tipos | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `bcryptjs` | hash de contraseñas | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `bwip-js` | códigos de barras | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `class-variance-authority` | variantes de clases (shadcn) | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `clsx` | composición de clases | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `embla-carousel-react` | carrusel | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `eslint` | lint | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `eslint-config-next` | reglas de lint de Next | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `exceljs` | lectura/escritura xlsx | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `html5-qrcode` | escaneo QR/código de barras | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `jsbarcode` | códigos de barras en canvas | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `jsdom` | DOM en tests | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `jspdf` | generación de PDF | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `leaflet` | mapas | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `lucide-react` | iconos | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `next` | framework | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `nodemailer` | correo SMTP | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `prisma` | CLI de migraciones | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `qrcode` | generación de QR | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `qrcode.react` | QR en React | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `react` | UI | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `react-barcode` | códigos de barras en React | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `react-countup` | animación de cifras | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `react-dom` | UI | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `react-leaflet` | mapas en React | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `recharts` | gráficas | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `shadcn` | CLI de componentes | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `sharp` | imágenes (iconos PWA) | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `swr` | data fetching cliente | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `tailwind-merge` | fusión de clases Tailwind | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `tailwindcss` | estilos | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `tsx` | ejecutar scripts TS | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `tw-animate-css` | animaciones Tailwind | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `typescript` | tipado | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `vitest` | tests | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `web-push` | notificaciones push | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `yet-another-react-lightbox` | visor de fotos | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |
| `zod` | validación en el borde | heredada de Ordenex; checks sin re-verificar | Carlos Restrepo, 2026-10-21 | aprobada |

### Por qué
Aprobarlas en bloque deja el gate en verde desde el primer día sin fingir una revisión que no se
hizo; la columna de checks dice la verdad.
