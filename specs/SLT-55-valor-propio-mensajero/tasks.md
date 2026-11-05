# SLT-55 — valor-propio-mensajero · tasks.md

**Puerta humana al aprobar el spec.** Esta sección no es una pantalla nueva y no pasa por `/design`
(`design.md §7.3`). Si Carlos prefiere maqueta, la Tanda D queda bloqueada hasta tenerla.

Reglas de todas las tandas:

- Un agente por tanda. `backend_dev` para A, B y C; `frontend_dev` para D; E y F según lo que toquen.
- Dinero contra Postgres real: `tests/integration/db/`, con `HAY_BASE_DE_DATOS` y sin `if (!fila) return`.
- Cada tanda cierra con sus **mutaciones**: una a una, en un arnés que primero compruebe que ejecutó tests. Cada una
  debe poner en rojo el test que se nombra. **Mutaciones y gate nunca en paralelo:** el gate leería el árbol mutado.
- Cada tanda commitea. El informe cita el SHA y la salida real de los tests.
- Los importes de los tests van en literales escritos a mano, nunca calculados con la función que se prueba.
- Sin nombrar al cliente: «la empresa usuaria». Sin migración y sin dependencias: si algo parece pedirlas, para.

## Tanda 0 — Preparación

- [x] **T0.1** Copiar `.env` al worktree y comprobar, solo con booleanos, que `DATABASE_URL` existe y no es de Ordenex.
  **Hecho:** `vitest` no reporta saltos por `HAY_BASE_DE_DATOS`.

## Tanda A — Escritura (backend). Depende de T0

- [x] **T1.1** `lib/types/tarifa-flexible.ts`: `mensajeroId` en `nivelSchema` y `FijarValorInput` (`design §3.1`).
  **Hecho:** `tarifa-schemas.test.ts` cubre con y sin clave, y que un pago con `ivaPct` sigue rechazado (R5).
- [x] **T1.2** `TarifaValorService` y `ITarifaValorRepository`: nivel real, chequeo de R7 y R8, `fijar` con `mensajeroId`
  (`design §3.2`). **Hecho:** `tarifa-valor-service.test.ts` cubre R1, R5, R6 (mensajero + zona, + grupo, + vehículo, en
  concepto de tienda y de satélite), R7, R8 y R10.
- [x] **T1.3** `TarifaValorRepository`: `mensajeroEsElegibleONivelOcupado`, `fijar` y `etiquetaDelValor` (`design §3.3`,
  `§3.4`); comentario en `historial-accion-etiquetas.ts`. **Hecho:** typecheck verde.
- [x] **T1.4** `tests/integration/db/tarifas-valor-propio-escritura.test.ts`, por el service y con dos empresas. Cubre:
  R1 con la fila real sin zona, grupo ni vehículo; R2 con los 5 conceptos; R3 reemplaza con el mismo id, y un `P2002` simulado
  por carrera sale `validation_error`; R4; R7 con rol `admin`, rol `Admin Tienda`, id inexistente y mensajero de B; R8 con
  `inactivo` y `bloqueado`, con y sin valor, y `pendiente` admitido; R9 con `INSERT` a mano y el trigger; R11 con la
  `entidadEtiqueta` literal (`mensajero_entregado · <nombre> <apellido>`), antes y después, al fijar y al quitar; R26 con
  borrado sin gestiones y con gestiones.
  **Hecho:** corre contra Postgres, 0 saltos.
- **Mutaciones A:**
  1. `fijar` vuelve a `mensajeroId: null` → R1.
  2. El service vuelve a `{ ...dato, mensajeroId: null }` → R6.
  3. Quitar `mensajeroId` de `nivelSchema` (el hueco de `design > Hallazgo`) → R6.
  4. Quitar `rol: { value: "mensajero" }` del `where` → R7.
  5. Quitar el `estado` del `where` → R8.
  6. Quitar la rama de `ocupado` → R8.
  7. Quitar `mensajero` de `partes` en `etiquetaDelValor` → R11.

