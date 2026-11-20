# Review SLT-167 «Recepción: destinatario y tienda en la respuesta»

Ruta **ligera** (backend, low), review acotada a `git diff origin/dev...HEAD` (HEAD `4f55939f`).
El diff no toca dinero, permisos, autenticación, integraciones externas, webhooks, `db/` ni pantallas:
la ruta ligera es la que corresponde.

## Checklist

- [x] **Trazabilidad R710-R716**, cada uno con un test que falla si se rompe:
  - R710: `tests/unit/services/recepcion-resumen.test.ts:117` (`toEqual` del literal completo, doble
    llamado con el id de la orden) en los tres servicios + `:267-312` las tres acciones reenvían.
  - R711: `:135` (guarda) y `:146` (carrera perdida y relectura), en los tres servicios.
  - R712: `:258` tabla por servicio (`forbidden`, `no_encontrada` 7777777, `estado_invalido`,
    `conflict`, `tienda_ajena`, `zona_ajena`, `sin_zona`): sin clave `resumen` y doble no llamado.
    `tienda_ajena`/`zona_ajena` se siembran con la orden YA en el estado destino, así que miden que
    la guarda de alcance va antes de `ya_recibida`. Mutación propia (leer el resumen antes de
    responder `zona_ajena` en `RecepcionSateliteService.ts:417`) → rojo
    `R712: 'zona_ajena' no trae resumen y no lo lee`. Restaurado con `git checkout --`.
  - R713: `:130` (claves exactas) y `tests/integration/db/recepcion-resumen-sql-real.test.ts:138-141`
    (Postgres real; teléfono y dirección sembrados no aparecen en el serializado).
  - R714: `recepcion-resumen-sql-real.test.ts` contra Postgres real, dos empresas, control positivo
    (`:136` A devuelve lo sembrado; `:129` control de la siembra). **Mutación propia:** borrar la
    línea `AND o."organizacion_id" = NULLIF(current_setting(...), '')` de
    `lib/repositories/OrdenRepository.ts:3502` → `1 failed`, `expected { …(2) } to be null` en `:145`
    (la orden de B). Restaurado con `git checkout --`; árbol limpio.
  - R715: `:162`, `:171`, `:183` (null y rechazo, en `ok` y `ya_recibida`; una sola escritura).
  - R716: los tests existentes de los tres servicios, `rol-admin-satelite-authz` y
    `tests/unit/actions/recepcion-*` verdes sin tocar aserciones de `status`/`ordenId`/`estado`.
- [ ] **Tasks:** T1-T3 `[x]`; **T4 sin marcar** (`./init.sh` no corrido; ver hallazgo 1).
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` → 20/40 archivos, 159/1000 producción, 482/3000 tests.
- [x] **Lo que ya existe:** sección presente y con contenido; el diff no re-crea nada (no había
  lectura de resumen; reusa `IOrdenRepository` y el patrón `current_setting('app.organizacion_id')`
  de `CierresBodegaAdminRepository.ts:489`).
- [x] **Ejecución propia** (base desechable `servi_slt167_desechable` vía `con-desechable.cjs`):
  `vitest run` de los dos tests nuevos, los 7 tocados y `tests/unit/actions` → `132 files, 1942
  passed`; la integración corre de verdad (verbose: `✓ … R714/R713`, no skip).
  `pnpm run typecheck` → exit 0. `eslint` de los `.ts` tocados → 0 errores, 1 warning preexistente
  (`IOrdenRepository.ts:11`, igual en `origin/dev`).
- [x] **Datos y seguridad:** la query nueva filtra por `organizacion_id` y tiene test de dos
  empresas; sin tabla ni migración nueva; sin `console.log` de PII; sin Ordenex.
- [x] **Privacidad R713:** el SQL selecciona solo `o.destinatario` y `t.nombre`; el repositorio
  reconstruye el objeto con esas dos claves. Solo se lee tras las guardas de rol y alcance, en
  respuestas que ya reciben maestro/admin (bodega central, global en la empresa), adminTienda (solo
  su tienda, `tienda_ajena` antes) y adminSatelite (solo su zona, `zona_ajena` antes): los mismos
  roles que ya ven esos nombres en sus listados (spec, Preguntas abiertas).
- [x] **SQL a mano con `organizacion_id` explícito:** decisión permitida por T1 y justificada en el
  comentario (`OrdenRepository.ts:3488-3494`): segunda barrera medible además de la RLS. El test
  corre como dueño sin RLS precisamente para medir esa barrera, y la mutación lo confirma.
- [x] **Cambio mínimo en `OrdenRepository`/`IOrdenRepository`:** +22 y +16 líneas, solo añadidos
  (un tipo, un método en la interfaz, un método en la clase y un import); nada existente se mueve.
  Choque con la épica de geografía jerárquica aceptado por Carlos (`progress/features/SLT-167.md`,
  Decisiones).
- [x] **3 tests fuera de Archivos esperados** (`bulk-orden-service.carga-api`, `bulk-orden-service`,
  `orden-service`): +1 línea cada uno, `resumenRecepcion: vi.fn().mockResolvedValue(null)` en el
  doble que implementa `IOrdenRepository` entero. Solo dobles; ninguna aserción tocada.
- [x] **Reglas del reviewer (perfil):** sin literales de país/moneda en producción, sin
  dependencias, comentarios explican el porqué. No toca `db/`, pantallas ni dinero.

## Hallazgos

1. **mayor (cierre, no código)** — `specs/SLT-167-recepcion-destinatario-tienda/requirements.md`
   T4 sin `[x]` y `./init.sh` no corrido (`progress/impl_SLT-167.md:77`: la desechable no tiene seed
   completo y `vitest related` arrastra ~734 archivos). Mis corridas cubren lo afectado; la suite
   completa la cubre `gate-completo` del PR #186 (vitest y e2e en curso al revisar). **Condición de
   merge:** `gate-completo` en verde y T4 marcado con esa evidencia. No lo trato como rechazo de
   código: nada del diff está pendiente.
2. **menor** — `conResumen` está copiado igual en los tres servicios
   (`RecepcionBodegaCentralService.ts:128`, `RecepcionOrigenService.ts:101`,
   `RecepcionSateliteService.ts:457`). Tres copias de 7 líneas; aceptable, pero un helper común
   evitaría que diverjan.
3. **menor** — el `catch {}` de `conResumen` traga el error sin rastro. R715 exige no fallar, no
   callar: un `console.error` sin PII (solo el id de la orden y el mensaje) dejaría ver en
   observabilidad una lectura que falla siempre.
4. **menor** — el guard `typeof fila?.destinatario !== "string"` (`OrdenRepository.ts:3505`) entró
   para acomodar el doble de `$queryRaw` de `tests/integration/db/devolucion-rechazadas-flow.test.ts`,
   que responde `[{ tope: 3 }]` a cualquier SQL. Es inocuo y además protege R713, pero el motivo real
   es un doble demasiado ancho; anotado.
5. **menor** — la tabla de R712 no incluye `validation_error` (catálogo sin estatus destino) ni
   `unauthenticated` (de la acción, que no cambia). El spec no los pedía en la trazabilidad; por
   lectura, `validation_error` sale antes de cualquier `conResumen` en los tres servicios.

## Veredicto

**OK** — sin bloqueantes de código. Condición de merge: hallazgo 1 (`gate-completo` en verde del
PR #186 y T4 marcado).
