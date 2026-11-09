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
