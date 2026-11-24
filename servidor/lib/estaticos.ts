/*
  Arquivos estáticos do site (fotos do banco do projeto e a logo em marca/). O PHP conferia com is_file();
  aqui a lista vem de servidor/gerado/estaticos.json (feito no build da Vercel) ou, no computador, da pasta site/.
*/
import fs from 'node:fs';
import path from 'node:path';

let lista: Set<string> | null = null;

export const raiz = (): string => process.env.RAIZ_PROJETO || process.cwd();

function varrer(dir: string, prefixo: string, saida: Set<string>): void {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) varrer(path.join(dir, e.name), `${prefixo}${e.name}/`, saida);
    else saida.add(prefixo + e.name);
  }
}

export function existe(rel: string): boolean {
  if (!lista) {
    const manifesto = path.join(raiz(), 'servidor', 'gerado', 'estaticos.json');
    if (fs.existsSync(manifesto)) {
      lista = new Set(JSON.parse(fs.readFileSync(manifesto, 'utf8')) as string[]);
    } else {
      lista = new Set();
      varrer(path.join(raiz(), 'site', 'assets', 'img'), 'assets/img/', lista);
      varrer(path.join(raiz(), 'site', 'marca'), 'marca/', lista);
    }
  }
  return lista.has(rel.replace(/^\/+/, ''));
}
