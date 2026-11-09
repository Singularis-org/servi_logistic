# impl SLT-46 — geo-jerarquica-admin

> Bitácora del implementer. Base de pruebas: `logistic_slt46` en localhost (desechable, creada para esta
> feature, todas las migraciones aplicadas; sin siembra de catálogos ni usuarios). Memoria baja:
> `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=8192`.

## Tanda 1 (2026-11-06): T0.1, T1, T2

Sha de partida: `44d5d02e` (docs(SLT-46): F2.0, aprobado y choque con SLT-77 aceptado).
T0.2 (maqueta) y T6 (UI) fuera de esta tanda: T0.2 la hace una persona. Sin push (lo hace el leader).

### T0.1 — la rama arranca en verde

- `pnpm exec vitest run tests/integration/db/geo-sincronia-geografia.test.ts tests/integration/db/carga-division.test.ts --maxWorkers=1`
  (con base, en `44d5d02e`) → `Test Files 2 passed (2) · Tests 24 passed (24)`.
- `./init.sh` (rápido) en `44d5d02e`, con la base exportada: typecheck, lint y perfil verdes; el paso
  `test:rapido` seleccionó 1364 archivos (el diff contra `origin/dev` es toda la pila 43/44/45/65/71) y
  tardó ~3,5 h compitiendo con dos subagentes en la misma máquina y base → `9 failed | 18635 passed`,
  12 archivos «nuevos fuera del baseline». Casi todos son timeouts de 20 s por saturación. Re-corridos
  uno a uno en el HEAD de la tanda (`29ecb5a3`), con la base y sin carga:
  `Test Files 1 failed | 11 passed (12) · Tests 95 passed | 12 skipped (107)`. El único rojo,
  `tests/integration/db/demo-qa.test.ts`, es de entorno: «faltan catálogos en la base (corre
  `pnpm run db:seed`): vehiculo» (la base local es nueva y sin siembra). No se sembró. No es de SLT-46.
  Conclusión: el T0.1 no fue un `init.sh` verde limpio; queda pendiente que el leader corra el gate
  (o el CI) sobre la rama.

### Commits

| sha | task |
|---|---|
| `60e6869e` | feat(SLT-46): T2.1 enums de historial de tipos de nivel |
| `880732ee` | feat(SLT-46): T1.1 validarCodigoDeTipo, la regla de codigo leida del tipo (R17) |
| `56a1f13e` | feat(SLT-46): T1.2 esquemas por nodo, alta de pais con 2-10 tipos, renombrar tipo y agregar nivel (R22, R24, R49) |
| `19535ee6` | feat(SLT-46): T1.3 planificarDivision a P profundidades con cabeceras nivel_k (R30, R32, R34) |
| `65d165f8` | feat(SLT-46): T1.4 nivel 3 vacio repite la etiqueta del nivel 2 (R51, P10) |
| `e235d2f6` | feat(SLT-46): T2.2 copia del nodo a la geografia vieja |
| `31d3a041` | test(SLT-46): T2.3 reglas de migracion aditiva compartidas y guardia de SLT-46 |
| `02b73e3b` | feat(SLT-46): T2.5 pais_tipos_de_nivel sin nivel_3 para paises de 2 niveles |
| `135eb78b` | test(SLT-46): T2.4 ida y vuelta de las tres migraciones de SLT-46 |
| `f2025d90` | docs(SLT-46): T1.1-T1.4 hechas |
| `29ecb5a3` | test(SLT-46): acotar el esquema en las consultas a catalogos de T2 (guardia 421) |

### Archivos

- T1.1: `lib/utils/codigo-geografico.ts` (`ReglaDeCodigoDeTipo`, `validarCodigoDeTipo`, `tipoDeNivelDePais`;
  `validarCodigo` pasa a envolver la nueva), `tests/unit/utils/codigo-geografico.test.ts` (solo bloques nuevos).
- T1.2: `lib/types/geografia-nodo.ts`, `lib/types/pais.ts`, `tests/unit/types/geografia-nodo.test.ts`
  (solo bloques nuevos), `tests/unit/types/pais-schemas.test.ts` (nuevo).
- T1.3: `lib/types/division-csv.ts`, `lib/utils/division-csv.ts`, `tests/unit/utils/division-csv.test.ts`
  (solo bloques nuevos).
- T1.4: `lib/types/pais.ts`, `tests/unit/types/pais-etiquetas.test.ts` (nuevo).
- T2.1: `db/migrations/20261106120000_slt46_historial_tipos_de_nivel/{migration,down}.sql`, `db/schema.prisma`.
- T2.2: `db/migrations/20261106120100_slt46_nodo_copia_a_geografia_vieja/{migration,down}.sql`,
  `lib/db/sqlstate.ts` (`SQLSTATE_NODO_CAMBIA_DE_TABLA_VIEJA = "SLT46"`),
  `tests/integration/db/slt46-nodo-copia-vieja.test.ts`.
- T2.3: `tests/unit/db/_migraciones-aditivas.ts` (nuevo), `tests/unit/db/slt43-migraciones-aditivas.test.ts`
  (solo importa el helper; aserciones intactas), `tests/unit/db/slt46-migraciones-aditivas.test.ts`.
- T2.5: `db/migrations/20261106120200_slt46_pais_tipos_de_nivel_opcional/{migration,down}.sql`,
  `tests/integration/db/slt46-pais-tipos-de-nivel.test.ts`.
- T2.4: `tests/integration/db/migracion-slt46-ida-y-vuelta.test.ts`.

Ninguna aserción de tests existentes cambió. Ningún llamador (service, repositorio, action, pantalla) cambió.

### Mapa R → test (tanda 1)

| R | Test (archivo › it) |
|---|---|
| R2 | `tests/integration/db/slt46-nodo-copia-vieja.test.ts` › «R2: el alta de un nodo de profundidad 1, 2 y 3 deja su provincia, cantón y distrito…», «R2: renombre, código, retiro y reactivación…», «R2: dar de alta un hijo bajo un padre retirado…» |
| R3 | idem › «R3: un nodo de profundidad 4 no crea ni cambia ninguna fila de provincia, cantón ni distrito» |
| R4 | idem › «R4: escribir el nodo termina sin bucle (pg_trigger_depth ≤ 3)…; y lo mismo desde la provincia por SQL» |
| R5 (base) | idem › «R5: si la copia choca con un único de la tabla vieja, falla la sentencia entera con 23505…» (la parte `P2002 → conflict` es de T4.4) |
| R6 | idem › «R6: cambiar la profundidad de una hoja de 1–3, o llevar una de 4 a 3, se rechaza con SLT46…» |
| R7 | idem › «R7: borrar físicamente un nodo de profundidad 3 (y luego su cantón y su provincia)…» |
| R8 | `tests/unit/db/slt46-migraciones-aditivas.test.ts` › carpetas exactas con `down.sql`, «verde sobre los migration.sql reales», controles y contraprueba (rojo con DML suelto también en `DO`, `EXECUTE 'DROP …'`, `TRUNCATE`/`RENAME` en cuerpo, `CREATE OR REPLACE FUNCTION geo_sincronizar_canton`); `migracion-slt46-ida-y-vuelta.test.ts` › «R8/R9: la ida pone la copia y la función nueva sin mover ningún dato» |
| R9 | `tests/integration/db/migracion-slt46-ida-y-vuelta.test.ts` › «R9: los tres down.sql, en orden inverso…», «R9: tras la vuelta la sincronía vieja → nodo sigue…», «R9: reaplicadas las tres, todo queda igual que la primera vez» |
| R10 | `slt46-migraciones-aditivas.test.ts` › «ninguna de las migraciones de SLT-46 nombra la tabla orden fuera de los comentarios» + contraprueba |
| R17 | `tests/unit/utils/codigo-geografico.test.ts` › «SLT-46 R17 — validarCodigoDeTipo da lo mismo que la regla de SL-20 (tabla de CR)» (24 casos), «SLT-46 R17 — tipo de cualquier profundidad» |
| R22 | `tests/unit/types/geografia-nodo.test.ts` › «el renombre acepta `{id, nombre}` y rechaza un `padreId`», «el cambio de estado acepta `{id, activo}` y rechaza un `padreId`» |
| R24 | `tests/unit/types/pais-schemas.test.ts` › «acepta 2 y 10 tipos, y conserva su orden», «rechaza 1 y 11 tipos», «rechaza un nombre de tipo fuera de 2–40…», «los demás rechazos siguen como en SL-20» |
| R25/R26 (borde) | `pais-schemas.test.ts` › «rechaza nombres fuera de 2–40, un tipo vacío y claves desconocidas» |
| R30 | `tests/unit/utils/division-csv.test.ts` › «exige nivel_<k> y codigo_nivel_<k> de 1 a P…», «SLT-46 R30 — P = 2 …», «SLT-46 R30/R17 — P = 4 …» |
| R31 (parte pura) | `division-csv.test.ts` › «SLT-46 R31 — los casos de SL-20 con P = 3 dan lo mismo por profundidad» (17 casos) |
| R32 | `division-csv.test.ts` › «nivel_3 vacio con nivel_4 lleno: error en nivel_3 con su linea», «un codigo mas abajo tambien es seguir la fila», «nivel_1 o nivel_2 vacios siguen con el mensaje de SL-20…» |
| R34 | `division-csv.test.ts` › «cada columna de mas es un aviso…», «en un pais de 3 niveles una columna nivel_4 es un aviso…», «las cotas del archivo no cambian (5 MB, 10 000 filas, 200 errores)» |
| R44 | `slt46-nodo-copia-vieja.test.ts` › «R44: el trigger de orden y los de las zonas siguen con el cuerpo de SLT-43…» + `orden-nodo-escritura.test.ts` (existente) verde |
| R46 | `tests/integration/db/slt46-pais-tipos-de-nivel.test.ts` › «R46: un país con '' en el nivel 3 queda con 2 tipos tras el INSERT…» + «R46 contraprueba: con la función de SLT-43…» |
| R47 | idem › «R47: Costa Rica y un país de 3 tipos quedan con los mismos tipos que con la función de SLT-43…» |
| R49 | `pais-schemas.test.ts` › «rechaza nombres fuera de 2–40 caracteres», «no admite posición: siempre va al final…» |
| R50 (función) | `slt46-pais-tipos-de-nivel.test.ts` › «R50: poner '' en el nivel 3 de un país que ya tiene nivel_3 no lo borra ni lo cambia» |
| R51 | `tests/unit/types/pais-etiquetas.test.ts` › «con el nivel 3 vacío devuelve la etiqueta del nivel 2…», «nunca devuelve un texto vacío…», «con nombre en el nivel 3 devuelve ese nombre» |

