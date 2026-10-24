# SL-44 — E2E en verde en CI · requirements

> Estado: **BLOQUEADO antes de especificar** (`docs/specs.md > Antes de especificar: lo que ya
> existe`). La búsqueda encontró una ficha con el mismo trabajo y una decisión cerrada que contradice
> la de esta ficha. No hay requisitos EARS hasta que Carlos decida (ver `## Preguntas abiertas`).

## Alcance (del encargo del leader, 2026-10-23)

- El job `e2e` de `.github/workflows/gate.yml` sale verde de verdad: sin baseline de E2E y sin skip
  masivo (decisión de Carlos, 2026-10-23).
- Inventario spec por spec de `e2e/`: arreglar con datos propios sembrados por servicios reales, o
  retirar con motivo. Ningún flujo crítico de `docs/checkpoints-proyecto.md` sale sin sustituto.
- Cómo obtienen el OTP los E2E en CI sin debilitar producción (deuda D17).
- Montaje del job, tiempo estimado y cómo verlo en verde antes del PR a `prod`.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-23 | ¿Se sale a producción con el `e2e` en rojo, con baseline o con skip masivo? | No. El job tiene que salir verde de verdad (Carlos, vía leader). |

## Requisitos (EARS)

Pendientes. No se escriben hasta resolver P1.

## Lo que ya existe (resultado de la búsqueda)

Buscado `e2e`, `datos propios`, `PRECONDITION (seed)`, `fixme`, `OTP`, `SL17_HUMO_LOG_SERVIDOR`,
`AUTH_OTP_DEBUG_LOG` en `feature_list.json`, `specs/`, `progress/` y el código (Grep/Read; el MCP del
grafo no estaba entre mis herramientas).

1. **SL-31 «Tests de integración con datos propios y base migrada en CI»**, en `pending` en el board,
   con spec aprobado (`specs/SL-31-tests-datos-propios-ci/`). Su tanda 1 (CI migrada, R16–R18) ya
   está en `dev` (`progress/impl_SL-31.md`). Su **tanda 7 está sin hacer** y es el punto 1 de esta
   ficha:
   - T10: `tests/fabricas/e2e.ts` (`abrirBaseE2E`, `crearUsuarioConSesion`, `limpiarE2E`). No existe
     en el árbol.
   - T11a y T11b: los 19 specs heredados con «PRECONDITION (seed)» pasan con datos propios
     (R19–R23).
2. **Contradicción con una decisión cerrada de SL-31.**
   - P3 / R23 de SL-31: el E2E que falle por algo que no son los datos (la UI cambió) queda como
     `test.fixme` citando una ficha nueva.
   - R24 de SL-31: no toca código de producción.
   - La decisión de esta ficha (2026-10-23) prohíbe el skip, y los hallazgos de abajo piden código
     de producción (guarda del OTP, almacén de archivos en CI).
3. **D16** (`progress/deudas.md`): el humo de dos empresas debería dar de alta A y B por la pantalla
   «Empresas». Toca `e2e/dos-empresas-humo.spec.ts`, el mismo archivo. Su dueño es Carlos, en ficha
   propia.
4. **D17**: la deuda que esta ficha cierra. No es un solapamiento.
5. **SL-43 «Datos de demostración para QA»** (`pending`, depende de SL-40): en `feature_list.json`
   la descripción es «(ver issue en Jira)». No puedo confirmar si siembra datos que los E2E podrían
   reutilizar. Hay que mirarlo en Jira.

## Preguntas abiertas

- **P1 — ¿Cómo se reparte el trabajo con SL-31?** (BLOQUEANTE) Opciones:
  - (a) SL-44 absorbe la tanda 7 de SL-31 (T10, T11a, T11b y R19–R23). SL-31 se acota a lo
    demás y se cierra sin ella. P3 queda sustituida por la decisión del 2026-10-23, y SL-44 sí puede
    tocar producción en lo mínimo: la guarda del OTP y el almacén de CI.
  - (b) SL-31 hace su tanda 7 antes, y SL-44 queda para OTP, montaje del job, specs propios (SL-17,
    SL-32, SL-38, SL-39) y para quitar los `fixme` que deje SL-31. Requiere reabrir P3 en SL-31.
  - (c) Otra partición que decida Carlos.

  Recomiendo la (a). Las dos piezas no se pueden separar: un spec heredado no sale verde si no se
  reescribe contra la UI actual, y R24 de SL-31 lo deja en `fixme`, que es lo que la decisión del
  2026-10-23 prohíbe.
