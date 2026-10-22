# SL-15 — El nombre «Ordenex» en código y textos de UI

> Zona: fullstack · Complejidad: high · depends_on: SL-8, SL-10 · Rama: `feature/SL-15-nombre-ordenex-codigo`
>
> **Alcance.** «Ordenex» desaparece del código, de los textos de UI, de los tests, de los e2e y de
> las migraciones. Lo que nombra a la **plataforma** pasa a `MARCA` («Servi Logistic»), o a un
> nombre técnico fijo de la plataforma: claves, cabeceras y prefijos de llaves. Lo que nombra a la
> **empresa usuaria**, la que cobra, paga, debe o gana, pasa a `EMPRESA`, que hasta SL-17 es el
> término neutro «la empresa». Los identificadores pasan a «empresa». Una guardia impide que la
> palabra vuelva, también cuando se porta código de Ordenex (`docs/plan-saas.md > Sincronía con
> Ordenex`). Solo admite excepciones temporales, cada una con la ficha que la retira. El trabajo se
> corta en tandas verificables (`tasks.md`).
>
> **Medido hoy (2026-10-21, en este worktree), con mayúsculas exactas.** `Ordenex|ordenex|ORDENEX`
> aparece en:
> - 251 archivos de producción;
> - 336 de `tests/`;
> - 3 de `e2e/`;
> - 25 de `db/migrations/`.
>
> El prefijo `ordx_` está en 81 archivos, sin contar `docs/`. El 241 de `docs/limpieza-ordenex.md`
> §1 sale de una búsqueda que no distingue mayúsculas, así que incluía falsos positivos:
> `OrdenExistente`, `ordenExacta` y `ordenExigido`. Hay detalle en `design.md` §1.
>
> **Lo que NO entra.** Lo de esta lista no lo hace SL-15. La guardia lo admite como excepción
> temporal, con la ficha que lo retira (`design.md` §7):
> - el texto visible de login, layout y landing, y `components/shared/Logo.tsx` → SL-8. SL-8 va
>   antes: SL-15 solo barre lo que SL-8 deje, como comentarios o imports;
> - `docs/` → SL-16, que va justo después. Incluye los documentos de historia: `docs/plan-saas.md`,
>   `docs/limpieza-ordenex.md` y `docs/marca.md`, que SL-16 recorre con una excepción temporal de
>   SL-27. La guardia de SL-15 no lee `docs/`;
> - `design-notificaciones/`, `design-whatsapp/`, `DESIGN.md` y `.design-work/` → SL-16.
>   También son de SL-16 los tests que solo afirman el contenido de `docs/ayuda/**`
>   (`tests/unit/asistente/contexto-45*.test.ts`, `contexto-461.test.ts`) y las líneas de test que
>   nombran un archivo de `docs/api/`;
> - el dominio de Ordenex → SL-14. El integrador → SL-13;
> - `scripts/seed-*.ts` → SL-11. `scripts/backfill-*.ts` y sus tests → SL-12;
> - `specs/` heredados: no se editan. Los retira SL-27 «Retirar los specs/ heredados de Ordenex»;
> - `progress/`: es el estado del arnés;
> - Costa Rica (provincias, SINPE, colones): no se toca;
> - la tabla `organizacion` y el nombre de cada empresa → SL-17;
> - las migraciones que tocan otras fichas:
>   - las cuatro del usuario maestro (`20260709120000_seed_maestro_user` y
>     `20260720150000_drop_default_maestro_user`, con sus `down.sql`) → SL-11;
>   - `20260925120300_reclasificar_cobros_459`, que SL-13 borra entera, y
>     `20260827160000_orden_num_remision_unico_parcial` → SL-13;
> - consolidar las migraciones → SL-28, que va después. SL-15 no consolida, no renumera y no
>   renombra carpetas.
>
> **`db/schema.prisma`.** Tiene 46 apariciones de «Ordenex» y 1 de `ordx_`, y las 47 están en
> comentarios (`//` o `///`). Lo comprobé buscando la palabra en las líneas que no tienen `/`
> antes, y no hay ninguna. Ningún modelo, columna, enum, `@map` ni `@@map` lleva la palabra, así
> que cambiarlas no cambia el SQL.

## Requisitos (EARS)

