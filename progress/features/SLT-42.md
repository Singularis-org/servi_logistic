# SLT-42 «Teléfono, documento y hora por país»

| key | nombre | zone | complexity | rama | assignee | estado |
|---|---|---|---|---|---|---|
| SLT-42 | telefono-documento-hora-por-pais | backend | high | feature/SLT-42-telefono-documento-hora-por-pais | Camilo (6ace53aa94bfd46ee6a600a5) | pending |

> Solo lo edita la rama de esta feature. Se lee al trabajarla, no al arrancar sesión.

## Estado
F1.0 cerrado (2026-11-03): tarjeta asignada, rama publicada (fb250fc2), worktree creado.
`/afinar-feature` cerrado (2026-11-03): `requirements.md` sembrado. Zona pasa a `backend`; la
pantalla del superadmin y los formularios salen a SLT-81.
F1.4 aprobado por escrito (2026-11-03, «aprobado»), con `libphonenumber-js` (fila en
`docs/dependencias.md`). Comentado en la tarjeta. **La tarjeta sigue en `spec_ready`**: no pasa a
`in_progress` (F2.0) hasta que se cumplan las dos condiciones de abajo.

Bloqueos de F2.0:
1. Cupo backend: subido de 3 a 4 en `arnes.config.json` por decisión del humano (2026-11-03): SLT-43, SLT-44 y SLT-65 están en pausa para pruebas futuras. Resuelto.
2. `archivos-en-vuelo.mjs --candidata SLT-42` (2026-11-03) CHOCA con fichas de Carlos Restrepo:
   SLT-52 (schema, servicios de cierres, CorteDiarioService, OrdenRepository, openapi…), SLT-56
   (CierresAdmin*) y SLT-64 (CierreDia*, `app/api/cron/procesar-jobs/route.ts`). SLT-56 ya figura
   `done` en el board. Esperar a que terminen o que el humano acepte el choque (`--acepto`).
   Con SLT-43 (propia) solo AVISO. Choque ACEPTADO por el humano (ver Decisiones). Resuelto.

## Evaluación
- zone `backend` (era `fullstack`; la UI salió a SLT-81 el 2026-11-03): catálogo por país, migración, validación en servidor, hora.
- complexity `high`: toca unos 80 archivos (teléfono ~12, documento ~43, zona horaria ~47 con tests),
  incluye jobs/cron y cortes de día; posible dependencia nueva (libphonenumber).
- Cupo: al tomarla era fullstack (0 de 3). Al pasar a `backend` choca: SLT-43, SLT-44 y SLT-65 ya
  ocupan los 3 cupos backend. Puede seguir en spec (pending/spec_ready no cuentan), pero NO pasa a
  `in_progress` (F2.0) hasta que una de esas tres pase a `done`.
- Cruce de archivos: sin `tasks.md` aún; repetir `archivos-en-vuelo.mjs --candidata SLT-42` en F2.0.
- `depends_on`: SL-20, `done`.

## Decisiones
- 2026-10-26 (en /afinar-feature SL-20): teléfono con libphonenumber (dependencia nueva, requiere
  los cuatro checks y aprobación); zona horaria es del país; documento único por país y tipo.
- 2026-11-03: por ahora solo se soporta Costa Rica. Prefijo y validación de teléfono, tipos de
  documento y zona horaria salen de **catálogos por país**; se siembra solo CR y se agregan filas
  cuando entre un país nuevo.

- 2026-11-03 (/afinar-feature): ver tabla de decisiones en `specs/SLT-42-*/requirements.md`.
  libphonenumber entra ahora; documento único por empresa y tipo; 5 tipos de CR; ficha partida
  en SLT-81 (frontend, bloqueada por SLT-42 y SLT-46).

- 2026-11-03: el humano acepta el choque de archivos con SLT-52, SLT-56 y SLT-64 (Carlos Restrepo):
  «Acepto el choque, arrancar ya». Resuelve quien mergee segundo (F2.3). `--acepto SLT-52,SLT-56,SLT-64`.
- 2026-11-03: cupo backend 3 → 4 en `arnes.config.json`: «ignoralo, esas estan en pausa para
  pruebas futuras, las de geo» (SLT-43, SLT-44, SLT-65).

- 2026-11-04 (tras tanda 1, desvíos de `progress/impl_SLT-42.md`):
  1. Guardia `geografia-predicado-unico`: se acota a geografía (provincia/cantón/distrito/nodos); deja de mirar otras tablas.
  2. Migración 120100: inserta «ruc»/«pasaporte» si faltan (CI, bases nuevas) en vez de abortar. Desvío aceptado del design.
  3. `scripts/seed-catalogos.ts`: se QUITAN los tipos de documento del seed; solo los crea la migración.
  4. Tipo de documento inactivo: la lectura lo devuelve con `activo: false` y el servicio lo rechaza (R11), con mensaje propio.
  5. Excepción de plataforma etiquetada `SL-20` en vez de `SLT-42` (deuda D29, criterio de SLT-58): aceptado por el leader.

