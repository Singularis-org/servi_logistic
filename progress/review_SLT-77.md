# Revisión SLT-77 «Tope de intentos de entrega configurable por empresa»

Rama `feature/SLT-77-tope-intentos-por-empresa`, HEAD revisado `47c84e50`, merge-base con `origin/dev` `89228cc3`. Grafo: sin proyecto para este worktree; exploré con Grep, `git grep` y Read.

## Veredicto: OK

Sin bloqueantes. Ocho hallazgos menores. **Un choque concreto con `dev`, aparte, que hay que resolver al sincronizar:** el timestamp de las migraciones (sección «Choque con `dev`»).

T7.5 sigue abierta y es del leader, antes del PR a `prod`. El reviewer no la comprueba.

## Ejecutado por mí

Base `servi_gate_slt77`, con host local comprobado por booleano y sin imprimir ninguna URL.

| Qué | Resultado |
|---|---|
| 18 archivos de vitest: los cuatro `tope-intentos-*` de integración, `tarifas-action`, guardias del tope, servicios y componentes | 389 de 389, 0 saltados |
| 13 archivos más: `TarifasModulo`, `TarifasDisposicion`, `TarifasPage`, `intentos-entrega`, los de tope de cada servicio, `avisos-diarios`, `devolucion-sla`, `devolucion-rechazadas-flow`, `tope-276` | 193 pasados, 0 fallados. `tope-276` y su par `intentos-y-tope` (corrido aparte) caen en el `beforeAll` con «tabla `orden` vacia»: la desechable no tiene órdenes y los dos están en `tests/baseline-rojos.json`. No es hallazgo, pero sus 8 tests no se ejecutaron aquí |
| Mapa R → test de la Tanda G, por script contra el disco y el JSON de vitest | Los 42 R tienen fila y todos los archivos citados existen. Los 24 fragmentos que no están literales en la fuente (títulos de `it.each` o con comillas invertidas) sí aparecen en títulos que pasaron. Los demás, buscados en la fuente |
| `pnpm run typecheck` | exit 0 |
| `pnpm run lint` | exit 0, 0 errores |
| `pnpm run test:guardias` | 331 de 332 archivos, 4 rojos. Todos en `dependencias-declaradas-presentes`, en el baseline: no es hallazgo |
| `playwright test e2e/tope-intentos-por-empresa.spec.ts --project=dinero --no-deps`, 1 corrida sobre el `.next` existente | 12 passed, `INIT_EXIT=0`. Paso 4 con el texto de R42 en satélite; paso 7 con 44 px y sin desplazamiento a 390 |
| `git status` al terminar | Limpio |

## Checklist

### Proceso
- [x] Trazabilidad: los 42 R mapeados, y 41 con test que existe y ejecuta. R39 es la excepción declarada (punto 4).
- [ ] Tasks: T7.5 sin marcar, asignada al leader antes del PR a `prod`. Es la única abierta.
- [x] `design.md` abre con `## Lo que ya existe`, y el diff no re-crea nada de su lista. Reutiliza `alcanzaElTope`, `permitidoEnElTope`, `MSG_TOPE_*`, `appendAccion`, `resolverActorCongelado`. Siete alternativas descartadas.
- [x] Mapa `R<n> -> test` en `progress/impl_SLT-77.md`.
- [x] Sin dependencias: `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` no cambian.
- [x] E2E de flujo crítico: `tope-intentos-por-empresa` repetido aquí. `reintentos-escalado` y `dos-empresas-humo` solo en la bitácora (2 y 18 passed): no los repetí.
- [x] Sin secretos, URLs de entorno ni webhooks nuevos. Sin `console.*` nuevo en `lib/` ni `app/`. Sin literal de país o moneda en código nuevo. Sin recursos de Ordenex.
- [ ] `gate-completo`, `Cierre` de la ficha y desmontar el worktree: posteriores al PR, del leader.
- [ ] Assignee en Jira: no verificado. La ficha local dice Carlos Restrepo.

