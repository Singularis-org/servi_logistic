# SL-11 — Fuera zonas y seeds de Ordenex

> Zona: backend · Complejidad: medium · depends_on: SL-10 · Rama: `feature/SL-11-fuera-zonas-y-seeds-ordenex`
>
> **Alcance.** La app nace **limpia y vacía**, **sin ningún usuario** hasta SL-32. Lo único que trae
> de serie es:
> - la geografía del país (hoy Costa Rica, por sus migraciones);
> - los catálogos del sistema (roles, estados de orden, tipos de identificación, vehículos).
>
> Las zonas las crea cada empresa.
>
> Salen del árbol los datos de negocio y los seeds de Ordenex:
> - los xlsx de zonas de `public/` y sus notas;
> - `scripts/seed-zonas.ts`, `04_insert_zonas_pago_distrito.sql`, `scripts/seed-usuarios-qa.ts` y
>   `scripts/seed-maestro.ts`;
> - la migración que siembra las 7 zonas de Ordenex;
> - el usuario que siembra una migración;
> - el SINPE inicial: `scripts/seed-sinpe-inicial.ts` y el desatasco que lo llama desde
>   `scripts/migrate-deploy.ts`.
>
> Los tests que necesitan datos o un usuario los crean dentro de la prueba. En esta ficha son los
> seis `zona-*`, `zona-sinpe-migration`, la geografía DTA 2026 y la carga masiva.
>
> **Lo que NO entra.**
> - **Crear el superadmin → SL-32 «Rol superadmin y su usuario de arranque».** SL-11 no crea ningún
>   usuario ni añade ningún comando de arranque.
> - Quitar la **funcionalidad** de Costa Rica (geografía, SINPE como método de pago, colones): es la
>   fase 3 (SL-20/21/22). La geografía de CR se sigue sembrando por migración.
> - Consolidar las migraciones en una sola: es otra ficha.
> - El resto de «Ordenex» en las migraciones que esta ficha no toca (23 archivos) y en
>   `db/schema.prisma` (46 apariciones) → SL-15 «Nombre «Ordenex» en código y UI».
> - Pasar a fixtures los otros 68 tests de integración que leen datos preexistentes con
>   `fksDeOrden`, y migrar la base en CI (`.github/workflows/gate.yml`) → SL-31 «Tests de
>   integración con datos propios y base migrada en CI».
> - Los E2E de `e2e/` que dan por hecho usuarios y órdenes sembrados a mano → pregunta abierta 1.
> - El `prisma migrate reset` de la base local del checkout principal: lo hace el leader tras
>   integrar.
> - `organizacion_id`: es la fase 2 (SL-17).
> - `specs/` de Ordenex: no se edita ningún archivo.

## Requisitos (EARS)

### Lo que sale

- **R1.** El repositorio NO DEBE contener estos archivos:
  - `public/geografia-cr-completa.xlsx`;
  - `public/mapa-geografico-costa-rica.xlsx`;
  - `public/geografia-cr-completa-NOTAS.md`;
  - `scripts/seed-zonas.ts`;
  - `scripts/seed-usuarios-qa.ts`;
  - `scripts/seed-sinpe-inicial.ts`;
  - `scripts/seed-maestro.ts`;
  - `04_insert_zonas_pago_distrito.sql`.
- **R2.** `package.json` NO DEBE declarar `db:seed:zonas`, `db:seed:usuarios`, `db:seed:maestro` ni
  ningún script que cree usuarios. El único script de siembra que DEBE declarar es `db:seed`
  (catálogos del sistema), y DEBE apuntar a un archivo de `scripts/` que existe.
- **R3.** Ningún archivo de `tests/`, `scripts/`, `lib/`, `app/` ni `README.md` DEBE pedir correr un
  comando `db:seed…` que `package.json` no declare. Esto incluye los mensajes de error de los tests.
- **R4.** El repositorio NO DEBE contener tests cuyo único sujeto sea código retirado por esta ficha:
  el seed de zonas, su columna `codigo_dta`, su cruce por código, el trasvase del SINPE y el
  desatasco automático de migraciones. La lista está en `design.md > D7`.

### Migraciones: la base nace vacía

- **R5.** CUANDO se aplican todas las migraciones sobre una base vacía, las tablas `zona`,
  `zona_distrito` y `usuario` DEBEN quedar sin filas, y la geografía de Costa Rica DEBE quedar
  completa: 7 provincias, 84 cantones y 494 distritos.