- 2026-11-04 (tras tanda 2, preguntas de `progress/impl_SLT-42.md > Tanda 2`):
  1. Rojo de `rollup-guards` R47: `TOPE_MEMO` de `calendario-zona.ts` pasa de `20_000` a `16_384`; la guardia no se toca (opción A, humano). Hecho en `4e99808c`.
  2. Webhook de WhatsApp con país incompleto (`PaisIncompleto`): se registra el error en el log, se saltan los mensajes de esa empresa y se responde 200 a Meta, sin tumbar el lote ni provocar reintentos (opción A, humano). Pendiente de implementar.
  3. Rastreo público: sigue con `normalizarTelefonoCR` en esta tanda; se resuelve en T5.6, con el país de la empresa dueña de la orden (opción A, humano).
  4. `CorregirDatosClienteService`: pasa ya al prefijo del país, como WhatsApp en T4.4, y se ajusta la guardia `corregir-datos-sin-rastro` para que acepte la función nueva (opción A, humano). Pendiente de implementar.
  5. R15: aprobar una postulación NO reescribe el teléfono; solo cambia `estado` (feature 22). Los teléfonos viejos van con la pregunta abierta «normalizar teléfonos guardados» (humano).
  6. Postulación previa a SLT-42 con documento o teléfono fuera de regla: se aprueba igual; la validación del país solo se aplica a las postulaciones nuevas. Aprobar ya no devuelve `validation_error` por esos datos (humano). Pendiente de implementar; falta fijar qué marca «previa» (p. ej. fecha de creación anterior a la migración).
  7. Alta de empresa: la comprobación de repetición va ANTES de validar R6 y los datos del maestro, como en SL-20 §13; repetir un alta siempre da `ya_existe` (humano). Pendiente de implementar.
  8. Los 9 desvíos menores del design de la tanda 2 (lista en `progress/impl_SLT-42.md > Tanda 2`) quedan aceptados (humano).
  9. `historial-accion-atomicidad` (17 rojos por datos de `logistic_slt42_test`): se recrea esa base desde cero y se vuelve a correr el test para comprobar el ajuste de T4.1 (humano).

- 2026-11-04 (tras tanda 2b, preguntas de `progress/impl_SLT-42.md > Tanda 2b > Preguntas`):
  1. Corte de «postulación previa» (`POSTULACION_VALIDADA_POR_PAIS_DESDE`): queda `2026-11-04T14:00Z` por ahora y se ajusta al instante real del deploy como paso de T1.0 (humano).
  2. Corregir datos con país incompleto: devuelve `fieldErrors.telefonoDest` con texto propio en vez del error genérico (humano). Implementado en la tanda 2c.
  3. Webhook que salta una empresa por país incompleto: los estados de entrega y el «último contacto» se siguen aplicando; solo se saltan los mensajes entrantes (humano).
  4. `ChatLogger` gana nivel `error`; el aviso de mensajes saltados sale por `console.error` (humano). Implementado en la tanda 2c.
  5. `historial-accion-atomicidad`: no se arregla en SLT-42; queda para SL-31, que ya lo tiene en el baseline (humano).
  6. Test de integración que recorre `construirReglasPaisEmpresa` dentro de `buildService()` de corregir datos (humano). Implementado en la tanda 2c.

- 2026-11-05 (tras T5.3, desvíos de `progress/impl_SLT-42.md > Tanda 3 · T5.3`):
  1. `reglasPais` queda opcional en los constructores de servicio (la real la inyecta cada composition root); T7.1 suma una guardia que exige `construirReglasPaisEmpresa` en cada composition root de esos servicios (humano).
  2. Rutas (`OptimizacionRutaService`, 2 marcadores «rutas, sin task asignada») pasa a T5.5 (humano).
  3. `lib/types/historial-accion-etiquetas.ts` (fecha en CR para cierres, bodega y órdenes) pasa a T5.4 (humano).
  4. Desvíos menores aceptados: repositorios con `zona` para formatear fechas; filtros de cierres como instantes (toca 2 servicios de bodega); `generarGuiaLote` exige `fechaReparto` con mensajero; 3 actions de lectura leen la zona en el borde; `jornada-cierre.ts` sin cambios (humano).