- **P2 — ¿D16 entra aquí o sigue en su ficha?** Si el humo se rehace para CI, cambiar ahora el alta
  a la pantalla evita tocarlo dos veces.
- **P3 — ¿El job `e2e` corre en cada PR a `dev`, o solo con `workflow_dispatch` / una etiqueta?** El
  repo es público y los minutos de Actions no cuentan, pero el job alarga el reloj del PR.

## Hallazgos previos (para el spec, cuando se desbloquee)

Leído en el árbol de `dev` (`dc95473`). El log del run 40020120423 no lo he leído porque no tengo
shell. Su resumen en `progress/impl_SL-32.md:1351` y en `progress/review_SL-32.md:251`: 49 failed,
28 did not run y 3 passed, en 24 specs. En `dev` hay ahora **26 specs**, porque se sumaron los de
SL-38 y SL-39.

- **Heredados (21):** `auth`, `home`, `marca`, `analitica-roles`, `asignacion-satelite`,
  `recepcion-satelite`, `mis-asignaciones`, `cierre-dia`, `cierre-vencido-modelo`, `cierres-admin`,
  `cierres-admin-rechazos-sla`, `cierre-bodega-satelite`, `reglas-bloqueos-cierre`,
  `devolucion-origen`, `historial-orden`, `reintentos-escalado`, `reprogramacion-liberacion`,
  `wallet`, `mi-wallet`, `wallet-mensajeros`, `rastreo-publico`.
  - Todos menos `home`, `marca` y `rastreo-publico` entran con usuarios fijos
    (`…@example.com` / `correct-password`) que la base vacía no tiene.
  - Esperan `waitForURL("/")` tras el login, pero la app lleva a `/dashboard` (`marca.spec.ts:127`).
  - Varios declaran en su cabecera que la UI cambió desde que se escribieron (`mis-asignaciones`:
    sin botón «Recoger» ni modal «Gestionar orden»). Arreglarlos es reescribirlos.
  - `home.spec.ts` espera el título `/Next/`: plantilla de create-next-app, candidato a retirar.
  - `marca.spec.ts` crea un `admin` sin `organizacion_id`, anterior a SL-17.
  - Casi todos son flujos críticos de `docs/checkpoints-proyecto.md`: no se pueden retirar sin
    sustituto.
- **Propios (5):**
  - `dos-empresas-humo`, `superadmin-arranque` y `superadmin-empresas` leen el OTP del log del
    servidor (`SL17_HUMO_LOG_SERVIDOR` + `AUTH_OTP_DEBUG_LOG=1`).
  - El humo exige además SMTP real (`_dos-empresas-fixture.ts:197`) y buzones por entorno
    (`SL17_HUMO_MAESTRO_A/_B`).
  - `wallet-iva-aparte-sl39` se salta sin `SL39_UI=1`: es un skip.
  - `zona-especial-dos-empresas` no necesita ni OTP ni SMTP.
- **OTP:** `otpDebugLogHabilitado()` (`lib/config/email.ts:144`) no mira el entorno. Con
  `AUTH_OTP_DEBUG_LOG=1` en Vercel production, el código saldría en los logs. Una guarda que lo
  apague cuando `VERCEL_ENV=production` falta hoy, con o sin esta ficha.
- **Almacén de archivos:**
  - Las gestiones con evidencia y los comprobantes suben a Supabase Storage. Las composition roots
    hacen `new SupabaseFileStorage(...)` directamente (`lib/actions/mis-asignaciones.ts:120` y unas
    diez más).
  - En CI no hay `SUPABASE_URL`, así que las subidas de los flujos de mensajero y cierres fallarán
    aunque haya datos.
  - Hace falta una decisión de diseño: una fábrica `crearFileStorage` con un almacén local solo en
    CI/E2E, o un stub HTTP de Storage en el job.
- **Orden entre specs:**
  - `superadmin-empresas` afirma el estado vacío «Aún no hay empresas».
  - En una sola base de CI, los specs que dan de alta empresas (humo, SL-38, SL-39) se lo rompen.
    Hace falta ordenarlos (proyectos de Playwright con `dependencies`) o darles bases distintas.
- **Servidor:**
  - `playwright.config.ts` arranca `pnpm dev`, con un `timeout` de 30 s y la salida del servidor sin
    archivo.
  - La cookie de sesión es `secure` con `NODE_ENV=production` (`lib/actions/auth.ts:61`). Hay que
    medirlo si se pasa a `next build` + `next start`.
