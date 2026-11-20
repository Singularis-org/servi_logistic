# Review SLT-225 «Desactivar zona: sacarla del trabajo nuevo sin borrar su historia»

Reviewer, 2026-11-20. Rama `feature/SLT-225-desactivar-zona`, HEAD revisado `36d1af27`, diff contra
`origin/dev`. Ruta completa (fullstack, medium): migración, triggers, Histórico y pantalla existente.
El grafo no indexa este worktree: todo se revisó con Grep/Read.

## Veredicto: APROBADO

Sin bloqueantes en el código. Antes de abrir el PR, el leader tiene que hacer **T0** (ver C1).

## Checklist

- [x] **Ruta.** Completa, con `requirements.md`, `design.md` y `tasks.md`. Toca permisos (solo `maestro`) y
  base de datos: la ruta completa es la que corresponde.
- [x] **`design.md > ## Lo que ya existe`** existe y no está vacía. El diff no re-crea nada de esa lista:
  reutiliza `ESTADOS_TERMINALES` (única fuente), `Modal`, `Badge`, `EstadoConInfo`, `ROL_LABELS` y
  `ESTADO_LABELS`, y copia el patrón de la geografía (FICHA 374).
- [x] **Alternativas descartadas** en design §4 (cinco).
- [ ] **Tasks.** T1–T7 en `[x]`. **T0 sigue en `[ ]`**: es del leader, de solo lectura en producción y
  «antes del PR» (ver C1).
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 48/40 archivos, 944/1000 líneas de producción y 1383/3000
  de tests. Está aceptado por escrito con la marca `tamano-pr-aceptado` en `progress/features/SLT-225.md`
  (Carlos, 2026-11-20).
- [x] **Trazabilidad.** R1740–R1761: los 22 tienen un test concreto que de verdad afirma lo que pide
  (mapa en `progress/impl_SLT-225.md`). Revisé los 17 casos de `tests/integration/db/zona-desactivar.test.ts`
  y los nombres de los de componentes, servicio y acción.
- [x] **Orden viva = lo que decidió Carlos.**
  - `whereOrdenViva` exige `deletedAt: null` y estado fuera de `ESTADOS_TERMINALES` (entregado, devuelta a
    tienda e incidente). Así, `devolviendo_a_tienda` y `por_devolver_a_tienda` bloquean (P3).
  - Los usuarios se buscan con `where: { zonaId }` y sin filtro de estado, así que uno `inactivo` (dado de
    baja) también bloquea (P2).
  - Los dos casos están afirmados en R1742 y R1743, y los maté con mutación (abajo).
- [x] **Triggers `FOR SHARE` y RLS.**
  - Las dos funciones son `SECURITY INVOKER` y leen `zona` con `FOR SHARE`.
  - El trigger de `usuario` es `BEFORE INSERT OR UPDATE OF zona_id`, con la salida «ya la tenía».
  - R1754 se prueba bajo `servi_app`, con dos carreras reales entre dos conexiones (una con la
    desactivación primero y otra con el distrito primero).
  - No hay tabla nueva. La columna va en `zona`, que ya tiene RLS (`zona_por_empresa`). R1752 cubre dos
    empresas bajo `servi_app`.
- [x] **La historia queda intacta.** `desactivar`/`reactivar` solo hacen un `updateMany` de la marca y
  `appendAccion`. R1741 compara la orden, las tarifas y el conteo del historial con lo leído antes. El
  centinela deshace la marca cuando hay impedimentos (R1746, sin marca ni fila).
- [x] **Histórico.** Hay dos valores del enum en una migración aparte (55P04). Los dos van en «hace
  desaparecer», con etiquetas «Desactivó/Reactivó una zona». La guardia `historial-accion-escrituras-cubiertas`
  tiene dos entradas, una por método. R1741/R1747 afirman la fila completa: tipo, entidad, etiqueta, actor
  y `valor_*` en NULL.
- [x] **UI.** No hay pantalla nueva: todo va en `ZonasModule` con los componentes de hoy. La confirmación
  es un `Modal`, con `dismissible={false}` y `throw res` para que siga abierta. Los textos están en español
  llano y con singular/plural. El estado de la orden se pinta con `EstadoConInfo` y la marca con el
  `Badge` «Desactivada». El selector de usuario usa `opcionesZonaUsuario`.
- [x] **Permisos en servidor.** `ZonaService.desactivar`/`reactivar` aplican el gate `maestro` antes del
  repositorio (R1751, unit + acción con el servicio real). El id se valida con zod en la acción.
- [x] **Migraciones con `down.sql`.** Están las dos. No se edita ninguna migración ya aplicada.
- [x] **Literales de país.** No hay literales de país ni de moneda en el código de producción nuevo. El
  SINPE ficticio está solo en el E2E, como campo obligatorio del alta de zona. No hay rastro de Ordenex ni
  dependencias nuevas.
- [x] **Gate local.** `NODE_OPTIONS=--max-old-space-size=8192 ./init.sh` contra `servi_slt225_impl` dio
  **`INIT_EXIT=0`** en la tercera corrida (typecheck, lint, `test:rapido` y guardias). Las dos primeras no
  cuentan:
  - La 1.ª se cayó por un error mío: mi helper exportaba la URL con un `\r` del `.env`, lo que dio
    `ENOTFOUND` en 53 archivos de integración. No tiene que ver con el código.
  - La 2.ª se cortó en `demo-qa.test.ts` con P2028 (`maxWait` del pool) bajo carga. Aislado pasó 14/14 y
    en la 3.ª corrida completa salió verde. No está en el baseline, pero no es atribuible al diff.