- 2026-11-05 (tras T5.4, preguntas de `progress/impl_SLT-42.md > Tanda 4a · T5.4`):
  1. `CajaBackfillTesoreriaService` es código muerto (nada lo construye fuera de los tests): se deja como está, con la zona en `deps` (humano).
  2. `PlanesService`: la fecha que se muestra pasa a la zona de la empresa en T5.5; el ciclo de cobro sigue en UTC (humano).
  3. Integración de T5.4 contra la base: la corre CI (`gate-completo`) en el PR; no se corre en local (humano).

- 2026-11-05 (tras T5.5, preguntas de `progress/impl_SLT-42.md > Tanda 4b · T5.5`):
  1. Catálogo de planes y correo de cambio de plan: el correo muestra la fecha en la zona de la empresa que cambia de plan; el catálogo sin empresa (superadmin) la muestra en UTC con la etiqueta «UTC». Va en T5.7 (humano).
  2. Descripciones de variables de informes y `plantilla-datos.ts`: «(hora de Costa Rica)» pasa a «(hora local)» en SLT-42, en T5.7 (humano).
  3. `scripts/rollup-analitica-manual.ts`: se arregla en T6; recorre las empresas y usa la zona de cada una, como el job diario (humano).
  4. Corte de «hoy» del chat de WhatsApp (`lib/actions/chat-whatsapp.ts`) y tope diario de `AsistenteService`: pasan a la zona de la empresa en T5.7 (humano).
  5. Desvíos de T5.5 aceptados (humano): zona `"UTC"` sin actor en los bordes de analítica (`zonaDelBordeConActor`), `PlanesService` con `zonaDeOrganizacionCon`, «hora local» en los PDF.

- 2026-11-05 (tras T5.6, preguntas de `progress/impl_SLT-42.md > Tanda 4c · T5.6`):
  1. Rastreo público con país sin prefijo o dígitos de teléfono: responde `no_encontrado` (no delata la guía) y deja un `console.error` con la empresa para soporte (humano). Va en T5.7.
  2. Rastreo público con país sin zona horaria: se iguala al caso anterior, `no_encontrado` + `console.error` con la empresa, en vez del error de servidor de R28 (humano). Va en T5.7.
  3. Desvío aceptado: `PaisSinZonaHoraria` lo lanza `zonaHoraria()` de las reglas del país, no el servicio (R33 de la 229).

- 2026-11-06 (tras T5.7, preguntas de `progress/impl_SLT-42.md > Tanda 4d · T5.7`):
  1. Desvíos de T5.7 aceptados (humano): etiqueta «UTC» dentro del valor `vigenteDesdePendiente` («AAAA-MM-DD UTC»); `ReglasPaisEmpresaService` en la lista blanca del borde de `asistente-sin-datos`; aviso del rastreo por `ErrorLogger`; entrada sin ruptura en `docs/api/CHANGELOG.md`.
  2. `lib/types/plantilla-datos.ts` (`fechaHora`): pasa a la zona de la empresa en T6, en SLT-42, incluida la vista previa (humano).
  3. `docs/api/guia-integracion/guia-integracion.html` §5: el texto pasa a «zona horaria del país de la empresa (hoy Costa Rica, UTC-6)» en T6 (humano).

## Pendiente para el cierre
- 2026-11-05, pedido del humano: al terminar la feature, resumen de TODOS los errores nuevos que puede lanzar SLT-42 (p. ej. `PaisIncompleto`, `PaisSinZonaHoraria`, `EmpresaNoResuelta`, documento/teléfono inválido por país, tipo de documento inactivo): dónde salen, qué ve el usuario y qué hay que completar o configurar (catálogo de país, zona, prefijo, tipos de documento, `POSTULACION_VALIDADA_POR_PAIS_DESDE`, T1.0) para que no se disparen. Va a `progress/impl_SLT-42.md > Errores nuevos y prevención` y se resume al humano.

## Preguntas abiertas
Las del `requirements.md` (normalizar teléfonos guardados, jobs por zona horaria, largos de documento).

