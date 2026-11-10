# SLT-98 «Reporte de bugs: imágenes»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-98 | reporte-bugs-imagenes | fullstack | medium | feature/SLT-98-reporte-bugs-imagenes | Camilo | in_progress |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.4 (2026-11-10): spec aprobado por el humano («Aprobado, implementa»). Tarjeta en curso. F2.1 implementer.

## Evaluación
- zone fullstack: bucket nuevo, subida firmada, validación en el servidor, enlaces en el correo y en el detalle, y el panel.
- complexity medium; ruta completa (almacenamiento y permisos).
- Entrega 3 de 3; depende de SLT-97 (hecha, PR #112).

## Decisiones
- 2026-11-10 · Alcance y decisiones → `specs/SLT-98-reporte-bugs-imagenes/requirements.md`.

- 2026-11-10 · Humano, sobre el spec (e22c354f): P1, las imágenes suben al pulsar «Enviar», no al elegirlas (sin huérfanas ni purga); P2, exceso de tamaño aceptado; P3, el enlace del detalle del superadmin dura 24 h; P4, 5 MB = 5 × 1024 × 1024 bytes. spec_author reescribe el flujo de subida.

- 2026-11-10 · Humano, tras la review (m1): arreglar en este PR el tope de subida, «21 al dia como limite». Sobre la enmienda (7fb00846): P5 día calendario de Costa Rica; P6 cuentan los permisos concedidos; P8 con el tope lleno se puede enviar texto; P9 «subelas todas, pero el siguiente ya no puede enviar mas imagenes» (tope blando: si al pedir quedan menos de 21 usadas se conceden todas, hasta 5, aunque pase de 21; desde 21 no se concede ninguna); P10 devolver el cupo si Storage falla; P11 «sin aviso» y aclarado «Envía solo el texto» (con el tope lleno el reporte se envía sin las imágenes y sin mensaje); P12 tamaño aceptado.
- 2026-11-10 · Humano, P13 (ba2d57dc): sin cupo al «Reintentar», el reporte lleva las imágenes ya subidas en el intento anterior («Sí, van las ya subidas»); coincide con R29 y design §16.5 tal como están.
- 2026-11-10 · Humano aprueba la enmienda del tope (ba2d57dc): «Aprobado, implementa». Implementer T12–T16.
- 2026-11-10 · Humano, tras F2.1 vuelta 2: el día del cupo se corta con la zona horaria del país de la empresa, como `asistente_uso_diario`, porque la guardia `pais-sin-literales` (SLT-42) veta fijar Costa Rica en `lib/**` («Zona del país de la empresa»); país sin zona responde `error`. Tamaño real aceptado («Aceptar 4151, un PR»). E2E del tope: la máquina se quedó sin memoria en el build; el humano decide «Solo CI»: el grupo E2E de CI que incluye `reporte-de-bugs` sustituye las dos corridas locales y su verde cierra T16.

<!-- tamano-pr-aceptado: 2026-11-10 · 36 archivos y 4173 líneas (cifra real final: 4171 tras el test de R24 «país sin zona», +2 de los comentarios de la review m4, movimiento que el humano dio por aceptado), casi la mitad tests (incluye el doble de Storage del E2E). Humano: «Aceptar 4171». -->

## Preguntas abiertas
Ninguna.

## Condición de merge
- Comprobación en el preview del PR, contra Supabase real (design §15): con un `BUG_REPORT_BUCKET` que aún no exista, enviar un reporte con una imagen crea el bucket privado con sus límites (5 MB, PNG/JPG/WebP); el `PUT` del navegador sube sin error de CORS; el enlace del correo abre la imagen. Resultado anotado en `progress/impl_SLT-98.md`.
- `gate-completo` en verde.
- Grupo E2E `aislamiento` de CI (incluye `e2e/reporte-de-bugs.spec.ts`) con 0 failed, 0 skipped y 0 flaky, incluido el test nuevo «con el cupo del día lleno, el reporte se envía solo con el texto, sin subir nada y sin aviso». El enlace a esa corrida va a `progress/impl_SLT-98.md`. Si falla por cruzar la medianoche de Costa Rica (06:00 UTC, review m5), se relanza.
- Los demás grupos E2E de CI (`reparto`, `dinero`) en verde.

## Tandas
- 2026-11-10 · F2.1 implementer: T1–T10 hechas y la parte de código de T11 (77a2ebe1…c4aac3d8). Typecheck y lint en verde; vitest de lo tocado 197/197; guardias en verde salvo baseline; guardias de esquema 52/52; ida y vuelta de la migración limpia; E2E ×2 21/21. Pendiente: comprobación en preview contra Supabase real (design §15). Tamaño según `tamano-pr`: 34 archivos y 3374 líneas, por encima de lo aceptado (~2.200–2.500). Detalle → `progress/impl_SLT-98.md`.

## Modelos (overrides)

## Cierre
