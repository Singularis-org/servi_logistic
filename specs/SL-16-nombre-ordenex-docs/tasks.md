# SL-16 — Tasks

> Orden: T0 → T1 → T2 → (T3 ‖ T4 ‖ T5 ‖ T6 ‖ T7) → T8 → T9. Las tareas `[P]` no comparten archivos.
> Un commit por task (`docs/conventions.md > Commits`).

- [x] **T0. Precondiciones.** Comprobar tres cosas antes de tocar nada:
  - el worktree está sobre `dev` con SL-10 integrado;
  - `./init.sh` termina con código 0;
  - SL-15 está integrado en `dev` (depends_on, decisión Q1);
  - `EMPRESA` existe en el código con el término de transición (corregido el 2026-10-22: `lib/config/marca.ts`, `EMPRESA.enFrase` = «la empresa»).

  Si falta alguna, la feature se detiene aquí y el término no se adivina.
  **Hecho cuando:** `git merge-base --is-ancestor <commit de SL-10> HEAD` sale con 0, `INIT_EXIT=0`
  queda escrito dentro del log, y el término y el módulo de `EMPRESA` quedan anotados en
  `progress/impl_SL-16.md`.

- [x] **T1. Medir y clasificar** (depende de T0). Clasificar cada aparición de «ordenex» y de `ordx_`
  del alcance en plataforma, operador, dominio, identificador o cita (`design.md > Regla de
  sustitución`):
  - cada «cita» se comprueba en el código, sin comentarios;
  - cada frase dudosa entre plataforma y operador se anota entera;
  - se mide si SL-14 o SL-15 ya cambiaron algo;
  - se cuenta el suelo de archivos de R14.

  **Hecho cuando:** `progress/impl_SL-16.md` tiene cuatro cosas:
  - la tabla por archivo, con el número de apariciones de cada clase;
  - la lista de excepciones, cada una con la ficha que la retira;
  - la forma final de cada frase de operador;
  - el suelo de archivos medido.

- [x] **T2. La guardia, primero en rojo** (depende de T1). Crear
  `tests/unit/guards/docs-marca-heredada.guardia.test.ts` según `design.md > La guardia`. Lleva:
  - `PALABRA` y `PREFIJO_LLAVE` armados por partes;
  - `EXCEPCIONES`, con su clase y la ficha que la retira, incluidas las tres de «historia» de
    `docs/limpieza-ordenex.md`, `docs/plan-saas.md` y `docs/marca.md` (SL-27);
  - `TERMINO_EMPRESA`, con la comparación contra `EMPRESA.nombre`, y `FRASES_OPERADOR`;
  - la caducidad, la anti-vacuidad y las contrapruebas;
  - los casos de R1–R5, R15, R16, R18 y R19.

  Todos los literales se escriben a mano.
  **Hecho cuando:** la guardia sale en rojo listando exactamente las apariciones de plataforma y de
  operador que contó T1, y las contrapruebas ya pasan.

- [x] **T3. [P] El contrato de la API** (depende de T2). Cambiar, a la vez y con las mismas palabras:
  - `lib/api/openapi-spec.ts`;
  - `docs/api/api-key-openapi.yaml`;
  - el `<title>` de `app/api-docs/route.ts`.

  Después, el test (c) de `tests/unit/api/openapi-405-gestiones.test.ts` y los comentarios de
  `tests/unit/api/openapi-webhook-estado-actualizado.test.ts`.
  **Hecho cuando:** `pnpm exec vitest run tests/unit/api tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts`
  sale en verde y pasan los casos de R15 y R16.

- [x] **T4. [P] La colección de Postman** (depende de T2). Mover el archivo con
  `git mv docs/api/ordenex-api-key.postman_collection.json docs/api/servi-logistic-api-key.postman_collection.json`
  y cambiar su `info.name`. Después, apuntar a la ruta nueva en:
  - `tests/unit/api/openapi-266-habilitar.test.ts` y `tests/unit/api/openapi-320-eliminar.test.ts`;
  - los comentarios de `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts` (l. 10, 52 y 58);
  - la l. 710 de `docs/api/CHANGELOG.md`.

  **Hecho cuando:** `openapi-266` y `openapi-320` salen en verde con la ruta nueva (R17) y pasan los
  casos de R2 y R5.

- [x] **T5. [P] CHANGELOG y guía de integración** (depende de T2; la l. 710 la cambia T4). Cambiar
  las clases plataforma y operador en `docs/api/CHANGELOG.md`, sin añadir entrada, y en
  `docs/api/guia-integracion/README.md` y `guia-integracion.html`.
  **Hecho cuando:** la guardia no informa ninguna aparición en `docs/api/` fuera de las excepciones,
  y `openapi-466-descripciones`, `openapi-406-evidencias-url` y `changelog-455` salen en verde.

