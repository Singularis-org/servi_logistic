# Review SLT-60 «Confirmación del pago a la plataforma por el superadmin»

Vuelta 1, completa. Rama `feature/SLT-60-confirmar-pago-plataforma`, HEAD `67cde81e`, diff contra `origin/dev`
(80 archivos). Ruta completa, fullstack, complexity high; toca dinero y el flujo crítico «Dinero: wallet».

## Verificación ejecutada por el reviewer (no copiada de la bitácora)

- `pnpm run typecheck` (con `--max-old-space-size=8192`): exit 0.
- `eslint` sobre los 70 `.ts/.tsx` añadidos o cambiados: exit 0, sin avisos.
- `vitest run` de 20 archivos unitarios y de componentes del diff (servicio, action, componente, reparto, tope,
  anulación, deuda, composition roots, textos de la wallet, `verificar-rls-despliegue`):
  `Test Files 20 passed (20) · Tests 456 passed (456)`.
- `vitest run` de integración contra Postgres real (`servi_logistic_slt60`, la base local de la feature):
  `pago-plataforma-confirmacion`, `pago-plataforma-sl45`, `migracion-slt60-ida-y-vuelta`,
  `empresas-plataforma-deuda-sl45`, `pago-plataforma-sl45-concurrencia`:
  `Test Files 5 passed (5) · Tests 54 passed (54)`, ninguno saltado.
- Guardias del área (15 archivos: `rls-por-empresa`, `fk-misma-empresa`, `unicos-por-empresa`,
  `organizacion-en-modelos`, `plataforma-solo-en-lista`, `sql-a-mano-por-empresa`, `storage-solo-por-adaptador`,
  `superficie-de-uso`, `modulos-reparto`, `cobro-plataforma-solo-por-trigger`, `pago-plataforma-inmutable-sl45`,
  `catalogo-postgres-acota-esquema`, `pais-sin-literales`, `sinpe-en-toda-superficie`,
  `api-key-dependencias-usuario`): `15 passed | 2 skipped` (los 2 saltados piden base).
- `down.sql`: el cuerpo de `wallet_movimiento_tope_pago_plataforma` comparado byte a byte con el de
  `20261111130100` §9 (script): idéntico.
- `node scripts/tamano-pr.mjs`: 75/40 archivos, 5775/1000 líneas (ver hallazgo m1).
- No corrí el E2E (lo corre el CI; contexto del leader).

## Checklist

### Ruta y especificación
- [x] Ruta completa: es la que exige el suelo (dinero, complexity high).
- [x] `requirements.md` con R1–R38 en EARS.
- [x] `design.md` con `## Lo que ya existe` no vacía y 7 alternativas descartadas con su porqué.
- [x] El diff no re-crea nada de «Lo que ya existe»: el tope reescribe el trigger existente (no uno nuevo),
  `TopePagoPlataformaService` y `PagoPlataformaRepository` se modifican, el comprobante reutiliza
  `WalletComprobanteRepository.lateralDe`, `SupabaseSignedUrlProvider` y `walletComprobanteConfig`;
  `FacturaPlataformaRepository` (de SLT-119) no se toca.
- [~] Tasks: 61 de 64 en `[x]`. Quedan T7.3 (segunda corrida E2E, la cierra el check `e2e` del CI por decisión
  del humano), T9.1 (`./init.sh` corta por el cupo de las fichas geo, aceptado por el humano) y T9.2 (conteo en
  prod, del humano). Por el contexto del leader no son hallazgo, pero tienen que cerrarse antes del merge.

### Tamaño del PR
- [~] Por encima del tope, con la aceptación humana escrita en `requirements.md > Decisiones cerradas`
  (2026-11-13). Falta el marcador mecánico en `progress/features/SLT-60.md` (m1).

### Trazabilidad
- [x] Cada R1–R38 mapea a un test concreto (`progress/impl_SLT-60.md > T8.2`). Comprobé por muestreo que los
  tests no son vacíos: R5, R19 y R21 fuerzan la contienda (otra conexión sostiene el mismo candado 1,5 s y se
  afirma que ninguna termina con él tomado); R10 afirma 0 constancias, 0 contra-asientos e historial igual;
  R16 compara la foto de la factura y la caja antes y después; R25 prueba 42501 en INSERT/UPDATE/DELETE y en
  `pago_plataforma_disponible` ajena; R26 prueba `SL060` como dueño; R28/R29 con `pg_get_functiondef`.
- [x] Cuatro mutaciones del design §8 medidas y revertidas, más dos del comprobante (sin `conEmpresa` → 18
  rojos; sin el control de superadmin → 9).