## Tandas
- 2026-11-04 · T0.1, T1.1–T1.5, T2.1–T2.4, T3.1–T3.2 · 31a5b0eb · gate rápido local rojo por carga (6 tests de UI, verdes 3/3 en la rama y en dev sin carga; ver impl_SLT-42.md); subido. T1.0 pendiente (persona, antes del deploy).
- 2026-11-04 · T4.1–T4.4 (+ migraciones slt42 renombradas a 20261104140000–140200 tras el merge de dev) · f0f20c0a, f38e1c9f, 070e6e96 · typecheck exit 0; test:guardias 9 rojos: `dependencias-declaradas-presentes` (4, en el baseline), `rollup-guards` R47 (1, REAL de SLT-42: la cifra de la caché de `calendario-zona.ts` del fix-up de la tanda 1 coincide con el umbral de volumen), 4 que pasan solas (`dominio-ordenex-fuera`, `filtros-url-r25`, `otp-debug-solo-en-pruebas`, `sin-estados-retirados`) y `descargas-por-registro` (timeout de 20 s, también sola; ningún archivo de UI tocado). Preguntas abiertas en impl_SLT-42.md > Tanda 2.
- 2026-11-04 · Tanda 2b (decisiones 2, 4, 6, 7 y 9 de «tras tanda 2») · a35d50f6, 13757c87 · typecheck exit 0; test:guardias solo con los 4 rojos de `dependencias-declaradas-presentes` (baseline); los tests tocados, en verde. `logistic_slt42_test` recreada: `historial-accion-atomicidad` sigue rojo por el fixture (no hay órdenes, o las FKs son de otra empresa; está en el baseline y no es de SLT-42). `descargas-por-registro`: la lentitud es de la guardia, no de SLT-42. Preguntas en impl_SLT-42.md > Tanda 2b.
- 2026-11-04 · Tanda 2c (decisiones 2, 4 y 6 de «tras tanda 2b») · commit de esta tanda · typecheck exit 0; test:guardias solo con los 4 rojos de `dependencias-declaradas-presentes` (baseline); 11 archivos de test tocados en verde; `corregir-datos-cliente.{chat,repo}` rojos en `beforeAll` porque `logistic_slt42_test` está sin datos (pregunta en impl_SLT-42.md > Tanda 2c).
- 2026-11-05 · T5.3 (zona de la empresa en órdenes, reparto, cierres, corte y reprogramadas) · commit de esta tanda · typecheck exit 0; test:guardias solo con los 4 rojos de `dependencias-declaradas-presentes` (baseline); integración tocada: 34 rojos, todos en el baseline (base sin datos); `vitest related` en 5 de 7 lotes (los 2 últimos los paró Claude Code por falta de memoria; se cubrieron con los 29 tests tocados que faltaban, en verde). Fuera del baseline: `carga-division` (carga, verde aislado) y `demo-qa`, rojo real de T4.2/T4.3 (documento del maestro demo inválido), sin tocar. Detalle en impl_SLT-42.md > Tanda 3 · T5.3.
- 2026-11-05 · Tanda 4a · T5.4 (zona de la empresa en wallet, liquidación, caja e historial; la dejó sin commitear un agente anterior, revisada y cerrada) · a6109cff · typecheck exit 0; lint limpio; test:guardias solo con los 4 rojos de `dependencias-declaradas-presentes` (baseline); 58 tests unitarios tocados en verde; `vitest related` en 11 lotes: rojos de UI por carga en los lotes 1–2 (verdes aislados); los lotes 3–11, sin UI, en verde. Integración con base no corrida (sin `DATABASE_URL`). Preguntas en impl_SLT-42.md > Tanda 4a · T5.4.
- 2026-11-05 · Tanda 4b · T5.5 (analítica, tablero, ranking, notificaciones, avisos e informes de WhatsApp) + rutas + fecha que muestra `PlanesService` · 35466d02 · typecheck exit 0; lint 0 errores; test:guardias solo con los 4 rojos de `dependencias-declaradas-presentes` (baseline); `vitest related` sin UI ni integración en 16 lotes: sin rojos de T5.5 (el único rojo, `ordenes-listado-vistas` de UI, por carga, verde aislado). Integración: la corre CI. Preguntas en impl_SLT-42.md > Tanda 4b · T5.5.
- 2026-11-05 · Tanda 4c · T5.6 (rastreo público con el país de la empresa dueña de la orden; fuera `RASTREO_PUBLICO_ZONA_HORARIA` y `normalizarTelefonoCR` del rastreo) · 61cd7c2e · typecheck exit 0; lint 0 errores; test:guardias con los 4 rojos de `dependencias-declaradas-presentes` (baseline) y `sin-estados-retirados` por carga (verde aislado); tests del rastreo 150/150; `vitest related` sin UI ni integración 113/113. Integración: la corre CI. Preguntas en impl_SLT-42.md > Tanda 4c · T5.6.
- 2026-11-06 · Tanda 4d · T5.7 (API por key y OpenAPI, páginas de servidor) + agregados: correo y catálogo de planes, «(hora local)», chat y asistente en la zona de la empresa, rastreo con país incompleto → `no_encontrado` + aviso · ac5a2eb4 · typecheck exit 0; lint 0/0; test:guardias con los 4 rojos del baseline, `sin-estados-retirados` por carga (verde aislado) y `asistente-sin-datos` arreglado (lista blanca del borde); `vitest related` sin UI ni integración, 5 lotes en verde (270 archivos, 4297 tests). Integración: la corre CI. Quedan 9 marcadores, todos T6. Preguntas en impl_SLT-42.md > Tanda 4d · T5.7.

## Modelos (overrides)

## Cierre