### 1. Dinero: correcto
- `git grep` de `reintentosConfig`, `REINTENTOS_MIN_INTENTOS` y `lib/config/reintentos` en `lib`, `app`, `components` y `hooks`: cero. Solo queda un comentario en `scripts/contraste-454.sql:25`, que `design §Lo que ya existe` deja a propósito.
- Recorridas todas las comparaciones con `ntentos`, `umbral`, `alcanzaElTope` y las 25 llamadas a `contarIntentos*`. Los 10 de `design §3` usan el tope de la empresa: `MisAsignacionesService.ts:310,667`, `GestionDesdeAyudaService.ts:211`, `NovedadesService.ts:146`, `ReprogramacionTiendaService.ts:89`, `GuiaAsignacionService.ts:504`, `AsignacionSateliteService.ts:239`, `AvisosDiariosService.ts:184`, `DevolucionSlaService.ts:106`, `OrdenHistorialService.ts:200`, `CierresAdminService.ts:1076`.
- **Fuera de la tabla, ninguno decide por tope:** `liberacion-reprogramada`, `Manifiesto`, `RechazosSlaTienda`, `TableroDia`, `RecepcionSatelite`, `OrdenService` y las analíticas solo muestran el número o miran `=== 0`. `EliminarOrden` y `ApiOrdenEliminacion` usan `intentos === 0` (`order-status-eliminables.ts:149`). No hay comparaciones con literal.
- `CierresAdminRepository.ts:2295`: `Math.max(leído, vigente)` en la transacción, y `enElTope` y `aBodega` con el mismo `umbral`.
- `DevolucionSlaRepository.ts:204`: el veto es la primera sentencia de la transacción, y `false` no escribe. El veto no se pasa a un `wrong_*` con la ventana vencida (`DevolucionSlaService.ts:222`), que sigue escalando.
- **Tests de dinero abiertos:** `caminos:440,473,493,512` y `carreras:343,364,382,397,410,429,448`. Órdenes con intentos reales por cierres aprobados, servicio real en `conEmpresa`, y afirman estado, gestión sintética e importe `164.00` en el siguiente cierre, en los dos lados, con literales. Los que simulan la carrera guardan por el servicio real entre la lectura y la escritura. Una mutación del umbral o del veto los mataría.
- La ventana residual de `design §6.2` sigue declarada y sin probar, como dice el spec.

### 2. Multi-empresa y RLS: correcto
- La extensión (`extension-empresa.ts:202-212`): el SQL a mano sin contexto se rechaza con `EmpresaNoResuelta`. En plataforma corre como dueño, sin `set_config`, y el `NULLIF(current_setting(...))` no encuentra fila: `EmpresaNoResuelta`. El `tx` de una transacción lleva el contexto fijado al abrirla (`:289`).
- Migración: `GRANT UPDATE` solo de las dos columnas, política `FOR UPDATE` con `USING` y `WITH CHECK` por `id`. `escritura:221,266,290` prueban otra fila, `es_demo` en `42501` y la lista exacta de privilegios.
- `FOR NO KEY UPDATE` en la lectura previa no frena las FK de las inserciones.
- `down.sql`: `migration:263` baja con datos sembrados, compara columnas, CHECK, enums, privilegios y una foto completa de la base contra la de antes, y vuelve a subir. Ejecutado, verde. La fila ajena del historial sobrevive.
- Los dos caminos de lectura, sin contexto y en plataforma, los miden `escritura:560,566,574,591,600` con el cliente de petición real.

### 3. R32: el número no llega al mensajero
- `umbral` solo sale de `OrdenHistorialService.ts:200`, con `null` para `mensajero`. La action (`orden-historial.ts:58`) lo devuelve tal cual. `KNOWN_ROLES` no tiene otro rol de mensajero.
- Las listas llevan solo `enElTope`. `caminos:645` serializa la lista entera y busca `umbral`, `topeIntentos` y `tope_intentos`.
- `MSG_TOPE_*` no llevan número (`mensajes-bloqueo.ts:111,131`).
- `cargarPantalla` comprueba el rol antes de leer (`TarifasPantallaService.ts:40`); `cargarZona` no lee el tope.
- **Lecturas de `organizacion` que pudieran arrastrar la columna:** todas con `select`, y ninguna `organizacion: true`. `guardarTopeIntentos` solo responde el número a un `maestro`.

### 4. Trazabilidad
- Muestreados a fondo R7, R18, R19, R20, R21, R22, R25, R26, R27, R28, R29, R30, R32, R34, R35, R36, R37 y R38. Sin `if (!x) return` antes de afirmar: los `if (r.status !== "ok") return` de `caminos:616,633,639` van tras un `expect` de ese estado.
- **R26:** `caminos:896` pasa por `handleProcesarDevueltasSla` y `paraCadaEmpresa` reales, con commit, con una empresa fantasma que falla y no frena a las otras.
- **R39:** D57 de `progress/deudas.md` reproduce `design §8` punto por punto. La excepción está declarada en `tasks.md` y la deuda tiene dueño. Hallazgo 4 sobre lo que le falta a los dos.
- `devolucion-rechazadas-flow.test.ts` dobla `$queryRaw` con `[{ tope: 3 }]`. No mide el tope: es otra ficha y el SQL se mide en los archivos nuevos.
- Los tests existentes que perdieron aserciones: las de `reintentos.test.ts` (módulo retirado), contadores del catálogo (82 a 83, 30 a 31), `.at(-1)` del enum y `reintentosConfig` a literales. El de `REINTENTOS_MIN_INTENTOS = 5` lo sustituye el caso por empresa.

