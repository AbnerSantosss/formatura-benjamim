// Erros de aplicação com código estável e status HTTP. As rotas convertem em resposta JSON.
// As mensagens são em português e podem ser exibidas ao usuário; nunca incluem dado pessoal nem segredo.

export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos.') {
    super('VALIDATION_ERROR', message, 422);
  }
}

/** Um ou mais números pedidos já estão reservados ou confirmados por outro pedido. */
export class OrderConflictError extends AppError {
  readonly numbers: number[];

  constructor(numbers: number[], message = 'Alguns números já estão reservados. Escolha outros.') {
    super('ORDER_CONFLICT', message, 409);
    this.numbers = numbers;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Não encontrado.') {
    super('NOT_FOUND', message, 404);
  }
}

export class GatewayNotConfiguredError extends AppError {
  constructor(message = 'O meio de pagamento não está configurado.') {
    super('GATEWAY_NOT_CONFIGURED', message, 503);
  }
}

export class GatewayNotImplementedError extends AppError {
  constructor(message = 'Este meio de pagamento ainda não está disponível.') {
    super('GATEWAY_NOT_IMPLEMENTED', message, 503);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado.') {
    super('FORBIDDEN', message, 403);
  }
}