Pendientes de tandas siguientes: R1, R11–R16, R18–R21, R23, R25–R29, R33, R35–R43, R45, R48, R52 y el
resto de R5/R31/R50.

### Salida real de la verificación

- Por task (subagentes): `slt46-nodo-copia-vieja` 9/9; `slt43`+`slt46-migraciones-aditivas` 21/21 (T2.3),
  26 con `slt46-pais-tipos-de-nivel` (T2.5); `slt46-pais-tipos-de-nivel` 4/4; `migracion-slt46-ida-y-vuelta`
  5/5 (no queda ninguna base `slt46_*`). Contrapruebas en rojo comprobadas: sin el trigger de T2.2, 7/9 rojos;
  sin T2.5, R46 y R50 rojos; un espacio en el `down.sql` de T2.5 pone rojo el caso de vuelta.
- `vitest related --run` sobre los 10 archivos de T1 → `Test Files 243 passed | 19 skipped (262) · Tests 3923 passed | 206 skipped (4129)`.
- `prisma migrate diff` (base ↔ schema) vacío tras T2.1 y con las tres aplicadas.
- Suites existentes tras T2.2 y T2.5 (`geo-sincronia-geografia`, `carga-division`, `geo-nodo-rls`,
  `orden-nodo-escritura`, `geo-nodo-invariantes`, `geo-tipo-nivel`, `api/v2-paises-de-prueba.route`,
  `geografia-*`, `pais-*`): sin rojos nuevos. De entorno (base local sin siembra):
  `geografia-historico-intacto` y `geografia-ordenes-sin-entregar` (no hay `orden`);
  `geografia-cascada-reversible`, `geografia-registro-accion` y `geografia-renombrado` necesitan un
  `usuario` (con un superadmin temporal pasaron; se retiró porque `carga-division` y
  `geografia-superadmin-sin-empresa` exigen base sin superadmin, y esas dan 20/20).