### 5. Composition root: correcto
- `servicios.ts:44` construye `TopeIntentosService` y `servicios-composicion.test.ts` lo ata.
- Los crons `procesar-devueltas-sla` y `avisos-diarios` construyen `OrdenHistorialService` con `OrdenHistorialRepository(prisma)` y corren en `paraCadaEmpresa`. `topeIntentos` es método del servicio, así que no hay argumento que olvidar.
- Los servicios del tope solo se construyen en actions con sesión o en esos dos crons: ninguno en `comoPlataforma`.

### 6. R42: correcto, con la central sin E2E
- El servicio central emite `MSG_TOPE_INTENTOS_ASIGNACION` (`GuiaAsignacionService.ts:512`; `guia-asignacion-tope-intentos.test.ts:131` lo afirma con la constante).
- La action lo devuelve tal cual (`ordenes-guia.ts:125-136`). El modal hace `throw result` y `onError={handleError}` (`AsignarBodegaModal.tsx:459`), que llama al mapper.
- El mapper busca `no puede volver a salir a reparto`, que está en esa constante y no en la de gestión. No hay fragmento anterior que lo tape. Hallazgo 5.

### 7. Textos de pantalla: correctos
- Sin siglas ni nombres de columna en `tarifas-textos.ts:324-330`, en el mapper ni en la ayuda.
- `git grep` de `por ley`, `cota legal`, `umbral legal` y similares en `lib`, `app`, `components`, `hooks`, `docs`, `e2e`, `scripts` y `db/schema.prisma`: cero. Sin «3 intentos» ni «tercer intento» hablando del tope. Hallazgos 2 y 3.
- Abrí `seccion-390-claro.png` y `seccion-1360-claro.png`: datos `Maestro E2E <hash>`. Lo cortado a 390 en esa captura es D58, ajeno a la sección.

### 8. Migraciones y dependencias
- Cuatro archivos nuevos en `db/migrations`, ninguno editado. Las dos con `down.sql`, y los enums van solos, por 55P04.
- Timestamps: ver «Choque con `dev`».

## Choque con `dev`, aparte

No es hallazgo de esta rama: el spec anotó como última `20261104150200`, y lo era en su `origin/dev`. Pero **el timestamp ya no vale.**

- `origin/dev` trae `20261106120000_plan_periodo_facturacion`, el **mismo prefijo** que `20261106120000_historial_tope_intentos`, y `20261106130000`, `140000` y `150000`, posteriores a las dos de esta rama.
- **Consecuencia:** en una base nueva corren `historial_tope` y `organizacion_tope` intercaladas con las de plan. En una que ya tenga las de `dev` corren después. Hay dos órdenes distintos de `historial_accion_tipo` según el entorno, porque `20261106150000` también añade un valor a ese enum. `caja-459-migration.test.ts:126` lo afirma con `.at(-1)`: en `dev` espera `plan_cambio_empresa_cancelado`, y en esta rama, `tope_intentos_cambiado`.
- **Qué hacer al sincronizar**, y antes del PR (`design §1.1` lo pide): renombrar las dos a un timestamp mayor que `20261106150000`, en el mismo orden. Actualizar `HISTORIAL`, `COLUMNA` y `ULTIMA_PREVIA` en `tope-intentos-migration.test.ts:46-49`, y las citas en `down.sql`, `historial-accion-*-migration.test.ts`, `design.md` y `progress/features`.
- **Si se sube `ULTIMA_PREVIA`,** `COLUMNAS_DEL_CODIGO_ANTERIOR` (`:55`) tiene que ganar las `plan_cambio_*`, que `dev` añade a `organizacion`.
- Recrear `servi_gate_slt77`: una renumerada ya aplicada deja una fila fantasma. Si alguien la aplicó en otra base, ahí igual.

**Otros solapes con `dev`, textuales:** `db/schema.prisma`, `docs/architecture.md`, `lib/types/historial-accion.ts` (contadores 83 y 31, `dev` suma el suyo) y 10 tests del catálogo. Ninguno de los 10 servicios ni de los repositorios del tope cambia en `dev`, y `dev` no añade lectores de la configuración retirada.

