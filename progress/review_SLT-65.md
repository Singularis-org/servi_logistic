# review SLT-65 «Geografía jerárquica: consultas de órdenes, cierres y zonas sobre el nodo»

Reviewer, F2.2, 2026-11-03. Alcance: solo el diff propio de SLT-65, `ff1ed16f..HEAD` (`ff1ed16f` es el
merge de `feature/SLT-44` en esta rama; desde ahí no entra ningún otro merge). Son 18 commits, de
`b2bade45` a `49b23e2b`, y 56 archivos.

Ya aceptado por el humano, así que no cuenta como hallazgo:
- T8.3 se cerró con excepción: hay un costo fijo de unos 4-5 ms por cada lectura del catálogo;
- T9 no se ejecuta;
- el cupo backend va 4/3;
- los 5 literales de test se enmendaron por decisión humana (2026-10-31 y 2026-11-03).

## Verificación ejecutada por el reviewer

| Qué | Resultado |
|---|---|
| `pnpm run typecheck` | exit 0 |
| `eslint` sobre los `.ts` del diff | 0 errores, 2 warnings. Los dos ya estaban antes: `normalizeName` sin uso en `ZonaRepository.ts:16` ya existía en `ff1ed16f`, y `_args` está en un test. |
| `pnpm run test:guardias` | `1 failed / 324 passed / 3 skipped`. Las 4 rojas son de `dependencias-declaradas-presentes`, que está en `tests/baseline-rojos.json`. |
| Unit: guardias, `zona-repository`, `lugar-orden`, `cierre-dia-repository`, `orden-repository.api-lectura`, `no-regresion-106` | Las únicas rojas son las de la baseline de arriba. |
| Integración SLT-65 (Postgres local) | 11 archivos, `70 passed`, ninguno saltado. Son: `geo-consultas-{ordenes,cierre,conteo,zona}`, `geo-equivalencia-consultas`, `geo-explain-consultas`, `geo-lecturas-sin-backfill`, `geo-65-fixture`, `zona-especial-dos-empresas`, `cierre-detail-congelado` y `asimetria-sin-tarifa`. |
| Integración existente (R8, R14, R16, R18, R27) | `219 passed`, `3 skipped` y 9 rojas, por dos causas. 8 son de `geografia-ordenes-sin-entregar`: está en la baseline y falla en la preparación (`referencia a otra empresa`). 1 es de `geografia-superadmin-sin-empresa`, que se corta en la precondición «la base ya tiene un superadmin»: es el estado de la base local, no el código (ver m6). Entre las verdes están `zona-reconciliacion-ordenes`, `zona-central-guarda-y-rastro`, `zona-pago-mensajero-rastro`, `zonas-action`, `geo-nodo-rls`, `geografia-dos-paises`, `cierre-iva-aparte-sl39`, `cierres-admin-service` y `geo-equivalencia-dinero`. |
| `./init.sh` | Se corta en el paso 3 por el cupo backend 4/3, que es la excepción humana. Los pasos que vienen detrás no corren (ver m1). |
| T1.2, copia literal | Comparé con `b2bade4` dos funciones, `findBaseCobroDevolucion` y `leerDescriptivosDeOrdenes`. Solo cambian el `this.prisma` por `cliente` y la cabecera. |
| MCP del grafo | No lo usé. Trabajé con Grep, Read y `git diff`. |

## Checklist

### CHECKPOINTS.md
- [x] `requirements.md` con R1–R28 en EARS.
- [x] `design.md` con alternativas descartadas (§15).
- [ ] `tasks.md` con todas las tasks `[x]`. Faltan T8.2 (ver m1) y T9.1 y T9.2. T9 no aplica por decisión humana.
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada de esa lista: reutiliza `geografia-dominio`, `CatalogoGeograficoRepository`, `zona-colapso` (vía `zonaQueCubre`) y `crearClienteDeSoloLectura`. `compararPorId` se extrae y no se copia.
- [x] Assignee (Camilo) y rama creada con `wt.sh`.
- [x] Cada R1–R28 mapea a un test concreto, y el mapa está en `progress/impl_SLT-65.md` (§«Mapa R → test (R1–R28)»). Leí los casos: cada uno afirma lo que dice. R26 y R28 se cubren con comprobaciones de diff, y las repetí:
  - en `db/` no hay cambios;
  - `lib/db/` solo trae `excepciones-aislamiento.ts`;
  - los filtros y nombres de §2.2 no se tocan.
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente, es una condición de merge.
- [ ] E2E de los flujos críticos con su salida local en el impl. La feature toca cierres y `lib/db/`. Por decisión humana («¿E2E nuevo? No») se delega en los E2E existentes, que corren en CI (ver m5).
- [x] Sin dependencias nuevas.
- [x] Sin secretos ni valores de entorno hardcodeados. Los scripts solo corren contra localhost y su conexión es `default_transaction_read_only=on`.
- [ ] `./init.sh` en verde: se corta en el cupo (m1).
- [x] Este archivo existe.
- [ ] El `Cierre` de `progress/features/SLT-65.md` y el desmontaje del worktree se hacen después del merge.

