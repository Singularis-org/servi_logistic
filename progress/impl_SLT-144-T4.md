# SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» — T4.1 (frontend_dev)

## Archivos
- NUEVO `app/(app)/plataforma/planes/_components/plan-form/FechasPorEmpresa.tsx`: tipo `FechasDelCambio` (cargando / fallo / ok con la F pedida) y el componente: «Calculando…» (`role="status"`), error con «Reintentar» (`role="alert"`), texto de R19, tabla «Empresa · Período · Recibe el cambio el» y `AvisosDeTopes` por empresa.
- `app/(app)/plataforma/planes/_components/PlanForm.tsx`: entrada `{ planId, vigenteDesde, topes }` (solo al editar y en `vigencia`/`revisar`, validada con `previsualizarCambioSchema`), espera `ESPERA_VISTA_PREVIA_MS`, clave vigente, lectura en vuelo de la misma clave reutilizada, `reintentarFechas`. Pasa `fechas` y `onReintentarFechas` a los dos pasos.
- `app/(app)/plataforma/planes/_components/plan-form/PasoCuandoRige.tsx`: solo líneas añadidas (import + `PasoCuandoRigeConFechas`, que pinta `PasoCuandoRige` intacto y `FechasPorEmpresa` debajo). `git diff --stat`: 20 insertions(+), 0 deletions.
- `app/(app)/plataforma/planes/_components/plan-form/PasoRevisar.tsx`: props `fechas`, `onReintentarFechas`; al editar, `FechasPorEmpresa` debajo de las filas (la última es la de cuándo rige).
- NUEVO `tests/components/PlanFormFechasPorEmpresa.test.tsx`.
- `specs/SLT-144-planes-form-pasos-borrador/tasks.md`: T4.1 en [x].

## R → test (`tests/components/PlanFormFechasPorEmpresa.test.tsx`)
- R17 → «R17: una fila por empresa con su fecha», «R17: De inmediato no muestra la tabla», «R17: los pasos de antes no piden la fecha».
- R18 → «R18: aviso por empresa y el botón final sigue habilitado».
- R19 → «R19: plan sin empresas».
- R20 → «R20: cargando», «R20: error con Reintentar», «R20: una respuesta vieja no se pinta».

## Salida
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run tests/components/PlanFormFechasPorEmpresa.test.tsx tests/components/PlanFormBorrador.test.tsx`: Test Files 2 passed (2), Tests 33 passed (33).
- `pnpm exec eslint` de los 5 archivos: «No issues found», exit 0.
- `pnpm run typecheck`: un solo error, `PlanDetalle.tsx(410,19)` (props de `PlanForm`, T5.2). Ninguno en los archivos de esta task.

## Decisiones fuera del spec
- `PasoCuandoRige.tsx` gana un componente envolvente `PasoCuandoRigeConFechas` en vez de tocar el `return` de `PasoCuandoRige` (tiene un `return` temprano con «Rige desde»): así el diff del archivo es solo de líneas añadidas y SLT-135 «Planes: sin «De inmediato» al editar un plan» no choca. `PlanForm` monta el envolvente.
- R18 «por empresa»: los avisos se agrupan por `organizacionId` en una `section` con `aria-label` = nombre de la empresa, cada grupo con su `AvisosDeTopes`. El texto de `textoDelAvisoDeTope` dice «La empresa ya tiene…» sin nombrarla, y con dos empresas en el mismo tope el texto se repetiría (y la `key` de `AvisosDeTopes` chocaría).
- Durante la pausa de 300 ms de una entrada nueva ya se muestra «Calculando la fecha de cada empresa…» (no hay lectura de esa entrada que pintar).
- Pasar de «Cuándo rige» a «Revisar» con la misma entrada no relee: la clave no incluye el paso, así que se reutiliza lo leído (también el error, con su «Reintentar»).
- La columna «Período» muestra la etiqueta del tipo de cobro (`TEXTOS_TIPO_COBRO.tipo`, «Mensual»…); la fecha, `recibeEl` tal cual (`AAAA-MM-DD`), como la fila «Rige desde».

Veredicto: T4.1 hecha y en verde; el único rojo de typecheck es el previsto de T5.2 (`PlanDetalle.tsx`).