- [x] **E2E repetido.** Hice el `next build` de nuevo, ya con `EstadoConInfo` (base `servi_slt225_e2e`,
  `NEXT_PUBLIC_APP_URL=http://localhost:3361`, `E2E_PUERTO=3361`). Con `--project=aislamiento --no-deps`
  pasaron `zona-desactivar`, `zonas-crear-sin-costos`, `zona-sin-distritos` y `dos-empresas-humo`:
  **11 passed (1.4m)**, `E2E_EXIT=0`.

## Mutaciones propias

Cada mutación se aplicó, se corrió el test y después se restauró. El árbol volvió a quedar limpio
(`git status` vacío) y las funciones de la base se repusieron desde el `migration.sql`.

| # | Mutación | Resultado |
|---|---|---|
| A | `whereOrdenViva` trata `devolviendo_a_tienda`/`por_devolver_a_tienda` como terminales | **Muerta**: R1742 rojo (1/17) |
| B | usuarios con `estado: { not: "inactivo" }` en el `WHERE` | **Muerta**: R1743 rojo (1/17) |
| D | `zona_distrito_exige_zona_activa` reducida a `RETURN NEW` (en la base) | **Muerta**: R1754 y las dos carreras (3/17) |
| C | `usuario_zona_exige_activa` sin la salida `TG_OP='UPDATE' AND zona_id IS NOT DISTINCT FROM OLD` | **Sobrevive** (34/34 verdes con `usuario-zona.test.ts`). Ver m1 |

## Hallazgos

### Condición antes del PR (leader)

- **C1 — T0 sin hacer.** Falta medir en producción, en solo lectura, los impedimentos reales de «GAM Kevin
  (Alajuéla)»: órdenes vivas por estado, usuarios y distritos. Los números van en
  `progress/features/SLT-225.md`. La task dice «antes del PR» y es del leader: el implementer no la puede
  cerrar, así que no la cuento como rechazo del código. Pero el PR no se abre con T0 en `[ ]`.

### Menores

- **m1 — La salida «ya la tenía» del trigger de usuario no la cubre ningún test** (la mutación C
  sobrevive).
  - El caso R1755 de `zona-desactivar.test.ts` comprueba «no rechaza al que ya la tenía» con un `update`
    de `telefono`. Ese `update` ni siquiera dispara el trigger, porque el evento es `UPDATE OF zona_id`.
  - El camino real sí lo dispara: `UsuarioService.actualizar` pone `data.zonaId` aunque no cambie, y
    `UserRepository` lo escribe en el `SET`.
  - En el flujo normal es casi inalcanzable, porque R1743 no deja desactivar una zona con usuarios. Aun
    así, es la rama que evita rechazar a quien ya tenía la zona.
  - Arreglo: en ese caso, actualizar `yaLaTenia` con `data: { zonaId: z.id }` (misma zona) y esperar que
    entre.
- **m2 — R1752 «órdenes/usuarios de B no cuentan» es vacuo tal como está sembrado.**
  - El mensajero de B está en la zona de B, y los impedimentos de A se cuentan por `zonaId` de A, así que
    no podría contar aunque se quitara la RLS.
  - El aislamiento real sí queda probado: la zona de B responde `not_found` bajo `servi_app`, y el trigger
    de misma empresa impide sembrarlo de otro modo.
  - Basta con ajustar el título del caso o quitar esa promesa.
- **m3 — La ayuda usa voseo y la pantalla tuteo.**
  - `docs/ayuda/oficina/configuracion-zonas.md` dice «Marcá», «Editá», «quitale», «cambiale» y «Esperá».
  - La pantalla dice «Marca otra zona», «Quítalos» y «Cámbiales», igual que el resto del documento.
  - Conviene unificar en tuteo.
- **m4 — `progress/features/SLT-225.md > ## Estado` está atrasado.** Todavía dice «falta pantalla, ayuda y
  E2E (T5–T7)». Lo actualiza el leader.
- **m5 — `ZonaRepository.update` lee `activa` sin bloqueo.**
  - Si una desactivación hace commit entre esa lectura y la escritura, un guardado sin distritos (por
    ejemplo, un cambio de nombre) entra en una zona recién desactivada.
  - Los distritos sí los frena el trigger.
  - Es inofensivo (solo cambia el nombre o las tarifas de una zona sin trabajo). Lo anoto, sin pedir
    cambio.

## Choque con SLT-224 «Retiro a central: recalcular la zona de la orden» (#257, se mergea primero)

- El head actual de #257 **no toca `lib/repositories/ZonaRepository.ts`** ni la guardia del Histórico.
  Solo toca `tests/unit/repositories/zona-repository.test.ts`, y ese archivo SLT-225 no lo modifica.
- `git merge-tree HEAD origin/feature/SLT-224-zona-al-retirar-a-central` termina sin conflictos.
- Lo semántico a vigilar:
  - los dobles de `zona-repository.test.ts` de #257 no declaran `activa`, y siguen verdes gracias a
    `activa === false` (no `!activa`) en `update`;
  - #257 re-estampa la zona de órdenes por distrito o con la central, y ninguna de las dos puede ser una
    zona desactivada (sin distritos; la central no se desactiva).
- Después de rebasar sobre `dev` con #257 dentro, corre `pnpm run typecheck`,
  `tests/unit/repositories/zona-repository.test.ts` y `tests/integration/db/zona-desactivar.test.ts`.

## Evidencia (logs fuera del repo)

Están en el scratchpad de la sesión, carpeta `rev225`:
- `init3.log` (`INIT_EXIT=0`);
- `mutA.log`, `mutB.log`, `mutC.log` y `mutD.log`;
- `build.log` (`BUILD_EXIT=0`) y `e2e.log` (`E2E_EXIT=0`).
