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
