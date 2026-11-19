# SLT-61 «Endurecer search_path de las funciones SECURITY DEFINER» — design

## Lo que ya existe

Buscado `search_path`, `pg_temp`, `SECURITY DEFINER`, `prosecdef`/`proconfig`:

- **Board** (`feature_list.json`, todos los estados): solo SLT-61. Ninguna otra ficha lo trata.
- **Specs:** 20 specs fijan `search_path` para **sus** funciones (precedente del valor:
  `specs/SL-40-cobro-plataforma-por-orden/design.md:74`, «`SET search_path = public, pg_temp`»).
  Ninguno re-endurece funciones anteriores.
- **Código / tests:**
  - 38 funciones ya nacen con `SET search_path = public, pg_temp` (inventario abajo).
  - `tests/integration/db/plan-de-la-empresa.test.ts:298-307` y
    `tests/integration/db/migracion-ciclo-elegido-ida-y-vuelta.test.ts:327` ya comprueban
    `proconfig = ["search_path=public, pg_temp"]` de **una** función cada uno. Se reutiliza la forma
    de la consulta (`pg_proc` JOIN `pg_namespace` con `n.nspname = 'public'`).
  - `tests/integration/db/_fixtures/ida-y-vuelta-32.ts` (base propia, `aplicarMigracionesHasta`,
    `ejecutar`, `sqlDe`, `carpetasDeMigracion`): se reutiliza para el test de ida y vuelta.
  - `tests/fixtures/sin-comentarios.ts > quitarComentariosSql`: se reutiliza en la guardia.
  - Fábricas `tests/fabricas/paises.ts` (`crearPaisDePrueba`, `crearOrganizacionEnPais`,
    `crearGeografiaDePrueba`) y `tests/integration/db/_fixtures/pais-20.ts` (`sqlstateDe`, …): se
    reutilizan para el caso de la tabla temporal (como en `geografia-dos-paises.test.ts`).
  - **No existe** guardia ni test que recorra **todas** las `SECURITY DEFINER`. Eso es lo nuevo.
- **Grafo:** el índice de este worktree no existe en `codebase-memory-mcp` (`index_status`: «project
  not found»); la búsqueda se hizo con Grep/Read.

## Inventario (fuente: `db/migrations/*/migration.sql` en `dev` @ `ab489908`)

Regla: vale la **última** migración que crea o reemplaza cada función; se descuentan los `DROP
FUNCTION` (`plan_cupo_ordenes` y `plan_tope_ordenes`, retiradas en `20261106120000`). No hay ningún
`ALTER FUNCTION` en el repo. El test de catálogo (R1/R7) es la comprobación real contra Postgres.

**Sin `pg_temp` (2, las que cambia SLT-61):**

| Función | Migración vigente | Hoy | Tablas que lee sin esquema |
|---|---|---|---|
| `verificar_misma_empresa()` | `20261022130300_misma_empresa_en_fk` | `public` | ninguna: la tabla referida va como `%I.%I` con `TG_TABLE_SCHEMA` |
| `geografia_del_pais_de_la_empresa()` | `20261026130300_geografia_del_pais_de_la_empresa` | `public` | `organizacion`, `provincia`, `canton`, `distrito` |

`verificar_misma_empresa` no es atacable hoy por esta vía (califica su única lectura), pero se
endurece igual: la guardia exige la regla a todas, y un cambio futuro de su cuerpo la expondría.

**Ya con `public, pg_temp` (38), por migración vigente:**

- `20261104150200_cobro_plataforma_porcentual_funciones`: `orden_estado_es_final`,
  `cobro_plataforma_importe_porcentual`, `cobro_plataforma_porcentual_conciliar`,
  `cobro_plataforma_al_crear_orden`, `cobro_plataforma_al_cambiar_borrado`,
  `cobro_plataforma_al_cambiar_estado`, `plan_cobro_del_ciclo`.
- `20261028130200_plan_topes_triggers`: `plan_uso_ordenes`, `plan_uso_rol`, `plan_uso_api_keys`.
- `20261108120300_slt94_fulfillment_triggers`: `fulfillment_registrar_movimiento`,
  `fulfillment_al_crear_orden`, `fulfillment_al_cambiar_borrado`, `fulfillment_al_cancelar_por_api`.
- `20261109120000_cobro_plataforma_traza`: `cobro_plataforma_traza_al_registrar`.
- `20261111130100_factura_plataforma`: `plan_costo_del_periodo`, `plan_costo_del_tramo`,
  `plan_dias_de_calendario`, `factura_plataforma_avanzar`, `factura_plataforma_ordenes`,
  `factura_plataforma_en_curso`.
