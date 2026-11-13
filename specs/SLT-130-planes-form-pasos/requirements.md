# SLT-130 — planes-form-pasos · requirements.md

> **Zona:** frontend · **Complejidad:** medium · **depends_on:** — · **Rama:** feature/SLT-130-planes-form-pasos
>
> **Alcance.** El formulario de crear y editar plan pasa a un componente compartido de formulario por pasos
> dentro del Sheet ancho (`components/ui/sheet.tsx`), según la maqueta aprobada (`maqueta/formulario-planes-c.html`,
> opción C, humano 2026-11-11). Pasos: General, Precio y descuentos, Cobro por orden, Topes, Módulos, Cuándo rige
> (solo al editar) y Revisar (y crear / y programar). Descuentos como lista de líneas con agregar y quitar. «Revisar»
> lista los cambios con la clave en negrita y «antes → después»; al crear, los valores finales. Guarda una sola vez,
> al final, con las actions de hoy. No se pierde nada de lo que hace hoy `PlanForm`.
>
> **Lo que NO entra** → SLT-144: el borrador guardado por paso («Guardar y continuar», ✓ por paso, estado y hora
> del borrador), la fecha de cada empresa y el aviso de topes pasados en «Cuándo rige» y «Revisar», quitar
> «De inmediato» y la cuenta «N de M empresas». Tampoco el correo a los maestros que muestra la maqueta.
>
> *Sembrado por `/afinar-feature` el 2026-11-13. El bloque de Alcance y la tabla de «Decisiones cerradas» los fijó
> el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su trabajo aquí es
> `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

- Tamaño: `PlanForm.tsx` tiene 1 137 líneas; si el cambio pasa el tope del PR (40 archivos / 1 000 líneas),
  spec_author propone el corte en F1.2.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-13 | Partir SLT-130 | Solo UI; lo que depende de SLT-128, SLT-129 y SLT-135 pasa a SLT-144 (humano). |
| 2026-11-13 | Fecha al editar sin SLT-144 | El paso «Cuándo rige» entra ya, con los controles de hoy (de inmediato o fecha, y «Rige desde» del precio, SLT-86 R22/R23). SLT-144 solo cambia su contenido. |
| 2026-11-13 | Navegación sin borrador | «Siguiente» valida el paso actual con el mismo esquema que la action y no avanza con errores. Volver atrás y saltar a pasos ya visitados es libre. Si la action rechaza algo, el formulario lleva al paso del campo. |
| 2026-11-13 | Orientación | Prop `vertical` / `horizontal`. Vertical en escritorio; pasa sola a horizontal en pantallas angostas. |
| 2026-11-13 | Campos de crear custom | Visibilidad, empresa, «Inicio del ciclo» y fecha de efecto (planes-custom D4, SLT-86 R16/R25) se heredan tal cual y van en el paso General. |
| 2026-11-13 | E2E | No: planes no es un flujo crítico de `docs/checkpoints-proyecto.md`. Tests de componente. |