### Calidad de código
- [x] Typecheck 0 y lint 0 errores (verificado).
- [ ] `gate-completo` en CI: pendiente del PR (no evaluable aquí).
- [x] Flujo crítico «Dinero: wallet» con E2E nuevo (`e2e/pago-plataforma-confirmacion.spec.ts`, proyecto
  `dinero`) y su salida local anotada en la bitácora (dinero 111 passed).
- [x] Sin dependencias nuevas.

### Datos y seguridad (perfil)
- [x] Las dos tablas nuevas con `organizacion_id NOT NULL`, FK CASCADE, RLS, política `…_por_empresa`,
  `REVOKE INSERT, UPDATE, DELETE … FROM servi_app` y únicos con `organizacion_id` primero.
- [x] Triggers de misma empresa en las 4 FK de negocio (generados), `…_sin_cambio_de_empresa` e `…_inmutable`.
- [x] Migración con `down.sql` completo (triggers, tablas, funciones y el tope de SLT-118 literal); no edita
  ninguna migración aplicada (el tope se reemplaza con `CREATE OR REPLACE` en la nueva).
- [x] Funciones `SECURITY DEFINER` con `search_path` fijo y `EXECUTE` revocado a `PUBLIC`; solo
  `pago_plataforma_disponible` se concede a `servi_app`, con control de la empresa del contexto (42501).
- [x] Toda query nueva filtra por empresa: `pagoDeLaEmpresa` lleva `organizacionId` escrito además de la RLS;
  el `JOIN` a `usuario` y el `EXISTS` a `wallet_comprobante` de `leer` llevan la empresa escrita; el listado
  acota con `in: ids` y `unnest(ids)`. Probado con dos y tres empresas en integración.
- [x] Sin literales de país o moneda en código nuevo de producción (`ZONA_CR` es la excepción vigente hasta
  SLT-90, como dice el design; `₡` solo en E2E, como otros 11 specs).
- [x] Sin recursos de Ordenex, sin secretos, sin `console.log` de PII.

### Permisos y autorización (lo pedido por el leader)
- [x] **Autorización en el servidor.** `PagoPlataformaConfirmacionService` comprueba `esPlataforma` antes de zod
  y antes del repositorio en `verDeEmpresa`, `confirmar` y `verComprobante`; la action resuelve el actor de la
  sesión y sin sesión responde `forbidden`. La página da `notFound()` a otro rol. Las funciones de escritura no
  son ejecutables por `servi_app`.
- [x] **Enlace firmado del comprobante.** La empresa se liga en el servidor (`.bind`) y la lectura corre en
  `conEmpresa(org)`: `pagoDeLaEmpresa` filtra por empresa y categoría, `lateralDe` pasa por el cliente
  extendido con RLS, y `SupabaseSignedUrlProvider` firma con `rutaEnCarpeta(org, …)`, así que no puede firmar
  fuera de la carpeta de la empresa del contexto. La respuesta solo lleva `url` y `contentType`. Si un cliente
  llama la action sin el `.bind` con otro `organizacionId`, sigue haciendo falta ser superadmin, que ya ve todas
  las empresas: no hay fuga entre empresas.

### Concurrencia confirmar contra anular (lo pedido por el leader)
- [x] Las tres operaciones toman el mismo `pg_advisory_xact_lock(hashtext('pago_plataforma:' || org))`: el tope
  (registro), `pago_plataforma_confirmar` y el trigger `pago_plataforma_no_anular_confirmado` (anulación, en el
  INSERT del contra-asiento). Las funciones son plpgsql volátiles, así que la lectura posterior al candado
  toma una foto nueva en READ COMMITTED y ve lo que commiteó la otra.
  - Gana la confirmación: el contra-asiento choca con `SL060 pago_confirmado`, la constancia escrita antes en
    la misma transacción se revierte y el servicio devuelve `forbidden` (R10, R21).
  - Gana la anulación: la confirmación ve el contra-asiento y lanza `pago_no_encontrado` → `not_found`.
  - Sin riesgo de interbloqueo: la confirmación no toca `ajuste_caja_anulacion` ni filas del libro.
- [x] Probado en integración con contienda forzada, y la mutación «sin candado» lo tumba (2 rojos).

### R18 de SL-45 partido en `pago-plataforma-sl45.test.ts` (lo pedido por el leader)
- [x] El SL-45 R18 dice «DEBE permitir anular un pago vigente aunque la deuda sea cero o esté a favor». Con
  SLT-60 R10, un pago confirmado ya no se anula, así que el caso viejo (anular el confirmado con saldo a favor)
  pasa a «SLT-60 R10: … forbidden, y nada escrito». El R18 se sigue midiendo con un pago **por confirmar** y la
  deuda en 0,00 (B elimina su orden): se anula, la caja vuelve y la deuda sigue en 0,00. El camino de código de
  la anulación no mira la deuda, así que la rama «a favor» es la misma. La partición es correcta y no baja
  ninguna afirmación fuera de «la deuda baja al registrar» (ver m4 sobre el texto de SL-45).