## Tanda B — Los caminos del cierre (backend). Depende de A. [P] con C

Se espera **cero código de producción**. Un rojo aquí es un defecto real: se para y se avisa, sin arreglarlo por encima.

- [x] **T2.1** `tests/integration/db/tarifas-valor-propio-caminos.test.ts`, con los moldes de `tarifas-flexibles-snapshot` y
  `-base-congelada`. Escenario: empresa activada; mensajero M con vehículo y orden en un distrito de grupo; valores de los
  cinco niveles presentes (propio 501, grupo+vehículo 502, grupo 503, zona+vehículo 504, zona 505).
  - **R12:** en **vista previa, solicitud, corte, re-solicitud 477 y corrección 398**, paga 501 y congela nivel `mensajero`
    con su `tarifaValorId`. En 398 el concepto es `mensajero_rechazo`: esa corrección siempre pasa a rechazo. Quitando el
    propio, el mismo escenario paga 502: prueba que el valor ganaba de verdad.
  - **R13:** el mismo M con otra zona, y sin vehículo, sigue pagando 501.
  - **R14:** propio solo en entregado: el rechazo paga por grupo; sin ningún nivel, 0 y el cierre se crea.
  - **R15:** propio de 0 sobre zona de 505 paga 0,00 con nivel `mensajero`.
  - **R16:** M2 en el mismo lote cobra 502, y la satélite de la gestión de M cobra su valor.
  - **R17:** las cuatro cifras de `design §4.3`, con la zona de M sin ningún valor de pago: 600,00, 500,00, 400,00 y 666,67.
  - **R18:** reprogramado al 20 % sin flete: 0,00, con fila congelada de base 0,00.
  - **R19:** 477 y 398 con el valor de la tienda cambiado tras congelar: la base sigue siendo la congelada; y cobro congelado
    del viejo con pago del nuevo.
  - **R20:** M sin zona: `solicitarCierre` responde `validation_error` en `zona`, el corte lo cuenta en `mensajerosSinZona` y
    la vista previa da 0.
  - **R21:** sin activar, con propio: paga el modelo viejo, y fijar no crea `tarifa_activacion`.
  - **R22:** digita, activa: el cierre previo no cambia y el siguiente paga el propio.
  - **R24:** cambiar y quitar el propio tras congelar: `cierre_dia`, `gestion_orden` y `gestion_pago_congelado` iguales, con
    `tarifa_valor_id` a NULL al quitar; y el siguiente cierre usa lo nuevo.
  - **R25:** M `inactivo` con gestión pendiente: el corte le paga el propio; lo mismo si cambia de rol.
  **Hecho:** 0 saltos, y el informe dice qué caminos ya funcionaban sin tocar código.
- **Mutaciones B** (en `precedencia.ts` y `resolver-tarifas.ts`, y se revierten):
  1. La rama `mensajeros` de `whereValores` fuera → R12.
  2. El rango del propio a 5, detrás del grupo → R12.
  3. `contextosCobro` con `c.zonaId` en lugar de `c.zonaOrdenId` → R17.
  4. `NIVELES_PAGO[1]` a `"zona"` → R12.

## Tanda C — Lecturas de la pantalla (backend). Depende de A. [P] con B

- [ ] **T3.1** `TarifasPantallaRepository`, `ITarifasPantallaRepository`, `TarifasPantallaService`,
  `ITarifasPantallaService`: `mensajeros` y `valoresMensajero` (`design §7.1`). **Hecho:** `tarifas-pantalla-service.test.ts` y
  `tests/fixtures/tarifas-pantalla.ts` al día.
- [ ] **T3.2** `tests/integration/db/tarifas-valor-propio-pantalla.test.ts`, con dos empresas:
  - **R23:** el recorrido entero. Con un propio del único mensajero y la zona sin `mensajero_entregado`, `cargarPantalla` da
    `faltan` y la misma lista; `activar` sin confirmar responde `confirmacion_requerida` con él dentro; una zona sin nada sigue
    `sin_empezar`.
  - **R31, R32:** `elegible` por rol y estado; un retirado sigue en la lista.
  - **R37:** A no lee mensajeros ni valores de B, ni B los de A, y los dos ven los suyos: el vacío no es que nadie vea nada.
  - **R10:** `admin` lee; otro rol, `forbidden`.
  **Hecho:** 0 saltos.