- [x] **T6. [P] La ayuda** (depende de T2). Cambiar las clases plataforma y operador en los 12
  documentos de `docs/ayuda/**` y poner su `actualizado` a la fecha del cambio. Las citas
  exceptuadas no se tocan, y un test de `tests/unit/asistente/` que afirme un texto que cambió se
  actualiza a mano.
  **Hecho cuando:**
  - la guardia no informa nada en `docs/ayuda/` y pasan los casos de R7 y R18;
  - este comando sale en verde:
    `pnpm exec vitest run tests/unit/asistente tests/unit/guards/nombres-wallet-461.guardia.test.ts tests/unit/guards/nombres-estado-retirados.guardia.test.ts tests/unit/guards/ayuda-pantalla-ruta-existe.guardia.test.ts tests/components/AyudaDocumentoPage.test.tsx`.

- [x] **T7. [P] Diseños** (depende de T2).
  - En `design-notificaciones/Push.dc.html` y en los 8 `.dc.html` de `design-whatsapp/` con
    apariciones, cambiar las clases plataforma y operador sin tocar las líneas que nombran al integrador.
  - Borrar `design-notificaciones/notificaciones-ordenex.html` y la carpeta `.design-work/` entera.
  - En `DESIGN.md`, cambiar el título y añadir la nota que remite a `docs/marca.md` y a SL-8.

  **Hecho cuando:** la guardia no informa nada en `design-*/` ni en `DESIGN.md`, y pasan los casos de
  R3, R4 y R19.

- [x] **T7b. Ajustes de la review de SL-15 y SL-34** (leader, 2026-10-22; R22–R25; depende de T2, va
  con T3–T7).
  1. `Bearer` de `evidenciasUrl`: `lib/api/openapi-spec.ts`, `docs/api/api-key-openapi.yaml` y el test
     que lo fija (`tests/unit/api/openapi-webhook-contrato.test.ts`) dicen lo mismo con `svl_`; se
     retira su excepción `retira: "SL-16"` de `sin-nombre-heredado.guardia.test.ts` (R23).
  2. El dominio de `docs/api/` y de `openapi-406-evidencias-url.test.ts` pasa a `example.com`; las dos
     entradas `ficha: "SL-16"` salen de `EXCEPCIONES_DOMINIO` en `tests/unit/guards/_dominio-heredado.ts`
     (no en la guardia de SL-14) (R22).
  3. Las demás excepciones `retira: "SL-16"` de `sin-nombre-heredado.guardia.test.ts` salen cuando su
     sujeto queda limpio (diseños, `DESIGN.md`, `.design-work/`, rutas de `docs/`, tests de `docs/`) (R23).
  4. `docs/jira.md`: el email pasa a `<tu-email>@example.com` y sale su excepción de
     `recursos-origen-fuera.guardia.test.ts`; anotado en el impl para `arnes-sync --subir` (R25).
  5. `pnpm-lock.yaml`: el email del `deprecated` de `glob@7.2.3` es del registro de npm; su excepción
     pasa a permanente y documentada, sin `SL-16` (R24). El lockfile no se edita.

  **Hecho cuando:** `sin-nombre-heredado`, la guardia de dominio de SL-14, `recursos-origen-fuera`,
  `openapi-webhook-contrato` y `openapi-406-evidencias-url` salen en verde, y `grep 'SL-16'` en esas
  listas de excepciones no devuelve nada salvo comentarios de historia.

- [x] **T8. Guardia en verde, y comprobar que muerde** (depende de T3–T7). Aplicar estas mutaciones
  una a una, ver cada una en rojo con su mensaje y revertirla:
  1. la palabra suelta en un `.md` de `docs/ayuda/` (R8, R13);
  2. un identificador exceptuado renombrado en su `fuente` (R10);
  3. un rótulo citado cambiado en su archivo de código (R11);
  4. una excepción extra que no aparece en el alcance (R12);
  5. una excepción sin `retira` (R9);
  6. «Servi Logistic» en una frase de `FRASES_OPERADOR`, y `TERMINO_EMPRESA` distinto de
     `EMPRESA.nombre` (R7);
  6b. la excepción de historia de `docs/marca.md` apuntando a un archivo sin la palabra (R12);
  7. el suelo de archivos por encima del medido (R14);
  8. un archivo con la palabra en su nombre dentro de `docs/api/` (R5);
  9. el título del YAML distinto del de TS (R15);
  10. una palabra cambiada en una descripción del YAML (R16).

  Ni la guardia ni el gate corren a la vez que las mutaciones.
  **Hecho cuando:** `progress/impl_SL-16.md` tiene cada mutación con el caso que se puso rojo y su
  mensaje, y `git status` queda limpio después.

- [x] **T9. Gate y trazabilidad** (depende de T8). Correr `./init.sh` (R21) y revisar R20 sobre
  `git diff dev...HEAD`:
  - no hay archivos de `specs/` ajenos ni de `arnes.manifest`;
  - ninguna línea `+`/`-` nombra al integrador ni lleva literales de literales de Costa Rica.

  Escribir el mapa `R<n> → test` en `progress/impl_SL-16.md`.
  **Hecho cuando:** `INIT_EXIT=0` queda dentro del log y el mapa cubre de R1 a R21.

## Mapa R → test (previsto)

