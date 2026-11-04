# SL-42 «Vehículos: catálogo de la plataforma» — review (vuelta 1, completa)

Revisado: `git diff origin/dev...HEAD` (HEAD `60e42c61`), contra
`specs/SL-42-vehiculos-catalogo-plataforma/{requirements,design,tasks}.md` (enmienda `7ae9e721`),
`progress/impl_SL-42.md`, `docs/{architecture,conventions,verification,perfil-agentes,checkpoints-proyecto}.md`
y `CHECKPOINTS.md`. Fecha: 2026-11-04.

## Verificación que corrí yo (NODE_OPTIONS=--max-old-space-size=8192)

- `pnpm run typecheck`: 0 errores.
- `eslint` sobre los `.ts/.tsx` añadidos o modificados del diff: 0 problemas.
- `vitest run` por ruta de los 15 archivos de test de la feature, incluida la integración contra
  Postgres. Comprobé que `DATABASE_URL` apunta a `localhost` y no la imprimí. Resultado:
  `Test Files 15 passed (15)`, `Tests 301 passed (301)`, 0 skipped. Los archivos:
  - `tests/unit/{types/vehiculos, services/vehiculo-service, services/usuario-vehiculo, services/postulacion-mensajero-service, actions/vehiculos-plataforma-action, components/vehiculos-plataforma-page, components/usuario-form, auth/menu-visibility}`;
  - `tests/components/{Sidebar, TarifasAlineacionRejilla, TarifasClaridadMontos}`;
  - `tests/integration/{actions/vehiculos-action, db/vehiculos-migration, db/vehiculos-plataforma, postulacion-page}`.
- `pnpm run test:guardias`: `Test Files 1 failed | 322 passed | 3 skipped (326)`, `Tests 4 failed | 4532 passed`.
  Los 4 rojos son de `dependencias-declaradas-presentes`, que está en la baseline. No hay ningún rojo nuevo.
- Barrido del diff añadido: no aparece Costa Rica, colones, SINPE, Ordenex ni `console.log`. Los únicos
  aciertos son `SinPermiso` y un fixture de test con `sinpeNumero`, que no cuentan.
- No corrí `./init.sh` (validador cortado por el cupo 4/3 de SLT-42, contexto conocido) ni el E2E
  (`next build` no cabe en el tope local, contexto conocido).

## Checklist

### Trazabilidad (R → test que afirma de verdad)
- [x] R1: `vehiculos-plataforma-page.test.tsx` › «R1 — la puerta, antes de leer» (404 sin llamar a la action) + `menu-visibility.test.ts` › SL-42 R1 (solo superadmin).
- [x] R2: `vehiculos-plataforma-page.test.tsx` › «R2 — el listado»; `vehiculo-service.test.ts` › listarTodos. Ver m1.
- [x] R3: `menu-visibility.test.ts` › «R3: el aterrizaje…» (compara con y sin el ítem para los 7 roles) y R36.
- [x] R4: servicio, action (nombre normalizado), integración (activo por DEFAULT) y UI.
- [x] R5: servicio (incluido el propio nombre sin escribir), integración, UI.
- [x] R6: servicio (no-op sin escribir), integración (no toca `usuario.vehiculo_id` ni `tarifa_zona_mensajero`), UI.
- [x] R7: integración por el cliente real sin empresa, con control «sin `comoPlataforma` → `EmpresaNoResuelta`».
- [x] R8: action (exporta exactamente cuatro) + UI (sin botón de borrar).
- [x] R9: `tests/unit/types/vehiculos.test.ts` + action (`validation_error` por campo, sin servicio).
- [x] R10: servicio (activo o inactivo), action (único en carrera), integración.
- [x] R11: action (permission denied → `error`, log con causa y sin nombre ni mensaje; `causa=desconocido`; cambio de estado nunca `conflict`).
- [x] R12: servicio, action, integración (`not_found` sin rastro).
- [x] R13: `vehiculos-plataforma-page.test.tsx` › «R13 — un mensaje por desenlace».
- [x] R14: servicio (barrido de roles, sin repositorio), action (las cuatro con maestro y sin sesión), guardia `superadmin-fuera-de-empresa` con contraprueba.
- [x] R15: `menu-visibility.test.ts` › «R15».
- [x] R16: `vehiculos-plataforma-page.test.tsx` › «R16» (la ruta no existe en `app/`), menú, y E2E escrito (sin correr en local).
- [x] R17: servicio, `vehiculos-action.test.ts`, `usuario-form.test.tsx`, `postulacion-page.test.tsx`.
- [x] R18: servicio de usuarios y de postulación, SQL de la postulación, UI. La viñeta de la asignación la cubre ahora `vehiculos-plataforma.test.ts` › «R18 — un mensajero con vehiculo inactivo sigue siendo asignable…» (`60e42c61`, con control de que el filtro filtra). Ver B1 para el mapa desactualizado.
- [x] R19: `vehiculos-plataforma-page.test.tsx` › «R19» (recorre `docs/ayuda` con control de no vacuidad).
- [x] R20: servicio (no importa `appendAccion`/`historialAccion`) + guardia `historial-accion-escrituras-cubiertas`.
- [x] R21: integración en el repositorio y en el borde: una fila por escritura con todos los campos; ninguna en los no-op.
- [x] R22: integración (SQL con `servi_app` → 42501; cliente de la app en contexto de empresa → rechazo).
- [x] R23: `vehiculos-migration.test.ts` (up y down contra Postgres; `servi_app` sigue sin escribir).
- [ ] `progress/impl_SL-42.md` contiene el mapa R → test: está, pero el «Mapa completo» todavía declara el hueco de R18 que `60e42c61` cerró (B1).

