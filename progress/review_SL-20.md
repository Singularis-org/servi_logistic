# Review SL-20 «Geografía configurable por país» — vuelta 1

Rama `feature/SL-20-pais-geografia-configurable`, HEAD `e7d20b5`, base `origin/dev` (ya mergeado).
Revisado el 2026-10-27 contra `specs/SL-20-pais-geografia-configurable/{requirements,design,tasks}.md`
(R1–R52), `progress/features/SL-20.md` (decisiones 1–10), `CHECKPOINTS.md`,
`docs/checkpoints-proyecto.md` y `docs/perfil-agentes.md > reviewer`.
No se corrió `./init.sh` (lo pidió el leader: no hay memoria; el gate completo va en CI). MCP del grafo
no consultado: revisión con Grep/Read y ejecución directa.

## Verificación ejecutada (por el reviewer)

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` (`NODE_OPTIONS=--max-old-space-size=8192`) | 0 errores |
| `pnpm run lint` | 0 errores, 230 avisos |
| 15 suites unit/componente de SL-20 (organizacion-service, empresas-module, geografia-service, codigo-geografico, openapi-geografia-sin-cambios, guardia de etiquetas, etiquetas-geograficas, geografia-plataforma-page, menu-visibility, pais-service, division-csv, carga-division-service, geografia-plataforma-action, paises-iso-3166-1, errores-pais) | 15/15 archivos, 437/437 tests |
| `pnpm run test:guardias` | 311 passed, 1 failed: `dependencias-declaradas-presentes` (en `tests/baseline-rojos.json`) |
| Integración SL-20 en serie contra `servi_logistic_sl20` (16 suites) | 12 verdes; 4 rojas por `usuario` vacía: `geografia-renombrado`, `geografia-cascada-reversible`, `geografia-registro-accion` (en baseline) y **`carga-division` (NO en baseline, nueva de SL-20)** |
| Integración `zona-*`, `cobertura-*` y resto de `geografia-*` en serie | 14 verdes; 3 rojas, las tres en baseline (`cobertura-repository`, `geografia-historico-intacto`, `geografia-ordenes-sin-entregar`) |
| `git diff origin/dev...HEAD -- package.json pnpm-lock.yaml` | vacío: ninguna dependencia nueva |

## Checklist

### Especificación
- [x] `requirements.md` con R1–R52 en EARS.
- [x] `design.md` con alternativas descartadas (§10, nueve).
- [x] `tasks.md`: 99 `[x]`, 0 `[ ]`.
- [x] `design.md` abre con `## Lo que ya existe`, con búsqueda hecha; el diff reutiliza lo listado
      (`GeografiaService`, `GeoRepository`, `comoPlataforma`, `contarSinEntregarPorNodoGeografico`,
      `parseSpreadsheet`) y no lo re-crea. `GeografiaAdminModule` se movió, no se duplicó.

### Equipo
- [x] Assignee (Camilo) y rama de `wt.sh new`.

### Trazabilidad
- [x] `progress/impl_SL-20.md` tiene el mapa R1–R52 → test; los 29 archivos citados existen.
- [ ] **Cada R mapea a un test que de verdad corre** — falla para R49 y R50 y debilita R24–R26, R33 y
      R35: ver hallazgo M1.

### Calidad de código
- [x] Typecheck 0 errores.
- [x] Lint 0 errores.
- [ ] `gate-completo` en verde: no lo estará mientras `carga-division.test.ts` caiga en CI (M1).
- [ ] Flujo crítico «Aislamiento entre empresas» (toca `lib/db/`, RLS y triggers): el E2E existente
      `e2e/dos-empresas-humo.spec.ts` se ajustó pero no se corrió, y no hay su salida en
      `progress/impl_SL-20*.md` (M2).
- [x] Sin dependencias nuevas (el catálogo ISO es un archivo generado y fijo, decisión 10).

### Seguridad y configuración
- [x] Sin secretos hardcodeados; ningún recurso de Ordenex en el diff.
- [x] Sin webhooks nuevos.
- [x] Nada de entorno hardcodeado. El único `"CR"` en código de app es `PAIS_DEMO` de la demo de QA,
      que manda la decisión 3; el resto de «Costa Rica» del diff son comentarios.

### Datos y seguridad (proyecto)
- [x] Tablas nuevas `pais` e `historial_plataforma`: de plataforma, sin `organizacion_id` por diseño,
      clasificadas en `MODELOS_DE_PLATAFORMA` (16 → 18) con comentario; RLS activada en las dos
      (`pais_lectura` + `REVOKE INSERT, UPDATE, DELETE`; historial sin políticas + `REVOKE ALL`).