| R | Test |
|---|---|
| R1–R16, R18, R19 (salvo R17) | `tests/unit/guards/docs-marca-heredada.guardia.test.ts` (un `describe` por requisito) |
| R6 | `tests/unit/guards/docs-marca-heredada.guardia.test.ts` > `FRASES_PLATAFORMA` (cada frase de plataforma de T1 está en su archivo, lleva «Servi Logistic» y no el término de la empresa; añadido tras la review, H1) |
| R17 | `tests/unit/api/openapi-266-habilitar.test.ts`, `tests/unit/api/openapi-320-eliminar.test.ts` |
| R20 | revisión del diff en T9 (reviewer) |
| R21 | `./init.sh` |
| R22 | `tests/unit/guards/docs-marca-heredada.guardia.test.ts` + la guardia de dominio de SL-14 (vía `tests/unit/guards/_dominio-heredado.ts`) |
| R23 | `tests/unit/guards/sin-nombre-heredado.guardia.test.ts` + `tests/unit/api/openapi-webhook-contrato.test.ts` |
| R24 | `tests/unit/guards/recursos-origen-fuera.guardia.test.ts` |
| R25 | `tests/unit/guards/recursos-origen-fuera.guardia.test.ts` |

## Archivos esperados

- `tests/unit/guards/docs-marca-heredada.guardia.test.ts`
- `lib/api/openapi-spec.ts`
- `app/api-docs/route.ts`
- `docs/api/api-key-openapi.yaml`
- `docs/api/CHANGELOG.md`
- `docs/api/ordenex-api-key.postman_collection.json`
- `docs/api/servi-logistic-api-key.postman_collection.json`
- `docs/api/guia-integracion/README.md`
- `docs/api/guia-integracion/guia-integracion.html`
- `docs/ayuda/README.md`
- `docs/ayuda/compartido/analitica.md`
- `docs/ayuda/oficina/cierres.md`
- `docs/ayuda/oficina/configuracion-plantillas.md`
- `docs/ayuda/oficina/configuracion-tarifas.md`
- `docs/ayuda/oficina/wallet-caja.md`
- `docs/ayuda/oficina/wallet-mensajeros.md`
- `docs/ayuda/oficina/wallet-satelites.md`
- `docs/ayuda/oficina/wallet-tiendas.md`
- `docs/ayuda/publico/entrar-y-recuperar-contrasena.md`
- `docs/ayuda/publico/rastreo-de-paquete.md`
- `docs/ayuda/tienda/mi-wallet.md`
- `design-notificaciones/Push.dc.html`
- `design-notificaciones/notificaciones-ordenex.html`
- `design-whatsapp/Formulario.dc.html`
- `design-whatsapp/Historial.dc.html`
- `design-whatsapp/ListaMovil.dc.html`
- `design-whatsapp/Main.dc.html`
- `design-whatsapp/PdfPicking.dc.html`
- `design-whatsapp/PdfTransito1.dc.html`
- `design-whatsapp/PdfTransito2.dc.html`
- `design-whatsapp/Vacio.dc.html`
- `.design-work/Bloque.dc.html`
- `.design-work/Editorial.dc.html`
- `.design-work/Main.dc.html`
- `.design-work/Tabla.dc.html`
- `.design-work/Triage.dc.html`
- `.design-work/canvas.json`
- `.design-work/hero-bodega.jpg`
- `.design-work/landing-ordenex-direcciones.html`
- `.design-work/paquetes.jpg`
- `.design-work/tablero-monitoreo.html`
- `.design-work/zona-especial/Confirmacion.dc.html`
- `.design-work/zona-especial/Estados.dc.html`
- `.design-work/zona-especial/canvas.json`
- `.design-work/zona-especial/Main.dc.html`
- `.design-work/zona-especial/ModoMarcado.dc.html`
- `.design-work/zona-especial/marcador-zona-especial.html`
- `DESIGN.md`
- `tests/unit/api/openapi-266-habilitar.test.ts`
- `tests/unit/api/openapi-320-eliminar.test.ts`
- `tests/unit/api/openapi-405-gestiones.test.ts`
- `tests/unit/api/openapi-webhook-estado-actualizado.test.ts`
- `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts`
- `tests/unit/asistente/contexto-457.test.ts`
- `tests/unit/asistente/contexto-458.test.ts`
- `tests/unit/asistente/contexto-460.test.ts`
- `tests/unit/asistente/contexto-461.test.ts`
- `tests/unit/api/openapi-webhook-contrato.test.ts`
- `tests/unit/api/openapi-406-evidencias-url.test.ts`
- `docs/api/manual-metricas-por-mensajero.md`
- `tests/unit/guards/_dominio-heredado.ts`
- `tests/unit/guards/sin-nombre-heredado.guardia.test.ts`
- `tests/unit/guards/recursos-origen-fuera.guardia.test.ts`
- `docs/jira.md`
- `progress/impl_SL-16.md`
- `specs/SL-16-nombre-ordenex-docs/requirements.md`
- `specs/SL-16-nombre-ordenex-docs/design.md`
- `specs/SL-16-nombre-ordenex-docs/tasks.md`