### Plataforma y empresa

- **R1.** El sistema DEBE tener un único módulo de marca, `lib/config/marca.ts`, que exponga dos
  cosas:
  - `MARCA.nombre`, que vale «Servi Logistic»;
  - el nombre de la empresa usuaria en tres formas: en frase, al inicio de frase y como membrete.

  MIENTRAS no exista la tabla `organizacion` (SL-17), esas formas DEBEN valer «la empresa»,
  «La empresa» y nada (sin membrete).
- **R2.** CUANDO una pantalla, un correo, una notificación o la documentación de la API nombran a la
  plataforma, el sistema DEBE mostrar `MARCA.nombre`. Son ejemplos la app instalada, el aviso de
  versión nueva, la invitación a instalar, el asistente, el correo del código de verificación y
  `/api-docs`.
- **R3.** CUANDO una pantalla, una descarga, una plantilla de mensaje o un PDF nombran a quien cobra,
  paga, factura, debe, gana, gasta o reparte, el sistema DEBE usar el nombre de la empresa del
  módulo de marca, y NO DEBE decir «Servi Logistic».
- **R4.** SI cambia el nombre de la empresa en el módulo de marca, ENTONCES cada grupo de
  superficies de R3 DEBE mostrar el valor nuevo sin que se edite ningún otro archivo.
- **R5.** Ningún archivo de `app/`, `lib/`, `components/`, `hooks/` ni `middleware.ts` DEBE contener
  el literal «Servi Logistic», salvo `lib/config/marca.ts`.
- **R6.** `public/sw.js`, `public/offline.html` y `public/manifest.json` no pueden importar el
  módulo. Aun así, DEBEN nombrar a la plataforma con el mismo valor que `MARCA.nombre`, incluidas
  las etiquetas de las capturas del manifiesto. SI difieren, ENTONCES el gate DEBE fallar.

### Documentos impresos

- **R7.** CUANDO se genera la etiqueta de guía en PDF, el rótulo superior depende del membrete de
  la empresa:
  - MIENTRAS no haya membrete, el rótulo DEBE ser «GUÍA»;
  - DONDE haya membrete, el rótulo DEBE ser el membrete en mayúsculas seguido de « · GUÍA».

  En los dos casos DEBE terminar antes del recuadro del número de guía.
- **R8.** CUANDO se generan los informes de tránsito y de picking en PDF, el encabezado depende del
  membrete:
  - MIENTRAS no haya membrete, el encabezado y el sello DEBEN omitir el nombre: por ejemplo,
    «Informe de tránsito · <fecha> <hora>»;
  - DONDE haya membrete, DEBEN llevarlo.

### Lo técnico de la plataforma

- **R9.** Todas estas claves DEBEN usar el prefijo `servi-logistic:`:
  - las claves de almacenamiento del navegador;
  - los eventos de ventana;
  - los mensajes entre el service worker y la página;
  - la etiqueta de las notificaciones.

  La cookie de tema DEBE llamarse `servi_logistic_tema`. El service worker y la aplicación DEBEN
  usar los mismos nombres de mensaje.
- **R10.** El webhook saliente DEBE firmar con `X-Servi-Logistic-Signature` y
  `X-Servi-Logistic-Timestamp`, y el OpenAPI de `/api-docs` DEBE documentar esas cabeceras y
  ninguna otra de firma.
- **R11.** Las API keys nuevas DEBEN empezar por `svl_` y los secretos de webhook por `svl_whsec_`.
  La parte que se guarda en claro DEBE ser el prefijo más 7 caracteres. El OpenAPI DEBE documentar
  `Authorization: Bearer svl_…`. SI llega una key con el prefijo anterior, ENTONCES DEBE recibir el
  mismo 401 que cualquier key desconocida: no hay ninguna emitida y no se mantiene compatibilidad.
- **R12.** Los scripts locales que vigilan adónde apunta `DATABASE_URL` DEBEN aceptar la base
  `servi_logistic` en los mismos casos en que hoy aceptan `ordenex`, y DEBEN rechazar `ordenex`.
  Son `scripts/rollup-analitica-manual.ts`, `scripts/contraste-454.ts` y `scripts/drenar-jobs.ts`.

### Identificadores y migraciones