### Arquitectura y convenciones
- [x] Capas respetadas: action → servicio → repositorio, interfaces en `lib/interfaces/`, zod en el borde.
- [x] El cliente no fetchea: los datos llegan por props desde el Server Component; las actions entran por
  props.
- [x] Importes en céntimos `bigint` en el cliente (sin `Number(`/`parseFloat` sobre dinero); `Prisma.Decimal`
  en el servidor.
- [x] Comentarios explican el porqué (candado, por qué el saldo no es columna, por qué `conEmpresa`).
- [x] `docs/architecture.md` y la ayuda de la wallet al día; ninguna frase de la ayuda dice ya que la deuda baja
  al registrar (verificado con `grep`).

### E2E (calidad, sin correrlo)
- [x] `e2e/pago-plataforma-confirmacion.spec.ts` recorre los cinco puntos de R30. Lee el total de la factura de
  la base (no lo escribe a mano), verifica por detrás el libro, el comprobante, la confirmación y su
  aplicación, y las esperas son por condición (sin `waitForTimeout`). Textos esperados escritos a mano.
- [x] `e2e/pago-plataforma-sl45.spec.ts`: siembra la factura cerrada, la región ya no baja al pagar, el contador
  aparece en Empresas y el pago se confirma como dueño antes del paso «al día». Los literales de R35–R37 a mano.
- [~] La constancia local no cubre todos los E2E que visitan las rutas cambiadas (m3).

## Hallazgos

Ningún BLOQUEANTE.

- **m1 — menor.** Falta el marcador `<!-- tamano-pr-aceptado: 2026-11-13 · … -->` en
  `progress/features/SLT-60.md`. La aceptación humana está escrita en `requirements.md > Decisiones cerradas`
  y en el propio `progress/features/SLT-60.md > Decisiones`, pero `node scripts/tamano-pr.mjs` y el gate
  buscan la línea. Es contabilidad del leader: añadirla antes de sacar el PR de borrador.
- **m2 — menor.** El `RAISE` del tope reescrito sigue diciendo «supera la deuda vigente de la empresa (%)»
  aunque el número que imprime ahora es lo disponible para registrar
  (`db/migrations/20261116120000_pago_plataforma_confirmacion/migration.sql`, §8). La app no lo muestra (pinta
  R36) y la decisión está anotada (lo lee `caja-tesoreria-migration.test.ts`), pero quien lea el log de la
  base verá una cifra con un nombre equivocado. Se puede corregir en una ficha posterior junto con ese test.
- **m3 — menor.** La constancia local de E2E (`progress/impl_SLT-60.md > T7`) cubre el grupo `dinero` y
  `dos-empresas-humo` + `cobro-plataforma-sl40` + `pago-plataforma-sl45`, pero no `planes-superadmin`,
  `planes-costeo` ni `reporte-de-bugs`. Los tres están en el proyecto `aislamiento` y visitan
  `/plataforma/empresas` o su detalle, que esta ficha cambia (sección nueva y tercera línea en la celda
  Plataforma). Revisé sus selectores: buscan la región por nombre exacto («Plan», «Plan activo») y filas por
  slug, así que no deberían romperse. Por decisión del humano los cubre el check `e2e` del CI; mirar ese
  check antes del merge.
- **m4 — menor.** `specs/SL-45-pago-a-la-plataforma/requirements.md` R18 («DEBE permitir anular un pago vigente
  aunque la deuda sea cero o esté a favor») queda acotado por SLT-60 R10, que no deja anular un pago confirmado.
  El cambio está decidido y probado, pero el spec de SL-45 no lo menciona. Una nota de «acotado por SLT-60 R10»
  en ese spec evitaría que alguien lo lea como contradicción.
- **m5 — menor.** La base no comprueba que `confirmado_por` sea el superadmin. Solo el dueño puede llamar a
  `pago_plataforma_confirmar` y el servicio pasa el actor superadmin, así que en producción se cumple. Pero los
  tests de §8.1 confirman con el maestro como `confirmado_por` (decisión anotada). Si SLT-142 pinta «quién
  confirmó», que no lo dé por hecho en datos sembrados por tests.

## Veredicto

**OK**: 0 bloqueantes, 5 menores. Antes del merge: el marcador de tamaño (m1), T7.3 con el check `e2e` del CI
en verde, `gate-completo` en verde, T9.1 según la excepción del cupo y T9.2, el conteo en prod que hace el
humano.
