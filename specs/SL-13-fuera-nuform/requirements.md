# SL-13 — Fuera el integrador de origen

> Zona: backend · Complejidad: medium · depends_on: SL-10 · Rama: `feature/SL-13-fuera-nuform`
>
> **Alcance.** El integrador era un cliente real de Ordenex. En servi_logistic no existe. Por
> eso su nombre sale del código, los tests, las migraciones, los diseños y los docs, y con él los
> nombres de sus clientes reales: «cliente A», «cliente B», «Distribuidora» y la referencia a Ecuador
> (respuesta del humano). Base: `docs/limpieza-ordenex.md` regla 2 y §6, y `docs/plan-saas.md`
> decisión 6 (lo heredado desaparece del todo).
>
> **Medido el 2026-10-21 con Grep, fuera de `specs/`.**
> - «el integrador»: **59 archivos**. Son los 58 del inventario, menos `docs/release.md` (ya borrado), más
>   `docs/plan-saas.md` y `docs/limpieza-ordenex.md` (nacieron después).
> - «cliente A» / «cliente B»: 13 archivos. Siete ya están entre los 59 y **6 son nuevos**.
> - «Distribuidora» y «Ecuador»: 10 archivos, detallados en `design.md > Inventario clasificado (f)`.
>   Cuatro ya estaban contados y **6 son nuevos**. Salen **todos**: ampliación pedida por el humano
>   sobre el spec aprobado (Decisiones cerradas).
> - Total: **71 archivos**. Ningún seed nombra a ninguno de estos términos.
> - El centro por defecto del mapa (Quito) deja de estar escrito en el código y pasa a la
>   configuración del país: es la única pieza nueva de código de producción.
>
> | Clase | Archivos | Qué se hace |
> |---|---|---|
> | (a) Código que solo lleva el nombre | 5 de `app/` y `lib/`. En cuatro, el nombre está **solo en comentarios** que narran incidentes de Ordenex. El quinto es el `ejemplo` de la variable `tienda` del informe de picking («cliente A») | Se generaliza el comentario («una tienda»), y el ejemplo pasa a un nombre inventado |
> | (b) Datos del integrador | La migración `20260925120300_reclasificar_cobros_459`, con 203 ids, montos y la tienda de la producción de Ordenex. En servi_logistic no escribe nada. Con ella van su guardia, su test de integración y su fixture SQL | **Se quita** la migración con todo lo que solo existía para ella |
> | (c) Tests y fixtures | 46 archivos de `tests/` que usan los nombres como dato de prueba o en comentarios | Se actualizan: nombres inventados, mismas aserciones |
> | (d) Diseños y docs | 6 archivos de `design-*/` (incluido `canvas.json`), `docs/plan-saas.md` y `docs/limpieza-ordenex.md` | Se sustituye o se quita la mención |
> | (e) Migraciones con el nombre en comentarios | `20260827160000_orden_num_remision_unico_parcial` (`migration.sql` y `down.sql`) y `20260828120000_api_key_tienda_destino` | Se editan **solo los comentarios**. No hay base desplegada (Decisiones cerradas) |
>
> Además, una guardia impide que esos nombres vuelvan a entrar, por ejemplo con un port desde Ordenex
> (`docs/plan-saas.md > Sincronía con Ordenex`).
>
> **Lo que NO entra.**
> - `specs/`: no se edita ningún archivo de los specs de Ordenex, aunque varios nombran a estas
>   tiendas. Se retiran en SL-27.
> - Costa Rica (provincias, SINPE, colones): no se toca. Es la fase 3.
> - Consolidar o renumerar migraciones.
> - El valor de enum `cobro_manual_reclasificado` y el código que lo lee. Sin la 459 nadie lo escribe,
>   pero no lleva ningún nombre de cliente. Queda como deuda, y el leader la anota en
>   `progress/deudas.md`.
> - Hacer configurable el país más allá del centro del mapa (geografía, moneda, el `PAIS` de
>   `lib/geo/direccion-query.ts`): lo hace la fase 3 (SL-20), que ampliará la configuración mínima de
>   R16.
> - El destino de las carpetas `design-notificaciones/` y `design-whatsapp/`: lo decide SL-16. Aquí
>   solo se sustituye la palabra.
> - El nombre «Ordenex» en comentarios y textos: es de SL-15 y SL-16.