### docs/checkpoints-proyecto.md
- [x] Sin tablas ni migraciones nuevas.
- [x] Las queries nuevas de negocio se acotan por empresa: `deLaEmpresa` toma la empresa del contexto, y si no la hay lanza `EmpresaNoResuelta` (R4). Hay test con dos empresas en `geo-consultas-zona` R17, `geo-consultas-cierre` R17 y `zona-especial-dos-empresas`. El conteo en plataforma es la excepción que pide R12, y tiene su test.
- [x] Nada de Ordenex. Los `console.log` solo están en los scripts y sacan cifras e ids. R24 tiene test de que no salen datos personales.
- [x] Capas: el acceso a datos está en `lib/repositories/` y el dominio en `geografia-dominio`.
- [x] Sin literales de país ni de moneda en el código nuevo. El país del doble de test es `"XX"`.
- [x] Permisos: no cambian.

### docs/perfil-agentes.md > reviewer
- [x] Ninguna query de negocio queda sin empresa, ninguna tabla sin RLS y ninguna migración sin `down.sql` (no hay migraciones).
- [x] Sin literales CR, colones ni SINPE, y sin recursos de Ordenex.
- [x] Sin dependencias nuevas.
- [x] Los comentarios explican el porqué. Por ejemplo, el de `whereLugarEn` dice por qué no usa `COALESCE`, y el de `sinTransaccionAnidada` explica el `newTxId`. Hay un comentario desfasado (m2).

## Puntos que pidió el leader

1. **Trazabilidad R1–R28.** Completa. Las suites nuevas tienen antivacío y contraprueba: marca inyectada en un cantón (R1, R5 y R22), cadena incoherente (R11 y R23), INSERT que falla con 25006 (R24) y +19 % / +21 % / Seq Scan (R25).
2. **Los 5 literales enmendados.** Ninguno pierde fuerza:
   - Guardia `zona-reconciliacion-no-retarifa`. Sigue fallando con entrada vacía: `fallosDeLaReconciliacion("")` devuelve «no contiene el `orden.updateMany(`», y ese detector no cambió. `cuerpoDePlanificarReconciliacion` lanza si la función no existe o si no cierra. El antivacío exige `planificarReconciliacion(` en `update`, y `orden.findMany(` y `orden.count(` en el plan. Además gana fuerza: comprueba que el plan no escribe en ningún modelo (`escriturasDelPlan`, con su contraprueba) y que no nombra ninguna tabla de dinero.
   - `zona-repository.test.ts`. Mantiene las dos aserciones de la unión (el conjunto y la longitud 3). Ahora se leen de la llamada que de verdad lleva los lugares. `BASE_D1_ZA` queda escrito literal con la forma de `whereLugarEn`.
   - `emisor-relaciones-anidadas`: 0 lecturas de `provincia` y 2 de `zona`, con su explicación. Conserva el antivacío, `maximoEnVuelo() = 1` y una sola conexión.
   - `gestiones-detalle-api-405`: lectura de calentamiento, después 12 consultas en caliente y la comparación con y sin gestiones sobre la misma base. La lista nombrada se sigue comparando con `toEqual`.
   - Los dos literales de `select` en `orden-repository.api-lectura` y `api-pdf-etiqueta-columna-intacta` siguen afirmando que la relación `distrito` no viaja.
   - Los dos de integración (`emisor` y 405) **no se pudieron medir en local**, porque están en la baseline (m3).