- [x] RLS de la geografía por país (`*_del_pais`, subconsulta no correlacionada), probada con dos
      empresas en dos países en `geografia-dos-paises.test.ts` (verde).
- [x] Triggers SL020 (`organizacion_pais_inmutable`) y SL021 (`geografia_del_pais_de_la_empresa`,
      `SECURITY DEFINER` con `search_path` fijo) en `orden`, `zona_distrito` y
      `distrito_zona_especial`; cubiertos por `organizacion-pais-inmutable` y `geografia-dos-paises`.
- [x] `lib/actions/geografia-plataforma.ts` en `EXCEPCIONES_DE_PLATAFORMA` con ficha y motivo; todas
      sus actions: sesión → `exigirSuperadmin` → zod → servicio dentro de `comoPlataforma`.
- [x] Seis migraciones nuevas, cada una con `down.sql`; ninguna migración ya aplicada editada (solo
      se añadió un comentario al `down.sql` de `120000`, que no es la migración aplicada). La ida y
      vuelta (`migracion-sl20-ida-y-vuelta`) pasa. Los downs que perderían datos abortan con `RAISE`.
- [x] Sin `console.log` de PII: `registrarFallo` solo registra el nombre del error, la operación, el
      nivel y el país.

### Arquitectura y permisos (proyecto)
- [x] Capas respetadas: `PaisService`/`CargaDivisionService` → `PaisRepository`/`GeoRepository`;
      actions en `lib/actions/`.
- [x] Entrada validada con zod en el borde (`crearPaisSchema`, `cambiarDisponibilidadPaisSchema`,
      `arbolDePaisSchema`, schemas de nodo).
- [x] País, nombres de nivel y regla de código salen de la fila `pais`, no de literales
      (`validarCodigo` no reconoce `CR` por su código).
- [x] Autorización en servidor: la page hace `notFound()` antes de leer (R21) y los servicios
      vuelven a mirar `GESTION_ROLES` (R37).

### Puntos pedidos por el leader
- [x] Ninguna ruta `/configuracion/geografia`: la carpeta no existe, el menú no la lista y la ayuda del
      maestro se retiró (decisión 9). Quedan menciones solo en comentarios y en tests que verifican el
      404.
- [x] Pantalla `/plataforma/geografia`: puerta, selector de país, alta con autocompletado sin campo de
      código (R42), `Switch` de disponibilidad (R47), carga CSV con errores por línea y avisos, árbol
      sin zonas con etiquetas del país; cubierta por `geografia-plataforma-page.test.tsx`.
- [ ] Literales de Costa Rica donde el spec pide etiquetas por país: la guardia nueva barre `app/` y
      `components/` sin excepciones y está verde; queda un resto muerto en `lib/` (m1).

## Hallazgos

### Mayores

**M1 — `tests/integration/db/carga-division.test.ts` (nueva) depende de un `usuario` sembrado y cae
en CI; con ella, R49 y R50 quedan sin test que corra.**
El `beforeAll` hace `prisma.usuario.findFirst(...)` y lanza «hay DATABASE_URL pero `usuario` esta
vacia» si no encuentra ninguno (líneas 75–79). La base de CI solo recibe `migrate deploy` +
`db:seed`, y `db:seed` «nunca siembra usuarios» (`.github/workflows/gate.yml`, líneas 179–187). El
archivo **no** está en `tests/baseline-rojos.json`, así que es un rojo nuevo de `gate-completo`. No
es la deuda de datos del baseline: es un test nuevo escrito contra ella, a pesar del precedente
SL-31 («Esta suite necesita crear su usuario en el test»).
Consecuencias para la trazabilidad:
- R49 (homónimos: gana el primero por `id`) y R50 (alta bajo padre retirado) se mapean solo a este
  archivo: hoy no los verifica ningún test que corra.
- R35 (la carga no escribe en `historial_accion`) se mapea a este archivo y a dos suites del baseline
  (`geografia-renombrado`, `geografia-registro-accion`): tampoco tiene un test que corra.
- R24–R26 y R33 conservan cobertura en otras suites verdes (`carga-division-service`,
  `division-csv`, `geografia-superadmin-sin-empresa`, `pais-repositorio`, `historial-plataforma-rls`),
  pero la prueba de base de «todo o nada» a mitad de escritura (R25/R51) también vive aquí.
Qué falta: que la suite cree y borre su propio superadmin, como ya hace
`geografia-superadmin-sin-empresa.test.ts` (`insertarUsuario(tx, await idDeRol(tx, "superadmin"),
null)` en `beforeAll` y `DELETE` en `afterAll`), y verla verde contra una base sin usuarios. Conviene
añadir a una suite verde, o a esta misma una vez arreglada, un caso de R35 propio de las escrituras
del superadmin (alta, renombre, retiro de nodo → cero filas nuevas en `historial_accion`).

