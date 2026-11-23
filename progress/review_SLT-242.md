# review SLT-242 «Moneda del país en pantallas: analítica»

Reviewer, 2026-11-21. Rama `feature/SLT-242-moneda-pantallas-analitica`, diff `origin/dev...HEAD`
(HEAD `73229138`). Ruta completa (fullstack, complexity high, toca dinero): correcta.

## Verificación ejecutada por el reviewer
Todo con `NODE_OPTIONS=--max-old-space-size=8192`.
- `pnpm run typecheck`: 0 errores. Esto prueba también R6: los `@ts-expect-error` del test nuevo serían un error si sobraran.
- `eslint` sobre los 32 `.ts/.tsx` del diff: 0 errores. Hay 1 aviso que ya existía (`salidasQueCasan` en `dinero-centimos-cuando-existen.guardia.test.ts:252`) y que este diff no toca.
- `vitest run` sobre 8 archivos, 355/355 verdes:
  - `moneda-del-pais-analitica`;
  - `moneda-del-pais-pantallas`;
  - `pais-sin-literales.guardia`;
  - `ProductosTablaDinero`;
  - `rechazo-nombre-466-app`;
  - `textos-455-recorrido`;
  - `tablero-financiero.guardia`;
  - `analytics-paquete-guard`.
- `pnpm run test:guardias`: 357 archivos ok y 3 saltados; 5419 tests ok y 28 saltados.
- `node scripts/tamano-pr.mjs`: AVISO de cercanía al tope, sin pasarlo. Son 32/40 archivos, 425/1000 líneas de producción y 1222/3000 de tests.
- No se corrieron `./init.sh` ni el E2E (T4.3): por orden del leader los corre el CI.

## Checklist
- [x] Ruta: completa, como pide el suelo (dinero, complexity high).
- [x] `requirements.md` con R1–R17 en EARS.
- [x] `design.md` abre con `## Lo que ya existe` y tiene 6 alternativas descartadas. El diff no re-crea nada de la lista: reutiliza el proveedor, el hook, `paisParaPantallasDelActor`, `formatearMontoEn` e `IMPUESTO_ROTULO`.
- [~] `tasks.md`: T1.1–T4.2 están en `[x]`. **T4.3 está sin marcar** (`./init.sh` y E2E), queda pendiente del CI por orden del leader. Ver hallazgo 1.
- [x] Tamaño: dentro del máximo (aviso del 80%).
- [x] Trazabilidad: cada R tiene un test concreto que lo comprueba de verdad, y el mapa está en `progress/impl_SLT-242.md`. Revisé los casos de R3, R4 y R17: comprueban el texto montado con el país de prueba, con CR y sin proveedor, no son casos vacíos. R2 cubre las 5 gráficas, `SerieTextual`, `TablaResumen`, `KpiValor` y `KpiCard`. R14 lo comprobé en el diff (abajo).
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente (PR no abierto).
- [x] Dependencias nuevas: ninguna.
- [x] Seguridad y configuración: no hay secretos ni literales de país o moneda en producción. «€», «XTS» e «IGV» aparecen solo en los tests, como datos de prueba.
- [x] Datos: no hay tablas, queries ni migraciones nuevas. La empresa del país sale del actor de la sesión y nunca del input. Lee el país después de la validación y del `forbidden`, y solo si no se inyecta el servicio (R9, con test).
- [x] Capas: la lógica está en el servicio y en el catálogo, la acción solo cablea. `metrics.ts` sigue puro (pasa la guardia `modulo-puro`).
- [x] Comentarios: explican el porqué, por ejemplo las dos firmas de `formatearValor`, la hoja de cliente y el `Map` de `etiquetaEnElPais`.
- [x] R16: salen las 2 excepciones a nombre de SLT-242 y `TOPE_EXCEPCIONES` baja a 12. `FichaQueLoRetira` y `FICHAS_ADMITIDAS` no se tocan.
- [x] R14, comprobado en el diff:
  - no hay sumas ni restas nuevas: solo se añade el argumento `moneda` a `importeConNeto` y `importeSoloBruto`;
  - no se renombra ningún id con «iva»;
  - `page.tsx` no está en el diff;
  - `DECIMALES_DE_LA_CUENTA` no cambia;
  - no hay archivos de otra rebanada ni de plataforma.
- [x] Los tests que ya existían solo cambian la forma de llamar (tercer argumento `MONEDA_PLATAFORMA`) y ningún valor esperado. Las dos guardias ajustadas (`formatearMontoEn` y `<CifraAnalitica`) mantienen su intención.

## Desviación declarada en T3.4 (design §5.2): ¿cumple R17?
**Sí, cumple R17.** El design decía que `empresaPista` y `retornoPista` «salen de la constante». Siguen en ella, pero calculadas con `pistasConImpuesto(IMPUESTO_ROTULO)` y no escritas a mano. Lo que pide R17 se cumple:
- **Lo que pinta la pantalla:** el componente pinta `pistasConImpuesto(useImpuestoDelPais())` (con `useMemo`), no la constante. El test con el país de prueba exige las dos pistas con «IGV» y que no quede ningún `\bIVA\b` en el `body`.
- **Sin datos del país:** sale el rótulo de la plataforma, «IVA». Está probado sin proveedor y con CR.
- **El archivo no escribe «IVA» fuera de comentarios:** lo comprueba un censo con contraprueba, y está verde.

El motivo es razonable: tres suites que ya existían leen las pistas de la constante, y R12 pide que con CR el texto sea idéntico. Además, el test nuevo fija que la constante sea igual a `pistasConImpuesto(IMPUESTO_ROTULO)`, así que las dos no pueden divergir.

## Hallazgos
1. **menor (condición de cierre, no es un defecto de código).** Falta T4.3: no hay constancia de `./init.sh` ni de los E2E afectados corridos en local. Son el grupo `dinero`, `analitica-roles`, `cierres-admin` y `guia-api-ejemplos-ejecutables`.
   - `docs/perfil-agentes.md > reviewer` lo pone como bloqueante para un PR que toca pantallas o dinero.
   - El leader ordenó que corran en CI, según la regla del humano de correr el gate en GitHub.
   - No lo bloqueo por esa orden explícita. La feature no puede pasar a `done` ni avisarse como lista para mergear hasta que `gate-completo` y esos E2E estén verdes y T4.3 marcada `[x]`.
2. **menor.** `DETALLE_DINERO_TEXTOS.totales.empresaPista` y `.retornoPista` siguen exportadas con el rótulo de la plataforma. Un consumidor futuro que las lea de la constante pintaría «IVA» con cualquier país.
   - Hoy solo las leen tests, lo comprobé con Grep.
   - El comentario de `PISTAS_DE_LA_PLATAFORMA` lo advierte.
   - Para una ficha posterior: migrar esas tres suites a `pistasConImpuesto(IMPUESTO_ROTULO)` y quitar las entradas.
3. **menor.** `design.md §5.2` dice «Las dos entradas salen de la constante», y no se reflejó la desviación en el spec, solo en la bitácora. Conviene una línea en el design o en la Decisión de la feature para que no lo herede la siguiente rebanada como si estuviera hecho.

## Veredicto
**OK.** No hay bloqueantes en el código. Queda condicionado, para el cierre, a T4.3: `./init.sh`, el E2E afectado y `gate-completo` en verde en CI.
