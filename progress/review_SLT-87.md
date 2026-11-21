# SLT-87 «Reporte de bugs: botón flotante y envío» · review (F2.2)

Revisado el 2026-11-09 sobre `feature/SLT-87-reporte-de-bugs`, con el diff `origin/dev...HEAD` hasta
`53ec3891`: 17 commits y 33 archivos. Ruta **completa**: complejidad high, permisos entre empresa y
plataforma y una migración. Entrega 1 de 3.

El MCP del grafo no se usó. El diff es acotado y se leyó entero con Read y Grep.

## Verificación ejecutada por el reviewer

| Qué | Resultado |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` | `tsc --noEmit`, exit 0 |
| `pnpm exec eslint` sobre los 18 archivos de código y tests tocados | sin salida, sin errores |
| `vitest run` de `ReporteBugBoton`, la action, el servicio, la plantilla, la config y `AppLayout` | 6 archivos, 63/63 |
| Base propia `servi_logistic_slt87_rev` (borrada al terminar): ida y vuelta de `20261110120000` | ver abajo |
| `vitest run tests/integration/db/bug-report.test.ts`, contra esa base | 9/9, 0 skipped |
| Disparadores del gate (`migration migracion demo-qa sql-real verificar-rls`) | 70 archivos en rojo: 69 están en `tests/baseline-rojos.json`; el otro, `slt73-migracion-retira-asientos.int.test.ts`, da timeout bajo carga y pasa solo (6/6). Ninguno nombra `bug_report`. |
| `pnpm run test:guardias` | `Test Files 1 failed \| 341 passed (342)`. El rojo es `dependencias-declaradas-presentes.guardia.test.ts`, que está en el baseline. |
| `node scripts/tamano-pr.mjs` | AVISO, 28/40 archivos y 2164/1000 líneas. Lo acepta la línea `tamano-pr-aceptado` de `progress/features/SLT-87.md:20`, con la cifra real. |

**Ida y vuelta de la migración.** Se miden tabla, RLS, número de políticas, privilegios de
`servi_app` y filas de `_prisma_migrations`:

1. `prisma migrate deploy` → `{"tabla":true,"rls":true,"politicas":0,"priv":0,"mig":1}`.
2. `pnpm run db:rollback` → «Rollback completado: 20261110120000_bug_report» y
   `{"tabla":false,…,"mig":0}`.
3. `prisma migrate deploy` otra vez → `{"tabla":true,"rls":true,"politicas":0,"priv":0,"mig":1}`.

## Checklist

### Ruta y especificación
- [x] La ruta es la completa, como exige el suelo.
- [x] `requirements.md` tiene R1–R20 en EARS. `design.md` abre con `## Lo que ya existe` y descarta
  las alternativas A–E con su porqué. `tasks.md` tiene T1–T9 en `[x]`.
- [x] El diff no re-crea nada de «Lo que ya existe». Reutiliza `resolveActorFromSession`,
  `esPlataforma`, `requestContextFromHeaders`, `comoPlataforma`, `componerCorreo`,
  `crearEmailSender`, `ROL_LABELS`, `nombreCompletoUsuario` y las primitivas `Button`, `Textarea` y
  `Card`.
- [x] Las «Decisiones cerradas» se respetan: P2, P3, P5, Q2, Q3, Q5 y el contador «{n}/500».
- [x] Tamaño del PR: aceptado por el humano.
- [x] Equipo: assignee Camilo y rama del candado.

### Trazabilidad (cada R, con el test que lo prueba de verdad)

