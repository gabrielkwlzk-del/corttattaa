// Função única da Vercel: todas as rotas /api/* passam por aqui.
import { handle } from "../lib/app.mjs";

export const GET = (request) => handle(request);
export const POST = (request) => handle(request);
export const PUT = (request) => handle(request);
export const PATCH = (request) => handle(request);
export const DELETE = (request) => handle(request);
export const HEAD = (request) => handle(request);
export const OPTIONS = (request) => handle(request);
