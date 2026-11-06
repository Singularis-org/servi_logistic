# Review SLT-42 «Teléfono, documento y hora por país»

- Rama `feature/SLT-42-telefono-documento-hora-por-pais`, HEAD `9039b3a2`, diff `origin/dev...HEAD`
  (62 commits; 352 archivos fuera de `tests/`, `specs/` y `progress/`).
- Reviewer, 2026-11-06. Las decisiones y desvíos de `progress/features/SLT-42.md > Decisiones` y de
  `design.md > Desvíos aceptados` no se reportan como hallazgo: se comprobó que el código los cumple.
- Grafo MCP: no se usó (Grep/Read bastaron).

## Veredicto: RECHAZADO (cambios requeridos)

1 hallazgo **BLOQUEANTE** y 4 **menores**. Ninguna R está sin test.

## Verificación ejecutada por el reviewer

| Comando | Resultado |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` | exit 0 |
| `pnpm test:guardias` | `Test Files 1 failed / 325 passed / 3 skipped`, `Tests 4 failed / 4586 passed`. Los 4 rojos son de `dependencias-declaradas-presentes` (baseline esperado) |
| `vitest run` de los 19 archivos de test del mapa R → test (unitarios y `migracion-slt42-ida-y-vuelta`) | `19 passed`, `334 passed / 5 skipped` (los 5 omitidos son los de base, que corre CI) |
| `eslint` de los 327 `.ts/.tsx` de producción añadidos o modificados (4 lotes) | 0 errores; 3 warnings ya existentes (`GestionarOrdenPanel.tsx:76`, `IOrdenRepository.ts:11`, `whatsapp-envio-mantenimiento-handler.ts:67`), ninguno de este diff |
| Integración con base, E2E, `./init.sh` | No corridos (los corre CI o el leader en F2.4) |

## Checklist

### CHECKPOINTS.md
- [x] `requirements.md` con EARS R1–R31.
- [x] `design.md` con alternativas descartadas (§9, 7) y su porqué.
- [ ] `tasks.md` todo `[x]`: falta **T1.0**. Es el paso humano previo al deploy y está aceptado así
  (ficha, tandas 1 y 6). No bloquea el PR a `dev`; sí el deploy. Ver menor m2.
- [x] `design.md` abre con `## Lo que ya existe`, con búsqueda hecha. El diff no re-crea nada:
  amplía `tipo_identificacion`, reutiliza `pais` e `IPaisRepository` y generaliza `telefono-cr`.