| R | Test | Juicio |
|---|---|---|
| R1 | E2E «el maestro ve el botón en dos pantallas… y el mensajero en un móvil» (`/dashboard`, `/ordenes`, Pixel 7 en `/mis-asignaciones`) | OK |
| R2 | E2E «el superadmin no ve el botón», con un anti-vacío: el h1 «Empresas» | OK |
| R3 | `ReporteBugBoton.test.tsx` «en `/mis-asignaciones` y sus subrutas se apila…», con `data-posicion`, las clases `bottom-24`/`bottom-5` y el falso prefijo `/mis-asignaciones-viejas`. El E2E móvil repite `sobre-chat`. | OK |
| R4 | «abre un panel… sin campo de archivos» y «el contador muestra exactamente "0/500"… "120/500"… "500/500"… no admite el 501», con literales escritos a mano | OK |
| R5 | «Enviar está deshabilitado con la descripción vacía o solo con espacios» | OK |
| R6 | Componente: cerrar y reabrir, y desmontar y montar. E2E: «el borrador sobrevive a recargar la página». | OK |
| R7 | «el borrador de un usuario no aparece con otro usuarioId» | OK |
| R8 | Componente: «Descartar borra el borrador y no llama a la action». E2E: Descartar y cuenta 0 filas. | OK |
| R9 | Componente: Gracias, panel vacío, clave borrada y solo 4 claves en la entrada. Action: «la respuesta buena es solo «enviado»». E2E: Gracias y panel vacío tras recargar. | OK |
| R10 | «si la action responde error, avisa y conserva el texto» (4 estados) y «si la llamada se cae (red)…». Action: `error`, con un log que solo lleva la causa. | OK |
| R11 | Action: sin sesión, sin llamar al servicio. Servicio: superadmin con y sin empresa, sin empresa y usuario de otra empresa, sin guardar ni mandar correo. Integración: con un usuario de otra empresa devuelve `null`. Hay además un CHECK contra `superadmin`. | OK |
| R12 | Action: 14 entradas malas, incluidas 501, query, fragmento, `organizacionId`, `rol` y `usuarioId`; 500 pasa. Integración: el CHECK da `23514` con 501, solo espacios, `?`, `#`, sin barra y superadmin. | OK |
| R13 | Integración: fila completa y DTO. Servicio: actor de sesión y agente recortado a 512. Action: el agente sale de la cabecera. E2E: la fila real con `/ordenes` sin `?…#…`, el UA, la ventana y `is_standalone`. R19 fija la lista exacta de columnas, así que no hay versión de la app. | OK |
| R14 | Integración: con `servi_app`, SELECT, SELECT propio, INSERT, UPDATE, borrado lógico y DELETE dan `42501`, con su control como dueño. Por el modelo en `conEmpresa` también da `42501`. | OK |
| R15 | Servicio: un correo por destinatario, después de guardar y a nadie más. Plantilla: cada dato en HTML y en texto. E2E: una sola línea `[email][debug]` a `reportes-e2e@example.test`, ninguna al maestro. | OK |
| R16 | Config: vacía, ausente, solo comas o inválidas dan `[]`. Servicio: sin destinatarios guarda, responde `enviado` y no llama al emisor. | OK |
| R17 | Servicio: «si un envío falla, los demás salen…» y «si fallan todos…», con un intento por destinatario y un log sin descripción. | OK |
| R18 | Plantilla: «escapa `<script>` en la descripción, el nombre, la página y el navegador», prefijo por prefijo | OK |
| R19 | Integración: `created_at` y `updated_at` como Date, `deleted_at` nulo y las 14 columnas en inglés | OK |
| R20 | Config: «.env.example documenta BUG_REPORT_EMAILS vacía», con el formato y el efecto de dejarla vacía | OK |

- [x] Cada R tiene un test que lo prueba de verdad, y `progress/impl_SLT-87.md` tiene el mapa.

### Seguridad (foco del leader)
- [x] `bug_report` tiene RLS sin políticas y `REVOKE ALL … FROM servi_app` (`migration.sql:60-61`).
  Medido en la base: 0 políticas y 0 privilegios.
- [x] Solo escribe `BugReportRepository.crear`, dentro de `comoPlataforma` (`BugReportRepository.ts:30`).
  Tiene su entrada en `EXCEPCIONES_DE_PLATAFORMA` y está en `MODELOS_DE_PLATAFORMA`.
- [x] La empresa, el usuario y el rol salen de `resolveActorFromSession`
  (`lib/actions/reporte-bug.ts:59`). El zod es `.strict()` en los dos niveles, y el repositorio
  vuelve a buscar el usuario con `{ id, organizacionId }` de la sesión.
- [x] El superadmin no ve el botón (`app/(app)/layout.tsx:219`), y el servicio lo rechaza aunque el
  cliente llame a la action (`ReporteBugService.ts:37`).
