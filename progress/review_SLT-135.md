# Review SLT-135 «Planes: sin «De inmediato» al editar un plan» — vuelta 1

- Fecha: 2026-11-18 · Ruta: completa · HEAD `42aaaa27` · PR #224
- Diff revisado: `origin/feature/SLT-144-planes-form-pasos-borrador...HEAD`. Los archivos que entran con el merge
  de `dev` (SLT-188: `gate.yml`, `filas-fuera-de-tx`, `deudas.md`, `total-a-cobrar-sin-cerrado…`) no difieren de
  `origin/dev` y quedan fuera de la revisión.
- MCP del grafo: no hizo falta. Revisé con git diff, Grep y Read.

## Checklist

- [x] **Trazabilidad R1–R23.** Cada requisito tiene su test con el nombre del spec y aserciones reales:
  - R1: `planes-service.test.ts` «R1: sin fecha…» (null, ausente, solo nombre y con precio, sin llamadas al repo) y `planes-schema.test.ts` «R1: editarPlanSchema exige vigenteDesde».
  - R2 y R3: `planes-service-periodo.test.ts`. R3 también en `planes-edicion-en-uso.test.ts` «R3: los topes y los módulos llegan por la recepción».
  - R4 y R8: `planes-cambio-por-empresa.test.ts`, con recepciones, `runAfter`, recordatorios (ninguno para hoy), correos con fecha y reemplazo sin `cambio_a_medias`.
  - R5: `planes-cambio-programado.test.ts`.
  - R6: `plan-precio-historial.test.ts`, «R6: precio con F hoy…» y «R6 (Gana el último)…»; además `plan-descuento-periodo.test.ts`.
  - R7 y R9: `planes-service.test.ts`.
  - R10: `plan-borrador-schema.test.ts`.
  - R11 y R12: `plan-borrador-confirmar.test.ts`.
  - R13: `planes-previsualizar-cambio.test.ts`, la unitaria y la de integración ajustada.
  - R14–R17: `PlanForm.test.tsx`. R15 también en `plan-form-borrador.test.ts`.
  - R18: `plan-form-revision.test.ts` y `PlanFormRevisar.test.tsx`.
  - R19: `PlanFormFechasPorEmpresa.test.tsx`.
  - R20: `PlanDetalle.test.tsx`.
  - R21: `plantilla-cambio-plan.test.ts` con `vigenteDesde: null`. No cambia; corre verde.
  - R22: `forbidden` de editar con fecha y R22 de previsualizar.
  - R23: `e2e/planes-costo-porcentual.spec.ts` «…con fecha de hoy (R23)». Verde en CI: los jobs `e2e*` de la run 44392369459 y de la 44389082761.
- [x] **Tasks:** todas `[x]` en `tasks.md` (0 sin marcar).
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` da AVISO, aceptado por el humano (`<!-- tamano-pr-aceptado -->` en `progress/features/SLT-135.md`). Ver m1.
- [x] **`design.md > ## Lo que ya existe`:** presente y con contenido. El diff no re-crea nada de la lista; quita `PlanesRepository.editar` y `editarYa`, como dice §3.
- [x] **CHECKPOINTS y checkpoints-proyecto:**
  - sin migración, tabla ni query de negocio nueva sin `organizacion_id`;
  - sin literales de país o moneda ni recursos de Ordenex (grep del diff de `app/` y `lib/`);
  - capas respetadas: la validación está en zod (`editarPlanSchema`) y en el servicio, y la autorización en el servicio (R22);
  - sin dependencias nuevas.
- [x] **Verificación ejecutable (local):**
  - `pnpm run typecheck`: 0 errores.
  - eslint de los `.ts`/`.tsx` del diff: exit 0.
  - vitest unitarios y de componentes del diff, más `plantilla-cambio-plan`: `23 passed`, `690 passed`.
  - Integración en `servi_logistic_slt135` (`--no-file-parallelism`), 9 archivos: `plan-precio-historial`, `planes-cambio-por-empresa`, `planes-cambio-programado`, `plan-borrador-confirmar`, `plan-descuento-periodo`, `planes-edicion-en-uso`, `planes-previsualizar-cambio`, `factura-plataforma-cambio-plan` y `cobro-plataforma-plan`. Resultado: `110 passed (110)`.
  - Guardias: `4 failed | 5279 passed`. Los 4 rojos son de `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json`, así que no cuentan como hallazgo.
  - CI del PR (sobre `42aaaa27`): `estatico`, vitest 1/3 y 3/3, todos los `e2e*` y Vercel en verde. **vitest 2/3 seguía pendiente** al cerrar esta review, y por eso `gate-completo` aún no tiene resultado.