**M2 — El E2E de aislamiento entre empresas no se corrió y su salida no está en la bitácora.**
SL-20 toca `lib/db/` (clasificación y excepciones), la RLS de toda la geografía, triggers sobre
`orden`, `zona_distrito` y `distrito_zona_especial`, y el alta de empresa. Por
`docs/checkpoints-proyecto.md > Flujos críticos`, una feature así corre `e2e/dos-empresas-humo.spec.ts`.
`CHECKPOINTS.md` pide además que la salida local quede en `progress/impl_<key>.md`.
`progress/impl_SL-20-T5.md` dice que `dos-empresas-humo.spec.ts`, `_dos-empresas-fixture.ts` y
`superadmin-empresas.spec.ts` se ajustaron (el alta ahora elige país) y que **no se corrieron**. La
decisión «E2E: no» del spec descarta un E2E **nuevo**, no correr los que ya existen. El CI solo corre
E2E en el PR a producción, así que nada lo verifica antes de entrar en `dev`.
Qué falta: correr `pnpm exec playwright test e2e/dos-empresas-humo.spec.ts` y
`e2e/superadmin-empresas.spec.ts` en local (o en un runner con memoria) y pegar la salida en
`progress/impl_SL-20.md`. Si la máquina no puede, el humano decide y queda anotado en
`progress/features/SL-20.md`.

### Menores

**m1 — `NIVEL_LABELS` («Provincia», «Cantón», «Distrito») sigue exportado en
`lib/types/geografia-nodo.ts:23` y no lo usa nadie.** El design §5 dice «Sale `NIVEL_LABELS`». Es
código muerto con los nombres de Costa Rica fijos, fuera del barrido de la guardia (que solo mira
`app/` y `components/`): cualquiera puede volver a importarlo sin que nada avise. Hay que borrarlo.

**m2 — R48, «tanto con la carga buena como con la inválida», solo está probado en la rama buena a
nivel de servicio.** `carga-division-service.test.ts` comprueba `avisos` con una columna de más en
un `ok`, y con `invalido` solo `avisos: []`. Con columna de más e `invalido` solo hay un test de UI
con la respuesta simulada. El código lo hace (`CargaDivisionService.ts:58`), pero falta el caso:
cabecera con columna extra + fila inválida → `invalido` con el aviso.

**m3 — `/plataforma/geografia` no pasó por `/design`** (`docs/perfil-agentes.md > frontend_dev`: «Una
pantalla NUEVA pasa por `/design`»). Ya está como pregunta abierta 3 en `progress/features/SL-20.md`.
Camilo debe decidirlo por escrito antes del merge; si acepta la pantalla tal cual, que quede anotado.

**m4 — Preguntas abiertas sin cerrar en `progress/features/SL-20.md`:** D15 sigue esperando la
confirmación de Carlos (pregunta 6, también citada en `progress/deudas.md`). La pregunta 2 (medir R13/R38
sin los triggers) también sigue abierta. Ninguna bloquea el código, pero D15 figura como «cerrada»
en `deudas.md` con la confirmación pendiente.

**m5 — La cabecera de `progress/features/SL-20.md` todavía dice `spec_ready`** y su `## Estado` habla
de F2.0, aunque la feature ya está implementada y en revisión. Es estado viejo en disco.

**m6 — La evidencia de integración de R30 vive solo en suites del baseline**
(`geografia-renombrado`, `geografia-cascada-reversible`), que no corren en verde. El flujo de retiro,
reactivación y renombre sí lo recorre `geografia-superadmin-sin-empresa.test.ts` (verde). Lo que no
cubre ninguna suite verde de base es «pedir el estado que ya tiene es éxito sin escribir». Esa deuda
es heredada (SL-31), pero conviene que el arreglo de M1 incluya ese caso.

## Veredicto

**RECHAZADO** — 2 mayores (M1, M2) y 6 menores.

Para la vuelta 2 bastan:
1. `carga-division.test.ts` con su propio superadmin y verde contra una base sin usuarios, con R49 y
   R50 corriendo y un caso de R35 en una suite que corra (M1).
2. La salida local de `e2e/dos-empresas-humo.spec.ts` y `e2e/superadmin-empresas.spec.ts` en
   `progress/impl_SL-20.md`, o la decisión escrita del humano de diferirlo (M2).
3. Recomendado: m1 y m2 (cambios pequeños).