- [x] No se guarda query ni fragmento. El cliente manda `location.pathname`, el zod los rechaza
  (`lib/types/reporte-bug.ts:38`) y el CHECK `bug_report_page_path_solo_ruta` también.
- [x] La descripción tiene un máximo de 500 en el `Textarea` (`maxLength`), en el zod
  (`.trim().max(500)`) y en el CHECK (`char_length(btrim(...)) BETWEEN 1 AND 500`). Un test fija que
  el CHECK usa el mismo número que `DESCRIPCION_MAX`.
- [x] Un fallo del correo no rompe el guardado: `Promise.allSettled` va después del `crear`, el log
  lleva solo el id y el nombre de la causa, y la respuesta sigue siendo `enviado`.
- [x] El correo solo va a `BUG_REPORT_EMAILS`. Lleva lo de R13 más el email de quien reporta y el id
  del reporte, como pide design §7. Ninguna línea del log lleva la descripción, las direcciones
  descartadas ni el mensaje de Postgres.
- [x] Sin secretos ni recursos de Ordenex, sin `console.log` de PII y sin literales de país en el
  código. «SINPE» aparece solo en un comentario del E2E, como texto de una pantalla que ya existe.

### Migración `20261110120000`
- [x] Tiene `down.sql` (`DROP TABLE IF EXISTS "bug_report"`) con la pérdida de dato declarada.
- [x] La ida, la vuelta y la ida otra vez funcionan (arriba).
- [x] No edita ninguna migración ya aplicada.

### UI
- [x] Los textos coinciden literalmente con §8.4, en `TEXTOS_REPORTE_BUG`
  (`ReporteBugBoton.tsx:21-29`), y el contador es `${n}/${DESCRIPCION_MAX}`.
- [x] El borrador va en `localStorage["servi:reporte-bug:borrador:<usuarioId>"]`, solo el texto. Se
  borra con «Enviar» bueno y con «Descartar». Si no hay almacenamiento, cae a memoria.
- [x] En `/mis-asignaciones` el botón va en `bottom-24`, por encima del chat (`bottom-5` y 56 px, así
  que el borde superior del chat queda a 76 px y no se solapan).
- [x] Accesibilidad: el panel tiene `role="dialog"` y `aria-labelledby`. Al abrir, el foco va al
  campo con `autoFocus`; al cerrar con Escape o con «Cerrar», vuelve al botón. El botón lleva
  `aria-expanded` y `aria-controls`; el contador, `aria-live="polite"`; el éxito, `role="status"`, y
  el fallo, `role="alert"`. El campo tiene etiqueta.

### Layout y páginas públicas
- [x] El botón se monta como hermano en `app/(app)/layout.tsx`, que no cubre `/`, `/login`,
  `/paquete`, `/postulacion` ni `/recuperar-contrasena` (`app/`). Las guardias del layout están verdes.
- [~] No regresión del layout para todos los roles: ver los menores M1 y M2.

### Calidad y proceso
- [x] El typecheck y el lint pasan.
- [x] Las guardias están verdes, salvo el rojo del baseline.
- [x] Hay E2E local del flujo nuevo, dos corridas 17/17, y el grupo `aislamiento` entero, con los
  tres rojos de la landing explicados. Ver M1 para los otros dos grupos.
- [x] Las capas están en su sitio: action en `lib/actions`, servicio en `lib/services`, repositorio
  en `lib/repositories`, zod en el borde y config en `lib/config`. `reporte-bug` es `nucleo` en el
  reparto.
- [x] No hay dependencias nuevas.
- [x] `docs/architecture.md > Multi-empresa` tiene el párrafo de §10, con Q5.
- [ ] `./init.sh` y `gate-completo` en CI: los cierra el leader y CI, no el reviewer.

## Hallazgos

### BLOQUEANTE
Ninguno.

### menor

- **M1. Los E2E de los grupos `reparto` y `dinero` no se corrieron en local.**
  - Dónde: `app/(app)/layout.tsx:219` monta un `fixed right-5 z-40` en todas las páginas del portal.
  - Qué falta: el implementer corrió el spec nuevo y el grupo `aislamiento`, que es lo que pedía T9.
    No corrió `reparto`, que incluye `mis-asignaciones`, un flujo crítico donde el botón queda sobre
    el chat, ni `dinero`.
  - Por qué es menor: CI corre los tres grupos en cada PR a `dev` (`docs/verification.md > El E2E`).
  - Condición de merge: el check `e2e` en verde. Si un clic de esos specs choca con el botón
    («intercepts pointer events»), vuelve al implementer.