## Requisitos (EARS)

### Que los nombres no estén y no vuelvan

- **R1.** Ningún archivo del repositorio fuera de `specs/` y de las excepciones de R2 DEBE contener
  en su contenido ni en su ruta ninguna de estas cadenas exactas, sin distinguir mayúsculas:
  - «el integrador», «cliente A», «cliente B»;
  - «cliente C», `cliente D`, `cliente E`,
    `cliente F`;
  - `<centro del mapa de origen>`, `<barrio de origen>`, `<dirección de origen>`.

  Cuenta tanto lo versionado como lo no versionado que no esté ignorado. Las palabras sueltas
  «Ecuador» y «distribuidora» **no** se vetan: el plan exige varios países desde el principio
  (`docs/plan-saas.md`, decisión 2), y «distribuidora» es un tipo de comercio corriente.
- **R2.** Las excepciones a R1 DEBEN ser exactamente dos, cada una con su motivo escrito:
  - el propio archivo de la guardia de R1, que define los términos;
  - la cadena literal `fuera-nuform`, que es el slug de esta ficha en el board.

  Ninguna migración es excepción. SI una excepción ya no hace falta, ENTONCES la guardia DEBE fallar
  y nombrarla.
- **R3.** CUANDO la detección de R1 recibe un texto sintético con un término prohibido, DEBE marcarlo.
  Vale cualquier combinación de mayúsculas e incluye el término dentro de otra palabra (`u-<integrador>`,
  `<INTEGRADOR>test`, `picking-<cliente-a>-…`, `t-<CLIENTE-B>`, `Cliente D`, `(<centro del mapa de origen>)`,
  `<dirección de origen>`). CUANDO recibe un texto que solo contiene «Ecuador» o «distribuidora» sueltas
  (`Distribuidora mayorista`, `Ecuador`), NO DEBE marcarlo. CUANDO recibe un texto limpio, o uno cuya única
  aparición es una cadena permitida en R2, NO DEBE marcarlo.
- **R4.** Los comentarios de `app/(app)/analitica/_components/entregas/ProductosTabla.tsx` NO DEBEN
  citar `Distribuidora` ni `Ecuador` como ejemplos medidos con datos reales.

### Código, tests y docs

- **R5.** En `app/` y `lib/` DEBEN cambiar solo comentarios. Las excepciones son tres:
  - el `ejemplo` de la variable `tienda` del informe de picking, que pasa a un nombre inventado;
  - el centro por defecto de los dos mapas de `mis-asignaciones`, que pasa a la configuración del país
    (R15);
  - el archivo nuevo de esa configuración (R16).

  Los tests existentes de esos archivos DEBEN seguir en verde.
- **R6.** Cada test que usaba uno de estos nombres como dato de prueba DEBE usar en su lugar su nombre
  inventado, con sus derivados (ids, slugs, emails, nombre de archivo):

  | Antes | Después |
  |---|---|
  | cliente A | `Abarrotes` |
  | el integrador | `Mercadito` |
  | cliente B | `Surtidora` |
  | cliente C | `Comercial Luna` |
  | `Cliente D` | `Abastos Central` |
  | `Cliente E` | `Abastos del Valle` |
  | `Cliente F SRL` | `Abastos Ejemplo SRL` |
  | `Ecuador / Pichincha / Quito (<barrio de origen>) / <dirección de origen>` | `País Ficticio / Región Norte / Ciudad Ejemplo (Barrio Uno) / Avenida Principal` |

  El número de casos y las expectativas DEBEN quedar iguales salvo el nombre. DONDE el test depende
  del orden alfabético de las tiendas, el orden esperado DEBE quedar igual:
  `Abarrotes < Mercadito < Surtidora`, como antes `cliente A < el integrador < cliente B`, y
  `Comercial Luna < Mercadito`, como antes `cliente C < el integrador`.