- [ ] **T3.3** `tests/integration/actions/tarifas-action.test.ts`: `guardarValoresTarifa` con una entrada de valor propio. **Hecho:**
  verde con R10.
- **Mutaciones C:**
  1. Quitar `mensajeroId: null` de `valoresDeZonaOGrupo` → R23 (además de la prueba existente).
  2. Quitar `v.mensajeroId === null` de `faltantesDeZona` → `faltantes.test.ts:72`.
  3. Quitar la rama `tarifaValoresComoMensajero` del `OR` → R32.
  4. `elegible` sin mirar el estado → R31.

## Tanda D — Sección de la pantalla (frontend). Depende de C

- [ ] **T4.1** `tarifas-borrador.ts` y `tarifas-textos.ts`: `mensajeroId` en `planDeGuardado` y textos (`design §7.2`, `§7.4`).
  **Hecho:** test de que el plan del propio lleva `mensajeroId` sin `ivaPct`, y el de zona no lleva `mensajeroId`.
- [ ] **T4.2** `TarifasMensajeros.tsx`, `TarifaMensajeroDialogo.tsx` y su sitio en `TarifasModule.tsx`. Entrada `fuera` en
  `censo-tablas.ts`. **Hecho:** `tests/components/TarifasMensajeros.test.tsx` cubre R27-R36, con los textos a mano.
- [ ] **T4.3** `TarifasModulo.test.tsx`, `TarifasDisposicion.test.tsx` y `TarifasPage.test.tsx` al día; R38 en la disposición
  (clases `min-h-11`, sin hex). **Hecho:** `pnpm exec vitest related --run` verde.
- **Mutaciones D:**
  1. Mandar `ivaPct` en el plan → R29.
  2. Vaciar no quita → R29.
  3. Quitar la marca «Inactivo» → R32.
  4. Enseñar controles con `puedeEscribir` falso → R35.

## Tanda E — E2E y medida. Depende de D

- [ ] **T5.1** `e2e/tarifas-valor-propio-mensajero.spec.ts`, en el proyecto `dinero` de `playwright.config.ts`. Empresa nueva por
  los servicios reales. Cifras a mano en la cabecera:

  | | Modelo viejo | Zona digitada | Propio de M1 |
  |---|---|---|---|
  | Flete por entregado | 2.500 + 13 % | 3.100 + 13 % | — |
  | Flete por devolución | 1.250 + 13 % | 1.400 + 13 % | — |
  | Pago por entregado | 1.700 | 2.200 | 2.900 (monto) |
  | Pago por devolución | No paga | sin valor | 15 % de 1.400 = 210 |

  Recorre (R40):
  1. Digita los valores de la zona y el propio de M1 en la sección. «1 de 2 zonas completas» no cambia al añadirlo (R23).
  2. Sin activar, el cierre de M1 paga 1.700 (R21).
  3. Activa. Una entrega y una devolución de M1: en `/cierre-dia`, «Ganancia» dice 3.110 (R39). Aprobado: `totalPagoMensajero`
     3110, con nivel `mensajero` en los dos pagos congelados.
  4. M2, de la misma zona: 2.200 y 0 (R16).
  5. Cambia el propio a 3.000: el cierre anterior no se mueve; el siguiente de M1 paga 3.000 (R24).
  6. Quita el propio: el siguiente paga 2.200 (R4). Historial con el nombre de M1, por detrás (R11).
  7. M1 no ve «valor propio» en `/cierre-dia`, ni entra a `/configuracion/tarifas` (R39).
  8. Dos empresas y `admin` (R37, R35). R38: a 390 px, `documentElement.scrollWidth` ≤ 390 y controles ≥ 44.

  **Hecho:** `--project=dinero` dos corridas seguidas sobre la misma base, 0 failed, 0 skipped, 0 flaky. Log sin `tail`, con
  `INIT_EXIT=$?` dentro.