- **M2. Posible solape con las barras pegadas abajo, en móvil.**
  - Qué: el botón ocupa de 20 a 68 px desde abajo y desde la derecha, con `z-40`. Debajo, con
    `z-10`, quedan:
    - la paginación pegada (`components/shared/Pagination.tsx:415`, centrada y con `flex-wrap`);
    - la barra de acciones de `app/(app)/configuracion/envios-whatsapp/_components/EnvioForm.tsx:574`,
      pegada abajo solo debajo de `lg`.
  - El aire del final (`pb-12`, 48 px, `app/(app)/layout.tsx:162`) es menor que 68 px, así que el
    último elemento de una página puede quedar bajo el botón.
  - El design §8.2 solo analizó el chat. No se verificó a ojo, así que es un riesgo, no un fallo
    probado.
  - Qué hacer: mirar una lista con paginación y ese formulario a 390 px. Si tapa, subir `pb-12` o
    desplazar el botón; eso es un cambio de UI que decide el humano.
- **M3. El aviso «Gracias» reaparece al reabrir el panel.**
  - Dónde: `components/shared/ReporteBugBoton.tsx:85-88`. `cerrar()` no reinicia `estado`, así que
    después de un envío bueno, cerrar y volver a abrir muestra otra vez el aviso, con el campo vacío.
  - No incumple R9: el panel queda vacío y no se muestra ningún dato del reporte.
  - Sugerencia: volver a `editando` al cerrar.
- **M4. Escape solo cierra si el foco está dentro del panel.**
  - Dónde: `components/shared/ReporteBugBoton.tsx:116-121`. El `onKeyDown` está en la `Card`; con el
    foco en el botón flotante, Escape no cierra.
  - El panel no es modal y no lleva `aria-modal`, lo que es coherente. Detalle de accesibilidad.
- **M5. Título viejo en la ficha.**
  - Dónde: `progress/features/SLT-87.md:1` dice «Reporte de bugs: botón flotante y módulo del
    superadmin».
  - En `feature_list.json` el título es «Reporte de bugs: botón flotante y envío». Lo corrige el
    leader.

## Juicio de las «(propuesta)» del implementer

Se aceptan todas:

- **`VENTANA_LADO_MAX = 20 * 1000`.** Es otro dato, no el umbral de R47, y el comentario lo explica.
  Aceptada.
- **`BugReport.reporter` como `no_alcanzable`.** La única escritura es la action con sesión y el
  schema es `.strict()`. Aceptada.
- **Descripción en párrafos sin vacíos y «Sin datos» en el dispositivo.** Tiene su test. Aceptada.
- **Sin índice para `reporter_user_id`.** Se respeta design §2.1. Aceptada; la anota SLT-97 si la
  tabla crece.
- **`useSyncExternalStore` en vez de `useState` + efecto.** Cumple el objetivo de §8.3, que es no
  leer en el SSR, sin el `set-state-in-effect`, y tiene precedente en `usePreferenciaSonido`.
  Aceptada.
- **Copia en memoria y ventana fuera de rango que no se manda.** Son razonables y no pierden el
  reporte. Aceptadas.
- **La caída de red cuenta como `error` y el mismo aviso sirve para `unauthenticated`.** Coherente
  con §8.2. Aceptada.
- **Textos accesibles «Describe el problema» y «Cerrar».** §8.4 no los fija y no chocan con nada.
  Aceptados.
- **Panel en `bottom-20` y en `bottom-40`.** No se solapa con el botón ni con el chat. Aceptada.
- **E2E con dos empresas, la del maestro sin zonas.** Está justificado en el propio spec. Aceptada.

## Veredicto

**OK.** No hay bloqueantes y hay 5 menores. Condición de merge: `gate-completo` y `e2e` en verde en
el PR, por M1. M2 conviene mirarlo antes de subir a `prod`.
