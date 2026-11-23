# SLT-176 «Sacar de CierreBodegaService las lecturas de cifras de presentación del cierre» — design

## Lo que ya existe

Buscado `CierreBodegaService`, `cifras-bodega-descarga`, `anularEmpresaSiNoCentral`,
`listarCierresBodegaSolicitadosCompleto`, `DescargaService`, `solo lectura` en `feature_list.json`,
`specs/`, `lib/`, `tests/` y `e2e/`, con Grep/Read. **El grafo no tiene indexado este worktree**
(`index_status` devolvió «project not found»); se siguió con Grep/Read.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | SLT-133 «Mensajes del servidor de cierres en tú y con tildes» (`done`) y SLT-43/SLT-48 (geografía) nombran `CierreBodegaService`, por otros motivos. Ninguna ficha mueve esta lectura. | Se sigue. No es duplicado. |
| `lib/services/cifras-bodega-descarga.ts` | `cierresBodegaModeloNuevo`, `cifrasBodegaDescarga`, `CLASE_CIFRAS_BODEGA_DESCARGA`, `LecturaCifrasBodegaAusenteError`. También los usa `CierresBodegaAdminService.ts:62-68` (la central). | **Se reutiliza tal cual.** El servicio nuevo los importa. |
| `lib/services/CierresAdminService.ts:188` | `anularEmpresaSiNoCentral` (el recorte de SLT-154/SLT-161 R480). | **Se reutiliza tal cual**, sin tocar el archivo (SLT-125). |
| `lib/services/zona-de-la-empresa.ts` | `filtrosParaRepo`, `zonaPerezosa`, `zonaDeLaEmpresa`. | Se reutiliza: el servicio nuevo resuelve los filtros igual que hoy. |
| `lib/services/EtiquetasDescargaService.ts`, `EntregaDescargaService.ts` | Servicios `<Cosa>DescargaService` con su `I<Cosa>DescargaService`. | Se copia el patrón de nombre. |
| `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts` | La guardia R631 con `EXCEPCIONES`, `TOPE_EXCEPCIONES`, `veredicto`, `lectorDelArbol`, `lectorEnMemoria`. | **Se amplía** (no se crea otra guardia). |

## Decisión: un servicio de solo lectura para la descarga de la satélite

Se crea `CierresBodegaSateliteDescargaService` y se le **mueve entero** el método
`listarCierresBodegaSolicitadosCompleto` de `CierreBodegaService`, con el mismo nombre, la misma firma,
el mismo tipo de resultado y el mismo cuerpo. `CierreBodegaService` se queda sin el método, sin el
parámetro `cifrasLote` y sin los imports de `cifras-bodega-descarga` y `CierresAdminService`.

Con eso desaparecen los dos caminos a la vez, sin tocar `CierresAdminService`:
- el camino 1 porque `CierreBodegaService` ya no importa `cifras-bodega-descarga`;
- el camino 2 porque ya no importa `anularEmpresaSiNoCentral`. Lo importa el servicio nuevo, que no es
  de dinero, así que el camino de módulo `CierresAdminService → cifras-cierre` deja de importarle a R631.

### Contrato

`lib/interfaces/services/ICierresBodegaSateliteDescargaService.ts` (nuevo):

```ts
export interface ICierresBodegaSateliteDescargaService {
  listarCierresBodegaSolicitadosCompleto(
    actor: Actor,
    filtros?: FiltrosCierresBodega,
  ): Promise<ListarCierresBodegaSolicitadosCompletoServiceResult>;
}
```

- `ListarCierresBodegaSolicitadosCompletoServiceResult` y `CifrasCierreBodegaDescargaDTO` **siguen en
  `ICierreBodegaService.ts`** y se importan como `import type`. Moverlos tocaría ~20 tests de componentes
  que los importan de allí, sin ganancia.

`lib/services/CierresBodegaSateliteDescargaService.ts` (nuevo):

```ts
export class CierresBodegaSateliteDescargaService implements ICierresBodegaSateliteDescargaService {
  constructor(
    private readonly repo: Pick<ICierreBodegaRepository, "findCierresBodegaByZona">,
    private readonly ordenRepo: Pick<IOrdenRepository, "findUsuarioZonaId">,
    private readonly reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">,
    private readonly cifrasLote?: ICifrasBodegaLoteLectura,
  ) {}
}
```

