# Review SLT-89 «Geografía jerárquica: zonas de la empresa sobre el nodo» — F2.2

- Fecha: 2026-11-10 · Reviewer (sin sub-agentes).
- Diff revisado: `origin/feature/SLT-46-geo-jerarquica-admin...fc30ef87` (144 archivos, +10 825 / −1 259).
  Es una pila de ramas: la base es SLT-46 «Geografía jerárquica: administración de países» (PR #107).
- Ruta: completa (`requirements.md` + `design.md` + `tasks.md`; complejidad alta, toca dinero y permisos).
- Base de pruebas: `logistic_slt89` (local, desechable), `--maxWorkers=1`, heap de 8 GB. Sin `./init.sh`
  completo y sin E2E local, por instrucción del leader.
- Grafo: el proyecto de este worktree no está indexado en `codebase-memory-mcp` («project not found»).
  Seguí con Grep/Read.

## Veredicto: RECHAZADO (solo por proceso; el código y los tests están bien)

No encontré defectos de código ni de trazabilidad. Lo rechazan dos puntos de CHECKPOINTS que siguen
abiertos: T9.2 sin marcar y los E2E sin ninguna corrida. Los dos se cierran sin tocar código (ver
«Qué falta para OK»).

## Verificación ejecutada por el reviewer

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` (heap 8 GB) | exit 0 |
| `eslint` sobre los .ts/.tsx añadidos o modificados | 0 errores, 2 avisos ajenos (`normalizeName` sin usar en `ZonaRepository`, ya en la base; `_args` en `cobertura.composition-root.test.ts`) |
| Integración nueva de SLT-89 (12 archivos: `zona-nodo-{asignacion,impacto,reconciliacion,rastro,dos-empresas,herencia}`, `grupo-nodo`, `grupo-cambio-concurrente`, `orden-nodo-mas-profundo`, `slt89-equivalencia-cr`, `migracion-slt89-ida-y-vuelta`, `slt89-migraciones-aditivas`) | 12/12 archivos, 68/68 tests |
| Suites existentes de R38 + contrato v1 (18 archivos: resolver, escritura y activación de tarifas, `tarifas-referencia`, `zona-*` de reconciliación, rastro, unicidad, grupos, costos, inactivos, central, pago, zona especial, `geo-consultas-zona`, `geo-lecturas-sin-backfill`, `zonas-action`, `tarifas-action`, `contrato-v1.route`) | 18/18 archivos, 298/298 tests |
| Unitarios y componentes del diff (27 archivos: los 11 de zonas, `TarifasGrupos`, `ZonasPage`, los 3 del selector, services, esquemas, `zona-repository`, censos de historial, guardias RLS / SQL a mano / escrituras cubiertas) | 27/27 archivos, 701/701 tests |
| Guardias relacionadas (14: `superficie-de-uso`, `geografia-lecturas-sin-nodo-fk`, `zona-reconciliacion-no-retarifa`, `tarifas-sin-escritura-vieja`, `etiquetas-geograficas-sin-literal`, `organizacion-en-modelos`, `fk-misma-empresa`, `unicos-por-empresa`, `e2e-sin-saltos`, `geografia-sin-cte-recursiva`, `zona-especial-punto-unico`, `geografia-dominio-puro`, `catalogo-postgres-acota-esquema`) | 14/14 archivos, 189/189 tests |
| `prisma migrate status` en `logistic_slt89` | «Database schema is up to date!» |
| `node scripts/tamano-pr.mjs` | **No aplica:** el script no existe en este worktree y `docs/gate.md` no tiene la sección «Tamaño del PR» (versión del arnés anterior a esa regla) |
| E2E (`zonas-nodo-canton`, los 3 adaptados, `dos-empresas-humo`) | **No corridos** (restricción de memoria; ver B2) |

## Checklist

### Especificación
- [x] `requirements.md` con R1–R48 en EARS; decisiones cerradas respetadas, incluidas las cuatro del 2026-11-10.
- [x] `design.md` con alternativas descartadas (§11, siete).
- [ ] **`tasks.md` con todo `[x]`: T9.2 sigue `[ ]`** → B1.
- [x] `design.md` abre con `## Lo que ya existe`, con la búsqueda y la tabla de reutilización. El diff
      no re-crea nada de esa lista: reutiliza `zonasCandidatas`/`zonaQueCubre`, `planificarReconciliacion`
      (con la foto opcional en vez de `contarPlan`), `filtrarArbolDeNodos` de SLT-46, `Modal`,
      `borrarGrupoDetalle` y `impactoZonaCentral`.

### Equipo
- [x] Assignee (Camilo) y rama de la feature (`progress/features/SLT-89.md`).

### Trazabilidad
- [x] Mapa R→test (R1–R48) en `progress/impl_SLT-89.md`. Lo contrasté test por test (abajo).

### Calidad de código
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: sin corrida todavía. Es el siguiente paso del leader; no lo marco como hallazgo.
- [ ] **Flujo crítico «aislamiento entre empresas» (la feature toca datos de negocio): el E2E existe, pero
      ninguna corrida tiene salida** → B2.
- [x] Sin dependencias nuevas (`package.json` no está en el diff).

### Seguridad y configuración
- [x] Sin secretos ni valores que cambien entre entornos. Ni webhooks ni recursos de Ordenex.
- [x] Sin literales de país, moneda ni método de pago en código nuevo. Los «SINPE» de `CrearZonaForm`
      son de la ficha 429 y solo se movieron con el rediseño; los nombres de nivel salen de `tipos` o de
      `useEtiquetasGeograficas`.

### Datos y seguridad (proyecto)
- [x] Tablas nuevas `zona_nodo` y `grupo_distritos_nodo`: `organizacion_id` con DEFAULT de empresa, RLS
      `FOR ALL TO servi_app` con USING y WITH CHECK, únicos que empiezan por `organizacion_id`, `sme_*`
      generados, `*_sin_cambio_de_empresa` y SL021 por país. Lo prueba `zona-nodo-dos-empresas.test.ts`
      (42501, SL017, SL021, 23505 y 23514).
- [x] Queries nuevas sobre negocio: por la extensión y la RLS. El SQL a mano de `bloquearGrupo` filtra por
      `current_setting('app.organizacion_id')`. Hay test con dos empresas: el caso R35 de
      `zona-nodo-dos-empresas` (cobertura, impacto y grupo por empresa).
- [x] Migraciones con `down.sql`. No editan migraciones ya aplicadas. Aditivas, con su guardia
      (`slt89-migraciones-aditivas`) y su ida y vuelta (`migracion-slt89-ida-y-vuelta`). No tocan la tabla
      `orden`: solo `CREATE OR REPLACE` del cuerpo de `orden_nodo_geografico`, que el down devuelve al
      cuerpo de SLT-43. La rama extra del trigger (el UPDATE que mueve el lugar sin tocar el nodo) está
      justificada y probada en `orden-nodo-mas-profundo`.
- [x] Sin `console.log` de PII.

### Arquitectura y permisos
- [x] Capas: actions → services → repositories. Zod en el borde: `impactoAsignacionZonaSchema` con tope de
      5 000 ids, `actualizarZonaSchema` con `antes` y los esquemas de grupos con `nombreAnterior`/`antes`.
- [x] Autorización en el servidor, con el rol mirado antes de cualquier lectura:
  - `GeografiaService.listarArbolDeZonas`, `ZonaService.actualizar` e `impactoAsignacion` (solo `maestro`);
  - `GrupoDistritosService`: escritura solo `maestro`, lectura `maestro` y `admin`.
  - Los tests usan dobles que lanzan si se tocan.
- [x] Sin módulo apagable: Zonas y Tarifas son núcleo (design §7).

### Puntos que pidió el leader
- [x] **R38, aserciones cambiadas.** Revisé `git diff` de los 72 tests y e2e modificados. Solo encontré
      cambios de entrada («antes», `ZonaRepositoryConAntes`, `antesDeMiembros`/`antesDeBorrar`), los
      `toHaveBeenCalledWith` autorizados por T5.6 (renombrar, miembros y borrar, en `tarifas-action`,
      `grupo-distritos-service` y `TarifasGrupos`), el 3→4 del resolver (decisión del 2026-11-10), los
      censos (+2 tablas, +2 `sme_*`, +1 tipo de enum, autorizados por el leader), la forma del árbol en
      los tests de componente y los botones de la maqueta. Los tres reescritos fuera de la lista
      (`geografia-selector-zona-ocupada`, `geografia-selector-inactivos`, `ZonaDistritoEspecial`):
  - no son tests de integración de los flujos de R38;
  - la cascada que afirmaban la descarta el design (§8.1, §11.3), y `permitirEspecial` lo retiran §8.1 y R8;
  - los casos de 374 (retirados preseleccionados, que responden al clic, que se mandan al guardar y la
    búsqueda con dos espacios) se conservan con su mismo título.

  Ver la decisión D1.
- [x] **Aislamiento.** RLS, misma empresa y país en la base; caso R35 de integración; el E2E (3) lo cubre
      de punta a punta, pero sin corrida (B2).
- [x] **Cambio concurrente y «antes».**
  - Zona: `FOR UPDATE` de la fila; compara distritos + nodos con `mismoConjunto` antes de la primera
    escritura. Sin «antes», el service responde antes de leer, también si se salta la action con un cast.
  - Grupos: `FOR UPDATE` del grupo en renombrar, fijar y borrar. Borrar compara nombre, miembros de las
    dos tablas y número de valores.
  - Probado en `zona-nodo-asignacion` (R16), `grupo-cambio-concurrente` (R43–R46), `zona-service`,
    `grupo-distritos-service` y `tarifas-action`.
- [x] **Migraciones aditivas con down.sql y sin tocar `orden`** (arriba).
- [x] **Solo `maestro`** (arriba).
- [~] **Accesibilidad.**
  - Modal: el `Modal` compartido, con `aria-labelledby`/`describedby` y foco atrapado.
  - «Sí, guardar» con `confirmDisabled` hasta tener las cifras; las cifras en `section aria-label` +
    `aria-live`.
  - Aviso de cambio concurrente en `role="status"` `aria-live` fuera del modal.
  - Árbol con `ul/li` anidadas, botón de plegar con `aria-expanded` y casillas con nombre accesible.
  - Un detalle menor en m1.

## Trazabilidad R → test (contrastada)

Los tests citados existen y afirman lo que el requisito pide. Para cada caso leí el título y las
aserciones; las suites las corrí arriba.

| R | Test | Nota del reviewer |
|---|---|---|
| R1, R3, R4 | `zona-nodo-asignacion` (R1: crear y guardar con cantón, profundidad 4 y provincia, «exactamente esos»; R3: los dos órdenes; R4: inexistente, otro país y distrito → `nodo_invalido` sin escribir; retirado sí) | ok |
| R2 | `zona-nodo-asignacion` (conflicto nombrado; carrera por el índice → `conflictos: null`); `zona-service` (mensajes ordenados en `nodoIds`) | ok |
| R5 | `zona-schemas`; `zona-nodo-asignacion` (por la action, sin escribir) | ok |
| R6, R7, R9 | `zona-nodo-herencia` (v1, v2, carga masiva, cotización v1/v2, cobertura, árbol, filtros por zona, «sin zona» igual que hoy, profundidades de SLT-45) | ok |
| R8 | `zona-nodo-herencia` (marca heredada a profundidad 4); guardia `tarifas-sin-escritura-vieja`; `ZonaDistritoEspecial` (el selector no ofrece la marca); grep del diff: ninguna escritura a `distrito_zona_especial` | ok |
| R10, R11 | `zona-nodo-reconciliacion` (excepciones, estante, cierre, gestión final, un lote; cantón que sale; idempotente) | ok |
| R12 | `ZonaGuardadoConfirmacion` (inválido sin modal ni llamadas; entran y salen con nivel y padre; «Volver» no escribe); `ZonaCentralConfirmacion` (texto de la 376 intacto) | ok |
| R13 | `ZonaGuardadoConfirmacion` (cifras; bloqueado hasta tenerlas; un fallo no desbloquea); `zona-nodo-impacto` | ok |
| R14, R15 | `zona-nodo-impacto` (sin escrituras: filas y zonas iguales tras el aviso; el guardado da las mismas cifras; tarifa con y sin activar) | ok |
| R16 | `zona-nodo-asignacion`, `zona-schema`, `zona-service`, `zonas-action`, `ZonaGuardadoConfirmacion` | ok |
| R17–R21 | `grupo-nodo` (R19/R20 con distrito > cantón > provincia y sin distrito → `null`; R21 asignado ↔ heredado y salida con historial, también con solo distritos); `grupo-distritos-service` | ok |
| R22 | `TarifasGrupos` (las cuatro escrituras: inválido sin modal; antes → después; «Volver» no llama; padre también sin árbol); `tarifas-referencia` y `grupo-nodo` (el servidor manda el padre) | ok |
| R23 | `TarifasGrupos` (árbol a todas las profundidades, bloqueado en otro grupo, marca de solo lectura); `grupo-nodo`; `tarifas-pantalla-service` | ok |
| R24–R27 | `geografia-selector-n-niveles` (+ los dos adaptados) | ok |
| R28, R29 | `orden-nodo-mas-profundo` | ok |
| R30 | `zona-nodo-rastro` (lote propio; añadido y quitado; raíz sin padre; sin cambios no escribe; crear no deja filas) | ok |
| R31 | `grupo-nodo`, `zona-nodo-rastro` | ok |
| R32 | `slt89-migraciones-aditivas` | ok |
| R33 | `migracion-slt89-ida-y-vuelta` | ok |
| R34 | `zona-nodo-dos-empresas` | ok |
| R35 | `zona-nodo-dos-empresas` (caso T6.1); `e2e/zonas-nodo-canton` (3) | el E2E sin corrida (B2) |
| R36 | `zona-service` (guardar e impacto); `geografia-service` (árbol) | ok |
| R37 | `grupo-distritos-service`; `tarifas-pantalla-service` | ok |
| R38 | `slt89-equivalencia-cr` + suites existentes (298/298 verdes aquí) | ok; ver D1 |
| R39 | Guion de T6.3 para una persona sobre una copia de producción | correcto: ningún agente lo corre; la salida va al PR |
| R40 | `contrato-v1.route` (modo comparar), verde | ok |
| R41 | `e2e/zonas-nodo-canton` (cantón + aviso + confirmar; orden con zona y flete; B sin zona ni cobertura); `dos-empresas-humo` | existe; **sin corrida** (B2) |
| R42 | Revisión del diff: no hay cambios en filtros ni exportes, FK viejas, regla de profundidades de SLT-45, modelo viejo de tarifas ni grupo de la orden sin distrito | ok |
| R43–R46 | `grupo-cambio-concurrente`, `grupo-distritos-service`, `tarifas-action`, `TarifasGrupos` | ok |
| R47 | `TarifasGrupos` (renombrar, lugares y borrar: cierra, `aria-live` y recarga) | ok |
| R48 | `cf715317` (14:49, referencia y «aprobada el 2026-11-10») es anterior a `3534e676` (15:16, primer commit de T7) | ok |

## Desvíos declarados por el implementer (contrastados)

| Desvío | Juicio |
|---|---|
| `nodoIds` `.optional()` en zona (el design dice `.default([])`) y `ZonaDTO.nodosCount` opcional | Aceptable. El service solo reenvía `nodoIds` si hay alguno; protege R38 sin tocar fábricas |
| Sin `contarPlan`: `planificarReconciliacion` gana una `foto` opcional | Aceptable y mejor para R15: el aviso y el guardado usan la misma función. No toca la guardia `zona-reconciliacion-no-retarifa`. Probado en `zona-nodo-impacto` |
| `distritosDeLaZona` no se renombra a `nodosCubiertos` | Aceptable (semántica en la interfaz; menos churn de dobles) |
| `nodosDeZona` → `null` con zona de solo distritos | Aceptable: sin él caían 17 casos de `tarifas-referencia`. La respuesta de CR queda idéntica |
| Archivos extra de T3.7 (`geo-consultas-zona`, `geo-lecturas-sin-backfill`) | Solo entrada (`ZonaRepositoryConAntes`); comprobado en el diff |
| Tres tests reescritos por T7.1, §8.1 y §11.3 | Ver D1 |
| Insignia «Precio de pacto especial» omitida | Correcto: SLT-54 R44 lo prohíbe y tiene test (`TarifasGrupos` › R44) |
| Rótulo «cambian de zona» en vez de «cambian a Zona Oeste» | Correcto según R13; la maqueta sería falsa para las órdenes que salen hacia otra zona. Ver D2 |
| `@sin-superficie` (deuda) en `listarArbolGeografico` | Aceptable; falta anotarla en `progress/deudas.md` (m4) |
| Rama extra en el trigger de `orden` | Correcta y necesaria para R29 (borrado de un distrito); probada |
| Migraciones con timestamp `20261110130000`/`…130100` (choque con `dev`) | Correcto; tasks y design actualizados |

## Hallazgos

### B1 — BLOQUEANTE (proceso): T9.2 sin marcar en `tasks.md`
CHECKPOINTS > Especificación exige todas las tasks en `[x]`. De lo que pide T9.2:
- ya está hecho: el mapa R1–R48; R42, R48 y que T3.7/T5.6 solo ganan «antes», todo comprobado aquí;
- falta: «`./init.sh` verde».

**Para cerrarlo:** `./init.sh` rápido en verde. Si en esta máquina muere por memoria, vale
`gate-completo` en CI, según la regla vigente del humano «gate en CI». Después, marcar T9.2 con la
salida citada en la bitácora.

### B2 — BLOQUEANTE (proceso): los E2E no se corrieron nunca
- `e2e/zonas-nodo-canton.spec.ts` es nuevo (323 líneas) y se adaptaron `zonas-crear-sin-costos`,
  `zona-especial-dos-empresas` y `tarifas-activacion`.
- CHECKPOINTS > Flujos críticos y `docs/checkpoints-proyecto.md` (aislamiento: «una feature que toque datos
  de negocio … lo corre») piden su salida.
- R41 pide además que `dos-empresas-humo` siga verde. No hay ninguna corrida.
- Ojo: el PR de esta rama apunta a la rama de SLT-46, no a `dev`, así que `gate.yml` no lo lanza solo.

**Para cerrarlo:**
1. Lanzar `gate.yml` por `workflow_dispatch` sobre `feature/SLT-89-geo-jerarquica-zonas`: corre el
   gate-completo y los grupos E2E; `aislamiento` incluye `zonas-nodo-canton` y `dos-empresas-humo`.
2. Pegar el resultado en `progress/impl_SLT-89.md`. Si algo cae, vuelve al implementer.

### m1 — menor (accesibilidad): el estado de herencia no llega al lector de pantalla
En `GeografiaSelector.tsx` (líneas 143-163) la casilla lleva `aria-label`, que reemplaza al texto del
`<label>`. Quien usa lector oye «Seleccionar distrito Escazú, marcada, no disponible», sin el porqué:
- «hereda de Zona Oeste por Escazú»;
- «Excepción · va a Zona Sur».

Solo «(zona: X)» de otra zona va en el nombre. Arreglo sugerido: `aria-describedby` hacia el
`TextoDeEstado`.

### m2 — menor (robustez): la cobertura de un miembro se valida fuera de la transacción del grupo
`GrupoDistritosService` comprueba cobertura y «otro grupo» (`distritosInvalidos`) antes de
`repo.crear` y `repo.fijarDistritos`, fuera de su transacción y sin el candado de la zona. Si un
guardado de zona quita la cobertura entre las dos, `grupo_distritos_nodo` queda con un miembro sin
cubrir:
- no hay FK que lo impida (design §2.2, a propósito);
- `ZonaRepository.update` normaliza solo lo que ya existía.

Es raro, lo escribe solo el `maestro` y el resolver lo toleraría (el miembro más cercano sigue siendo
de esa zona). Sugerencia: volver a comprobar la cobertura dentro de la transacción, bajo el
`FOR UPDATE` del grupo. Si no, anotarlo como deuda.

### m3 — menor (consistencia): el `FOR UPDATE` de la zona no filtra por empresa
`ZonaRepository.update`, línea 1007: `SELECT "id" FROM "zona" WHERE "id" = ${id} FOR UPDATE`. La RLS lo
acota, porque la app corre como `servi_app`. Pero `bloquearGrupo` sí añade
`organizacion_id = current_setting(...)` por la regla SL-17 R25, y aquí la guardia
`sql-a-mano-por-empresa` no lo caza: mide por archivo y `ZonaRepository` ya nombra `organizacion_id` en
otro sitio. Mismo patrón que el `FOR UPDATE` de SINPE ya existente. Sugerencia: añadir el filtro por
simetría.

### m4 — menor (deuda sin anotar): `listarArbolGeografico`
Queda sin llamador, con `@sin-superficie` «deuda … para SLT-48», pero no está en `progress/deudas.md`.
Anotarla con su ficha.

### m5 — menor (registro): `progress/features/SLT-89.md`
- En «Decisiones», la línea del 2026-11-09 («arranca 89, ignora…») quedó partida por la del 2026-11-10
  (líneas 24-26).
- «Estado» sigue diciendo «maqueta … sin aprobar».

Lo corrige el leader.

### m6 — nota: tamaño del PR
`scripts/tamano-pr.mjs` no existe en este worktree, así que no hay umbral que aplicar. El diff es
grande (144 archivos), pero «¿Partir la tarjeta? No, una sola» es una decisión cerrada del humano.

## Decisiones para el humano

- **D1 — Ratificar los tres tests reescritos fuera de la lista del leader**
  (`geografia-selector-zona-ocupada`, `geografia-selector-inactivos`, `ZonaDistritoEspecial`).
  - Recomiendo ratificar. La cascada distrito a distrito (SLT-75 R16/R17) y `permitirEspecial` los retira
    el design aprobado (§8.1, §11.3, R8).
  - No son tests de integración de los flujos de R38.
  - Los casos de 374 sobre retirados se conservan intactos.
- **D2 — Ratificar el rótulo «cambian de zona»** (la maqueta decía «[N] cambian a Zona Oeste»). Recomiendo
  ratificar: es el texto de R13, y «a Zona Oeste» sería falso para las órdenes que salen de la zona.
- **D3 — m2:** ¿se corrige ahora (volver a comprobar la cobertura dentro de la transacción del grupo) o se
  anota como deuda?

## Qué falta para OK

1. B2: corrida de `gate.yml` por `workflow_dispatch` sobre la rama, con E2E (`aislamiento`, que incluye
   `zonas-nodo-canton` y `dos-empresas-humo`, y los grupos de los tres E2E adaptados) en verde, y su
   salida en la bitácora.
2. B1: `./init.sh` rápido, o `gate-completo` de esa misma corrida, en verde, y T9.2 marcada.
3. Si la corrida queda verde y no cambia código, la vuelta 2 se limita a comprobar esas dos cosas.

## Vuelta 2 (acotada a c93db97c..20714c9f)

Fecha: 2026-11-10. La revisión se limita a los hallazgos de la vuelta 1, los dos arreglos de CI y lo que
quedaba de T9.2.

### Verificación de esta vuelta
- **CI** [run 42913893905](https://github.com/Singularis-org/servi_logistic/actions/runs/42913893905),
  lanzado con `workflow_dispatch` sobre `feature/SLT-89-geo-jerarquica-zonas` @ `e1e243e4`: todos los
  jobs en `success`. Lo comprobé con `gh run view`:
  - `estatico`, los 3 shards de vitest y `gate-completo`, que da «sin rojos nuevos (239 rojos, todos en
    el baseline de 245)»;
  - `e2e (aislamiento)`: 89 passed, entre ellos `zonas-nodo-canton` (1)(2)(3), `dos-empresas-humo`,
    `zona-especial-dos-empresas` y `zonas-crear-sin-costos`;
  - `e2e (dinero)`: 49 passed, con `tarifas-activacion`; `e2e (reparto)`: 16 passed; `e2e`.
- **Después de `e1e243e4`** solo cambia `progress/features/SLT-89.md`, así que la corrida vale para HEAD.
- **Local** (`logistic_slt89`, `--maxWorkers=1`): 16 archivos, 252/252 en verde:
  - integración: `grupo-nodo`, `slt46-nodo-copia-vieja`, `geo-explain-analitica`, `grupo-cambio-concurrente`, `zona-nodo-herencia`, `zona-nodo-asignacion`, `slt89-equivalencia-cr`, `tarifas-flexibles-escritura`, `tarifas-flexibles-resolver`, `geo-equivalencia-consultas`;
  - actions: `tarifas-action`;
  - unitarios: `geografia-selector-n-niveles`, `grupo-distritos-service`;
  - guardias: `sql-a-mano-por-empresa`, `superficie-de-uso`, `geografia-lecturas-sin-nodo-fk`.
- **eslint** sobre lo tocado en la vuelta: 0 errores, 1 aviso que ya estaba en la base.

### Hallazgos de la vuelta 1
| Hallazgo | Estado | Comprobación |
|---|---|---|
| B2 E2E sin corrida | **Cerrado** | El run de arriba: el E2E nuevo, los tres adaptados y `dos-empresas-humo` en verde |
| B1 T9.2 | **Cerrado en el fondo; falta la marca** | El gate está verde (run de arriba). R42: el diff de la vuelta no toca filtros, exportes, FK viejas, la regla de SLT-45 ni el modelo viejo. T3.7/T5.6 solo ganan el «antes», como se comprobó en la vuelta 1, y la vuelta no los toca. La casilla de `tasks.md` queda sin marcar: ese archivo está fuera de mi alcance de escritura (solo `progress/review_<key>.md`). La marca el leader citando el run 42913893905 |
| m1 accesibilidad | **Cerrado** | `aria-describedby` hacia el texto de estado, con `useId`. El test nuevo `toHaveAccessibleDescription` cubre hereda, excepción y otra zona; lo elegido queda sin descripción |
| m2 cobertura en la transacción | **Cerrado** (D3) | Detalle debajo de la tabla |
| m3 `FOR UPDATE` por empresa | **Cerrado** | Filtro `organizacion_id = current_setting(...)`. Quitar `ZonaRepository.ts` de `EXCEPCIONES_SQL_A_MANO` lo exige la guardia, cuya lista solo baja; la guardia pasa |
| m4 deuda | **Cerrado** | D47 en `progress/deudas.md`, citada en el `@sin-superficie` |
| m5 registro | **Cerrado** | Estado y decisiones al día en `progress/features/SLT-89.md` |
| D1–D3 | Decididos | Están en `requirements.md > Decisiones cerradas`; D1 es la cuarta excepción de R38 |

Detalle de m2:
- La cobertura se vuelve a comprobar dentro de la transacción de `crear` y de `fijarDistritos`.
- Antes se toma `FOR SHARE` sobre la zona, filtrado por empresa, y después `FOR UPDATE` sobre el grupo.
  Es el mismo orden que el guardado de zona (zona y luego grupo), así que las dos no se esperan en cruz.
- Un miembro que ya no está cubierto responde el mismo error de R18 sin escribir nada.
- Sin miembros heredados no se carga el catálogo (R38).
- El test nuevo de `grupo-nodo` reproduce la carrera y no deja grupo, miembros ni historial.

### Arreglos de la corrida de CI anterior (42907373831)
- **`geo-explain-analitica` (8e95e91b): correcto.**
  - El conteo de `zona_nodo` viaja en la misma consulta de `organizacion` (`_count`, una subconsulta),
    con la RLS de `zona_nodo`.
  - Con 0 filas no se lee la tabla, así que una empresa de solo distritos hace las mismas consultas que
    antes de SLT-89 (R38) y no se tocó ninguna aserción. Un doble sin `_count` cae en leer la tabla.
- **`slt46-nodo-copia-vieja` R44 (c8c3d940): limitado a lo autorizado.**
  - Cambia el extractor del cuerpo esperado de `orden_nodo_geografico`, que pasa a leerse de
    `20261110130000_slt89_zona_nodo`, y el título del caso.
  - El cuerpo de `zona_nodo_geografico_del_distrito`, los triggers y las FK se siguen comprobando contra
    SLT-43, como dice la decisión (quinta excepción de R38).

### Menores nuevos
- **n1 — menor (docs): el guion de R39 quedó desfasado.** Con 8e95e91b la carga del catálogo ya no suma
  ninguna consulta para una empresa de solo distritos. Pero el guion de T6.3 en `progress/impl_SLT-89.md`
  («Esperado: +1 consulta en la carga del catálogo») y `design.md` §9 siguen esperando +1. Solo queda el
  +1 por lote del resolver. Conviene corregirlo antes de que la persona corra
  `pnpm geo:equivalencia-consultas`, para que no lo lea como diferencia.
- **n2 — nota (sin acción en SLT-89):** al salir `ZonaRepository.ts` de `EXCEPCIONES_SQL_A_MANO`, la
  guardia, que mide por archivo, deja de ver el `FOR UPDATE` de `guardarSinpe` (línea ~1617, ficha 429),
  que no filtra por empresa. Ese bloqueo es anterior a SLT-89 y la RLS lo acota. Si se quiere, otra ficha
  puede filtrarlo como el resto.

### Veredicto de la vuelta 2: OK
No queda ningún bloqueante de código, tests ni CI. Queda una condición de proceso: el leader marca T9.2
en `tasks.md` citando el run 42913893905, porque el reviewer no escribe fuera de este archivo. n1 se
puede corregir en el mismo commit.