- [x] **Reglas del reviewer (perfil):**
  - sin `organizacion_id` faltante, RLS, migraciones ni literales;
  - comentarios con el porqué (salvo m2).
  - E2E de pantallas y dinero: no hay constancia local, porque `next build` muere por memoria. La constancia está en CI, que es lo que decidió el leader (memoria «gate en CI»). Lo dejo anotado; no bloquea.

## «Gana el último» en `escribirPrecioDelCambio`: ¿puede confundir dos cambios con el mismo precio?

Mecanismo:
1. Lee la última fila del historial con `desde_at ≤ F`.
2. Si su precio y sus descuentos son los del cambio, sale sin escribir.
3. Si no, hace `INSERT … ON CONFLICT DO UPDATE`.

Lo que comprobé:
- **Mismo precio, cambios distintos.** La única carga de la fila son `precio_mensual` y `descuentos` (PK `plan_id, desde_at`, sin columna de origen). Si dos cambios tienen el mismo precio, sobrescribir dejaría la fila byte a byte igual. Saltarse la escritura y «dar por hecho que la dejó este cambio» da el mismo estado. Para el cobro no hay diferencia: `factura_plataforma_cuota` y `precio_del_periodo` leen solo esos dos campos, con el mayor `desde_at ≤ inicio del tramo`.
- **Un cambio viejo que escribe tarde.** No puede pisar al nuevo. `recibirCambio` y `aplicarCambioProgramado` buscan el pendiente por su id bajo el cerrojo del plan, y un pendiente reemplazado o promovido devuelve `sin_pendiente` antes de escribir. Lo cubre el test del reintento: el `ctid` no cambia y la tercera llamada da `sin_pendiente`.
- **Sobrescribir afecta a una empresa que ya recibió el anterior.** Solo pasa con dos cambios del mismo F = hoy. La empresa que recibió el primero (período que empieza hoy) recibe el segundo hoy mismo, porque su recepción también es hoy. Su versión y el historial vuelven a coincidir tras la siguiente pasada.
- **Ventana sin cubrir, previa a esta ficha.** Si la recepción del segundo cambio queda «no aplicada» (SLT-128 R28) en esa empresa, conserva la versión del primero pero el historial del plan da el precio del segundo. Es el mismo desajuste que ya tenía SLT-128 con el historial a nivel de plan; esta ficha no lo crea. No bloquea.

Conclusión: el criterio de igualdad de precio no puede llevar a un cobro distinto del que daría distinguir el cambio por su id.

## Hallazgos

- **m1 — menor (tamaño).** Sin los archivos de `dev`/SLT-188 ni `progress/` ni `specs/`, el diff propio son 55 archivos:
  - 16 de producción, con 347 líneas;
  - 39 de tests y E2E, con 1494 líneas.

  El script mide 59/40 archivos y 854 líneas de producción. La nota aceptada dice «~48 archivos, ~250 líneas de producción». Pasa de lo estimado y de los 51 de la bitácora. No sobra nada evidente: los 5 `planes-service-*.test.ts` de una línea quitan el doble `editar:` que ya no existe en `IPlanesRepository`, y los `tests/integration` cambiados dejan de usar `repo.editar`. Que el leader confirme con el humano que la aceptación cubre la cifra real o actualice la nota.
- **m2 — menor (comentario roto).** En `lib/repositories/PlanesRepository.ts` ≈ l. 456-461, el JSDoc de `aplicarVersion` quedó mezclado: «Solo enciende lo» se corta, y conviven la línea nueva («La usa el aplicador…; SLT-135 quitó la edición inmediata») y la vieja («La comparten la edición inmediata y el aplicador…»). Hay que dejar una sola versión coherente.
- **m3 — menor (código muerto).** `aplicarVersion` ya solo se llama desde `promoverEnTx`, con `escribirPrecio: false`. La rama `opciones.escribirPrecio && cambiaElPrecio(...)`, que llama a `escribirPrecioDelHistorial(…, precioDesde, …)`, y el valor por defecto `{ sincronizarModulos: true, escribirPrecio: true }` ya no se alcanzan. Conviene quitarlos o anotar por qué se quedan; si no, alguien puede volver a escribir el historial por ese camino sin «Gana el último».
- **m4 — menor (spec ajeno).** `specs/SLT-128-planes-cambios-por-periodo/design.md §3.2` sigue diciendo `ON CONFLICT DO NOTHING`. La nota de `design.md §2` de esta ficha lo sustituye, pero quien lea SLT-128 verá la regla vieja. Lo decide el leader (lo dejó abierto el implementer).
- **m5 — menor (CI).** `vitest (shard 2/3)` estaba pendiente en la run 44392369459 al cerrar la review. El aviso «listo para mergear» espera a `gate-completo` en verde (regla 5).

## Veredicto

**OK.** No hay bloqueantes. Los menores m2 y m3 se pueden arreglar en un commit pequeño antes del merge, sin otra vuelta de review. m1, m4 y m5 son del leader.