## Hallazgos

1. **menor. JSDoc separada de su método.** `OrdenHistorialRepository.ts:336-340`: la de `findSenalesGestion` (FICHA 454) queda sobre `leerTopeIntentos`. `OrdenHistorialService.ts:218-226`: la de `contarIntentos`, punto único de la 215, queda sobre `topeIntentos`. Un lector cree que ese comentario habla de lo que no habla.
2. **menor. Comentarios que siguen hablando de la configuración retirada.** Son los que retiraron la lectura y no el texto: `CierresAdminService.ts:3-5` (huérfano, y dice que el umbral «se resuelve AQUI»), `GuiaAsignacionService.ts:55` («sale de la configuracion»), `ReprogramacionTiendaService.ts:5-6` («MISMO umbral de configuracion»). `MisAsignacionesService.ts:307` dice «Sin asignaciones -> 0 consultas al historial», y ahora `:310` lee el tope también con la lista vacía.
3. **menor. El aviso de R15 generaliza.** «Las novedades que ya alcancen este número se rechazan en la siguiente corrida automática» es cierto para `wrong_*`. Una `not_found` agotada espera a que venza su ventana (`DevolucionSlaService.ts:165`, y R22 lo pide así). La diferencia es de 24 horas y el texto lo aprobó Carlos: no se cambia sin él. Mismo texto en `docs/ayuda/oficina/configuracion-tarifas.md`.
4. **menor. El plan de reversión no dice qué pasa con las filas del historial.** `design §8` y D57 dicen que volver a un despliegue anterior «no toca la base». Pero una empresa que haya cambiado el tope deja filas con `tope_intentos_cambiado` y `organizacion`, valores que el cliente Prisma anterior no conoce: el propio `down.sql` de `20261106120000` lo dice. Por lectura, sin ejecutar: `/historico/acciones` fallaría al leerlas. Añadir a D57. No incumple R39, que pide otra cosa.
5. **menor. R42 en la central no tiene un camino continuo probado.** El E2E lo ejerce en satélite. La central queda en tres piezas separadas: servicio, mapper y modal, esta última solo por lectura. Además, `POR_TOPE` en `caminos:59` es `ya agoto sus intentos de entrega`, común a los dos mensajes, así que ese test pasaría con el motivo de gestión, que el mapper no reconoce. Lo cubre `guia-asignacion-tope-intentos.test.ts:131`, con doble. Basta un caso de E2E o de componente en `AsignarBodegaModal`.
6. **menor. `lib/actions/orden-historial.ts:60-63`.** Dice que el único error posible es `UNAUTHORIZED`, y responde `unauthenticated` a cualquier `AppErrorShape`. Un fallo al leer el tope (R27) se le pinta a la oficina como sesión expirada. No tiene efectos ni filtra nada, y antes pasaba igual con cualquier fallo de base. Por lectura.
7. **menor. La guardia de R31 no mira `components/` ni `hooks/`** (`tope-intentos-sin-valor-global.guardia.test.ts:47`). Hoy están limpios, por `git grep`. La de R40 sí mira `components/`.
8. **menor. La bitácora se quedó atrás.** `progress/impl_SLT-77.md:601,623` termina con `INIT_EXIT=1` y T7.4 abierta. El verde solo está en `progress/features/SLT-77.md`, y T7.4 pide «salida pegada». Va en el `Cierre`.

## No verificado

- `./init.sh` y `gate-completo`. El gate rápido es el del leader, `INIT_EXIT=0`, leído de la ficha.
- Las mutaciones de la bitácora: no modifico código. Leí los tests que dicen matarlas.
- `reintentos-escalado` y `dos-empresas-humo`: bitácora, no repetidos. El E2E de la ficha, una corrida, no dos.
- `tope-276` e `intentos-y-tope`: no ejecutan en una desechable sin órdenes.
- Concurrencia real entre un guardado y una aprobación: los tests simulan la carrera con el guardado entre lectura y escritura, sobre una sola conexión.
- La línea `[AppError:INTERNAL] Dynamic server usage` de `next build` en `/configuracion/tarifas` (bitácora, hallazgo 4 de la Tanda G): no la comparé con `dev`. `page.tsx` no está en el diff.
- Producción, T7.5, assignee en Jira, Safari o un teléfono real. Abrí 2 de las 8 capturas.
- Hallazgos 4 y 6: por lectura. No levanté un despliegue anterior.