- **R7.** `docs/plan-saas.md` NO DEBE nombrar la cuenta de GitHub del repo de origen. La procedencia
  queda como «el repo de Ordenex», con su rama y su commit.

### Migraciones

- **R8.** En `20260827160000_orden_num_remision_unico_parcial/migration.sql`, en su `down.sql` y en
  `20260828120000_api_key_tienda_destino/migration.sql` DEBEN cambiar solo líneas de comentario SQL.
  Sin comentarios, cada archivo DEBE ser idéntico al de `dev`.
- **R9.** La carpeta `db/migrations/20260925120300_reclasificar_cobros_459` NO DEBE existir. Ninguna
  otra carpeta de `db/migrations/` DEBE añadirse, borrarse ni renombrarse.
- **R10.** CUANDO se aplica la cadena completa de migraciones sobre una base local vacía
  (`prisma migrate reset`), DEBE terminar sin error. Contra esa base DEBEN pasar, ejecutados, los tests
  de integración que dependían de la 459 o que leen las migraciones editadas:
  - `caja-invariante-tiendas`;
  - `cobro-tienda-461-completar-migration`;
  - `orden-traspaso-migration`;
  - `api-key-tienda-destino-migration`;
  - `premio-ranking-devengo-migration`.

### Lo que solo existía para la 459

- **R11.** El repositorio NO DEBE contener estos archivos:
  - `tests/unit/guards/reclasificacion-459-lista.guardia.test.ts`;
  - `tests/integration/db/reclasificacion-459-migration.test.ts`;
  - `tests/integration/db/_fixtures/reclasificacion-459-sql.ts`.

  `tests/baseline-rojos.json` NO DEBE tener la entrada de esa guardia.
- **R12.** MIENTRAS la historia de git contenga el borrado de esos dos tests, la guardia
  `test-citado-desaparecido` DEBE aceptar sus citas en `specs/459-la-caja-muestra-el-dinero-real/design.md`
  y en `specs/461-cobro-a-tienda-y-nombres-claros/design.md`.
  - Las acepta mediante una excepción **temporal** que nombra a SL-13 como la ficha que la crea, a SL-27
    («Retirar los specs/ heredados de Ordenex») como la que la retira, y su motivo.
  - SI la excepción deja de hacer falta, porque la cita ya no existe o el borrado ya no está en la
    historia, ENTONCES esa guardia DEBE fallar y pedir que se quite.

### Límites y cierre

- **R13.** El cambio NO DEBE modificar ningún archivo bajo `specs/` salvo `specs/SL-13-fuera-nuform/`,
  ni ningún literal de geografía de Costa Rica, SINPE o colones.
- **R14.** CUANDO se corre `./init.sh` en el worktree de la feature, el gate DEBE terminar con código 0.

### Centro del mapa desde la configuración del país (ampliación)

- **R15.** El centro por defecto de `RutaMapaInner.tsx`, que se usa cuando no hay ningún punto que
  encuadrar, DEBE salir del `centroMapa` de la configuración del país (R16).
  - Ni `RutaMapaInner.tsx` ni `UbicacionMapaInner.tsx` DEBEN contener coordenadas literales.
  - `UbicacionMapaInner.tsx` NO DEBE conservar la constante de centro por defecto que hoy no usa.