- `20261114120000_plan_cambio_por_empresa`: `plan_version_de`, `plan_tope_rol_de`,
  `plan_tope_usuario`, `plan_tope_api_key`, `cobro_plataforma_tarifa_de`, `plan_de_la_empresa`,
  `factura_plataforma_abrir`, `factura_plataforma_tomar_cambio`, `factura_plataforma_cuota`,
  `factura_plataforma_cerrar`.
- `20261116120000_pago_plataforma_confirmacion`: `factura_plataforma_saldos`,
  `pago_plataforma_por_confirmar`, `pago_plataforma_disponible_de`, `pago_plataforma_disponible`,
  `pago_plataforma_confirmar`, `wallet_movimiento_tope_pago_plataforma`,
  `pago_plataforma_no_anular_confirmado`.

Las de dinero (cobro, factura, pago, wallet, fulfillment) ya estaban bien: **SLT-61 no toca
ninguna**.

## Decisiones

### D1 · Valor: `search_path = public, pg_temp`

- `pg_temp` al final: las tablas temporales se buscan las últimas y nunca tapan a las de `public`.
  Para funciones y operadores Postgres nunca mira `pg_temp`, así que no hace falta más.
- `pg_catalog` no se lista: si no aparece, Postgres lo busca **primero** de forma implícita, que es
  justo lo seguro.
- Es el valor de las 38 funciones vigentes y el que ya comprueban dos tests. Un solo valor canónico
  hace la guardia exacta (igualdad, no «termina en `pg_temp`»).

### D2 · `ALTER FUNCTION … SET search_path`, no `CREATE OR REPLACE`

`ALTER FUNCTION` cambia solo `proconfig`: el cuerpo, la firma, `SECURITY DEFINER`, la volatilidad,
el dueño y los `GRANT`/`REVOKE` quedan como están (R3), y los triggers que usan las funciones no se
tocan. No hay que copiar cuerpos (uno de ellos es generado por script) ni rehacer privilegios.

### D3 · Nombres sin esquema en la migración

`ALTER FUNCTION verificar_misma_empresa() …`, **sin** `public.`: igual que el resto de migraciones,
que crean las funciones sin esquema. Los tests que aplican migraciones en una base o un esquema
propio resuelven el nombre por su `search_path`; con `public.` la migración alteraría la función de
otro sitio.

### D4 · Dos redes: guardia estática y test sobre el catálogo

- **Guardia estática** (`tests/unit/guards/`, corre siempre en el gate rápido, sin base): reproduce
  en orden las migraciones y calcula el estado vigente de cada función. Detecta el caso más probable
  (una migración nueva o un `CREATE OR REPLACE` que olvida el `SET`, lo que **borra** el
  `search_path` anterior).
- **Test de catálogo** (`tests/integration/db/`, sobre la base desechable): la verdad de Postgres.
  Ve lo que el parser de la guardia no vea (sobrecargas, SQL dinámico, `DO $$ … $$`). Su nombre lleva
  `migration`, así que lo corre el disparador de `db/migrations/**` (`arnes.config.json >
  gate.disparadores`) en el gate rápido.

## Modelo de datos

Sin tablas, columnas, índices, enums ni políticas nuevas. Sin cambio en `db/schema.prisma` (Prisma
no ve funciones: no hay drift).

- **Multi-empresa / RLS:** sin cambio. `verificar_misma_empresa` es parte del aislamiento por
  empresa (SL-17 M3); su lógica no cambia (R3, R9).
- **Autorización:** sin cambio. No hay endpoint ni módulo.
- **País:** `geografia_del_pais_de_la_empresa` sigue leyendo `organizacion.pais_id` y la geografía
  de `public`. Ningún dato de país nuevo.

### Migración `db/migrations/20261120120000_security_definer_search_path/`

Timestamp: el siguiente libre tras `20261119120000_historial_accion_ordenes_retiradas_a_central`
(la última de `dev`). Si al rebasar aparece otra posterior, se renombra **antes** de mergear (nunca
después de aplicada).

`migration.sql`:

```sql
-- SLT-61: pg_temp al final del search_path de las dos SECURITY DEFINER que no lo tenían.
-- Solo cambia proconfig: cuerpo, firma, SECURITY DEFINER, volatilidad y privilegios quedan igual.
BEGIN;
ALTER FUNCTION verificar_misma_empresa() SET search_path = public, pg_temp;
ALTER FUNCTION geografia_del_pais_de_la_empresa() SET search_path = public, pg_temp;
COMMIT;
```