- **R6.** Ninguna migración DEBE insertar usuarios ni zonas. Las migraciones que esta ficha edita NO
  DEBEN contener «ordenex» (sin distinguir mayúsculas).
- **R7.** CUANDO se corre `prisma migrate deploy` sobre una base vacía, sin ninguna variable de SINPE
  en el entorno, DEBE terminar sin migraciones fallidas ni pendientes y sin pasos manuales.
- **R8.** SI al aplicar `20260918120200_zona_sinpe_no_nulo` existe una zona con `sinpe_numero` o
  `sinpe_nombre` nulos, ENTONCES la migración DEBE abortar con un mensaje que pida completar el
  SINPE de cada bodega desde la aplicación. Ese mensaje NO DEBE nombrar ningún script ni variable de
  entorno. MIENTRAS no haya zonas con nulos, DEBE aplicar `NOT NULL` y los dos `CHECK` como hoy.

### El SINPE inicial y el despliegue

- **R9.** El paso de base de datos del `build` (`scripts/migrate-deploy.ts`) NO DEBE sembrar SINPE
  ni marcar ninguna migración como revertida.
  - SI `migrate deploy` falla, ENTONCES DEBE salir con código 1 sin reintentar.
  - CUANDO las migraciones se aplican, DEBE seguir sembrando la primera ocurrencia de los jobs
    recurrentes.
- **R10.** La cadena `NEXT_PUBLIC_SINPE` NO DEBE aparecer en ningún archivo de código censado, y la
  lista de permitidos de su guardia DEBE quedar vacía.

### Tests con sus propios datos

- **R11.** Los tests de integración `zona-*` que necesitan datos DEBEN crear dentro de su transacción
  revertida todo lo que usan: tienda, usuario actor, zona, orden y lo demás que necesiten. CUANDO
  corren sobre una base recién migrada, sin ningún usuario y sin haber ejecutado ningún script de
  siembra, DEBEN pasar sin cambiar ninguna aserción de comportamiento. Son estos:
  - `zona-central-guarda-y-rastro`;
  - `zona-guardado-conserva-inactivos`;
  - `zona-pago-mensajero-rastro`;
  - `zona-reconciliacion-ordenes`;
  - `zona-sinpe-rastro`;
  - `zona-sinpe-revision`.
- **R12.** `tests/integration/db/zona-central-guarda-y-rastro.test.ts` y
  `tests/integration/db/zona-guardado-conserva-inactivos.test.ts` NO DEBEN figurar en
  `tests/baseline-rojos.json`.
- **R13.** `tests/integration/db/zona-sinpe-migration.test.ts` DEBE seguir midiendo tres cosas, con
  las filas de zona creadas por el propio test:
  - las columnas y sus restricciones;
  - el aborto de R8 ante nulos;
  - que la migración aplica sobre zonas completas.
- **R14.** `tests/integration/db/geografia-dta-2026-migration.test.ts` DEBE seguir midiendo la
  herencia de zona de los distritos nuevos de la DTA 2026, con zonas y vínculos creados por el
  propio test, sin aplicar ninguna migración que siembre zonas.
- **R15.** El test de la fila de ejemplo de la carga masiva DEBE comprobar que la terna
  provincia/cantón/distrito del ejemplo existe en la geografía de CR, leída de las migraciones que
  la siembran. SI el ejemplo cambia a una terna inexistente, ENTONCES DEBE ponerse en rojo. NO DEBE
  exigir que el distrito tenga zona, porque las zonas son de cada empresa.
- **R16.** Todo email que creen los fixtures nuevos DEBE terminar en `@example.com`. Ningún literal
  de los fixtures DEBE contener «ordenex» ni el nombre del integrador.

### Arranque, límites y gate

- **R17.** CUANDO una base vacía se arranca con la secuencia de `README.md > Base de datos`
  (`prisma migrate deploy` y `pnpm run db:seed`) y la app corre en local:
  - la página pública de inicio de sesión DEBE responder sin error de servidor;
  - la base NO DEBE tener ninguna fila en `usuario`.
- **R18.** El cambio NO DEBE modificar ningún archivo de `specs/` salvo
  `specs/SL-11-fuera-zonas-y-seeds-ordenex/`, ni ningún archivo listado en `arnes.manifest`. NO DEBE
  quitar la geografía de CR de sus migraciones, ni la funcionalidad de SINPE o colones.
