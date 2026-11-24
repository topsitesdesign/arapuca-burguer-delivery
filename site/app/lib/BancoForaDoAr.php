<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** O banco de dados não respondeu (servidor fora do ar, senha trocada, limite da hospedagem). */
final class BancoForaDoAr extends \RuntimeException
{
}
