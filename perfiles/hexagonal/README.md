# harnessConfig/hexagonal — configuración del arnés para arquitectura hexagonal

Esta carpeta es **aditiva y opcional**. `harnessConfig/` es la plantilla del arnés en su forma
por defecto —capas horizontales, `lib/services/` + `lib/repositories/`—; lo de aquí la
convierte en un arnés que organiza el código **por módulos de negocio**, con dominio, puertos
y adaptadores.

Se separó en su propia carpeta en vez de reescribir `harnessConfig/` por una razón concreta:
las dos formas son legítimas. Un proyecto de una sola área funcional no gana nada partiendo
en módulos y paga la ceremonia igual. La hexagonal empieza a rendir cuando hay **más de un
módulo que comparte entidades** —el caso de un ERP— y ahí es donde la separación horizontal
se rompe: cualquier módulo nuevo termina escribiendo en las mismas tres carpetas que todos
los demás.

Nació de **QC-15** en QuimiCloude (`specs/QC-15-arquitectura-hexagonal-y-modulos/`). Todo lo
que hay aquí sale de su `design.md` aprobado; no es una propuesta genérica de internet.

## Qué hay

| Archivo | Qué es | Cómo se aplica |
| --- | --- | --- |
| `docs/architecture-hexagonal.md` | El contrato estructural: árbol de carpetas, tabla de dependencias permitidas, qué publica un módulo, punto de composición, propiedad de modelos Prisma. | **Sustituye** la sección `## Estructura de carpetas` y amplía `## Principios` de `docs/architecture.md`. Es lo que el `reviewer` usa para juzgar. |
| `agents/*.fragmento.md` | Las líneas que cada agente necesita para poder *hacer cumplir* la regla, no solo conocerla. | Se pegan en el `.claude/agents/<agente>.md` del proyecto, en la sección que indica cada fragmento. |
| `plantilla-modulo/` | El esqueleto de un módulo nuevo. | `cp -r plantilla-modulo lib/modules/<modulo>` y renombrar. |
| `tests/guards/` | La guardia ejecutable. | Ver abajo — **todavía no está aquí**. |

## Lo que falta y por qué

`tests/guards/guard-arquitectura-modulos.test.ts` **no está en esta carpeta todavía**. Se
copia desde la implementación de QC-15 cuando esa feature cierre, no antes: una guardia que
nadie ha visto ponerse roja no es una guardia, es un archivo. Copiar aquí una versión escrita
"a mano" sería exactamente el tipo de configuración que parece que funciona y no funciona.

Mientras tanto, `docs/architecture-hexagonal.md > La regla de dependencias` tiene la tabla
completa de lo que la guardia comprueba, que es lo que hace falta para reimplementarla o
revisarla.

## Lo que esta carpeta NO cambia

- **El flujo del arnés.** F0 → F1 → F2, las puertas de aprobación humana, el gate en dos
  niveles y la regla de máx. 2 `in_progress` por zona son idénticos. La hexagonal cambia
  **dónde vive el código**, no cómo se trabaja.
- **`components/` y `hooks/`.** Se quedan fuera de la modularización a propósito (decisión D4
  del design): sus rutas las fija `components.json` de shadcn, y la UI compartida no
  pertenece a ningún módulo. La convención de componentes de ruta con barrel sigue vigente
  tal cual.
- **El esquema de Prisma.** Sigue siendo un solo `db/schema.prisma`. La frontera de módulo
  llega a la persistencia por **propiedad de modelo** (`/// @module <modulo>`), no partiendo
  el archivo. El multiarchivo de Prisma está soportado y aun así se descartó: no parte la
  propiedad real, rompe lo que lee el esquema por ruta fija, y las claves foráneas cruzan
  módulos igual.

## Antes de adoptarla en un proyecto que ya tiene código

Hazlo **temprano**. QC-15 se hizo con tres archivos de servicio y una pantalla, y aun así
tocó 40 rutas de import. Con dos módulos de dominio ya escritos, la misma reestructuración es
una feature de varias tandas y un merge doloroso con todo lo que esté en vuelo.

Y trátala como una migración **sin cambio de comportamiento**: los tests que pasaban siguen
pasando, con las mismas aserciones. Si algo tiene que cambiar de comportamiento, es otra
feature.