- Cierre de tanda, en `29ecb5a3`, por el implementer:
  - `pnpm exec tsc --noEmit` → exit 0.
  - `pnpm exec eslint <los .ts/.tsx tocados desde 44d5d02e>` → exit 0.
  - Guardias, todas (336 archivos `*guard*` en 7 lotes de ≤ 50): un único rojo,
    `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (4 casos), que está en
    `tests/baseline-rojos.json`. En la primera pasada salió además rojo
    `catalogo-postgres-acota-esquema.guardia.test.ts` (ficha 421) por tres consultas a `pg_trigger`/`pg_proc`
    sin esquema en los tests de T2; arreglado en `29ecb5a3` → 7/7, y los dos tests de integración
    re-corridos 14/14.

### Decisiones de implementación a revisar (reviewer)

1. Esquemas nuevos en paralelo, sin cambiar los viejos en sitio (`altaDeNodoSchema`, `renombrarNodoSchema`,
   `cambiarActivacionNodoSchema`, `nodoPorIdSchema`, `crearPaisConTiposSchema`), para no romper llamadores
   antes de T4/T6. T4 pasa los consumidores y retira los viejos o les da el nombre de §4.1.
2. `TipoNivelDTO` lleva `digitosCodigo` y `codigoHeredaPrefijo`, que §4.6 no lista: sin ellos
   `validarCodigoDeTipo` no puede usarse con lo que devuelven `contextoDeAlta`/`leerDivisionDePais` (§4.3/§4.4).
3. `planificarDivision` con dos firmas: la nueva `(filas, nodos planos con profundidad, tipos)` y la de
   SL-20, que traduce a P = 3 y devuelve el plan idéntico. Claves de alta nuevas `nivel_<k>-<n>`.
   Con una regla de dígitos del país a medias, la firma vieja ahora lanza al empezar (antes al validar un
   código); el CHECK de la base impide ese estado.
4. Mensaje nuevo de hueco (R32): «nivel_k: está vacío pero la fila sigue en <columna>; no se puede saltar
   un nivel.» (desde la profundidad 3; nivel_1/2 conservan «es obligatorio.»).
5. R5 probado sin base propia: un nodo de profundidad 1 con otro tipo pasa el único del nodo y choca con el
   de `provincia` → 23505 (§11 proponía apagar la sincronía en base propia).
6. R4 medido con un trigger temporal dentro de la transacción revertida: profundidad máxima 2.
7. `down.sql` de T2.1 es `SELECT 1` con su motivo (un `ADD VALUE` de enum no se quita, §3).
8. Con la copia puesta, los fixtures que insertan nodos de profundidad 1–3 por SQL (`geo-43`,
   `paises-de-prueba-geo`) también crean su fila vieja; las suites existentes siguen verdes.

### Bloqueos / avisos

- Ninguno de código. `tests/unit/services/carga-division-service.test.ts` › «CONTRAPRUEBA: exactamente 5 MB
  no se rechaza por tamaño» dio un timeout de 20 s bajo carga; falla igual con los archivos de HEAD
  restaurados y pasó en la corrida de `related`. Flake de saturación, no de SLT-46.
- La guardia `nodo-geografico-sin-escritor` sigue verde (aún no hay escritor del nodo en `lib/`); T3 la
  pondrá roja y T7.1 la retira.

## T3.2 (2026-11-06): PaisRepository con tipos de nivel

Archivos: `lib/repositories/PaisRepository.ts`, `lib/interfaces/repositories/IPaisRepository.ts`,
`lib/types/pais.ts` (`DatosDeAltaDePaisConTipos`), tests nuevos `tests/integration/db/pais-alta-tipos.test.ts`,
`pais-tipos-edicion.test.ts`, `pais-agregar-nivel.test.ts`; en `tests/unit/services/pais-service.test.ts` y
`tests/unit/actions/geografia-plataforma-action.test.ts` solo los tres métodos nuevos en los dobles (sin
tocar aserciones).

| R | Test (archivo › it) |
|---|---|
| R23 | `pais-alta-tipos` › «R23: con 2, 3 y 4 tipos crea exactamente P tipos en orden, y pais.nivel_N_* = …», «R23/R37: si el historial falla no queda ni el país ni sus tipos…», «R23: un código que ya está es `duplicado`…» |
| R24 (defensa del repo) | `pais-alta-tipos` › «R24 (defensa): 1 u 11 tipos no llegan a la base; 2 y 10 sí» |
| R25 | `pais-tipos-edicion` › «R25: renombrar el tipo 2 cambia el tipo y pais.nivel_2_*…», «R25: renombrar el tipo 4 cambia solo el tipo…», «R25/R37: si el historial falla…» |
| R26 | `pais-tipos-edicion` › «R26: los mismos nombres son `sin_cambio`… CONTRAPRUEBA…», «R26: un tipo que no existe es `no_existe`…» |
| R27 (datos) | `pais-tipos-edicion` › «R27: en el contexto de la empresa, deLaEmpresa devuelve el nombre nuevo del tipo 1…» |
| R37 | `pais-alta-tipos` › «R37: pais_creado y una tipo_nivel_geografico_creado por tipo…»; `pais-tipos-edicion` › «R37: cambiar los dos nombres deja dos filas…»; `pais-agregar-nivel` › «R48/R37: 2 → 3…» |
| R46 | `pais-alta-tipos` › «R46: un país de 2 tipos sigue sin nivel_3 tras el alta, tras renombrar el tipo 1 y el 2 y tras un UPDATE pais SET nombre» (con contraprueba) |
| R48 | `pais-agregar-nivel` › «R48/R37: 2 → 3 crea nivel_3, lo copia a pais.nivel_3_*…», «R48: 4 → 5 crea solo el tipo; … nodos intactos», «R48/R37: si el historial falla…» |
| R49 | `pais-agregar-nivel` › «R49: con 10 tipos es `tope`… CONTRAPRUEBA…», «R49: sin país es `no_existe`…», «R49: dos altas de nivel en paralelo… P2002», «R49 CONTRAPRUEBA de la carrera…» |
| R50 | sin método que borre tipos; `geografia-sin-borrado-fisico` y `nodo-geografico-escritor-unico` verdes |

Verificación (base `logistic_slt46`, `--maxWorkers=1`): los 3 nuevos + `pais-repositorio`, `pais-disponible`,
`pais-service`, `geografia-plataforma-action` y las guardias `nodo-geografico-escritor-unico`,
`geografia-sin-borrado-fisico`, `historial-accion-escrituras-cubiertas`, `catalogo-postgres-acota-esquema` →
`Test Files 11 passed (11) · Tests 289 passed` (ninguno saltado). `tsc --noEmit` exit 0; eslint de los 8
archivos exit 0. Contrapruebas por mutación (restaurado después): sin la copia a `pais` en `renombrarTipo` →
2 rojos (R25 tipo 2, R27); sin la copia en `agregarNivel` → 1 rojo (2 → 3); con el nivel 2 repetido en vez
de `''` → 6 rojos (R23, R46, R48, R49).

Decisiones a revisar:
1. El alta con tipos es un método nuevo, `crearConTipos`, y `crear` (seis nombres) queda igual: cambiarlo
   rompería `pais-repositorio.test.ts`, que afirma `historial = [pais_creado]` y 1 fila; con R37 el alta deja
   P + 1 filas. **Aviso para T4.3**: al pasar `PaisService.crear` a tipos, ese test (R23/R33 de SL-20)
   cambia de resultado por R37; hace falta decidir cómo se adapta antes de retirar `crear`.
2. `agregarNivel` relee el tipo tras el `pais.update` (P+1 = 3) porque el upsert del trigger aplica la regla
   de código de `pais` a ese nivel; devuelve lo que quedó escrito.
3. `crearConTipos` lanza (no escribe) con < 2 o > 10 tipos: defensa, el service ya lo valida.
4. Etiqueta del historial de un tipo = su singular (nuevo, en el renombre), como §7.
5. La carrera de R49 commitea el país `XV` (sin usuario: actor sistema), bajo `bajoLockDeEscrituraReal`, y lo
   borra en `finally` (también al empezar); el `afterAll` exige 0 residuos. Para que las dos lean P = 2
   antes de escribir, una tercera transacción hace `FOR UPDATE` del país hasta ver las dos esperando.

## Tanda 2 (2026-11-06 → 2026-11-09): T3, T4, T7

El implementer de la tanda se colgó tras commitear (`22f314b2`…`56939f04`, ya subidos) sin marcar
`tasks.md` ni escribir esta sección. La cierra un implementer de verificación (2026-11-09) que **no
implementa nada nuevo**: comprueba el «Hecho» de cada tarea, audita los cambios de aserción de los tests
existentes, corre la verificación y escribe esto. T5, T6 y T8 siguen pendientes.

### Commits

| sha | commit |
|---|---|
| `22f314b2` | feat: T3.1 GeoRepository sobre nodo_geografico a cualquier profundidad |
| `5193ae2c` | test: T7.1 escritor único del nodo y de los tipos (R43) |
| `619d1652` | test: T7.2 geografía vieja sin escritor (R1) y renombre punto único al nodo |
| `4d302269` | test: T7.3 sin borrado físico de nodos ni tipos, también por SQL |
| `2ed8028b` | test: T3.1 recupera en el nodo lo que SL-20 afirmaba de las escrituras |
| `b87733e9` | feat: T3.2 PaisRepository con tipos de nivel, renombrar tipo y agregar nivel |
| `54bccc13` | docs: architecture cita las guardias de escritor único y geografía vieja |
| `7303f7f6` | feat: T4.1 GeografiaService por nodo a N niveles (R14–R20, R39) |
| `74417592` | feat: T4.2 CargaDivisionService a P niveles (R30–R34, R39) |
| `b78c8645` | refactor: retirar de GeoRepository las formas por nivel de SL-20 |
| `72e635e5` | test: forma de entrada por nodo en carga-division, geografia-registro-accion y geografia-renombrado |
| `0b1f5b77` | feat: T4.3 PaisService con tipos, renombrar tipo y agregar nivel |
| `13345c30` | test: T7.1 control positivo de tipoNivelGeografico en escritor único |
| `53c1d455` | feat: T4.4 actions por nodo, renombrar tipo y agregar nivel; un esquema por operación |
| `56939f04` | test: guardias de superficie y test citado tras T4.4 y T7.1 |

### Estado de cada tarea (comprobado contra su «Hecho»)

- **T3.1** hecha. `IGeoRepository`/`GeoRepository` tienen exactamente los métodos de §4.4 por nodo; no
  queda ningún método por nivel (`crear(nivel,…)`, `findHermanos`, `findHermanosDeNodo`,
  `listArbolDePais`, `leerNodoParaActivacion` retirados en `b78c8645`); `GeoPrismaClient` sin
  `provincia`/`canton`/`distrito`; historial con entidad `nodo_geografico`.
- **T3.2** hecha (sección «T3.2» de arriba). Queda `PaisRepository.crear` (seis nombres) junto a
  `crearConTipos`: ver «Desviaciones» 3.
- **T4.1–T4.4** hechas. Un solo esquema por operación, con los nombres de §4.1 (`crearNodoGeograficoSchema`,
  `renombrarNodoGeograficoSchema`, `cambiarActivacionGeograficaSchema`, `nodoGeograficoSchema`,
  `crearPaisSchema`, `renombrarTipoNivelSchema`, `agregarNivelPaisSchema`); los paralelos de la tanda 1
  (`altaDeNodoSchema`, `renombrarNodoSchema`, `cambiarActivacionNodoSchema`, `nodoPorIdSchema`,
  `crearPaisConTiposSchema`) ya no existen en `lib/`, `app/` ni `tests/`.
- **T7.1–T7.3** hechas: `nodo-geografico-sin-escritor` retirada; `nodo-geografico-escritor-unico` y
  `geografia-vieja-sin-escritor` nuevas, `geografia-renombrado-punto-unico` y
  `geografia-sin-borrado-fisico` ampliadas; todas con contraprueba (archivo inventado en rojo).

(La verificación de esta sección se completa en «Salida real» abajo.)

### Cierre de T4.4 (2026-11-09)

`15a8f761` test(SLT-46): T4.4 el log de fallo de la action nombra el id, no el nivel (§4.1). Cuatro
aserciones de `geografia-plataforma-action.test.ts` seguían afirmando `nivel=distrito`/`nivel=canton` en
la línea de log de un fallo; desde `53c1d455` la entrada no trae nivel (§4.1) y la action escribe
`padre=c1` / `nodo=d1` / `nodo=c1`. Se cambió solo ese `toContain` (siguen `toContain(operación)` y
`not.toContain("Juan")`, que es lo que exige §4.2: «log sin datos»). Antes: 4 rojos; después 99/99.

### Cambios de aserción en tests existentes (auditoría `b0b7ff43..HEAD`)

«Forma» = solo cambia la entrada (`{id}`, `{paisId}|{padreId}`) o el doble por nodo, con los mismos
valores esperados (T5.5, design §4.1). Los tests nuevos de la tanda no van aquí.

| Archivo | Qué aserciones cambiaron | Respaldo |
|---|---|---|
| `integration/db/geografia-alta` | Forma (`altaPorNivel`, `{paisId}`/`{padreId}`); todos los `expect` iguales | §4.1, T5.5 |
| `integration/db/geografia-cascada-reversible` | Forma (`cambiarActivacion(id,…)`). «id inexistente en los tres niveles» queda como 3 pasadas idénticas (valor esperado igual; cobertura por nivel perdida) | §4.1, T3.1 (débil) |
| `integration/db/geografia-registro-accion` | Forma; sin aserción nueva de entidad `nodo_geografico` (es T5.4) | §4.1, T5.5 |
| `integration/db/geografia-renombrado` | Forma (`hermanosDeNodo(id)`). El `it` «`null` en los TRES niveles» queda con 3 `expect` idénticos | T3.1, §4.4 (débil) |
| `integration/db/geo-sincronia-geografia` | `creados: {provincia:1, canton:2, distrito:1}` → `{1:1, 2:2, 3:1}` (mismas cifras); filas del CSV y `division.{nodos,tipos}` (forma) | R33, §4.4, §5 |
| `integration/db/geografia-superadmin-sin-empresa` | `arbol.provincias[0].cantones[0]` → `arbol.raices[0].hijos[0]` (lo afirmado, igual); conteo a `{id}`. **El resto del bloque sigue con la forma vieja** (`crearPaisAction` de seis campos, `{nivel, cantonId}`, `{nivel, id}`) y los `expect` de `creados`/`renombrado` siguen con `provincia`/`nivel`: queda rojo hasta T5.4 | §4.3 (lo cambiado); lo no cambiado es T5.4 |
| `integration/db/carga-division` | Forma (filas `niveles`, `nodos/tipos`). **El `it` de `listArbolDePais` llama al método retirado con un cast y queda rojo a propósito** («hasta que T5.3 la decida»). El caso P6 «dos homónimos normalizados» sigue sin retirar | **SIN RESPALDO** el cast (ninguna tarea admite dejar un test en rojo); P6 es T5.3, pendiente |
| `integration/db/geo-lecturas-catalogo` | Mismo valor esperado, pero ya no compara `GeoRepository.listArbolDePais` con «hoy»: compara `arbolDeTresNiveles(arbolDePais(p).raices)`, una proyección de `app/(app)/plataforma/geografia/_components/` | **SIN RESPALDO** (ni design ni tasks nombran ese sustituto para la equivalencia de SLT-44 R17) |
| `unit/repositories/geo-repository.escrituras` | Reescrito (22 → 28 `it`). `entidadTipo` provincia/canton/distrito → `nodo_geografico`; casos por nivel retirados con equivalente por nodo; orden del log con 1–3 `findUnique` de la cadena; `throw` interno `/falta el padre/` → `/raiz/`; `creados` por profundidad; «no borra» → «el delegado no declara `delete`»; retirado sin equivalente «un id de otra profundidad que la del nivel es `no_existe`» (no hay nivel en la entrada) | P5/R35, §4.4, §7, R33/R36, R42, §4.1; T3.1 «adaptado» |
| `unit/services/geografia-service` | Los `ok` de `crear`/`renombrar`/`cambiarActivacion` pierden `nivel`; `listarArbolDePais` → `{ok, tipos, raices}`; argumentos al repo por nodo. Ningún mensaje ni status de CR cambia | §4.3, §4.4; el `ok` sin `nivel`, **respaldo débil** (§4.1 solo quita `nivel` de la entrada; la UI no lee `res.nivel`) |
| `unit/services/carga-division-service` | Rechazo por cabecera: antes «`leerDivisionDePais` no se llama», ahora `toHaveBeenCalledTimes(1)` (status y motivo iguales); `altas`/`creados` por profundidad | §4.3 (columnas según P tras leer la división), R30, R33, §5 |
| `unit/services/nombres-que-imprime-la-etiqueta` | Forma | §4.1 |
| `unit/services/pais-service` | `fieldErrors` `nivel1Plural`… → `tipos`; `repo.crear` → `repo.crearConTipos`; ningún `it` retirado | R23, R24, §4.1, T4.3 |
| `unit/actions/geografia-plataforma-action` | Entradas por nodo («cantón sin padre» → «hijo con `provinciaId`», sigue `validation_error`); `crearConTipos`; `{tipos}`; log de fallo `nivel=…` → id (`15a8f761`) | §4.1, §4.2, R22, R23, T4.3, T4.4 |
| `unit/actions/geografia-plataforma.composition-root` | Árbol vacío `{ok, provincias: []}` → `{ok, tipos: [], raices: []}` | §4.3, R21 |
| `unit/components/geografia-plataforma-page` | Ninguna; solo dobles (`raices`, `creados` por profundidad) | §4.3, §5 |
| `unit/types/geografia-nodo` | Retirados «un nivel desconocido no entra» (cubierto por «rechaza … un `nivel`») y «`padreDeAlta` …» (helper retirado con la unión por nivel); «canton exige provinciaId / distrito exige cantonId» → «el hijo exige su padreId»; esquemas paralelos renombrados a §4.1 | §4.1, R22, T4.4 |
| `unit/types/pais-schemas` | Ninguna; `crearPaisConTiposSchema` → `crearPaisSchema` | §4.1 |
| guardia `geografia-renombrado-punto-unico` | Detector de las tres tablas viejas → `nodoGeografico` (`update`/`updateMany`/`upsert`); retirados el caso de los tres niveles y el negativo `zonaDistrito` (lo cubre `geografia-vieja-sin-escritor`); `codigoDta` → `(codigoDta\|codigoOficial)` | R43, §9, T7.2 |
| guardia `geografia-sin-borrado-fisico` | Ninguna retirada; detector ampliado a `nodoGeografico`, `tipoNivelGeografico`, `?.` y `DELETE FROM` | R42, R50, T7.3 |
| guardia `nodo-geografico-sin-escritor` | Retirada entera (SLT-43 R37) | T7.1 |

### Costa Rica igual (R11, R12): `44d5d02e`/`b0b7ff43` → HEAD

Mensajes, status y desenlaces **iguales para CR** en alta (nombre, `paisId`, código por
`validarCodigoDeTipo` con los mismos literales, homónimo → `conflict`, padre inexistente → `not_found`),
renombre, retiro, reactivación, conteo y CSV (`.csv`, 5 MB, UTF-8, tope de filas, «Faltan columnas
obligatorias: …», mensajes por fila con `nivel_k`/`codigo_nivel_k`, aviso de columna ignorada). Nuevos con
respaldo: R15 («Este país no tiene un nivel por debajo de X» / «Este país no tiene ningún nivel.»), R32
(hueco), R49 («Este país ya tiene 10 niveles»). Diferencias, todas con entradas que la pantalla de hoy no
manda o en casos extremos:

1. Clave del padre en `fieldErrors`: `provinciaId`/`cantonId` → `padreId` (consecuencia de la entrada de
   §4.1; design no lo dice explícitamente).
2. Con `z.union` (antes `discriminatedUnion("nivel")`), una entrada sin `nombre` o con la forma vieja da
   `fieldErrors.entrada` en vez de `nombre`. **No previsto en design**: necesita decisión.
3. CSV: «Faltan columnas obligatorias» se comprueba ahora después del tope de filas y de leer la
   división; un archivo sin columnas y con más filas que el tope cambia de motivo. Caso extremo que R31 no
   exceptúa.
4. Los `ok` de alta/renombre/estado ya no llevan `nivel` (forma, no desenlace).

### Hallazgo: la pantalla de hoy no puede escribir

`GeografiaAdminModule.tsx` (alta, renombre, retiro, reactivación, conteo) y `GeografiaPlataformaModule.tsx`
(alta de país) siguen mandando la forma de SL-20 (`{nivel, provinciaId|cantonId, …}`, seis campos
`nivelN*`). Con los esquemas `.strict()` de T4.4, **las 8 llamadas responden `validation_error`**. `tsc` no
lo ve (las actions reciben `unknown`). La lectura sí tiene puente (`arbol-de-tres-niveles.ts`, T4.1); las
escrituras no. Pasarlas a la entrada nueva es UI (T6, bloqueada por la maqueta T0.2): no se tocó.

### Desviaciones del design a revisar (reviewer)

1. **Etiqueta del historial de un nodo de la hoja a la raíz** («Cabagra · Buenos Aires · Puntarenas»),
   mientras §7 dice «cadena raíz → nodo». Se eligió el orden de las etiquetas de provincia/cantón/distrito
   de SL-20 (`etiquetaDeEntidad`), para que CR no cambie de texto (R12). `GeoRepository.cadenaDeNombres`.
2. **`TipoNivelDTO` con `digitosCodigo` y `codigoHeredaPrefijo`** (de `ReglaDeCodigoDeTipo`), que §4.6 no
   lista: sin ellos `validarCodigoDeTipo` no se puede usar con lo que devuelven `contextoDeAlta` y
   `leerDivisionDePais` (ya anotado en la tanda 1).
3. **`PaisRepository.crear` (seis nombres) sigue** junto a `crearConTipos`; §4.4 pide un solo
   `crear(datos con tipos)`. Ya no tiene llamador en la app (`DatosDeAltaDePais` lo dice); solo lo usa
   `tests/integration/db/pais-repositorio.test.ts`, que afirma `historial = [pais_creado]` y 1 fila, y R37
   pide P + 1 filas: retirarlo cambia el resultado de ese test. **Pendiente de decisión** (aviso de T3.2).
   En `GeoRepository`/`IGeoRepository` no queda ninguna forma por nivel.
4. Los `ok` de alta/renombre/estado del service sin `nivel` (ver la auditoría).
5. `CargaDivisionService` lee la división antes de mirar las columnas obligatorias (necesita P): un país
   inexistente con cabecera mala es `not_found` (antes `archivo_rechazado`). §4.3 lo ordena así.
6. Puente de lectura `app/(app)/plataforma/geografia/_components/arbol-de-tres-niveles.ts` (T4.1) y
   `creados[1..3]` en `GeografiaPlataformaModule.tsx` (T4.2): la pantalla sigue pintando 3 niveles hasta T6.
7. `tests/integration/db/_fixtures/alta-por-nivel-46.ts`: adaptador de los tests existentes al alta por
   nodo (calcula la profundidad y el tipo con `contextoDeAlta`), para que esas suites solo cambien la llamada.

### Mapa R → test (tanda 2)

| R | Test (archivo › caso) |
|---|---|
| R1 | `tests/unit/guards/geografia-vieja-sin-escritor.guardia.test.ts` (+ contraprueba); `geo-repository.escrituras` › «el doble no declara provincia/canton/distrito» |
| R5 (borde) | `tests/unit/actions/geografia-plataforma-action.test.ts` › alta con P2002 / 23505 del driver → `conflict`; otra causa → `error` con log |
| R12 (unit) | `tests/unit/services/geografia-service.test.ts` (casos de SL-20 con nodos de CR, mismos mensajes de código) y `carga-division-service.test.ts` (P = 3) |
| R14, R15, R16 | `geografia-service.test.ts` › tipo de la profundidad, profundidad 4, sin tipo → `validation_error` sin llamar `crear`, raíz/hijo/padre retirado, `conflict`, `not_found` |
| R18, R19 | `geografia-service.test.ts` (profundidad 4, sin cambio) + `geo-repository.escrituras` (solo escribe `nombre`/`activo`) |
| R20 | `geografia-service.test.ts` › 1/2/3 → nivel al repo de órdenes; 4/10/inexistente → 0 sin llamarlo |
| R21 (datos) | `geografia-service.test.ts` › `{tipos, raices}`; `composition-root` › árbol vacío |
| R22 | `geografia-nodo.test.ts` (`padreId` en renombre/estado → error) y `geografia-plataforma-action.test.ts` › lista exacta de exports, sin mover |
| R23, R24 | `pais-service.test.ts` (orden, 2/10 aceptados, 0/1/11 → `validation_error`) + `pais-alta-tipos` (T3.2) |
| R25, R26 | `pais-service.test.ts` + `pais-tipos-edicion` (T3.2) + `composition-root` › `not_found` sin escribir |
| R28 | `pais-service.test.ts` › `cambiarDisponible` con un doble que solo admite ese método |
| R30, R32, R34 | `carga-division-service.test.ts` › P = 2/3/4, «Faltan columnas obligatorias», hueco, tope de filas sin leer la base |
| R33, R36 (unit) | `geo-repository.escrituras` › `importarDivision` por profundidad, `division_cargada` con `creados` por profundidad solo si escribe |
| R35 (unit) | `geo-repository.escrituras` › `entidadTipo = nodo_geografico` en alta, renombre y estado, a profundidad 4 |
| R39 | `geografia-service`, `carga-division-service`, `pais-service` › `maestro` → `forbidden` con doble que revienta si se le llama (+ contraprueba) |
| R42 | `tests/unit/guards/geografia-sin-borrado-fisico.guardia.test.ts` (nodo, tipo, `DELETE FROM`) |
| R43 | `tests/unit/guards/nodo-geografico-escritor-unico.guardia.test.ts` y `geografia-renombrado-punto-unico.guardia.test.ts` |
| R48, R49 | `pais-service.test.ts` › `tope` → `validation_error` «Este país ya tiene 10 niveles», `not_found`, P2002 sube; `geografia-plataforma-action.test.ts` › P2002/23505 → `conflict`; `pais-agregar-nivel` (T3.2) |
| R50 | `geografia-sin-borrado-fisico` (tipo) y `geografia-plataforma-action.test.ts` › exports sin «quitar» |

Pendientes (T5, T6, T8, T9): R11, R13, R21 (pantalla), R27 (componente), R29, R31 (integración),
R35/R36/R38/R40 (integración, T5.4), R41, R45, R52, y la equivalencia de R12 en integración.

### Salida real de la verificación (2026-11-09, sobre `56939f04` + `15a8f761`)

Base `logistic_slt46` local; `--maxWorkers=1`, `NODE_OPTIONS=--max-old-space-size=8192`. Sin `./init.sh`.

- `pnpm exec tsc --noEmit` → exit 0.
- `pnpm exec eslint` sobre los 43 `.ts/.tsx` tocados en `b0b7ff43..HEAD` → exit 0, 0 errores, 1 aviso
  (`tests/integration/db/geografia-alta.test.ts:102` `'s' is defined but never used`).
- Unit tocados (11 archivos: `geo-repository.escrituras`, `geografia-service`, `carga-division-service`,
  `nombres-que-imprime-la-etiqueta`, `pais-service`, `geografia-plataforma-action`,
  `geografia-plataforma.composition-root`, `geografia-plataforma-page`, `geografia-nodo`, `pais-schemas`,
  `components/GeografiaPlataformaAltaPais`): primera corrida `Test Files 1 failed | 10 passed (11) ·
  Tests 4 failed | 445 passed (449)` (los 4 `nivel=…` del log); tras `15a8f761`,
  `geografia-plataforma-action` → `Tests 99 passed (99)`. Total: 449/449.
- Guardias, todas (337 archivos con `guard` en la ruta, 7 lotes de ≤ 50): `552`, `663`,
  `4 failed | 767`, `812`, `710`, `750 | 1 skipped`, `475` → **4 734 tests, 4 rojos, todos de
  `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`** (en `tests/baseline-rojos.json`).
  Las cuatro de T7 en verde.
- Integración tocada, una por una:

| Suite | Resultado | Lectura |
|---|---|---|
| `geografia-alta` | 15/15 | verde |
| `geo-sincronia-geografia` | 8/8 | verde |
| `geo-lecturas-catalogo` | 8/8 | verde (ver «SIN RESPALDO» de la auditoría) |
| `pais-alta-tipos` / `pais-tipos-edicion` / `pais-agregar-nivel` | 6/6, 7/7, 7/7 | verde (T3.2) |
| `pais-disponible` | 4/4 | verde |
| `geografia-cascada-reversible`, `geografia-registro-accion`, `geografia-renombrado` | paran en `beforeAll` | **entorno**: «`usuario` está vacía» (base sin siembra); no se creó usuario |
| `geografia-superadmin-sin-empresa` | 2 rojos / 2 verdes | **T5.4 pendiente**: el bloque sigue mandando la forma vieja (`crearPaisAction` de seis campos → `validation_error`, luego `raices[0]` indefinido; conteo con `{nivel,id}` → `validation_error`) |
| `carga-division` | 9 rojos / 7 verdes | **T5.3 pendiente**: `creados` `{provincia,canton,distrito}` frente a `{1,2,3}` (mismas cifras), el cast de `listArbolDePais` (`is not a function`) y el caso P6 de homónimos sin retirar |
| `pais-repositorio` | 1 rojo / 6 verdes | **decisión pendiente** (Desviaciones 3): «R23/R33/R41: crea el país…» llama a `PaisService.crear` con seis campos → `validation_error` desde T4.3; adaptarlo a `tipos` cambia su `historial = [pais_creado]` por R37 |

Ningún rojo de integración es de T3/T4/T7 fuera de lo que T5 tiene que adaptar o de la decisión de
`pais-repositorio`; el comportamiento nuevo (T3.2) está verde contra Postgres.

## Tanda 3 (2026-11-09): T3.3, T3.4, T4.5, T4.6, T5, T8 (backend, sin UI)

Sha de partida: `f12f6529`. Sin T6 ni `@dnd-kit` (tanda siguiente). Base `logistic_slt46` local.

### R52 — maqueta aprobada (T0.2)

- **Fecha:** 2026-11-09 (anterior a cualquier commit de T6: aún no hay ninguno).
- **Referencia:** lienzo https://claude.ai/artifact/QFq31uvvXmLXF4AGt9PFfH, **versión 7**.
- **Quién la hizo:** Claude, a pedido del humano.
- **Aprobación:** el humano, el 2026-11-09, con «aprobado» (`progress/features/SLT-46.md > Decisiones`).
- Contenido aprobado: reordenar solo arrastrando por ⠿ (sin flechas visibles; teclado con la manija
  enfocada), título «Niveles N (máximo 10)», modal de confirmación antes → después en guardar, editar,
  crear, agregar nivel y retirar, validando antes de escribir.

### Decisiones del humano (2026-11-09) que entran en esta tanda

- Retirar `PaisRepository.crear` (seis nombres) y su contrato; `pais-repositorio.test.ts` a la forma
  nueva (historial P+1 filas, R37). Cambio de aserción autorizado.
- Entrada de alta de nodo (`z.union`): sin `nombre` → `fieldErrors.nombre`; forma vieja → error claro
  de formato no válido (no `fieldErrors.entrada`).
- P11: «Disponible» y CSV confirman en la pantalla. En backend: §4.7 y R61 no les asignan «antes» ni
  control de cambio concurrente (R61 solo nombra renombre de nodo, edición de tipo y agregar nivel; R57
  el reordenar). No se inventa contrato: se reporta al leader.
- P12: estado pedido = actual → éxito sin escribir (R19 tal cual).

### T3.3 — reordenar tipos, candado del país y «antes» en las escrituras de tipos (2026-11-09)

**Archivos.** `lib/interfaces/repositories/IPaisRepository.ts`, `lib/repositories/PaisRepository.ts`,
`lib/interfaces/services/IPaisService.ts`, `lib/services/PaisService.ts`, `lib/types/pais.ts`; tests
nuevos `tests/integration/db/pais-reordenar-tipos.test.ts` (9 casos) y
`tests/integration/db/geografia-cambio-concurrente.test.ts` (parte de tipos, 6 casos); adaptados
`pais-repositorio`, `pais-alta-tipos`, `pais-tipos-edicion`, `pais-agregar-nivel` (integración),
`pais-service`, `pais-schemas`, `geografia-plataforma-action`, `geografia-plataforma.composition-root` (unit).

**Qué hace.**
- `reordenarTipos(paisId, niveles, actor)` (§2.4): candado → conjunto de ids y nombres vigentes (si no,
  `cambio_concurrente`) → `sin_cambio` si ninguna profundidad cambia → `update` de nombres por tipo +
  un solo `pais.update` de los niveles 1–3 que cambian → una fila `tipo_nivel_geografico_renombrado` por
  nombre con `detalle = {campo, origen: "reordenado"}`.
- Candado `SELECT "id" FROM "pais" WHERE "id" = $1 FOR UPDATE` (`bloquearPais`) en `reordenarTipos`,
  `renombrarTipo` (tras leer el `paisId` del tipo; relee el tipo bajo el candado) y `agregarNivel`.
- `renombrarTipo(tipoId, nombres, anterior, actor)`: `sin_cambio` ANTES que el «antes»; luego
  `cambio_concurrente` si los actuales ≠ `anterior`. `agregarNivel(paisId, nombres, profundidad, actor)`:
  `tope` ANTES que la profundidad; `cambio_concurrente` si P+1 ≠ `profundidad`.
- **Retirado** (decisión humana 2026-11-09) el `crear` de seis nombres y su tipo `DatosDeAltaDePais` viejo;
  `crearConTipos` pasa a llamarse `crear` (§4.4) y `DatosDeAltaDePaisConTipos` → `DatosDeAltaDePais`,
  `CrearPaisConTiposRepoResultado` → `CrearPaisRepoResultado`. Llamadores y dobles actualizados.
- Sin migraciones ni valores de enum nuevos.

**Desviación (adelanto de T4.5).** Para que el service no pasara un «antes» inventado, en este commit ya
entran `anterior` en `renombrarTipoNivelSchema`, `profundidad` (entero 3–10) en `agregarNivelPaisSchema` y
la variante `{ status: "conflict"; motivo: "cambio_concurrente" }` en los resultados de `renombrarTipo` y
`agregarNivel` del service (con su mapeo). Sin eso, `typecheck` solo se podía mantener pasando los nombres
pedidos como «antes» (todo renombre real habría sido `cambio_concurrente`) o una profundidad falsa. T4.5
completa el resto (reordenar en el service, nodo, tests de los desenlaces nuevos).

**Cambios de aserción en tests existentes.**

| Archivo › caso | Cambio | Respaldo |
|---|---|---|
| `pais-repositorio` › «R23/R33/R41: crea el país…» | Entrada `{id, tipos}`; historial `[pais_creado]` → 4 filas (`pais_creado` + 3 `tipo_nivel_geografico_creado`) | Decisión humana 2026-11-09 (P+1, R37) |
| `pais-repositorio` › «R23: un código o un nombre…» | `repo.crear` con `tipos`; `historial` 1 → `tipos.length + 1` (4) | Ídem |
| `pais-agregar-nivel` › carrera | Título; vigila el `FOR UPDATE` del país (no el `INSERT`); `{ganadas:["nivel_3"], unicos:1}` → `{ganadas:["nivel_3"], rechazos:["cambio_concurrente"], unicos:0}` | Leader: «la carrera puede dar `cambio_concurrente` en vez del único» (§2.4, la action responde `conflict` en ambos) |
| `pais-service` › «crea el país con el nombre DEL CATÁLOGO…» | Retirado `expect(repo.crear).not.toHaveBeenCalled()` (afirmaba que el `crear` de seis nombres no se llamaba; ese método ya no existe y el nombre pasó a la única alta) | Decisión humana 2026-11-09 (retirar `crear` viejo) |
| `pais-service` › «R49: una posición (`profundidad`)…» | `fieldErrors` esperado `entrada` → `profundidad` (sigue `validation_error` sin tocar la base: `profundidad: 2` ya no es un campo de más sino uno fuera de 3–10) | §4.1 (gana `profundidad`) |
| `geografia-plataforma.composition-root` › «SLT-46 R49: agregar un nivel… `not_found`» | «el país se buscó con `pais.findUnique`» → «con el `$queryRaw … FOR UPDATE`» (el doble del cliente gana `$queryRaw`) | §2.4 «Candado del país» |
| Resto (`pais-tipos-edicion`, `pais-alta-tipos`, `pais-agregar-nivel` salvo la carrera, `pais-service`, `pais-schemas`, `geografia-plataforma-action`, composition-root del renombre) | Solo la forma de la entrada (`{nombreSingular, nombrePlural}` + `anterior`/`profundidad` vigentes) y `crearConTipos` → `crear`; mismos resultados | §4.1, §4.4 |

**Salida real** (base `logistic_slt46` local, `--maxWorkers=1`):
- `pnpm run typecheck` → exit 0. `pnpm exec eslint` de los 15 archivos tocados → exit 0, sin avisos.
- Integración (`pais-reordenar-tipos`, `geografia-cambio-concurrente`, `pais-tipos-edicion`,
  `pais-agregar-nivel`, `pais-alta-tipos`, `pais-repositorio`): `Test Files 6 passed (6) · Tests 41 passed (41)`.
- Unit (`pais-service`, `geografia-plataforma-action`, `geografia-plataforma.composition-root`,
  `pais-schemas`, `paises-plataforma.composition-root`): `Test Files 5 passed (5) · Tests 205 passed (205)`.
- Guardias que miran repositorios/SQL (`aprobacion-escrituras-cubiertas`, `catalogo-postgres-acota-esquema`,
  `geografia-lecturas-sin-nodo-fk`, `geografia-sin-borrado-fisico`, `geografia-sin-cte-recursiva`,
  `nodo-geografico-escritor-unico`, `sql-a-mano-por-empresa`, `geografia-renombrado-punto-unico`,
  `geografia-vieja-sin-escritor`): `Test Files 9 passed (9) · Tests 142 passed (142)`.

### T3.4 — `GeoRepository.renombrar` con `nombreAnterior` (2026-11-09)

**Archivos.** `lib/interfaces/repositories/IGeoRepository.ts`, `lib/repositories/GeoRepository.ts`,
`lib/interfaces/services/IGeografiaService.ts`, `lib/services/GeografiaService.ts`,
`lib/types/geografia-nodo.ts`; tests: parte de nodos de `geografia-cambio-concurrente.test.ts` (3 casos
nuevos); adaptados `geo-repository.escrituras` (+1 caso R61), `geografia-service`,
`nombres-que-imprime-la-etiqueta`, `geografia-nodo` (unit), `geografia-plataforma-action`, la guardia
`geografia-renombrado-punto-unico`, y en integración `geografia-renombrado`, `geo-sincronia-geografia`,
`carga-division`, `geografia-registro-accion` (una llamada cada uno).

**Qué hace.** `renombrar(id, nombre, nombreAnterior, actorId)`: `no_existe` → `sin_cambio` si el nombre
actual ya es el pedido (antes que el «antes», R18) → `updateMany({ where: { id, nombre: nombreAnterior } })`
y, con 0 filas, `cambio_concurrente` sin historial (R61). `valorAnterior` del historial = `nombreAnterior`
(es el valor que el `updateMany` reemplazó). El service lo traduce a `{ status: "conflict", motivo:
"cambio_concurrente" }`.

**Desviación (adelanto de T4.5, mismo motivo que en T3.3).** `nombreAnterior` (string no vacío, sin cotas
de longitud: es un dato de la base, no tecleado, y uno heredado de antes de las cotas tiene que poder
compararse) entra ya en `renombrarNodoGeograficoSchema`, y la variante con `motivo` en
`RenombrarNodoGeograficoServiceResult` (reusa `CambioConcurrenteResult` de `IPaisService`). La firma de
`renombrar` va en una sola línea porque la guardia `geografia-renombrado-punto-unico` localiza el cuerpo
por el literal `async renombrar(id: string,`.

**Cambios de aserción en tests existentes.**

| Archivo › caso | Cambio | Respaldo |
|---|---|---|
| `geo-repository.escrituras` › «escribe SOLO `nombre`…» | `update` llamado 1 vez con `{where:{id}, data:{nombre}}` → `updateMany` 1 vez con `{where:{id, nombre:"Barrio Uno"}, data:{nombre}}` (sigue: solo `nombre`) | §4.4 («`updateMany({ where: { id, nombre: nombreAnterior } })`»), T3.4 |
| `geo-repository.escrituras` › «`no_existe` y `sin_cambio` cortan…» | Añadido `updateMany` no llamado (además de `update`) | Ídem (aserción añadida, no cambiada) |
| guardia `geografia-renombrado-punto-unico` › «dentro de GeoRepository, `nombre` solo se escribe en el cuerpo del renombre» | Hallazgo esperado `nodoGeografico.update escribe nombre` → `nodoGeografico.updateMany escribe nombre` | §4.4/§4.7 |
| `geografia-renombrado` (fixture, no aserción) | El actor se crea en la transacción revertida de cada caso (`crearOrganizacion` + `insertarUsuario`), en vez de `usuario.findFirst()` en el `beforeAll` | Leader: «si una suite necesita filas de `usuario`, créalas dentro del propio test» |
| Resto | Solo la entrada: `nombreAnterior` = el nombre vigente del nodo (o una constante en los dobles que no lo comparan); mismos resultados | §4.1 |

**Salida real** (base `logistic_slt46` local, `--maxWorkers=1`):
- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él, `tsc` murió una vez por
  memoria, exit 134) → exit 0. `eslint` de los archivos tocados → 0 problemas.
- Unit (`geo-repository.escrituras`, `geografia-service`, `nombres-que-imprime-la-etiqueta`,
  `geografia-plataforma-action`, `geografia-plataforma.composition-root`, `geografia-nodo`):
  `Test Files 6 passed (6) · Tests 282 passed (282)`.
- Guardias geo (`geografia-renombrado-punto-unico`, `nodo-geografico-escritor-unico`,
  `geografia-vieja-sin-escritor`, `geografia-sin-borrado-fisico`): `Tests 87 passed` (tras ajustar la de
  punto único; antes 3 rojos por la firma multilínea y el `update` → `updateMany`).
- Integración: `geografia-cambio-concurrente` + `geo-sincronia-geografia` verdes; `geografia-renombrado`
  **16/17**: `Test Files 1 failed | 2 passed (3) · Tests 1 failed | 33 passed (34)`.
- `carga-division`: `9 failed | 7 passed (16)`, idéntico a antes de esta tanda (rojos de T5.3);
  `geografia-registro-accion` sigue parando en su `beforeAll` («`usuario` está vacía», T5.4).

**Bloqueo (T3.4 NO se marca `[x]`).** El rojo de `geografia-renombrado` es «una fila
`nodo_geografico_renombrado` sobre la entidad del nivel»: espera `entidad_tipo = "distrito"` y la base
escribe `"nodo_geografico"` desde T3.1 (R35, design §7, P5). No lo causa T3.4: la suite estaba parada en
el `beforeAll` y nunca había corrido contra el código de T3.1; al crear el actor en el test, aparece.
Cambiar `"distrito"` → `"nodo_geografico"` es un cambio de resultado que ni tasks ni el leader autorizaron
para este archivo: **pendiente de autorización** (es una línea, respaldada por R35/§7).

**Cierre de T3.4 (2026-11-09).** El leader autorizó (decisión para T5.4: las aserciones de `entidad_tipo`
por nivel pasan a `nodo_geografico`, P5) cambiar esa línea:

| Archivo › caso | Cambio | Respaldo |
|---|---|---|
| `geografia-renombrado` › «una fila `nodo_geografico_renombrado` sobre la entidad del nivel» | `entidad_tipo` `"distrito"` → `"nodo_geografico"` (sigue: 1 fila, acción y `entidad_id` iguales) | R35, design §7, P5; autorización del leader |

Salida real (base `logistic_slt46` local, `--maxWorkers=1`): `eslint` → «No issues found»;
`geografia-renombrado` + `geografia-cambio-concurrente`: `Test Files 2 passed (2) · Tests 26 passed (26)`;
`geo-repository.escrituras`: `Test Files 1 passed (1) · Tests 32 passed (32)`. T3.4 marcada `[x]`.

### T4.5 — esquemas, `PaisService.reordenarTipos` y `conflict` con motivo (2026-11-09)

**Archivos.** `lib/types/pais.ts` (`reordenarTiposSchema`, `TIPO_REPETIDO_AL_REORDENAR`),
`lib/types/geografia-nodo.ts` (alta de nodo sin `z.union`; `CAMPO_DE_FORMATO`, `mensajeDeFormatoNoValido`,
`DESTINO_SIN_DECIDIR`), `lib/interfaces/services/IPaisService.ts` (`ReordenarTiposServiceResult`,
`reordenarTipos`), `lib/services/PaisService.ts` (`reordenarTipos`); tests `pais-schemas`, `geografia-nodo`,
`pais-service`, `geografia-service` (casos nuevos) y el doble de `IPaisService` en
`geografia-plataforma-action`. `anterior`, `profundidad`, `nombreAnterior` y la variante `{ status:
"conflict"; motivo: "cambio_concurrente" }` en `renombrarTipo`/`agregarNivel`/`renombrar` ya entraron en
T3.3/T3.4 (ver sus «Desviación»).

**Qué hace.**
- `reordenarTiposSchema`: `{ paisId, niveles: { tipoId, nombreSingular, nombrePlural }[] }` `.strict()`,
  2–10 elementos, nombres 2–40 (normalizados como el alta), `tipoId` distintos por `superRefine` (el error
  cae en `fieldErrors.niveles`).
- `PaisService.reordenarTipos`: rol → esquema → `repo.reordenarTipos` → `no_existe` → `not_found`;
  `cambio_concurrente` → `conflict` con motivo; `sin_cambio`/`reordenado` → `ok`.
- **Alta de nodo (decisión del humano 2026-11-09).** `crearNodoGeograficoSchema` deja de ser
  `z.union` de dos `.strict()`: es UN objeto con `paisId?`, `padreId?`, `nombre`, `codigo?` (`.loose()`)
  más un `superRefine` que corre aunque otro campo haya fallado (`when: () => true`) y un `transform` a la
  unión `{paisId,…} | {padreId,…}` (el tipo `CrearNodoGeograficoInput` no cambia para quien lo usa).
  Resultado:
  - sin `nombre` → `fieldErrors.nombre` (como antes de SLT-46), sin `formErrors`;
  - claves que no son de esta forma (p. ej. la vieja `{ nivel, provinciaId|cantonId, … }`) →
    `fieldErrors.formato = ["Formato no válido: no se admiten los campos nivel, provinciaId. El alta lleva
    el país (raíz) o el padre (hijo), el nombre y, si se quiere, el código."]`;
  - país y padre a la vez, o ninguno → `fieldErrors.formato = ["Formato no válido: el alta lleva el país
    (raíz) o el padre (hijo), uno de los dos."]`;
  - una forma vieja sin nombre da los dos (`nombre` y `formato`).
  **Decisión a revisar:** el campo elegido es `formato` (constante `CAMPO_DE_FORMATO`), no `nombre` ni
  `entrada`: no es un dato que la persona teclee y así no se confunde con el error del nombre. La pantalla
  vieja (`mensajeDeValidacion` de `GeografiaAdminModule.tsx`) solo lee `nombre`/`codigo`: con la forma
  vieja con nombre, el toast mostrará el genérico de `validation_error` hasta T6 (no se tocó UI).

**Tests nuevos (T4.5 «Hecho»).**
- `pais-schemas`: `anterior` obligatorio (sin él, incompleto o con clave de más → error; con él, se
  normaliza); `profundidad` obligatoria (2, 11, 3.5, "4" → error; 3 y 10 → ok); reordenar: 2 y 10 ok, orden
  conservado y normalizado; 1 y 11 → error en `niveles`; repetido → `TIPO_REPETIDO_AL_REORDENAR` (con
  contraprueba); nombres fuera de 2–40, `tipoId` vacío, claves de más, país no alfa-2.
- `geografia-nodo`: `nombreAnterior` obligatorio y sin normalizar; los seis casos de la decisión del alta
  (sin nombre, campo propio, forma vieja, forma vieja sin nombre, destino sin decidir, contraprueba).
- `pais-service`: `reordenarTipos` `reordenado`/`sin_cambio` → `ok` con la lista normalizada en su orden;
  `no_existe` → `not_found`; `cambio_concurrente` → `conflict` con motivo; repetido / 1 / 11 →
  `validation_error` en `niveles` sin tocar el repo; `renombrarTipo` y `agregarNivel` con
  `cambio_concurrente` → `conflict` con motivo; contraprueba: los `conflict` del alta de país siguen sin
  `motivo`; R39: `reordenarTipos` (válida e inválida) → `forbidden` con el repo que lanza, y contraprueba.
- `geografia-service`: `cambio_concurrente` → `conflict` con motivo, el repo recibe el «antes»;
  contraprueba: el `conflict` por hermano sigue sin `motivo` y no llega al repositorio.

**Cambios de aserción en tests existentes.** Ninguno en esta task (los casos existentes del alta de nodo
—`validation_error` con `cantonId`, raíz sin país, etc.— siguen verdes sin tocarlos).

**Salida real.**
- `pnpm run typecheck` (`NODE_OPTIONS=--max-old-space-size=8192`) → exit 0; `eslint` de lo tocado → 0.
- Unit (`pais-service`, `geografia-service`, `pais-schemas`, `geografia-nodo`, `geografia-plataforma-action`,
  `geografia-plataforma.composition-root`, `nombres-que-imprime-la-etiqueta`):
  `Test Files 7 passed (7) · Tests 374 passed (374)`; tras ajustar el tipo del helper de
  `geografia-nodo`: `Tests 30 passed (30)` en ese archivo.

### T4.6 — `reordenarTiposAction` y el «antes» por el borde (2026-11-09)

**Archivos.** `lib/actions/geografia-plataforma.ts`; tests `tests/unit/actions/geografia-plataforma-action.test.ts`
y `geografia-plataforma.composition-root.test.ts`.

**Qué hace.** `reordenarTiposAction(input)`: `puerta` → `PaisService.reordenarTipos` dentro de
`comoPlataforma`; la entrada pasa tal cual (la valida el service, como `renombrarTipoNivelAction` y
`agregarNivelPaisAction`); un fallo de la base es `error` con log `reordenamiento de niveles -` (sin datos).
Lleva `@sin-superficie` (T6.3 le da pantalla) para la guardia `superficie-de-uso`. El «antes» de las
actions existentes ya viaja: `renombrarNodoAction` valida con `renombrarNodoGeograficoSchema` (con
`nombreAnterior`) y pasa `parsed.data`; `renombrarTipoNivelAction` y `agregarNivelPaisAction` pasan la
entrada al service, que valida `anterior`/`profundidad`. Comentarios del módulo y de
`agregarNivelPaisAction` actualizados (la carrera ahora sale por cambio concurrente; el único, de respaldo).
`EXCEPCIONES_DE_PLATAFORMA` no cambia: lista el ARCHIVO, que ya estaba.

**Tests nuevos.**
- R60: 15 entradas inválidas (alta de país con 11 tipos y con nombre de 1 carácter, disponibilidad sin
  `disponible`, alta y renombre de nodo con nombre de 1 carácter, renombre sin «antes», retiro sin `activo`,
  CSV sin archivo, edición de tipo con nombre de 1 carácter y sin «antes», agregar nivel con nombre de 1
  carácter y sin `profundidad`, reordenar con 11 niveles, con `tipoId` repetidos y con nombre de 1 carácter)
  → `validation_error`, con servicios REALES sobre repositorios que lanzan si se tocan; contraprueba: con
  entrada válida el mismo repositorio sí se toca.
- R61: edición de tipo, agregar nivel, reordenar y renombre de nodo con `cambio_concurrente` en el repo →
  `{ status: "conflict", motivo: "cambio_concurrente" }`, y el «antes» llega al repositorio tal cual;
  contraprueba: el `conflict` del único sigue sin `motivo`.
- R55–R57 por el borde: `reordenado`/`sin_cambio` → `ok`; `no_existe` → `not_found`; fallo → `error` con log
  sin datos; corre en `comoPlataforma`.
- Decisión del alta de nodo por el borde: sin `nombre` → `fieldErrors.nombre`; forma vieja →
  `fieldErrors.formato` («Formato no válido…»), sin `entrada`.
- `ACCIONES` (sin sesión → `unauthenticated`, `maestro` → `forbidden`, sin tocar servicios) y «corre en
  plataforma» ganan `reordenarTiposAction`; composition-root: reordenar con el cliente falso → candado sin
  fila → `not_found`, sin historial.

**Cambios de aserción en tests existentes.** La lista exacta de exports (R22, R50) gana
`"reordenarTiposAction"` (lo pide T4.6); sigue sin ninguna action de mover ni de quitar nivel (el filtro
`/mover|padre|quitar|borrar|eliminar|retirarNivel|retirarTipo/` no cambia). Ninguna otra.

**Salida real.**
- `pnpm run typecheck` (`NODE_OPTIONS=--max-old-space-size=8192`) → exit 0; `eslint` de los 3 archivos →
  «No issues found».
- `geografia-plataforma-action`: `Test Files 1 passed (1) · Tests 127 passed (127)`.
- `geografia-plataforma.composition-root` + guardias `superficie-de-uso` y `plataforma-solo-en-lista`:
  `Test Files 3 passed (3) · Tests 34 passed (34)`.
- **Todas las guardias** (332 archivos con `guard` en la ruta, 7 lotes de ≤ 50, `--maxWorkers=1`):
  `1 failed | 527 passed | 24 skipped (552)`, `666`, `4 failed | 763 passed (767)`, `836`, `726`,
  `720 | 1 skipped`, `423` → 5 rojos, ninguno de esta tanda:
  - 4 de `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (en `tests/baseline-rojos.json`);
  - 1 de `tests/guards/guard-dependencias-aprobadas.test.ts` › «el registro no lista paquetes que ya no
    están instalados»: `@dnd-kit/{core,sortable,utilities}` están aprobadas en `docs/dependencias.md`
    (`f12f6529`) y aún no instaladas (lo hace T6). Preexistente; no se tocó.