- **R13.** Los identificadores de producción y de test que nombran a Ordenex DEBEN pasar a
  «empresa» según el glosario de `design.md` §3, sin cambiar el comportamiento. Son los tipos, las
  funciones, las constantes, los valores de unión, el id de la métrica y el módulo
  `lib/utils/ingreso-ordenex.ts`.
- **R14.** Las migraciones de `db/migrations/` del alcance de SL-15 NO DEBEN contener la palabra,
  ni en comentarios ni en literales de texto. «Del alcance de SL-15» quiere decir todas menos las
  de SL-11 y SL-13. Aplicadas desde cero (`prisma migrate reset`) DEBEN dejar el mismo esquema que
  hoy. NO DEBEN consolidarse, renumerarse ni cambiar de nombre de carpeta: eso es de SL-28.
- **R14b.** Las 47 apariciones de `db/schema.prisma` DEBEN desaparecer sin que cambie ningún
  modelo, columna, enum, `@map` ni `@@map`. `prisma migrate diff` entre las migraciones y el
  esquema DEBE salir vacío.

### Guardia

- **R15.** SI un archivo versionado contiene, en su contenido o en su ruta, `Ordenex`, `ordenex`,
  `ORDENEX` u `ordx_` (distinguiendo mayúsculas) fuera de una excepción vigente, ENTONCES el gate
  DEBE fallar nombrando el archivo y la línea. La guardia no lee tres carpetas: `specs/`, que
  retira SL-27; `docs/`, que es de SL-16 y la vigila esa ficha; y `progress/`, que es el estado del
  arnés.
- **R16.** Cada excepción DEBE ser temporal y nombrar la ficha que la retira. SI una excepción ya no
  cubre ninguna aparición, ENTONCES el gate DEBE fallar. CUANDO SL-15 se integra, NO DEBE quedar
  ninguna excepción retirada por SL-15.
- **R17.** El patrón buscado DEBE escribirse en un solo archivo de test, sin que la palabra aparezca
  literal en él. Las aserciones de ausencia (R21) DEBEN importarlo de ahí.

### Lo que no se toca

- **R18.** El cambio NO DEBE modificar:
  - archivos de `specs/`, ni los listados en `arnes.manifest`;
  - literales de geografía de Costa Rica, SINPE o colones, salvo la palabra dentro de esa misma
    cadena;
  - el texto visible de login, layout y landing;
  - las líneas con el dominio de Ordenex ni las referencias al integrador;
  - los roles ni sus permisos (`maestro` no es el superadmin: el superadmin es de SL-32).

### Tests

- **R19.** CUANDO un test afirma un texto o un valor que produce el código y que contenía la
  palabra, DEBE afirmar el valor nuevo como literal, sin leerlo del módulo de marca.
- **R20.** Ningún archivo de `tests/` ni de `e2e/` DEBE mencionar la palabra fuera de las
  excepciones de R16, tampoco en comentarios, nombres de caso o datos de entrada.
- **R21.** CUANDO un usuario de oficina abre `/wallet` y una tienda abre `/mi-wallet`, la página
  renderizada NO DEBE contener la palabra heredada ni «Servi Logistic» en los textos de dinero, y
  DEBE mostrar el nombre de la empresa donde antes aparecía.

### Cierre

- **R22.** CUANDO termina cada tanda de `tasks.md`, y al cerrar la feature, `./init.sh` en el
  worktree DEBE terminar con código 0.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-21 | ¿Entran login, layout y landing? | No: son de SL-8, que va antes y crea `lib/config/marca.ts` con la forma de `design.md` §3. SL-15 barre lo que SL-8 deje (humano, P5). → R1, R5, R18 |
