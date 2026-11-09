/** Erro cuja mensagem pode ser mostrada ao usuário (validação, regra de negócio). */
export class UserError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