- [x] Assignee y rama publicada (ficha, F1.0).
- [x] Cada R tiene test (tabla abajo) y `progress/impl_SLT-42.md` tiene el mapa (T7.3 + tanda 7).
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` en CI: pendiente (no hay PR todavía).
- [ ] Flujo crítico con E2E y su salida local en `impl_SLT-42.md`: **falta**. Ver B1.
- [x] Dependencia nueva `libphonenumber-js`: fila en `docs/dependencias.md:77` con los 4 checks y la
  aprobación citada en `design.md` §7.
- [x] Sin secretos hardcodeados. No hay webhook nuevo. El cambio en `WebhookWhatsappService` conserva
  la firma y la idempotencia.
- [x] Configuración: la zona, el prefijo y los dígitos salen del catálogo. Se retiró `RASTREO_PUBLICO_ZONA_HORARIA`.
- [ ] `./init.sh` en verde y `review` OK: pendiente de este rechazo.
- [ ] `progress/features/SLT-42.md > Cierre`: vacío (lo completa el leader al cerrar).

### docs/checkpoints-proyecto.md
- [x] Typecheck y lint.
- [ ] Flujos críticos con E2E: la feature toca rastreo público, cierres, wallet, liberación de
  reprogramadas, `lib/db/` y entradas sin sesión (cron y jobs). Ver B1.
- [x] Sin tabla de negocio nueva. `pais` y `tipo_identificacion` son de plataforma: RLS de lectura,
  la política restrictiva nueva `tipo_identificacion_del_pais` y el `REVOKE` de escritura.
- [x] Queries nuevas sobre negocio: el `AT TIME ZONE` de `ConteoCargadasPorDia`, `CohorteCarga` y
  `FinanzasDiario` corre en el contexto de la empresa. `zonasConEmpresas` es lectura de plataforma y
  está registrada en `EXCEPCIONES_DE_PLATAFORMA`. Hay integración con dos empresas (R31).
- [x] Las tres migraciones traen `down.sql`. Ninguna migración aplicada se editó.
- [x] Ningún recurso de Ordenex en el diff.
- [x] Sin PII en logs. Webhook: solo empresa y país. Rastreo: `{evento, organizacionId, paisId, falta}`
  (ni guía ni factor). Jobs sin zona: texto fijo.
- [x] Capas: lógica en `lib/services/`, datos en `lib/repositories/`. Los schemas zod de borde
  validan la forma (design §4.2).
- [x] País por configuración: la guardia R29 está en verde, con 8 excepciones (tope 8, aceptado por el humano).
- [x] Autorización: sin cambios de quién puede hacer qué (design §5).

### docs/perfil-agentes.md > reviewer
- [x] Toda tabla o query de negocio tiene `organizacion_id`, toda tabla tiene RLS y toda migración su `down.sql`.
- [x] Literales de país: solo en la lista de excepciones de R29 (SLT-81, SL-22, SLT-86).
  En el SQL de agrupación por día queda `'UTC'` (aceptado: reloj de pared guardado). En
  `CohorteCarga`, `ConteoCargadasPorDia`, `FinanzasDiario`, `IngresosAnalitica` y `TableroDia`
  `America/Costa_Rica` solo aparece en comentarios que explican qué está prohibido, y la guardia
  excluye los comentarios.
- [x] Dependencia con fila en `docs/dependencias.md`.
- [x] Los comentarios explican el porqué; son extensos, pero no describen el qué.

### Puntos pedidos por el leader
1. **Trazabilidad:** completa (tabla abajo).
2. **Decisiones de la ficha y design:** cumplidas. Se revisó:
   - repetición del alta antes de R6 (`OrganizacionService.ts:48-53`);
   - corte de postulación previa (`AprobacionPostulacionService.ts:136`);
   - webhook con `PaisIncompleto` → log `error` + 200, con estados y último contacto aplicados;
   - rastreo con país incompleto → `no_encontrado` + aviso;
   - `AT TIME ZONE` parametrizado;
   - planes en excepción SLT-86 y `whatsapp-telefono` borrado;
   - tope 8;
   - inactivo con `activo: false` y mensaje propio;
   - R9 (`UsuarioService.validarCambioDePersona` solo valida lo que cambia).
3. **Seguridad:**
   - El rastreo no filtra existencia de guías. Una guía inexistente responde `no_encontrado` sin
     tocar el país. Un país sin teléfono deja la orden no consultable (centinela). Sin zona, solo
     falla quien ya acertó el factor, y se traduce a `no_encontrado` (`lib/actions/rastreo-publico.ts:118-140`,
     `RastreoPublicoService.ts:140-171`).
   - La zona en el SQL va siempre como parámetro (`Prisma.sql` con `${zona}::text`). El prefijo y los
     dígitos del teléfono en SQL van como `$1/$2` (`ChatConversacionRepository.ts:105-116`). Solo se
     interpola la columna literal.
   - RLS y permisos del catálogo los prueba `tipo-documento-por-pais.test.ts`: 42501 en 8 escrituras,
     0 filas sin empresa y aislamiento CR/XA.
   - No hay datos de clientes en los logs.
4. **Patrón `reglasPais?`:** la guardia de composition roots (`pais-sin-literales.guardia.test.ts:243-300`)
   está en verde, con su autocomprobación. Literales de país solo en las 8 excepciones.
5. **Migraciones `20261104140000`–`140200`:**
   - Cada una va en su transacción y trae `down.sql` con guardas.
   - El down de 140100 aborta con usuarios en dimex/nite. El de 140200 aborta con repetidos de
     `(organizacion_id, cedula)`.
   - 140100 es idempotente en las filas viejas (`ON CONFLICT ("value") DO NOTHING` + `UPDATE … WHERE pais_id IS NULL`),
     como pide el desvío 1. La forma de la política coincide con `provincia_del_pais` (SL-20).
   - Ida, vuelta y re-subida probadas en `migracion-slt42-ida-y-vuelta.test.ts`.
   - T1.0 está bien descrito en lo esencial, pero incompleto: ver m2.
6. **Calidad y convenciones:** sin hallazgos más allá de m1.

## Trazabilidad R → test

Rutas bajo `tests/`. «(int)» = contra Postgres, la corre CI.

| R | Test (archivo · caso) |
|---|---|
| R1 | `integration/db/migracion-slt42-ida-y-vuelta.test.ts` · «R1, R3, R7, R8: sobre una base como la de producción…» (int) |
| R2 | `integration/db/tipo-documento-por-pais.test.ts` · «R2: la regla del tipo se valida en la base (caracteres, largos) y la clave es única dentro del país…» (int) |
| R3 | `migracion-slt42-ida-y-vuelta.test.ts` · «R3: en una base nueva… la subida deja los cinco tipos de CR…» y «R1, R3, R7, R8…» (int); `unit/utils/documento.test.ts` |
| R4 | `tipo-documento-por-pais.test.ts` · «R4, R5, R11, R31: cada empresa ve solo los tipos de su país…», «R4: sin empresa en el contexto, servi_app no ve ningún tipo», «R4: una empresa recibe 42501 al escribir en pais y en tipo_identificacion…» (int) |
| R5 | `integration/db/tipos-identificacion-por-pais.test.ts` · «R5: el WHERE del repositorio deja solo los activos…», «R5, R31: por el servicio…» (int); `unit/services/usuario-service-pais.test.ts` · «R5: …» |
| R6 | `unit/services/organizacion-service-pais.test.ts` · «R6: un país %s rechaza…», «R6: un país que no existe…», «R6: el país incompleto se rechaza antes…» |
| R7 | `migracion-slt42-ida-y-vuelta.test.ts` · «R1, R3, R7, R8…» (cedula → `CR/cedula_fisica`, ruc → `CR/cedula_juridica`, pasaporte → `CR/pasaporte`) (int) |
| R8 | `migracion-slt42-ida-y-vuelta.test.ts` · «cada una trae su down.sql…», «R8: con un usuario en DIMEX el down… aborta…», «R8: sin esos casos, los tres down.sql… dejan el esquema…», «reaplicadas las tres…» (int) |
| R9 | `usuario-service-pais.test.ts` · los tres «R9: …» |
| R10 | `usuario-service-pais.test.ts` · «R10: …» (5); `postulacion-mensajero-service-pais.test.ts` · «R10: …»; `organizacion-service-pais.test.ts` · «R10: …»; `documento.test.ts` |
| R11 | `usuario-service-pais.test.ts` · «R11: …» (5); `postulacion-mensajero-service-pais.test.ts`; `organizacion-service-pais.test.ts`; `unit/services/reglas-pais-empresa-service.test.ts` · «R11: tipoDocumento pregunta por el país de la empresa en curso»; `tipo-documento-por-pais.test.ts` (int) |
| R12 | `usuario-service-pais.test.ts` · los dos «R12: …» |
| R13 | `tipo-documento-por-pais.test.ts` · «R13, R31: el documento es único por empresa y tipo…», «R13: el repetido llega como P2002 con el nombre usuario_cedula_key…» (int); `integration/db/postulacion-documento-por-tipo.test.ts` (int); `postulacion-mensajero-service-pais.test.ts` · «R13: …» |
| R14 | `unit/validacion/telefono.test.ts`; «R14…» en usuario (4), postulación y alta de empresa |
| R15 | «R15: …» en `usuario-service-pais.test.ts` (2), `postulacion-mensajero-service-pais.test.ts` y `organizacion-service-pais.test.ts`; `validacion/telefono.test.ts` |
| R16 | `validacion/telefono.test.ts` (`XA` → `pais_sin_reglas`); «R16: …» en usuario, postulación y alta de empresa |
| R17 | `unit/services/usuario-service-superadmin.test.ts` · los cuatro «R17: …» |
| R18 | `unit/utils/telefono-pais.test.ts` (tabla de CR congelada); `unit/services/chat-whatsapp-telefono-por-pais.test.ts`; `integration/db/chat-entrante-telefono-cr.test.ts` · «SLT-42 R18: en una empresa de otro pais…» (int) |
| R19 | `chat-entrante-telefono-cr.test.ts` · «R19: `sqlNormalizarTelefono` y `normalizarTelefono` producen EL MISMO texto (%s)» (int); forma: `telefono-pais.test.ts` · «sqlNormalizarTelefono (forma del gemelo SQL de R19)» |
| R20 | `telefono-pais.test.ts`; `unit/services/ejecucion-envio-prueba.test.ts` · «SLT-42 R18/R20…»; `unit/whatsapp-envios/telefono.test.ts` |
| R21 | `telefono-pais.test.ts` (`TABLA_CR_CONGELADA`); `chat-whatsapp-telefono-por-pais.test.ts` · «R21: con Costa Rica…» |
| R22 | `unit/utils/calendario-zona.test.ts`; `unit/utils/utilidades-por-zona.test.ts`; `unit/services/hora-por-pais-analitica-avisos.test.ts`; `unit/api/hora-por-pais-api-key.test.ts`; `historico-conversaciones-service.test.ts` · «R22: …»; `integration/db/dia-en-zona-sql.test.ts` (int) |
| R23 | `calendario-zona.test.ts` (Madrid, sus dos cambios); `recurrencia-por-zona.test.ts` · «con horario de verano (Madrid)…»; `dia-en-zona-sql.test.ts` (días de 23 y 25 h de Nueva York) (int) |
| R24 | `integration/db/hora-por-pais-dos-empresas.test.ts` · «R24/R28: el cron calcula «hoy» con la zona del pais de cada empresa; la que no tiene zona falla sola» (int); `hora-por-pais-analitica-avisos.test.ts` |
| R25 | `unit/services/jobs/recurrencia-por-zona.test.ts` · «la serie alterna Bogota (05:00 UTC) y CR (06:00 UTC)…», «la corrida de Bogota no toca la empresa de CR…»; `hora-por-pais-dos-empresas.test.ts` · «R25: las zonas con empresas salen de la base…» (int) |
| R26 | `recurrencia-por-zona.test.ts` · bloque «R26 — con una sola zona, los mismos instantes que antes de SLT-42» y «la clave vieja corre para TODAS las empresas…» |
| R27 | `unit/services/rastreo-publico-zona-pais.test.ts` · bloques «SLT-42 R27 — la fecha de cada evento, en la zona del pais de la empresa de la orden» y siguientes |
| R28 | `reglas-pais-empresa-service.test.ts` · «zonaHoraria() lanza PaisSinZonaHoraria…»; `recurrencia-por-zona.test.ts` · «el handler falla con PaisSinZonaHoraria…», «dentro de la serie (conSuEmpresa), la empresa sin zona falla y las demas corren…»; `hora-por-pais-dos-empresas.test.ts` (int) |
| R29 | `unit/guards/pais-sin-literales.guardia.test.ts` · «ningun archivo de servidor fuera de la lista tiene un literal del pais», «la lista no crece respecto de su tope» y la autocomprobación |
| R30 | `reglas-pais-empresa-service.test.ts` · «dos contextos seguidos con el mismo servicio devuelven cada uno el país de su empresa», «dos contextos a la vez tampoco se mezclan» |
| R31 | `tipo-documento-por-pais.test.ts`, `tipos-identificacion-por-pais.test.ts`, `hora-por-pais-dos-empresas.test.ts` (CR y `XA`, int) + los unitarios de arriba. Sin E2E, por decisión del humano |

R sin test: **ninguna**. Las de integración las comprobé por lectura (casos y aserciones reales, no
vacíos); su ejecución queda para CI.

## Hallazgos

### B1 · BLOQUEANTE — E2E tocados sin correr en local; flujo crítico sin salida E2E
- Dónde: `progress/impl_SLT-42.md:296`: «El E2E no se corrió; corre en CI».
- El diff modifica tres archivos E2E: `e2e/_dos-empresas-fixture.ts`, `e2e/dos-empresas-humo.spec.ts`
  y `e2e/superadmin-empresas.spec.ts` (documentos de 9 dígitos por R10). También toca flujos críticos
  de `docs/checkpoints-proyecto.md`: rastreo público, cierres, wallet y liquidación,
  liberación de reprogramadas, `lib/db/` y entradas sin sesión (cron y jobs).
- Qué incumple:
  - `CHECKPOINTS.md > Calidad de código` exige el E2E del flujo crítico con su salida local en `impl_<key>.md`.
  - `AGENTS.md` F2.4 exige haber corrido en local los E2E escritos o tocados.
  - El CI solo corre el E2E en el PR a producción. Hasta entonces nadie habrá ejecutado estos tres
    specs editados.
- La decisión «¿E2E? No» de la ficha trata de tests **nuevos** para el aislamiento por país. No exime
  de correr los E2E existentes que la ficha modifica.
- Propuesta: correr en local y pegar la salida en `impl_SLT-42.md`. Mínimo:
  `pnpm exec playwright test e2e/dos-empresas-humo.spec.ts e2e/superadmin-empresas.spec.ts`.
  Recomendados, por los flujos críticos tocados: `e2e/rastreo-publico.spec.ts` y
  `e2e/reprogramacion-liberacion.spec.ts`.

### m1 · menor — `lib/validacion/telefono.ts` sin `import "server-only"`, sin desvío registrado
- Dónde: `lib/validacion/telefono.ts:7-11`.
- El design §4.2 y §7 y T2.4 (`tasks.md:59`, marcada `[x]`) piden `import "server-only"`. No está, y
  el paquete `server-only` no está instalado: añadirlo sería una dependencia nueva. Hoy solo lo
  importan servicios de `lib/services/`, así que no hay fuga real a cliente.
- Propuesta: anotar el desvío en `design.md > Desvíos aceptados` («sin `server-only`, no es
  dependencia del proyecto») y corregir el texto de T2.4. Opcionalmente, una aserción en la guardia
  R29 o en `dependencias` que impida importar `@/lib/validacion/telefono` desde `components/**` o
  `app/**/_components/**`.

### m2 · menor — T1.0 incompleto respecto de las decisiones del humano
- Dónde: `specs/SLT-42-…/tasks.md:19-23`.
- La decisión «tras tanda 2b» punto 1 dice que `POSTULACION_VALIDADA_POR_PAIS_DESDE`
  (`lib/config/aprobacion-postulaciones.ts:49`, hoy `2026-11-04T14:00Z`) se ajusta al instante real
  del deploy **como paso de T1.0**. El texto de T1.0 no lo menciona; solo está en
  `impl_SLT-42.md > Checklist antes del deploy` punto 3.
- Tampoco recoge el ensayo de las tres migraciones y sus `down.sql` sobre una copia de producción
  (design §2.5) ni el criterio `usuario` > 100 000 → índice `CONCURRENTLY` (design §2.4).
- Propuesta: ampliar el texto de T1.0 con esos tres puntos. Precisar que el corte se fija igual o
  posterior al deploy: las postulaciones recibidas después ya se validaron al recibirlas. Precisar
  también que fijarlo exige un commit antes del deploy.
- T1.0 sigue sin marcar, como está decidido. Bloquea el deploy, no el PR a `dev`.

### m3 · menor — Desvío de §2.2 sobre la idempotencia de las filas nuevas
- Dónde: `db/migrations/20261104140100_slt42_tipo_documento_por_pais/migration.sql:79-81`.
- El `INSERT` de `dimex` y `nite` no lleva `ON CONFLICT`, a diferencia del de las tres filas viejas.
  Es correcto para una migración que corre una vez. Hoy, si alguien sembró `dimex` a mano, la
  precondición aborta primero (filas fuera de cedula, ruc y pasaporte), así que no hay fallo real.
- Propuesta: ninguna obligatoria. Si se quiere simetría, añadir `ON CONFLICT ("value") DO NOTHING`
  en una migración futura. Esta ya no se edita una vez aplicada en otra base.

### m4 · menor — `Cierre` de la ficha vacío
- `progress/features/SLT-42.md > Cierre` está sin completar (resumen, PR, deudas que deja: P6 en
  `progress/deudas.md:220`, SLT-86 debe bajar el tope de excepciones a 5, SLT-81). Lo cierra el
  leader en F2.4/F3; se anota para que no se pierda.

## Qué falta para OK
1. B1: correr los E2E tocados (y los recomendados) en local y dejar la salida en `progress/impl_SLT-42.md`.
2. m1 y m2: ajustes de texto en `design.md` y `tasks.md`, en la misma vuelta (no bloquean).

## Correcciones (2026-11-06)
- **m1** · No se añade `import "server-only"`: el paquete no es dependencia del proyecto (ni en
  `package.json` ni en `docs/dependencias.md`) y ningún archivo del repo lo importa. Solo importa
  `lib/validacion/telefono.ts` el servicio `lib/services/validacion-documento-telefono.ts`; nada de
  `components/` ni `app/`. Registrado como desvío 8 en `design.md`, y ajustados §4.2, §7 y T2.4.
  Commit `docs(SLT-42): correcciones m1 y m2 del review`.
- **m2** · T1.0 de `tasks.md` ampliado: índice `CONCURRENTLY` si `usuario` > 100 000, ensayo de las tres
  migraciones y sus `down.sql` en una copia de producción, y `POSTULACION_VALIDADA_POR_PAIS_DESDE`
  igual o posterior al deploy, fijado en un commit previo. El checklist de `impl_SLT-42.md` ya lo
  tenía; se precisó el commit. Mismo commit que m1.
- **m3** · `ON CONFLICT ("value") DO NOTHING` en el INSERT de `dimex` y `nite` de
  `20261104140100_slt42_tipo_documento_por_pais`. Se editó la migración porque la rama nunca llegó a
  `dev` (`git ls-tree origin/dev` no la tiene): solo la tienen aplicada bases locales o de prueba de
  esta feature, que deben rehacerse (`migrate reset`) por el cambio de checksum. Commit `bf5a0a82`.
