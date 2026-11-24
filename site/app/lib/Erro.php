<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Erro que pode ser mostrado ao usuário (mensagem clara, sem detalhes internos). */
final class Erro extends \RuntimeException
{
    public function __construct(
        string $mensagem,
        public readonly int $status = 422,
        public readonly ?string $campo = null,
        public readonly array $extra = [],
    ) {
        parent::__construct($mensagem);
    }
}