`down.sql`: lo mismo con `SET search_path = public` (el valor exacto de antes).

Idempotente en la práctica (reaplicar deja lo mismo). Si alguna de las dos no existiera, el
`ALTER` falla y la transacción entera se revierte: por eso T0 confirma que existen en producción.

### Generador `scripts/generar-misma-empresa.ts`

En el literal `FUNCIONES_SQL`, `SET search_path = public` pasa a `SET search_path = public, pg_temp`
(R8). Solo afecta al modo completo (sin `--faltantes`), que regenera la función. No se edita la
migración `20261022130300` (ya aplicada; `docs/checkpoints-proyecto.md`).

## Contratos de verificación

### Guardia `tests/unit/guards/security-definer-search-path.guardia.test.ts` (R6, R8)

- Lee `db/migrations/*/migration.sql` en orden de carpeta, sin comentarios (`quitarComentariosSql`).
- Por cada sentencia, en orden:
  - `CREATE [OR REPLACE] FUNCTION <nombre>(…) … AS $…$`: fija el estado de `<nombre>` con
    `definer` (lleva `SECURITY DEFINER` en la cabecera, antes del `AS`) y `searchPath` (el valor de
    `SET search_path = …` de la cabecera, o ninguno). Un `CREATE OR REPLACE` sin `SET` deja
    `searchPath` vacío, como hace Postgres.
  - `ALTER FUNCTION <nombre>(…) SET search_path = …`: actualiza `searchPath`.
  - `ALTER FUNCTION <nombre>(…) SECURITY DEFINER|INVOKER`: actualiza `definer`.
  - `DROP FUNCTION [IF EXISTS] <nombre>`: lo quita.
- Clave: el nombre sin esquema y sin comillas. Las sobrecargas no se distinguen (hoy no hay ninguna
  entre las `SECURITY DEFINER`); el test de catálogo cubre ese hueco.
- Falla si alguna función vigente con `definer` tiene `searchPath` distinto de `public, pg_temp`
  (comparación sin espacios de más ni mayúsculas), con un mensaje por función:
  `<función>: search_path <valor|ninguno>, vigente desde <carpeta de migración>`.
- Comprueba además que el literal de `scripts/generar-misma-empresa.ts` que define
  `verificar_misma_empresa` lleva `SET search_path = public, pg_temp` (R8).
- Autocomprobación (memoria del proyecto: una guardia que no ha visto un rojo no vale): casos
  sintéticos en el mismo archivo que la función de análisis debe rechazar — una `SECURITY DEFINER`
  con `public`, una sin `SET`, una correcta seguida de un `CREATE OR REPLACE` sin `SET` — y uno que
  debe aceptar (la mala corregida por un `ALTER FUNCTION … SET search_path = public, pg_temp`).
  También comprueba que el censo real vigente es ≥ 40 funciones: si el parser deja de reconocer
  las cabeceras, la guardia no queda verde en vacío.

### Test de catálogo `tests/integration/db/security-definer-search-path-migration.test.ts` (R1, R5, R7)

`describeSiHayBase` (`HAY_BASE_DE_DATOS`). Sobre la base desechable migrada:

1. **Catálogo (R1, R7).**
   ```sql
   SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS funcion,
          p.proconfig AS config
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                       WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
   ```
   Espera: toda fila con `config` que contiene `search_path=public, pg_temp`; el mensaje de fallo
   lista las que no. Y al menos las dos de SLT-61 presentes (sin filas no hay verde: memoria
   «Test de integración verde sin datos»). La consulta acota el esquema
   (`catalogo-postgres-acota-esquema.guardia`).
2. **Tabla temporal (R5).** Con una **conexión propia y nueva** (`conectar` del fixture, una sola
   conexión; así la función no tiene un plan cacheado de antes), en una transacción que se revierte:
   empresa en el país `XA` y un distrito de `XB` (fábricas de `geografia-dos-paises.test.ts`);
   `CREATE TEMP TABLE organizacion (id text, pais_id text)` vacía; `INSERT` en `zona_distrito` (o
   la tabla de negocio más simple que dispare el trigger) con el distrito de `XB`. Espera `SL021`.