### Especificación (CHECKPOINTS)
- [x] requirements EARS R1–R23; design con alternativas descartadas A1–A4.
- [ ] Todas las tasks `[x]`: **T5.1 y T5.2 siguen `[ ]`** (B1, m2).
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada de esa lista: reutiliza el servicio, el repositorio, el schema, `esViolacionDeUnico` y `exigirSuperadmin`; el módulo viejo se borra y el nuevo parte de él.

### Equipo
- [x] Assignee y rama de feature (`progress/features/SL-42.md`); el choque con SLT-51/52/56/64 está aceptado por el humano el 2026-11-03.

### Calidad de código
- [x] Typecheck sin errores (lo corrí yo).
- [x] Lint sin errores en los archivos del diff (lo corrí yo; la bitácora da 234 avisos heredados y ningún error).
- [ ] `gate-completo` en CI: pendiente de PR.
- [ ] Flujo crítico «Aislamiento entre empresas»: el diff toca `lib/db/`, así que exige `e2e/dos-empresas-humo.spec.ts`. El spec está escrito, pero no hay salida local (m2).
- [x] Sin dependencias nuevas.

### Seguridad / Configuración
- [x] Sin secretos ni valores de entorno hardcodeados. No hay webhooks.

### Datos y seguridad (proyecto)
- [x] `vehiculo_rastro` es tabla de plataforma: sin `organizacion_id` (la excepción la justifica D12, igual que `plan_rastro`), con RLS sin políticas y `REVOKE ALL` a `servi_app`, clasificada en `MODELOS_DE_PLATAFORMA`. La guardia `organizacion-en-modelos` está verde.
- [x] Las dos migraciones traen `down.sql` idempotente, y ninguna edita una migración aplicada.
- [x] El log de R11 no lleva PII (solo `error.name`).

### Arquitectura / Permisos (proyecto)
- [x] Capas: action → servicio → repositorio. El rastro tiene un único escritor y va en la misma `$transaction`.
- [x] zod en el borde (`.strict()`).
- [x] Autorización en el servidor por partida doble: `exigirSuperadmin` en el borde y `GESTION_ROLES` en el servicio. La página da `notFound()` antes de leer.
- [x] `comoPlataforma` solo en el borde, con su entrada en `EXCEPCIONES_DE_PLATAFORMA` (ficha y motivo, según la enmienda). La guardia `plataforma-solo-en-lista` está verde.

### Reglas del reviewer (`docs/perfil-agentes.md`)
- [x] No hay tabla de negocio sin `organizacion_id`, tabla sin RLS ni migración sin `down.sql`.
- [x] No hay literales de país o moneda en código nuevo, ni recursos de Ordenex.
- [x] No hay dependencias nuevas.
- [x] Los comentarios explican el porqué. Son largos, pero siguen el estilo del repo.

## Desviaciones juzgadas (no son hallazgo)

- **T4.3 y T4.4 en el commit de T2.4/T4.2 (`0e283e4a`).** Se aceptan. Sin ellas ese commit dejaba el menú
  y la ayuda apuntando a una ruta borrada, y `ayuda-pantalla-ruta-existe` y el R16 del menú salían rojos.
  Es la misma razón que tuvo el humano para juntar T2.4 y T4.2.
- **Guardias de conteo.** Se aceptan:
  - `pwa-manifiesto-atajos`: el maestro pasa de 25 a 24 y el superadmin de 3 a 4;
  - `asistente-sin-frontmatter`: pasa de 38 a 37.
  Las dos cifras son exactamente lo que el spec mueve (sale el subítem y la ayuda, entra el ítem de
  plataforma), y cada cambio está comentado con la ficha.
- **Excepción en `geografia-predicado-unico` para `lib/repositories/_shared/vehiculo-activo.ts`.** Se
  acepta. Es la salida que la propia cabecera de la guardia preveía para un segundo `activo`. Exceptúa
  un solo archivo, y un caso nuevo la acota: exactamente `["activo: true"]` y ningún nivel geográfico.
  `create` deja de escribir el flag y usa el DEFAULT, que la integración de R4 comprueba. La regla de
  geografía no cambia.
