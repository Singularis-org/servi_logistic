# Review SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora»

Vuelta 1 completa · reviewer · 2026-11-21 · rama `feature/SLT-121-planes-mora-congelamiento` @ `5521134f` · PR #264
contra `dev` · ruta **completa** (migración, dinero, permisos, API y webhooks: la ruta es la que corresponde).

## Checklist

- [x] **Spec completo.** `requirements.md` (R1–R35 en EARS, R35 enmendado a la tienda el 2026-11-21 con la
  decisión registrada), `design.md` (con `## Lo que ya existe` y §14 «Alternativas descartadas») y `tasks.md`
  (ninguna `[ ]`).
- [x] **Lo que ya existe.** La sección está y está llena. El diff reutiliza lo que lista: `factura_plataforma_saldos`,
  el candado `pago_plataforma:<org>`, `encolarEnEmpresas`/`JobRepository.enqueue`, `appendAccion`,
  `crearFacturaAvisoHandler` y el molde de recurrentes de plataforma. No re-crea nada.
- [x] **Tamaño.** `node scripts/tamano-pr.mjs`: 114/40 archivos, 3255/1000 líneas de producción y 5919/3000 de tests.
  Pasa porque está la línea `<!-- tamano-pr-aceptado: … -->` en `progress/features/SLT-121.md` (ver menor M2).
- [x] **Trazabilidad R → test.** Está el mapa R1–R35 en `progress/impl_SLT-121.md` > «Tanda 5: T5.3». Cada R apunta a
  tests que existen y afirman lo que piden. Muestreo con mutaciones (abajo): los tests caen.
- [x] **Typecheck.** `pnpm run typecheck` (8 GB): exit 0.
- [x] **Lint.** `eslint` sobre los `.ts`/`.tsx` añadidos o modificados del diff: exit 0, sin avisos.
- [x] **Guardias.** `pnpm run test:guardias`: 358 archivos ✓ y 3 skipped; 5436 tests ✓ y 28 skipped.
- [x] **Unit y componentes del diff.** Los 32 archivos de `tests/unit` y `tests/components` del diff, más
  `mora-empresa-repository` y `siembra-mora-diaria-idempotente`: 34 archivos, 766/766 ✓.
- [x] **Integración contra la base de la feature** (`servi_logistic_slt121`, URL de `dburl_SLT121_NO_TOCAR`):
  - `bloqueo-por-mora`, `bloqueo-por-mora-cobertura`, `mora-congelar`, `factura-plataforma-mora`;
  - `pago-plataforma-recalcula-mora`, `api-key-empresa-congelada.route`, `carga-masiva-empresa-congelada.route`.

  Resultado: 7 archivos, 72/72 ✓. No corrí los `*-migration` (aplican `down`) para no tocar esa base.
- [x] **Migraciones.**
  - `20261126120000_mora_enums` y `20261126120100_mora_congelamiento` traen las dos su `down.sql`.
  - Van después de la última de `origin/dev` (`20261124130000_orden_historial_origen_retorno_rechazo_cierre`).
  - Ninguna lleva «125» en el nombre.
  - No editan migraciones ya aplicadas.
- [x] **Sin tabla nueva.** Solo tres columnas en `organizacion`. Ninguna query nueva de negocio sale sin empresa: la
  lectura del banner va por la empresa del contexto, y la del superadmin por `conEmpresa(org)`. R33 lo prueba con
  `42501`.
- [x] **Sin dependencias nuevas.** `package.json` no cambia.
- [x] **Sin literales de país ni moneda en el código nuevo.** La guardia `pais-sin-literales` está en verde. `mora.ts`
  toma la hora de `lib/planes/ciclo.ts`. Ningún recurso de Ordenex.
- [x] **Sin secretos.** `FACTURA_DIAS_GRACIA` va por variable de entorno, con su entrada en `.env.example`.
- [x] **E2E.**
  - Hay constancia local en la bitácora (T5.1): `mora-congelamiento` 6/6 dos veces, `--project=dinero` 138/138 y
    `dos-empresas-humo` 18/18.
  - Tras el arreglo de R14, `mora-congelamiento` 6/6.
  - Falta repetirlo después del merge con `dev` (menor M1).
- [ ] **`gate-completo` en CI.** Lo vigila el leader en #264; no lo verifico aquí.
- [x] **Ninguna action con `@sin-superficie`.** No hay ninguna en `lib/actions/mora-empresa.ts` ni en
  `lib/actions/_shared/mora-empresa.ts`. Las cuatro se quitaron en T4.2/T4.3, y la guardia `superficie-de-uso` está
  en verde.
- [x] **Comentarios.** Explican el porqué (deadlock, orden auth → puerta → cuerpo, por qué el trigger es por
  sentencia y no `SECURITY DEFINER`).

## Comprobaciones pedidas por el leader

1. **Trazabilidad con mutaciones.** Cada mutación se aplicó, se corrió y se revirtió con `git checkout`; el árbol
   quedó limpio. Las tres las detectan los tests:

   | Mutación | Tests que caen |
   |---|---|
   | Sin `exigirEmpresaOperativa()` en `DELETE /api/ordenes/api-key/orden/{id}` | 4 de `api-key-empresa-congelada.route.test.ts` (R13) |
   | `registrarEgreso` concede `permitidoEnMora` a cualquier egreso | 2 de `wallet-egresos-mora.test.ts`: `gasto_variable` y `sueldo` (R11, R12) |
   | `recalcularCongelamiento` siempre `sin_cambio` | 4 de `pago-plataforma-recalcula-mora.test.ts` (R19, R30, R28, R34) |

