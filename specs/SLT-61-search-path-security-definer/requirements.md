# SLT-61 «Endurecer search_path de las funciones SECURITY DEFINER» — requirements

Ruta: **completa** (migración que redefine atributos de funciones de la base; varias del mismo
grupo tocan dinero y aislamiento entre empresas).

## Origen

Hallazgo menor m3 de la review de SLT-43 «Geografía jerárquica: modelo y migración» (T8, vuelta 2),
citado en la ficha como `progress/review_SLT-43.md`. Ese archivo **no está en `dev`** ni en este
worktree (vive en la rama de SLT-43, sin mergear): este spec se apoya en la `description` de la
ficha y en el inventario real de `db/migrations/`.

Problema (de la ficha): si `pg_temp` no aparece en el `search_path` de una función, Postgres busca
**primero** en el esquema temporal de la sesión para tablas y vistas. Una sesión con SQL arbitrario
puede crear una tabla temporal con el nombre de una tabla real y una función `SECURITY DEFINER`, que
corre con los permisos de su dueño, la leería. No da privilegios nuevos, pero anula las
comprobaciones de la función. Riesgo actual bajo (la app consulta por Prisma); es defensa en
profundidad, como recomienda la documentación de Postgres para `SECURITY DEFINER`.

## Alcance

Inventario real (`design.md > Inventario`): en `dev` hay **40** funciones `SECURITY DEFINER`
vigentes en `public`. **38** ya fijan `SET search_path = public, pg_temp`. **2** fijan solo
`SET search_path = public`:

| Función | Última migración que la define | `search_path` hoy |
|---|---|---|
| `verificar_misma_empresa()` | `20261022130300_misma_empresa_en_fk` | `public` |
| `geografia_del_pais_de_la_empresa()` | `20261026130300_geografia_del_pais_de_la_empresa` | `public` |

Ninguna `SECURITY DEFINER` vigente carece de `search_path`. Ninguna de las dos afectadas mueve
dinero: una aísla empresas (SQLSTATE `SL017`) y la otra ata la geografía al país de la empresa
(`SL021`).

Entra:
- Una migración nueva que fija `search_path = public, pg_temp` en esas dos funciones **sin tocar su
  cuerpo**, con su `down.sql`.
- Una guardia estática sobre `db/migrations/` y un test sobre el catálogo de la base migrada que
  fallan si una `SECURITY DEFINER` queda sin ese `search_path`.
- La prueba de que ninguna función cambia de cuerpo, firma, volatilidad ni privilegios.
- Un test de comportamiento: una tabla temporal homónima no engaña a la función.
- El generador `scripts/generar-misma-empresa.ts` emite el valor nuevo.

## Lo que NO entra

- Las funciones de SLT-43 «Geografía jerárquica: modelo y migración»
  (`geo_sincronizar_provincia/canton/distrito`, `nodo_geografico_invariantes`): **no existen en
  `dev`**. Las cubre la guardia de este spec el día que se mergeen (ver Preguntas abiertas, P1).
- Funciones que no son `SECURITY DEFINER` (las `IMMUTABLE` de plan, los triggers de inmutabilidad):
  corren con los permisos de quien llama y no tienen este problema.
- Esquemas distintos de `public` y funciones que pertenecen a una extensión.
- Reescribir cuerpos para calificar cada tabla con su esquema (`search_path = ''`): descartado en
  `design.md > Alternativas`.
- `scripts/verificar-rls-despliegue.ts` (verificación post-deploy): no se amplía aquí.

## Requisitos (EARS)

- **R1.** El sistema DEBE tener, en la base migrada, cada función `SECURITY DEFINER` del esquema
  `public` que no pertenezca a una extensión con su configuración `search_path` igual a
  `public, pg_temp` (en `pg_proc.proconfig`: `search_path=public, pg_temp`).
- **R2.** CUANDO se aplica la migración de SLT-61, el sistema DEBE dejar `verificar_misma_empresa()`
  y `geografia_del_pais_de_la_empresa()` con `search_path` `public, pg_temp`, y la configuración de
  toda otra función de `public` DEBE quedar como estaba.