- **R16.** El repositorio DEBE tener una configuración mínima del país en `lib/config/pais.ts`:
  - un tipo con `codigo` (ISO 3166-1 alfa-2) y `centroMapa` (`[lat, lng]`);
  - una instancia para el país de operación de hoy, Costa Rica, el mismo que fija
    `lib/geo/direccion-query.ts`;
  - `centroMapa` con `lat` en [-90, 90] y `lng` en [-180, 180];
  - ninguna dependencia nueva, y el archivo importable desde un componente de cliente.

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-21 | ¿Se tocan los `specs/` de Ordenex? | No en esta ficha. Se retiran en SL-27 (humano; `docs/plan-saas.md`, decisión 6). → R1 (fuera del barrido), R12, R13 |
| 2026-10-21 | ¿Se toca lo de Costa Rica? | No. Es la fase 3 (humano; `docs/limpieza-ordenex.md`, regla 4). → R13 |
| 2026-10-21 | ¿Qué hacemos con lo heredado de Ordenex? | Desaparece del todo. Una excepción solo puede ser temporal y llevar la ficha que la retira (humano; `docs/plan-saas.md`, decisión 6, commit `60befb1`). → R1, R2, R9, R11, R12 |
| 2026-10-21 | ¿Se pueden editar las migraciones que nombran al integrador? | **Sí.** No hay ninguna base de servi_logistic desplegada: las migraciones solo se aplicaron en bases locales desechables, y la historia se aplanará antes del primer push. Quien tenga base local hace `prisma migrate reset` (humano, vía leader). → R8, R9, R10 |
| 2026-10-21 | ¿Se consolidan migraciones? | No (humano, vía leader). → R9 |
| 2026-10-21 | ¿`docs/plan-saas.md:14` conserva la cuenta de GitHub de la app de origen? | No. Se reescribe sin ella, porque el repo es público (humano, vía leader). → R7 |
| 2026-10-21 | ¿Qué se hace en `design-*/`? | Solo se sustituye la palabra. El destino de las carpetas lo decide SL-16 (humano, vía leader). → R1 |
| 2026-10-21 | ¿«cliente A», «cliente B», «Distribuidora» y la referencia a Ecuador entran? | Sí: son clientes reales del integrador. Entran en el alcance y en la guardia, con nombres inventados que conservan el orden alfabético de los tests (humano, vía leader). → R1, R3, R4, R6 |
| 2026-10-21 | **Ampliación pedida por el humano con el spec ya aprobado (sobre `9d61656`).** ¿Salen también `Cliente D`, `Cliente E`, `Cliente F SRL`, el centro del mapa «<centro del mapa de origen>» y la dirección de Quito de `bulk-orden-service.test.ts`? | Sí, todos. Los fixtures y la dirección pasan a valores inventados, y sus cadenas exactas entran en la guardia. Corrección posterior del leader: «Ecuador» y «distribuidora» como palabras sueltas no se vetan (varios países, `docs/plan-saas.md` decisión 2). El centro del mapa deja de estar en el código y sale de una configuración del país. Si no hay una que reusar, se define la mínima para que la fase 3 la amplíe, sin dependencias nuevas (humano, vía leader). → R1, R3, R5, R6, R15, R16 |
| 2026-10-21 | ¿Arreglo o rediseño? | Arreglo mínimo (humano, vía leader). → R5, R6, R8 |
| 2026-10-21 | ¿Qué ficha retira la excepción temporal de `test-citado-desaparecido`? | SL-27 «Retirar los specs/ heredados de Ordenex», que ya existe (humano, vía leader). → R12 |
| 2026-10-21 | ¿Se retiran aquí `cobro_manual_reclasificado` y el código que lo lee? | No. Quedan como deuda, y el leader la anota en `progress/deudas.md` (humano, vía leader). → «Lo que NO entra» |
| 2026-10-21 | ¿Quién decide sobre la guardia `reclasificacion-459-lista`, en el baseline desde SL-10? | SL-13 (SL-10 `design.md` D3; leader). Se retira junto con la migración. → R11 |