## Review 2

Acotada a `370e34d..2609a25`: `497688e`, `2a478aa`, `33dbb24`, `ab81b55`, `7195370`, `f0cacac`,
`98255c0` y `2609a25`. Bitácoras: `progress/impl_SL-20-R1.md`, `progress/impl_SL-20-R2.md` y
`progress/impl_SL-20-design.md`. No usé el MCP del grafo: el diff es pequeño y Grep/Read bastaron.

### Verificación ejecutada (por el reviewer)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit`: exit 0.
- `pnpm exec eslint` sobre los archivos tocados: `app/(app)/plataforma/geografia/**`,
  `e2e/_superadmin-fixture.ts`, `lib/types/geografia-nodo.ts` y los 5 tests del diff. Exit 0, sin salida.
- `pnpm exec vitest run` de 4 archivos, todos en verde, 67/67:
  - `tests/components/GeografiaPlataformaAltaPais.test.tsx`
  - `tests/unit/components/geografia-plataforma-page.test.tsx`
  - `tests/unit/services/carga-division-service.test.ts`
  - `tests/unit/constants/paises-iso-3166-1.test.ts`
- Integración, en serie, contra `servi_logistic_sl20`: `carga-division.test.ts` y
  `geografia-superadmin-sin-empresa.test.ts` caen en `beforeAll` con «la base ya tiene un superadmin
  que no es de este test (SL-32 R27)». La causa es el entorno, no el código:
  - la corrida E2E de la decisión 12 dejó en esa base `superadmin-e2e@example.test`, 10 usuarios de
    empresa y 4 organizaciones `e2e-*`/`humo-*`;
  - la precondición `exigirSinSuperadmin` es la misma que ya exigen las suites de SL-32
    (`aislamiento-usuarios`, `arranque-superadmin`, …);
  - en CI la base de los shards de vitest es efímera: solo `migrate deploy` + `db:seed`, sin usuarios
    (`.github/workflows/gate.yml`, líneas 179–187);
  - la corrida verde 16/16 y 4/4 de `impl_SL-20-R1.md` es anterior al E2E (0 usuarios antes y después).

  Intenté reproducirla en un clon temporal de la base sin ese superadmin, pero la sandbox me impidió
  borrarlo (FK de `trusted_device`). El clon ya está borrado y `servi_logistic_sl20` no se tocó. Leí
  el código de la suite y casa con la bitácora (ver M1). Queda como menor n1.

### Cierre de los hallazgos de la review 1

| Hallazgo | Estado | Evidencia |
|---|---|---|
| **M1** | **Cerrado** | `carga-division.test.ts` ya no lee usuarios sembrados. En `beforeAll` hace `tomarLockDeSuperadmin` → `exigirSinSuperadmin` → `insertarUsuario(..., superadmin, null)` (líneas 90–98). En `afterAll` hace `DELETE` de su id y suelta el lock en un `finally` (116–119). Tiene un control de que el actor es el de la suite (124). R49 (286), R50 (270) y R35 tienen caso propio en esta suite: R35 con la carga (211) y con alta, renombre y retiro del superadmin (435). No hay entrada nueva en `baseline-rojos.json`. `geografia-superadmin-sin-empresa.test.ts` toma el mismo lock (lo pide el índice global `usuario_un_solo_superadmin`), así que las dos suites no chocan entre shards. |
| **M2** | **Cerrado** | Decisión 12 en `progress/features/SL-20.md`. La salida está en `impl_SL-20-R2.md §4`: `superadmin-empresas` 7/7 y `dos-empresas-humo` 6/6. El humo encontró un rojo real de SL-20: `altaDeEmpresaPorPantalla` no elegía país tras R9. Se arregló en `98255c0` (ver abajo) y la segunda corrida salió verde. |
| m1 | Cerrado | `NIVEL_LABELS` se borró de `lib/types/geografia-nodo.ts`. `tsc` en verde, sin imports colgando. |
| m2 | Cerrado | `carga-division-service.test.ts`: nuevo caso de una columna de más con una fila inválida que da `invalido` con el aviso y no llama a `importarDivision`. En verde. |
| m3 | Cerrado | Decisión 13. Auditoría en `impl_SL-20-design.md` y bloque «Decisión 13» (6 tests) en `geografia-plataforma-page.test.tsx`, en verde. |
| m4 | Cerrado en lo que toca al código | La pregunta 2 (R13/R38 sin triggers) la cierra la decisión 14: con los triggers apagados caen 4/5 y con ellos encendidos pasan 5/5 (`impl_SL-20-R2.md §3`), y la bitácora deja constancia de que se reencendieron. D15 sigue esperando a Carlos y, como pidió el leader, no cuenta como hallazgo de código. |
| m5 | Cerrado | La cabecera de `progress/features/SL-20.md` dice `in_progress` y `## Estado` dice F2.2. |
| m6 | Cerrado | `describe` «SL-20/R30» en `carga-division.test.ts` (463, 485). Mide el `ctid` sin cambios y cero filas de historial, con su contraprueba. Corre en una suite fuera del baseline. |