- [ ] **T5.2** `e2e/_tarifas-activacion-fixture.ts`: `nivel` en `pagosCongelados` y un `digitarValorPropio`. **Hecho:**
  `tarifas-activacion` sigue verde.
- [ ] **T5.3** `e2e/dos-empresas-humo.spec.ts`, porque toca datos de negocio (`docs/checkpoints-proyecto.md`). **Hecho:** verde.
- [ ] **T5.4** Mirar la sección con el navegador, a 1360 y 390 px, claro y oscuro, con un solo dev server. **Hecho:** capturas
  en `progress/impl_SLT-55.md`. Es lo que el humano verá: el backend sin pantalla no es entrega.

## Tanda F — Documentación y cierre. Depende de E

- [ ] **T6.1** `docs/architecture.md > Tarifas flexibles`: añade el nivel `mensajero` a la lista de niveles. `docs/ayuda/oficina/
  configuracion-tarifas.md`: sección de valor propio y `actualizado`. **Hecho:** guardias de ayuda verdes.
- [ ] **T6.2** `progress/impl_SLT-55.md`: mapa `R<n> → test` con los 40, salida real y resultado de cada mutación. **Hecho:** la
  tabla de `requirements.md` y este mapa dicen lo mismo.
- [ ] **T6.3** `./init.sh` en verde, después de revertir toda mutación, y comprobar que `git status` no trae ninguna.
  **Hecho:** salida pegada; el `gate-completo` lo da el PR, que abre el leader tras el OK del reviewer.

## Dependencias

```
T0 → A → B ─┐
      └→ C ─┴→ D → E → F
```

## Archivos esperados

- `specs/SLT-55-valor-propio-mensajero/requirements.md`
- `specs/SLT-55-valor-propio-mensajero/design.md`
- `specs/SLT-55-valor-propio-mensajero/tasks.md`
- `progress/features/SLT-55.md`
- `progress/impl_SLT-55.md`
- `lib/types/tarifa-flexible.ts`
- `lib/types/historial-accion-etiquetas.ts`
- `lib/services/TarifaValorService.ts`
- `lib/services/TarifasPantallaService.ts`
- `lib/repositories/TarifaValorRepository.ts`
- `lib/repositories/TarifasPantallaRepository.ts`
- `lib/interfaces/repositories/ITarifaValorRepository.ts`
- `lib/interfaces/repositories/ITarifasPantallaRepository.ts`
- `lib/interfaces/services/ITarifasPantallaService.ts`
- `app/(app)/configuracion/tarifas/_components/TarifasMensajeros.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifaMensajeroDialogo.tsx`
- `app/(app)/configuracion/tarifas/_components/TarifasModule.tsx`
- `app/(app)/configuracion/tarifas/_components/tarifas-borrador.ts`
- `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts`
- `docs/architecture.md`
- `docs/ayuda/oficina/configuracion-tarifas.md`
- `playwright.config.ts`
- `e2e/tarifas-valor-propio-mensajero.spec.ts`
- `e2e/_tarifas-activacion-fixture.ts`
- `tests/integration/db/tarifas-valor-propio-escritura.test.ts`
- `tests/integration/db/tarifas-valor-propio-caminos.test.ts`
- `tests/integration/db/tarifas-valor-propio-pantalla.test.ts`
- `tests/integration/actions/tarifas-action.test.ts`
- `tests/unit/services/tarifa-valor-service.test.ts`
- `tests/unit/services/tarifas-pantalla-service.test.ts`
- `tests/unit/types/tarifa-schemas.test.ts`
- `tests/unit/descarga/censo-tablas.ts`
- `tests/unit/app/tarifas/TarifasPage.test.tsx`
- `tests/fixtures/tarifas-pantalla.ts`
- `tests/components/TarifasMensajeros.test.tsx`
- `tests/components/TarifasModulo.test.tsx`
- `tests/components/TarifasDisposicion.test.tsx`