- **Solo puertos de lectura (R696).** Los `Pick` hacen que el tipo no deje llamar a nada que escriba.
- `cifrasLote` **sigue opcional y ruidoso** (lanza `LecturaCifrasBodegaAusenteError`), como hoy (R694).
  Hacerlo obligatorio cambiaría un comportamiento probado; no es el objeto de la ficha.
- Sin el parámetro `ahora`: el método no usa el reloj.
- El cuerpo es el de `CierreBodegaService.ts:520-559`, línea a línea. Solo cambia la etiqueta de la
  operación: `"CierresBodegaSateliteDescargaService.listarCierresBodegaSolicitadosCompleto"` (y la de
  `zonaPerezosa`). Es el texto de un error interno; ningún test ni E2E lo afirma.
- El comentario de cabecera del método (`:484-515`, incluida la «excepción declarada a R29 de la 170»)
  se mueve con él.

Imports del servicio nuevo, todos de valor salvo los tipos:
`cifras-bodega-descarga` (4 símbolos), `CierresAdminService` (`anularEmpresaSiNoCentral`),
`zona-de-la-empresa` (`filtrosParaRepo`, `zonaPerezosa`, `zonaDeLaEmpresa`), `@/lib/config/descarga`
(`descargaConfig`). Ninguno de `@/lib/repositories/`, `@/lib/db/` ni `@prisma/client` (R697).

### Cambios en archivos existentes

| Archivo | Qué cambia (líneas de `dev` 825ba66d) |
|---|---|
| `lib/services/CierreBodegaService.ts` | Fuera `:32` (`ICifrasBodegaLoteLectura`), `:33-38`, `:39-40`, el tipo `ListarCierresBodegaSolicitadosCompletoServiceResult` de `:17`, el parámetro `:251-256` y el método con su comentario `:484-560`. Nada más. |
| `lib/interfaces/services/ICierreBodegaService.ts` | Fuera la firma `:415-428`. Los tipos se quedan. |
| `lib/actions/cierre-bodega.ts` | `buildCierreBodegaService` (`:77-87`) deja de pasar `undefined` y `CifrasBodegaLoteRepository`. Nuevo `buildCierresBodegaSateliteDescargaService()` con `CierreBodegaRepository`, `OrdenRepository`, `construirReglasPaisEmpresa` y `CifrasBodegaLoteRepository`. `CierreBodegaDeps` (`:109`) gana `cierresBodegaSateliteDescargaService?`. La acción `:277-291` usa ese servicio. Nombre, firma, schema y `withErrorHandler`: iguales. |
| `lib/services/CierresAdminService.ts`, `lib/interfaces/services/ICierresAdminService.ts` | **Nada** (R704). |

## Modelo de datos, autorización, país

- **Modelo de datos:** sin cambios. Sin tablas, sin RLS nueva, sin migraciones ni `down.sql` (R703).
- **Multi-empresa / alcance:** igual que hoy. La zona sale del actor (`findUsuarioZonaId`) y viaja
  DENTRO de la lectura en lote (`{ lectura: "zona", zonaId }`, SLT-141 R389). Los repositorios son los
  mismos.
- **Autorización:** el servicio nuevo comprueba `actor.rol === "adminSatelite"` antes de cualquier
  lectura, como hacía `CierreBodegaService` (R693). El recorte de cifras de empresa sigue en
  `anularEmpresaSiNoCentral` con `CLASE_CIFRAS_BODEGA_DESCARGA` (R692). Sin módulos nuevos que encender.
- **País:** la zona horaria de la empresa, de `construirReglasPaisEmpresa` (igual que hoy). Moneda,
  impuestos y geografía: no intervienen más allá de lo que ya calcula `cifrasAgregadasBodega`.

## La guardia R631

En `tests/unit/guards/pago-tienda-no-mueve-dinero.guardia.test.ts`:

1. `EXCEPCIONES = []` y `TOPE_EXCEPCIONES = 0`. El test «solo encoge» afirma `EXCEPCIONES` vacía y
   `expect(TOPE_EXCEPCIONES).toBe(0)` con el literal (m1). Se actualiza el comentario de `:315-320`.
2. El test de los caminos del árbol real pasa a `expect(barrido.caminos).toEqual([])`; se mantienen las
   aserciones de barrido no vacuo (R702).