### Cambios nuevos: ¿rompen algo?

- **`e2e/_superadmin-fixture.ts`.** Elige «Costa Rica» en el combobox «País», igual que
  `superadmin-empresas.spec.ts`. Lo usa solo `dos-empresas-humo.spec.ts`. CR está disponible tras la
  migración (R44), así que el cambio es correcto y necesario.
- **Decisión 11.** `paisesPorDarDeAlta` filtra el catálogo por los ids de `paises`. El aviso de lista
  vacía distingue dos casos: todo el catálogo ya está dado de alta, o ningún país casa con lo escrito.
  - Test nuevo con 4 casos (búsqueda por nombre, por código, positivo y catálogo completo). La bitácora
    dice que, con el cambio deshecho, fallan 3 de 4.
  - El test del `conflict` se cambió a El Salvador. Sigue probando el `conflict` del servidor con dos
    sesiones a la vez, así que R42 no pierde cobertura.
- **Decisión 13.**
  - Los errores de lectura bajan como banderas (`paisesError`, `divisionError` →
    `cargaErrorInicial`). Ya no se pintan a la vez un error y un estado vacío.
  - Los formularios de alta y renombrado son `<form>` con `aria-labelledby`. El foco va al campo al
    abrir y vuelve al origen al cerrar, con `isConnected` como guardia.
  - La barra de búsqueda solo sale cuando hay división. El botón «Activar» pasa a `outline`.
  - Nada de esto cambia la lógica de servidor ni las actions.
  - Los tests de R20, R23/R42, R24/R25/R28/R48, R31 y R47 del mismo archivo siguen en verde.
- **Decisión 15.** Toasts en forma neutra: «Se dio de alta…», «Se retiró…», «Se devolvió…». No
  dejan ningún nombre de nivel fijo en el código.
- **Trazabilidad R1–R52.** Ningún `R<n>` pierde test:
  - el diff solo añade casos (R30, R35, R48, R42/D11, D13) y renombra uno (el `conflict`, R42);
  - el mapa de `progress/impl_SL-20.md`, completado con el de `impl_SL-20-R1.md`, sigue apuntando a
    archivos y casos que existen;
  - `tasks.md` no tiene ninguna casilla `[ ]`.
- **Dependencias.** No entra ninguna.

### Hallazgos

#### Mayores

Ninguno.

#### Menores

**n1 — `servi_logistic_sl20` quedó con los datos del E2E y la verificación de integración ya no se
puede repetir en esa base.**
- **Qué quedó.** `superadmin-e2e@example.test`, 10 usuarios de empresa y 4 organizaciones.
- **Por qué importa.** Las suites con `exigirSinSuperadmin` (las dos de SL-20 y las de SL-32) caen en
  `beforeAll` en esa base. En CI no afecta, porque la base es efímera y no comparte job con el E2E.
- **Qué falta en la bitácora.** `impl_SL-20-R2.md` no avisa de que el orden integración → E2E deja la
  base inservible para otra pasada de integración.
- **Qué se pide.** Antes de otra ronda de integración en local, limpiar la base o recrearla con
  `migrate reset` + `db:seed`, y dejar anotado en la bitácora que el E2E la ensucia.

**n2 — En `/plataforma/geografia` conviven dos vocabularios para el retiro.**
- **Dónde.** El botón de la fila es «Desactivar» (`aria-label`, `GeografiaAdminModule.tsx:710`) y la
  insignia dice «Inactivo» (371–374). La confirmación dice «Retirar del catálogo» / «Retirar»
  (598–599), y los toasts «Se retiró… / Se devolvió… al catálogo».
- **Estado.** La auditoría de diseño (punto 7) lo deja abierto. Los tests de R31 buscan el rótulo
  actual.
- **Qué se pide.** Lo decide el humano. No bloquea.

### Veredicto (review 2)

**APROBADO**: 0 mayores y 2 menores (n1, n2). M1 y M2 están cerrados con evidencia, y los seis
menores de la review 1 están cerrados o cubiertos por una decisión humana (m4/D15 depende de Carlos).
Antes del merge, el check `gate-completo` del PR tiene que salir verde en CI: este veredicto no lo
sustituye.