2. **El congelamiento en la base.**
   - `bloqueo_por_mora()` es un trigger `BEFORE INSERT OR UPDATE OR DELETE … FOR EACH STATEMENT`, sin
     `SECURITY DEFINER`, con `RAISE … USING ERRCODE = 'SL121'`. El `DO` lo instala en cada tabla con
     `<t>_por_empresa` y en `organizacion`.
   - `traducirErrorDeMora` convierte `SL121` en `EmpresaCongelada`, un `ForbiddenError` con
     `details.codigo = "empresa_congelada"`.
   - El 403 de la API lo afirman `api-key-empresa-congelada.route.test.ts` (cuerpo exacto) y el E2E, caso 3.
   - Las tres `organizacion_mora_*` toman la fila con `FOR NO KEY UPDATE` (líneas 96, 135 y 155 de la migración).
     `pago-plataforma-recalcula-mora.test.ts` > «decisión §2: … cruces forzados» está en verde.
   - La fecha límite se calcula y no se guarda: `factura_plataforma_mora` la deriva como
     `(hasta_at - 6 h)::date + COALESCE(gracia propia, global)`, y no hay columna de fecha límite en el esquema.
   - El dueño escribe por `SECURITY DEFINER`. Revisé las 54 funciones `SECURITY DEFINER`: las que escriben son
     funciones de trigger o tienen `REVOKE … FROM PUBLIC`. Ninguna escritora tiene `GRANT EXECUTE` a `servi_app`, así
     que no abren un camino para saltarse el trigger.
3. **Frontera con SLT-226 «Cobro automático: modelo del cobro e idempotencia».**
   - `recalcularCongelamiento` y `organizacion_mora_descongelar_si_pagada` solo ponen `congelada_at = NULL`, nunca la
     fijan.
   - La firma de cuatro argumentos de §5.2 se mantiene; el 5.º, `gracia`, es opcional.
   - `docs/architecture.md` documenta la llamada de SLT-226.
   - El diff no toca `cobro_intento` ni archivos de SLT-226.
4. **Migraciones 20261126….** Están ordenadas después de `dev` y sin «125» (ver checklist).
5. **Desvíos de la bitácora.** Los reviso uno a uno:
   - **timestamps 20261126:** justificados (choque con SLT-226 y la regex `/backfill|125/`);
   - **`P0002` con empresa inexistente:** aceptado por el leader;
   - **`tipoEgreso` en vez de `categoria`:** correcto, es el nombre real del campo;
   - **lectura previa en P3:** el trigger de SLT-60 sigue siendo la barrera para un pago confirmado, y está probado;
   - **`FOR NO KEY UPDATE` en `fijarGracia`:** coherente con la decisión del deadlock;
   - **`not_found` en el servicio:** mejora, no regresión;
   - **siembra del E2E sin mover `hasta`:** obligada por `SL118`;
   - **R35 a la tienda:** enmendado por el humano.

   El literal `"empresa_congelada"` duplicado en `OrdenesCargaUpload.tsx` es la menor M3.
6. **Sin `@sin-superficie`.** Confirmado (ver checklist).

## Hallazgos

- **M1 · menor.** El E2E no se repitió después del merge con `origin/dev` (`448056ee`).
  - Ese merge trajo SLT-240 «moneda en las pantallas de órdenes», que toca la carga masiva, y SLT-235.
  - La constancia local de `mora-congelamiento`, `dinero` y `dos-empresas-humo` es de antes del merge.
  - El CI del PR a `dev` no corre E2E.
  - Recomendación: antes de mergear, correr en local `mora-congelamiento` y `dos-empresas-humo` sobre una base
    desechable. Si la memoria no da, dejarlo explícito en el PR.
- **M2 · menor.** El tamaño real supera la estimación que aceptó el humano.
  - La línea `tamano-pr-aceptado` dice «~83 archivos, ~5 100 líneas».
  - El diff real tiene 114 archivos, 3 255 líneas de producción y 5 919 de tests.
  - El script la acepta igual; conviene que el humano lo sepa al revisar.
- **M3 · menor.** `CODIGO_EMPRESA_CONGELADA = "empresa_congelada"` está duplicado en
  `app/(app)/ordenes/_components/OrdenesCargaUpload.tsx:76`.
  - La razón del comentario es cierta: `lib/planes/empresa-congelada.ts` arrastra `node:async_hooks`.
  - Pero `MENSAJE_EMPRESA_CONGELADA` ya vive en `lib/planes/mora.ts`, que es puro y que el componente ya importa. El
    código podría vivir ahí, reexportado por `empresa-congelada.ts`, sin la copia.
  - Hoy no hay deriva, y lo cubren `OrdenesCargaUpload.test.tsx` y el E2E, caso 2.
- **M4 · menor (condición humana pendiente, no del código).** La decisión P5 (excepción declarada para el motivo en
  `historial_accion`) exige que Carlos Restrepo la acepte en la review del PR. Que el leader no dé #264 por listo sin
  esa aprobación.

No hay hallazgos bloqueantes.

## Veredicto

**OK**