- **R19.** CUANDO se corre `./init.sh` en el worktree contra una base arrancada según R17, el gate
  DEBE terminar con código 0.
- **R20.** `.env.example` NO DEBE nombrar `scripts/seed-sinpe-inicial.ts` ni presentar ningún
  archivo como autorizado a nombrar las variables de SINPE: ni en su lista de excepciones temporales
  de la cabecera (la que SL-10 dejó a cargo de SL-11), ni en el párrafo sobre esas variables. Los
  demás comentarios de SINPE y Costa Rica se quedan (fase 3). (Añadido tras la review del
  2026-10-22, hallazgo B1.)

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-21 | ¿Hay seeds de datos o de usuarios? | No. La app nace limpia, vacía y **sin ningún usuario** hasta SL-32. `seed-maestro.ts` se retira, como pedía la ficha original (humano, vía leader; corrige la revisión anterior, que lo convertía en arranque). → R1, R2, R5, R17 |
| 2026-10-21 | ¿Quién es el superadmin y quién lo crea? | Un rol **nuevo**, no `maestro` (que ya existe, con otros permisos). Su usuario de arranque va en SL-32 «Rol superadmin y su usuario de arranque», en la épica de la fase 6. SL-11 no crea ningún usuario (humano, vía leader). → R2, R5, R17 |
| 2026-10-21 | ¿Qué zonas trae la app? | Ninguna: las crea cada empresa. De serie solo va la geografía del país. Fuera las 7 zonas de la migración `20260713010000` y el SINPE inicial, que es dato de empresa (humano). → R5, R7–R10, R15 |
| 2026-10-21 | ¿Hasta dónde llega «fuera Ordenex»? | Del todo, migraciones incluidas. En esta ficha: las migraciones que toca. Las otras 23 y `db/schema.prisma` van a SL-15 (humano, vía leader). → R6 |
| 2026-10-21 | ¿Se puede editar una migración ya aplicada? | Sí. Motivo: no hay ninguna base de servi_logistic desplegada; las migraciones solo se aplicaron en bases locales desechables, y la historia de git se aplana antes del primer push. Quien tenga base local hace `prisma migrate reset`. No se consolidan las migraciones: eso es otra ficha (humano). → R5, R6, R8 |
| 2026-10-21 | ¿Cómo consiguen datos los tests? | Cada test, y cada E2E, que necesita datos o un usuario los crea dentro de la prueba. Ninguno depende de una semilla (humano). → R11, R13–R16 |
| 2026-10-21 | ¿Y los demás tests que leen datos preexistentes, y la base en CI? | Van a SL-31 «Tests de integración con datos propios y base migrada en CI». En SL-11 solo los seis `zona-*` (humano, vía leader). → R11 |
| 2026-10-21 | ¿Los catálogos de `db:seed` son «seed de datos»? | No: tipos de identificación, roles, estados y vehículos son parte del producto (humano, vía leader). → R2, R17 |
| 2026-10-21 | ¿Se quita lo de Costa Rica? | La funcionalidad no: es la fase 3 (humano; `docs/limpieza-ordenex.md` regla 4). → R5, R18 |
| 2026-10-21 | ¿Se tocan los `specs/` de Ordenex? | No (`docs/limpieza-ordenex.md` regla 5). → R15, R18 |
| 2026-10-21 | ¿Los dos tests de zona del baseline de SL-10? | Salen del baseline aquí (spec de SL-10, D3). → R12 |
| 2026-10-21 | ¿Quién resetea la base local del checkout principal? | El leader, tras integrar (humano, vía leader). → R19 |

## Preguntas abiertas

1. **E2E que dan por hecho datos sembrados.** Varios specs de `e2e/` llevan una «PRECONDITION
   (seed)» que pide usuarios y órdenes cargados a mano, entre ellos `wallet.spec.ts`,
   `mis-asignaciones.spec.ts`, `recepcion-satelite.spec.ts` y `devolucion-origen.spec.ts`. SL-11 no
   los rompe: nadie los sembraba, y solo corren en el PR a `prod`. Pero con la regla «el E2E crea
   su usuario dentro de la prueba», alguien tiene que reescribirlos. ¿Van a SL-31 o a una ficha
   nueva?
