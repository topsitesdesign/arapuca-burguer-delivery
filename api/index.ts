/*
  Função única da Vercel: recebe tudo o que não é arquivo estático (ver vercel.json) e responde como o index.php fazia.
*/
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tratar } from '../servidor/app.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await tratar(req, res);
}