| 2026-10-21 | ¿Se editan los `specs/` de Ordenex? | No. Se retiran más adelante (`docs/plan-saas.md`, decisión 6). → R15, R18 |
| 2026-10-21 | ¿Entran `docs/` y los diseños? | No: son de SL-16, que va justo después, incluido `.design-work/` (humano, P6 y P7). → R16 |
| 2026-10-21 | ¿Entran el dominio de Ordenex y el integrador? | No: son de SL-14 y SL-13. → R16, R18 |
| 2026-10-21 | ¿Se toca lo de Costa Rica? | No: es la fase 3. → R18 |
| 2026-10-21 | ¿Quién es «Ordenex» en los textos? | Servi Logistic es solo la plataforma. Quien cobra, paga, debe o gana es la empresa usuaria, y esos textos nunca dicen «Servi Logistic». Lo técnico de la plataforma sí lleva su nombre (humano, P1; `docs/plan-saas.md`, decisión 4). → R1, R2, R3, R5, R21 |
| 2026-10-21 | ¿Qué vale el nombre de la empresa hasta SL-17? | El término neutro «la empresa», sin membrete. SL-17 lo sustituye por el nombre de la organización de la sesión (spec, con la justificación de `design.md` §3, por encargo del humano). → R1, R4, R7, R8 |
| 2026-10-21 | ¿Cabeceras del webhook y prefijo de llaves? | Nombre de la plataforma: `X-Servi-Logistic-*` y `svl_`/`svl_whsec_`. En servi_logistic no hay ninguna llave emitida, así que no hay compatibilidad que mantener (humano, P2). → R10, R11 |
| 2026-10-21 | ¿Qué término llevan los identificadores? | «empresa» (humano, P3). → R13 |
| 2026-10-21 | ¿Desaparece «Ordenex» del todo? | Sí: de código, UI, tests, e2e y migraciones. Solo se admiten excepciones temporales con la ficha que las retira, y al cerrar el epic SL-1 no puede quedar ninguna (humano; `docs/plan-saas.md`, decisión 6). Sustituye a la regla anterior, «en tests, el literal solo si es contrato». → R15, R16, R19, R20 |
| 2026-10-21 | ¿Se editan las migraciones aplicadas? | Sí. No hay ninguna base de servi_logistic desplegada, solo bases locales desechables (`prisma migrate reset`), y la historia se aplanará antes del primer push. No se consolidan: lo hace SL-28, después (humano). Las de SL-11 y SL-13 son de esas fichas. → R14 |
| 2026-10-21 | ¿Algún nombre de `db/schema.prisma` es de columna o de tabla? | No. Las 47 apariciones están en comentarios (lo comprobé con grep), así que se editan sin migración nueva y sin cambiar el SQL (encargo del leader: decidir con evidencia). → R14b |
| 2026-10-21 | ¿`EMPRESA` puede valer «Servi Logistic»? | Nunca, ni siquiera como valor de transición (humano, reiterado). → R1, R3 |
| 2026-10-21 | ¿Y `tests/unit/utils/ingreso-ordenex.test.ts`, que citan `specs/` de Ordenex? | Se queda como excepción temporal, y la retira SL-27 «Retirar los specs/ heredados de Ordenex». Lo mismo vale para cualquier literal de test que tenga que coincidir con un spec heredado (humano, P4 y respuesta 1). → R16 |
| 2026-10-21 | ¿Los documentos de proceso son de SL-15? | No. `docs/plan-saas.md`, `docs/limpieza-ordenex.md` y `docs/marca.md` son historia y los recorre SL-16, con una excepción temporal de SL-27. `progress/` es el estado del arnés y queda fuera. La guardia de SL-15 no lee `docs/`, `specs/` ni `progress/` (respuesta 2). → R15 |
| 2026-10-21 | ¿Qué migraciones toca SL-15? | Todas las que tienen la palabra, salvo las del usuario maestro, que son de SL-11, y estas dos de SL-13: `20260827160000_orden_num_remision_unico_parcial` y `20260925120300_reclasificar_cobros_459`, que SL-13 borra entera (respuestas 4 y 5). Quedan 19 archivos en 18 carpetas. → R14 |
| 2026-10-21 | ¿El superadmin es el rol `maestro`? | No. Es un rol nuevo, de SL-32 «Rol superadmin y su usuario de arranque», y `maestro` conserva sus permisos. SL-15 no toca roles: el usuario maestro de las migraciones de SL-11 es otra cosa (corrección del humano). → R18 |
| 2026-10-21 | ¿Una entrega o varias? | Varias tandas verificables, cada una con el gate en verde (leader). → R16, R22 |

## Preguntas abiertas

1. **«La empresa» visto por una tienda** (esperando al humano). En mi-wallet, una tienda leerá
   «La empresa te debe ₡9.000». El spec lo deja así hasta que el humano responda.
