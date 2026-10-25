import type { ICifradorSecretos } from "@/lib/interfaces/external/ICifradorSecretos";
import type { IIntegracionRecifradoRepository } from "@/lib/interfaces/repositories/IIntegracionRecifradoRepository";
import type {
  IRecifradoIntegracionesService,
  OpcionesRecifrado,
  ResumenRecifrado,
} from "@/lib/interfaces/services/IRecifradoIntegracionesService";

// SL-36 (design §12; D10, R38-R40) — la rotacion de la clave maestra de las integraciones.
//
// Recorre TODAS las empresas porque una integracion que nadie usa nunca se recifraria «al leer», y
// entonces la version vieja no se podria retirar jamas (QC decisiones D10). Cada empresa va en su
// contexto (`paraCadaEmpresa`): listar las empresas es la unica lectura de plataforma, y es la de
// SL-17, ya en la lista de excepciones.
//
// NUNCA sale de aqui un valor, ni descifrado ni cifrado, ni un id de integracion o de empresa: el
// resultado son conteos (R39).

export interface RecifradoDeps {
  cifrador: ICifradorSecretos;
  /** La version activa del anillo; lanza si el anillo no es valido (R4), antes de tocar nada. */
  versionActiva: () => string;
  repositorio: IIntegracionRecifradoRepository;
  /** `paraCadaEmpresa`: corre `fn` una vez por empresa, dentro de `conEmpresa`. */
  recorrerEmpresas: (fn: (organizacionId: string) => Promise<void>) => Promise<unknown>;
}

/** Lo que una empresa aporta al resumen. Se suma solo si la empresa termina sin error de base. */
interface ConteoDeEmpresa {
  porVersion: Map<string, number>;
  ilegibles: number;
  recifrados: number;
  conflictos: number;
}

function sumarVersion(conteo: Map<string, number>, version: string, n = 1): void {
  conteo.set(version, (conteo.get(version) ?? 0) + n);
}

export class RecifradoIntegracionesService implements IRecifradoIntegracionesService {
  constructor(private readonly deps: RecifradoDeps) {}

  async ejecutar(opciones: OpcionesRecifrado): Promise<ResumenRecifrado> {
    const activa = this.deps.versionActiva();
    const porVersion = new Map<string, number>();
    const resumen: ResumenRecifrado = {
      soloContar: opciones.soloContar,
      versionActiva: activa,
      porVersion: {},
      ilegibles: 0,
      recifrados: 0,
      conflictos: 0,
      empresasConError: 0,
    };

    await this.deps.recorrerEmpresas(async (organizacionId) => {
      let conteo: ConteoDeEmpresa;
      try {
        conteo = await this.empresa(organizacionId, activa, opciones.soloContar);
      } catch {
        // El error NO se propaga ni se imprime: `paraCadaEmpresa` lo volcaria entero, y el mensaje
        // de un error de Prisma lleva los argumentos de la consulta, cifrados incluidos. Basta con
        // contarlo: con una empresa sin contar el resumen no sirve para retirar versiones y el
        // comando sale con 1.
        resumen.empresasConError += 1;
        return;
      }
      for (const [version, n] of conteo.porVersion) sumarVersion(porVersion, version, n);
      resumen.ilegibles += conteo.ilegibles;
      resumen.recifrados += conteo.recifrados;
      resumen.conflictos += conteo.conflictos;
    });

    resumen.porVersion = Object.fromEntries([...porVersion].sort(([a], [b]) => a.localeCompare(b)));
    return resumen;
  }

  private async empresa(organizacionId: string, activa: string, soloContar: boolean): Promise<ConteoDeEmpresa> {
    const conteo: ConteoDeEmpresa = { porVersion: new Map(), ilegibles: 0, recifrados: 0, conflictos: 0 };
    for (const fila of await this.deps.repositorio.listarSecretos()) {
      const nuevos: Record<string, string> = {};
      /** La version de cada valor legible tal como esta guardado hoy. */
      const antes: string[] = [];
      let aMover = 0;
      for (const [campo, guardado] of Object.entries(fila.secretos)) {
        nuevos[campo] = guardado;
        const ctx = { organizacionId, integracionId: fila.id, campo };
        const version = this.deps.cifrador.versionDe(guardado);
        let claro: string;
        try {
          // Tambien los de la version activa: un valor ilegible se cuenta aunque no haya que moverlo.
          claro = await this.deps.cifrador.descifrar(guardado, ctx);
        } catch {
          // Ilegible (alterado, de otra fila o de una version que ya no esta): no se toca nunca.
          conteo.ilegibles += 1;
          continue;
        }
        // Si descifro, tiene forma y por tanto version.
        antes.push(version as string);
        if (soloContar || version === activa) continue;
        nuevos[campo] = await this.deps.cifrador.cifrar(claro, ctx);
        aMover += 1;
      }

      if (aMover > 0 && (await this.deps.repositorio.reemplazarSecretos(fila.id, fila.secretos, nuevos))) {
        conteo.recifrados += aMover;
        for (let i = 0; i < antes.length; i += 1) sumarVersion(conteo.porVersion, activa);
        continue;
      }
      // Sin nada que mover, o la fila cambio mientras tanto. En el segundo caso lo que hay ahora no
      // se conoce, asi que se cuenta como estaba: nunca se anuncia vacia una version que no lo esta.
      if (aMover > 0) conteo.conflictos += 1;
      for (const version of antes) sumarVersion(conteo.porVersion, version);
    }
    return conteo;
  }
}