3. **Las dos excepciones de plataforma** de `lib/db/excepciones-aislamiento.ts` son aceptables. Las dos son scripts de consola que no entran al build, rechazan cualquier `DATABASE_URL` que no sea localhost (salida 2, con test `esBaseLocal`) y se conectan con `default_transaction_read_only=on` (test 25006). Cada una tiene su motivo y su ficha. La lista solo la consume la guardia `plataforma-solo-en-lista`, que está en verde, y ninguna ruta de la app.
4. **El rodeo `sin-transaccion-anidada.ts`** es correcto y está acotado:
   - Es un `Proxy` que solo oculta `$transaction`.
   - Se aplica en los dos únicos sitios que cargan el catálogo sobre un `tx`: `leerDescriptivosDeOrdenes` y `ZonaRepository.update`.
   - `OrdenRepository` nunca se construye sobre un `tx` en `lib/` ni en `app/`.
   - Hay test de regresión con el cliente extendido real: `zona-especial-dos-empresas` «SLT-65 R17…», que pasa.
   - El arreglo de raíz sigue pendiente en SLT-44 (m4).
5. **Dinero.** R3 y R5 se prueban fila a fila contra la copia de `b2bade4`: costeo de la API, importes del listado, cobro de la devolución, corrección y congelado del cierre. La equivalencia del script da 0 sobre el fixture y sobre 10 000 órdenes sintéticas. `congeladoDeLaFila` conserva el orden de evaluación de `descriptivoDe`. Con marcas solo en distritos, la orden sin distrito congela la marca del cantón, que es `false`, el mismo valor de antes.

## Hallazgos

### Bloqueantes
Ninguno.

### Menores
- **m1 (menor). T8.2 sin marcar, y `./init.sh` no pasa del paso 3** por el cupo 4/3, que es la excepción humana. Los pasos de después (`vitest related` y el perfil) no corren en local. Los cubrí con typecheck, lint del diff, todas las guardias y las suites relacionadas (tabla de arriba). Qué falta: el leader anota en `tasks.md` que T8.2 queda cerrada por la excepción del cupo, o se repite `./init.sh` cuando se libere el cupo (al mergear SLT-43 o SLT-44).
- **m2 (menor). `tests/integration/db/emisor-relaciones-anidadas.test.ts:250`.** El comentario «Y las SEIS consultas salieron por la MISMA conexion» ya no es cierto: con la carga del catálogo son más. La aserción (`conexionesUsadas() = 1`) sigue bien. Solo hay que corregir el comentario.
- **m3 (menor, condición de merge). Los literales nuevos de `emisor-relaciones-anidadas`** (0 de `provincia`, 2 de `zona`) **y de `gestiones-detalle-api-405`** (12 en caliente) **no se han medido nunca.** Los dos archivos están en la baseline y no corren con datos en local, así que salen del código y no de una medición. Cuando corran con semilla (CI con semilla o SL-31), hay que confirmarlos.
- **m4 (menor). El arreglo de raíz del `newTxId`** (`{ ...OPCIONES_TRANSACCION }` en `CatalogoGeograficoRepository.enUnaFoto`, que es de SLT-44) solo consta como ABIERTO en `progress/features/SLT-65.md`, no en `progress/deudas.md`. Mientras no se aplique, cualquier repositorio nuevo que cargue el catálogo sobre un `tx` sin `sinTransaccionAnidada` vuelve a romper la siguiente transacción. Qué falta: aplicarlo en SLT-44 antes de su merge, o anotarlo en `deudas.md`.
- **m5 (menor, condición de merge). E2E.** Por decisión humana la feature no deja un E2E nuevo, y en el impl no hay salida local de E2E. Antes de mergear tienen que estar en verde en CI `gate-completo` y `e2e`, y en particular los E2E de cierres y dinero. Como el diff toca `lib/db/`, también `dos-empresas-humo`.
- **m6 (menor). `geografia-superadmin-sin-empresa.test.ts`** (T3.4 dice que «pasa sin cambios») se corta en local en la precondición «la base ya tiene un superadmin que no es de este test». No está en la baseline, y el corte es del estado de la base local, no del diff. Hay que confirmarlo en CI. Además, `geografia-ordenes-sin-entregar` está en la baseline, así que en local la equivalencia del conteo con «hoy» (R11) solo la sostiene `geo-consultas-conteo`, que está en verde.

## Veredicto

**OK.** No hay bloqueantes y hay 6 menores. El merge queda condicionado a lo mismo que pide el proceso: `gate-completo` y `e2e` en verde en CI (m3, m5 y m6), y al cierre de m1 y m4 por parte del leader.