3. **Control del caso 2.** Otra conexión nueva, otra transacción que se revierte: primero
   `ALTER FUNCTION geografia_del_pais_de_la_empresa() SET search_path = public` (el valor viejo),
   luego lo mismo que en 2. Espera que el `INSERT` **pase** (la tabla temporal vacía deja a la
   función sin país y devuelve `NEW`). Demuestra que el caso 2 detecta el ataque y no está verde
   por otra razón. El `ALTER` va dentro de la transacción revertida: no se ve desde otras sesiones.

### Test de ida y vuelta `tests/integration/db/migracion-search-path-ida-y-vuelta.test.ts` (R2, R3, R4)

Base propia (prefijo `slt61_`), como `migracion-sl20-ida-y-vuelta.test.ts`:

- `PREVIA` = la carpeta anterior a la de SLT-61 en `carpetasDeMigracion()` (calculada, no literal:
  sobrevive a migraciones que entren antes).
- Foto de **todas** las funciones de `public`, una línea por función:
  `nombre(args) | md5(prosrc) | prorettype | prolang | provolatile | prosecdef | proacl | proconfig`.
  `md5(prosrc)` y no `md5(pg_get_functiondef)`: este último incluye el `SET` y cambiaría siempre.
- `antes` = foto tras aplicar hasta `PREVIA`; `despues` = tras aplicar la de SLT-61.
- R2/R3: `diferencias(despues, antes)` son **exactamente** dos líneas cambiadas, las de
  `verificar_misma_empresa()` y `geografia_del_pais_de_la_empresa()`, y solo en `proconfig`
  (`search_path=public` → `search_path=public, pg_temp`). Ninguna otra función cambia en nada.
- R4: `down.sql` → foto igual a `antes`; reaplicar `migration.sql` → foto igual a `despues`.

### Test que enumera migraciones

`tests/integration/db/orden-traspaso-migration.test.ts` lista todas las carpetas de migración y
exige declarar cada una nueva (`:194-303`). Se añade la de SLT-61 con un comentario: no toca
`orden_traspaso_mensajero`.

## Integraciones externas

Ninguna. Sin dependencias nuevas.

## Producción (T0, antes del PR)

Solo lectura, la hace el leader (ningún agente escribe en producción; la URL sale de `.env.prod`
sin imprimirse; `SET default_transaction_read_only = on` tras conectar). Comprueba:

1. Las dos funciones existen en `public` con firma `()` y `proconfig = {search_path=public}`.
2. La consulta del catálogo (arriba) en producción: toda `SECURITY DEFINER` de `public` que no sea
   de extensión tiene `search_path=public, pg_temp`, salvo esas dos. Una función de más (creada a
   mano) o con otro valor **para** el PR: se decide con Carlos.
3. `md5(prosrc)` de las dos coincide con el de la base desechable (si no, prod tiene un cuerpo que
   el repo no conoce: se para). Informe con nombres, configuraciones y hashes; nada de datos.

## Alternativas descartadas

- **`CREATE OR REPLACE FUNCTION` copiando el cuerpo.** Reescribe la lógica para cambiar un atributo:
  si la copia diverge en un carácter, cambia el comportamiento (una de las dos es código generado),
  y el `down.sql` tendría que volver a copiar el cuerpo viejo. `ALTER FUNCTION` no lo toca.
- **`ALTER FUNCTION` sobre las 40.** Idempotente para 38, pero pone en el diff funciones de dinero
  sin necesidad y ensucia el `down.sql` (tendría que distinguir cuáles volver atrás).
- **`SET search_path = pg_catalog, public, pg_temp`.** Mismo efecto práctico (`pg_catalog` ya va
  primero implícitamente) y rompe la uniformidad con 38 funciones y dos tests existentes.
- **`SET search_path = ''` y calificar cada tabla con `public.`.** Lo más estricto, pero obliga a
  reescribir el cuerpo de las 40 (la mayoría de dinero) y los tests que aplican migraciones en
  esquemas propios dejarían de funcionar. Desproporcionado para un riesgo bajo.
- **Solo la guardia estática o solo el test de catálogo.** La estática no ve sobrecargas ni SQL
  dinámico; la de catálogo solo corre con base y la salta un worktree sin `DATABASE_URL`. Juntas
  cubren el caso común en el gate rápido y la verdad de Postgres en el disparador y el CI.
- **Una `EVENT TRIGGER` que rechace `CREATE FUNCTION … SECURITY DEFINER` sin `search_path`.**
  Requiere superusuario para crearse (no garantizado en el hosting de producción) y añade una pieza
  de infraestructura en la base para un control que el gate ya da.

## Dependencias de terceros

Ninguna nueva.