- **Comentario en `lib/types/gestion-orden.ts`.** Se acepta. Nombraba `VehiculoActionError`, un tipo que
  el diff borra; ahora cita `lib/actions/vehiculos-plataforma.ts`, que usa ese mismo `status: "error"`.
  Un comentario con una referencia muerta habría sido peor.
- **`historial-accion-sin-datos-cliente`.** Se acepta. `VehiculoRepository` sale de los puntos de
  escritura y la contraprueba pasa a `PlantillaMensajeRepository`, con el mismo molde de un bloque.

## Hallazgos

### B1 — BLOQUEANTE (proceso): T5.2 sin marcar y el mapa R → test desactualizado
- `CHECKPOINTS.md > Especificación` exige todas las tasks `[x]`, y `tasks.md:103` (T5.2) sigue `[ ]`.
  El «Hecho» de T5.2 pide dos cosas:
  - `./init.sh` verde: no evaluable hoy por una causa ajena y conocida, el cupo 4/3 de SLT-42;
  - «los 23 requisitos tienen test»: ya se cumple.
- Pero `progress/impl_SL-42.md:351` (sección «Mapa completo R → test», viñeta R18) sigue diciendo
  «**Hueco parcial:** la viñeta de la asignación de órdenes no tiene un test». Las líneas 374-381
  («Estado de T5» y «Veredicto») repiten ese hueco. `60e42c61` lo cerró, pero solo añadió la línea
  en la sección de T3.1 (`:215`), y el mapa que pide CHECKPOINTS quedó contradiciéndose.
- Es el mismo caso que SL-23 B2.
- **Qué falta (sin tocar código):**
  1. Actualizar el mapa completo y el «Estado de T5» de `progress/impl_SL-42.md` con el test de R18
     (asignación), y quitar el «hueco parcial».
  2. Que el leader deje anotado en T5.2 (o en la bitácora) por qué `./init.sh` no es evaluable y que
     sus pasos se verificaron por separado: typecheck 0, lint 0 errores y guardias verdes salvo la
     baseline. Esta review lo comprueba.
  3. Marcar T5.2 `[x]`.

### m1 — menor: R2, un fallo real de lectura no llega al aviso del módulo
- `listarVehiculosPlataformaAction` no tiene `try/catch`, y su tipo de resultado no tiene `error`
  (`lib/actions/vehiculos-plataforma.ts`). Si la base falla, la excepción sube desde
  `app/(app)/plataforma/vehiculos/page.tsx` hasta `app/(app)/error.tsx`, que dice «No pudimos cargar
  esta pantalla». No llega a «No se pudo cargar el catálogo de vehículos.»
- R2 se sigue cumpliendo en lo esencial: no se pinta como vacío y sí dice que no se pudo cargar.
- El test de R2 solo simula `status: "forbidden"`, una rama que la página ya hace inalcanzable con su
  propia puerta. El caso realista (que la action lance) no está probado.
- Es el mismo patrón que `listarPaisesAction` (SL-20).
- Sugerencia, no obligatoria: capturar en la action con `registrarFallo("listado de vehiculos", e)` y un
  test que lo fuerce con `mockRejectedValue`.

### m2 — menor: T5.1 `[ ]` y sin salida local del humo de aislamiento
- El diff toca `lib/db/` (`excepciones-aislamiento.ts`, `modelos-de-negocio.ts`).
  `docs/checkpoints-proyecto.md > Flujos críticos` pide correr `e2e/dos-empresas-humo.spec.ts` y
  `CHECKPOINTS.md` pide su salida local en la bitácora. No la hay: `next build` no cabe en el tope local.
- El «Hecho» de T5.1 es «pasa en CI», así que por construcción solo se cierra con el PR (precedente:
  SL-43 m3). Revisé el spec: sin `skip`, `fixme` ni `.only`, afirma el 404, la ausencia de «Tipos de
  vehículo» y que el catálogo no cambia.
- **Qué falta:** el leader debe ver el grupo `aislamiento` verde en `gate-completo`, marcar T5.1 `[x]`
  y dejar anotado que la salida es la de CI y no la local.

### m3 — menor: la bitácora cita un commit que no existe
- `progress/impl_SL-42.md:189` dice «en el commit 564b6532». En la rama, T2.4 + T4.1–T4.4 están en
  `0e283e4a` (hubo reescritura).
- Corregir la referencia.

## Veredicto

**RECHAZADO**: 1 bloqueante (B1, solo de proceso y documentación) y 3 menores.

El código, los tests y las guardias están bien: typecheck 0, 301/301 tests de la feature con la
integración contra Postgres, y guardias verdes salvo la baseline. Los R1–R23 tienen test real. Para
pasar a OK basta con cerrar B1: actualizar el mapa de R18, anotar por qué `./init.sh` no es evaluable
y marcar T5.2. No hace falta tocar código.