3. El test «quitar una excepción da rojo» (`:465-470`) ya no tiene objeto y se sustituye por la
   **contraprueba sobre el árbol real** (R701): un lector que devuelve el árbol real salvo
   `lib/services/CierreBodegaService.ts`, que se sirve con su texto real más una línea de import. Tres casos:
   `cifrasBodegaDescarga` de `@/lib/services/cifras-bodega-descarga` (cadena hasta
   `cifras-cierre-bodega.ts`), `anularEmpresaSiNoCentral` de `@/lib/services/CierresAdminService` (hasta
   `cifras-cierre.ts`) y el import de `CierresBodegaSateliteDescargaService` (m2: un camino nuevo por otro
   módulo). Cada uno da exactamente un error `camino a modulo prohibido (…)` con su cadena.
4. Bloque nuevo «SLT-176 R696-R699»:
   - el servicio nuevo existe y **no** es servicio de dinero (`esServicioDeDinero` da `false`);
   - R697: sus imports de valor (con `importsDeValor` de la propia guardia) no resuelven a
     `lib/repositories/`, `lib/db/`, `@prisma/client` ni a un servicio de dinero; con contraprueba en
     memoria (un texto que importa `CierreBodegaRepository` da rojo);
   - R699: `"listarCierresBodegaSolicitadosCompleto" in CierreBodegaService.prototype` es `false`.

Se quedan en este archivo porque reutilizan su resolvedor y su lector; una guardia aparte los copiaría.

## Alternativas descartadas

1. **Inyectar en `CierreBodegaService` un puerto de «cifras de la descarga»** y dejar el método donde
   está, importando solo tipos. La guardia saldría verde (no sigue `import type`), pero solo porque se le
   esquiva: el servicio que escribe dinero seguiría orquestando las cifras de presentación en tiempo de
   ejecución. Es lo contrario de lo que pide el board («mover esas lecturas a un servicio de solo
   lectura»).
2. **Sacar `anularEmpresaSiNoCentral`/`anularEmpresa`/`ClasificacionDinero` de `CierresAdminService` a un
   módulo neutro.** Cierra el camino 2 a nivel de módulo, pero toca `CierresAdminService.ts`, que es de
   SLT-125 «Geografía jerárquica: presentación, exportes, cierres y geocodificación» (PR #161), y no cierra
   el camino 1: `cifrasBodegaDescarga` llega a `cifras-cierre-bodega` por diseño.
3. **Poner el método en `CierresBodegaAdminService`**, que ya importa `cifras-bodega-descarga`. Es el
   servicio de la central (acceso total, con `pagoEntregado` y seis dependencias); meter allí la lectura de
   la satélite mezcla los dos roles en una clase y arriesga el recorte F481/R480 por una rama de rol.
4. **Partir `cifras-bodega-descarga.ts`** para que `CierreBodegaService` importe solo
   `cierresBodegaModeloNuevo` y el error. El método seguiría necesitando `cifrasBodegaDescarga` y el
   recorte: no quita ningún camino.

## Dependencias de terceros

Ninguna nueva.

## Riesgos

- **Constructores con cinco argumentos.** Quien construya `CierreBodegaService` con `cifrasLote` deja de
  compilar. Medido: lo hacen `tests/unit/services/cierre-bodega-solicitados-modelo-nuevo-service.test.ts:102-108`,
  `tests/integration/db/cierres-bodega-cifras-lote-sql-real.test.ts:495`,
  `tests/integration/db/deudas-d39-d40-modelo-nuevo.test.ts:466` y la propia acción. El typecheck nombra
  cualquier otro.
- **Un test que siga llamando al método sobre `CierreBodegaService`** no compila (se borra de la
  interfaz y de la clase): el typecheck es la red.
- **E2E:** `e2e/cierres-rediseno.spec.ts` (descargas de cierres, satélite incluida) y
  `e2e/cierre-bodega-satelite.spec.ts` (pantalla de la satélite) se corren en local antes del PR, más el
  grupo `dinero`, porque el diff toca una lectura de dinero (`docs/perfil-agentes.md > Todos los agentes`).
  Ningún E2E cambia.
- **`deudas-d39-d40-modelo-nuevo.test.ts:463-481`** usa el MISMO servicio para el paginado (que se queda
  en `CierreBodegaService`) y para el completo (que se va): necesita las dos construcciones.