- **R3.** CUANDO se aplica la migración de SLT-61, el sistema NO DEBE cambiar, en ninguna función de
  `public`, el cuerpo (`prosrc`), la firma (argumentos y tipo de retorno), el lenguaje, la
  volatilidad, la marca `SECURITY DEFINER` ni los privilegios (`proacl`).
- **R4.** CUANDO se aplica el `down.sql` de la migración de SLT-61, el sistema DEBE dejar el catálogo
  de funciones de `public` idéntico al de antes de la migración (las dos funciones vuelven a
  `search_path` `public`); y CUANDO se reaplica la migración, idéntico al de después.
- **R5.** SI la sesión que escribe tiene una tabla temporal llamada `organizacion` que no contiene la
  empresa de la fila, ENTONCES `geografia_del_pais_de_la_empresa()` DEBE seguir leyendo la tabla de
  `public` y rechazar con `SL021` un distrito de otro país.
- **R6.** SI una migración de `db/migrations/` deja vigente (por `CREATE FUNCTION`,
  `CREATE OR REPLACE FUNCTION` o `ALTER FUNCTION`) una función `SECURITY DEFINER` cuyo
  `search_path` no es `public, pg_temp` o que no lo fija, ENTONCES la guardia estática DEBE fallar
  nombrando la función y la migración que la deja así.
- **R7.** SI en la base migrada existe una función que incumple R1, ENTONCES el test del catálogo
  DEBE fallar listando cada función que incumple con su configuración actual.
- **R8.** El generador `scripts/generar-misma-empresa.ts` DEBE emitir la definición de
  `verificar_misma_empresa` con `SET search_path = public, pg_temp`.
- **R9.** CUANDO se aplica la migración de SLT-61, el sistema DEBE seguir rechazando con `SL017` una
  referencia a una fila de otra empresa y con `SL021` una geografía de otro país (comportamiento
  previo intacto).

## Trazabilidad prevista (la confirma el implementer en `progress/impl_SLT-61.md`)

| Requisito | Test |
|---|---|
| R1, R7 | `tests/integration/db/security-definer-search-path-migration.test.ts` (catálogo) |
| R2, R3, R4 | `tests/integration/db/migracion-search-path-ida-y-vuelta.test.ts` |
| R5 | `tests/integration/db/security-definer-search-path-migration.test.ts` (tabla temporal) |
| R6, R8 | `tests/unit/guards/security-definer-search-path.guardia.test.ts` |
| R9 | los existentes: `tests/integration/db/geografia-dos-paises.test.ts`, `tests/integration/db/geografia-por-pais.test.ts` (`SL021`) y `tests/integration/db/aislamiento-fk-misma-empresa.test.ts` (`SL017`), que ya existen y deben seguir verdes con la migración aplicada |

## Preguntas abiertas

- **P1 (para Carlos; afecta a SLT-43 «Geografía jerárquica: modelo y migración», de Camilo).** La
  ficha dice «Depende de: SLT-43 mergeado», pero su `depends_on` está vacío y SLT-43 sigue
  `in_progress`. Propuesta: **no esperar**. SLT-61 endurece lo que hay en `dev` y deja la guardia
  (R6) y el test de catálogo (R7). Quien mergee segundo se adapta:
  - si SLT-61 entra antes, la guardia pondrá en rojo SLT-43 mientras sus funciones fijen
    `search_path = public`: Camilo las escribe con `public, pg_temp` (una palabra por función);
  - si SLT-43 entra antes, SLT-61 añade sus funciones al `ALTER FUNCTION` de su migración al
    rebasar (la guardia lo exige).
  ¿Se avisa a Camilo ahora, o se prefiere esperar a SLT-43 como dice la ficha?
- **P2 (resuelta en el spec, solo para que conste).** Valor elegido: `public, pg_temp`, no
  `pg_catalog, public, pg_temp`: `pg_catalog` se busca primero de forma implícita si no se lista, y
  las 38 funciones vigentes y sus tests ya usan `public, pg_temp`. Ver `design.md > Alternativas`.
