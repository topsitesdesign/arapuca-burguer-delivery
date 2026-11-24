<?php
declare(strict_types=1);
namespace Brasa;

defined('BRASA') || exit;

/** Quem acessa o painel: login com e-mail e senha (guardada só como hash), permissões, proprietário e perfil. */
final class Usuarios
{
    public const PERMISSOES = ['pedidos', 'produtos', 'cupons', 'areas', 'banners', 'configuracoes', 'usuarios'];
    public const FUNCOES = ['Administrador', 'Gerente', 'Atendente', 'Cozinha'];
    public const SENHA_MIN = 12;
    /** Senhas que aparecem nas listas de senhas vazadas (e variações óbvias): recusadas mesmo com 12 caracteres. */
    private const PROIBIDAS = ['123456789012', '1234567890123', '12345678901234', '123456123456', '111111111111', '000000000000', 'qwertyuiop12',
        'qwertyuiopas', 'qwerty123456', 'password1234', 'password123!', 'senha1234567', 'senhasenha12', 'senha@123456', 'mudar123456!', 'abc123abc123',
        'abcdefghijkl', 'iloveyou1234', 'admin1234567', 'administrador', 'adminadmin12', 'brasilbrasil', 'flamengo1234', 'corinthians1', 'palmeiras123',
        'hamburgueria', 'hamburguer12', 'deliverydelivery', '102030405060', '147258369123', '987654321098', 'aaaaaaaaaaaa', 'trocar123456'];
    /** Rota dos avisos sobre mudança de acessos: só quem tem a permissão Usuários recebe. */
    public const ROTA_ACESSOS = 'configuracoes?aba=usuarios';

    private static ?array $atual = null;
    private static ?string $dono = null;

    public static function linha(array $r): array
    {
        $perm = json_decode((string) $r['permissoes'], true);
        return [
            'id' => $r['id'], 'nome' => $r['nome'], 'email' => $r['email'], 'telefone' => $r['telefone'], 'funcao' => $r['funcao'],
            'permissoes' => is_array($perm) ? array_values(array_intersect(self::PERMISSOES, $perm)) : [], 'status' => $r['status'],
            'ultimoAcesso' => $r['ultimo_acesso'] === null ? null : (int) $r['ultimo_acesso'], 'ordem' => (int) $r['ordem'],
            'doisFatores' => !empty($r['totp_ativo']),
        ];
    }

    public static function iniciais(string $nome): string
    {
        $partes = array_values(array_filter(preg_split('/\s+/u', trim($nome)) ?: []));
        $ini = '';
        foreach (array_slice($partes, 0, 2) as $p) $ini .= mb_substr($p, 0, 1);
        return mb_strtoupper($ini ?: '?');
    }

    /** Identifica a senha atual sem revelá-la: muda sempre que a senha muda. */
    public static function versaoSenha(string $hash): string
    {
        return substr(hash('sha256', $hash), 0, 20);
    }

    /**
      Proprietário da loja: quem instalou o sistema (u1). Só ele altera o próprio acesso e o de outros administradores.
      Instalações antigas não guardavam isso: vale o u1 ou, sem ele, o usuário mais antigo com a permissão Usuários.
    */
    public static function proprietarioId(): string
    {
        if (self::$dono !== null) return self::$dono;
        $id = (string) Config::obter('proprietario', '');
        if ($id === '' || !Db::valor("SELECT COUNT(*) FROM usuarios WHERE id = ? AND status <> 'removido'", [$id])) {
            $id = '';
            foreach (Db::todos("SELECT id, permissoes FROM usuarios WHERE status <> 'removido' ORDER BY (id = 'u1') DESC, criado_em, ordem") as $r) {
                if (in_array('usuarios', json_decode((string) $r['permissoes'], true) ?: [], true)) { $id = (string) $r['id']; break; }
            }
            if ($id !== '') Config::gravar('proprietario', $id);
        }
        return self::$dono = $id;
    }

    /** Administrador logado (ou null). Usuário desativado ou com a senha trocada perde o acesso na hora. */
    public static function atual(): ?array
    {
        if (self::$atual) return self::$atual;
        $id = Sessao::adminId();
        if ($id === null) return null;
        $r = Db::um('SELECT * FROM usuarios WHERE id = ?', [$id]);
        if (!$r || $r['status'] !== 'ativo') {
            Sessao::sairAdmin();
            return null;
        }
        $v = self::versaoSenha((string) $r['senha_hash']);
        $s = Sessao::versaoAdmin();
        if ($s === null) {
            Sessao::definirVersao($v); // sessão aberta antes desta versão do sistema: passa a valer a senha de agora
        } elseif (!hash_equals($s, $v)) {
            Sessao::sairAdmin(); // a senha mudou depois que esta sessão começou
            return null;
        }
        return self::$atual = self::linha($r);
    }

    /** Exige login (e a permissão, se informada). */
    public static function exigir(?string $permissao = null): array
    {
        $u = self::atual();
        if (!$u) throw new Erro('Sua sessão terminou. Entre de novo para continuar.', 401);
        if ($permissao !== null && !in_array($permissao, $u['permissoes'], true)) {
            throw new Erro('Seu usuário não tem permissão para isso. Fale com o administrador da loja.', 403);
        }
        return $u;
    }

    public static function pode(array $u, string $permissao): bool
    {
        return in_array($permissao, $u['permissoes'], true);
    }

    /** Gerente: o proprietário, ou administrador/gerente com a permissão Pedidos (pode cancelar pedido concluído e estornar). */
    public static function gerente(array $u): bool
    {
        return $u['id'] === self::proprietarioId() || (in_array($u['funcao'], ['Administrador', 'Gerente'], true) && self::pode($u, 'pedidos'));
    }

    /** Administrador para a regra das duas etapas: quem cuida de usuários ou de configurações. */
    public static function administrador(array $u): bool
    {
        return self::pode($u, 'usuarios') || self::pode($u, 'configuracoes');
    }

    /** O proprietário mandou exigir as duas etapas e este administrador ainda não ativou. */
    public static function precisa2fa(array $u): bool
    {
        return !empty(((array) Config::obter('seguranca', []))['exigir2fa']) && self::administrador($u) && empty($u['doisFatores']);
    }

    public static function entrar(mixed $email, mixed $senha): array
    {
        $ip = Limite::ip();
        $msgIp = 'Muitas tentativas de entrar. Espere 15 minutos e tente de novo.';
        $msgEmail = 'Muitas tentativas de entrar com este e-mail. Espere 15 minutos e tente de novo.';
        // só as tentativas erradas contam: quem erra de um lugar não tranca o dono que acerta de outro
        Limite::verificar('login-ip:' . $ip, 12, 900, $msgIp);
        $email = is_string($email) ? mb_strtolower(trim($email)) : '';
        $senha = is_string($senha) ? $senha : '';
        if ($email === '' || $senha === '') throw new Erro('Escreva o e-mail e a senha.', 422);
        Limite::verificar('login-email-ip:' . $email . '|' . $ip, 6, 900, $msgEmail);
        Limite::verificar('login-email:' . $email, 30, 900, $msgEmail); // muitos lugares contra o mesmo e-mail
        $r = Db::um("SELECT * FROM usuarios WHERE email = ? AND status <> 'removido'", [$email]);
        // mesma demora com ou sem usuário: o hash falso tem o mesmo custo das senhas reais (não revela quais e-mails existem)
        $hash = $r['senha_hash'] ?? self::hashFalso();
        $ok = password_verify($senha, $hash) && $r && $r['status'] === 'ativo';
        if (!$ok) {
            foreach (['login-ip:' . $ip, 'login-email-ip:' . $email . '|' . $ip, 'login-email:' . $email] as $k) Limite::somar($k, 900);
            Auditoria::registrar(null, 'login.falha', 'usuario', $r['id'] ?? '');
            throw new Erro('E-mail ou senha incorretos.', 422);
        }
        $hashFinal = (string) $r['senha_hash'];
        if (password_needs_rehash($hashFinal, PASSWORD_DEFAULT)) {
            $hashFinal = password_hash($senha, PASSWORD_DEFAULT);
            Db::q('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [$hashFinal, $r['id']]);
        }
        Limite::zerar('login-email-ip:' . $email . '|' . $ip);
        if (!empty($r['totp_ativo'])) {
            // senha certa: falta o código do aplicativo (o acesso só abre depois dele)
            Sessao::guardarPre2fa($r['id'], self::versaoSenha($hashFinal));
            Auditoria::registrar($r['id'], 'login.senha', 'usuario', $r['id']);
            return self::linha($r) + ['precisaCodigo' => true];
        }
        Db::q('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?', [Tempo::agoraMs(), $r['id']]);
        Sessao::entrarAdmin($r['id'], self::versaoSenha($hashFinal));
        Auditoria::registrar($r['id'], 'login', 'usuario', $r['id']);
        return self::linha($r);
    }

    /** Hash de uma senha qualquer, com o custo atual: usado quando o e-mail não existe. */
    private static function hashFalso(): string
    {
        $h = (string) Config::obter('hashFalso', '');
        if ($h === '' || password_needs_rehash($h, PASSWORD_DEFAULT)) {
            $h = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
            Config::gravar('hashFalso', $h);
        }
        return $h;
    }

    /** Segundo passo do login: código do aplicativo ou um código de recuperação. */
    public static function entrarComCodigo(mixed $codigo): array
    {
        $p = Sessao::pre2fa();
        if (!$p) throw new Erro('O tempo para digitar o código acabou. Entre de novo com o e-mail e a senha.', 422, 'expirou');
        $chave = 'login-codigo:' . $p['id'];
        Limite::verificar($chave, 6, 900, 'Muitos códigos errados. Espere 15 minutos e entre de novo.');
        $r = Db::um("SELECT * FROM usuarios WHERE id = ? AND status = 'ativo'", [$p['id']]);
        if (!$r || empty($r['totp_ativo']) || !hash_equals($p['v'], self::versaoSenha((string) $r['senha_hash']))) {
            Sessao::limparPre2fa();
            throw new Erro('Entre de novo com o e-mail e a senha.', 422, 'expirou');
        }
        $codigo = is_string($codigo) ? trim($codigo) : '';
        $segredo = Totp::abrir($r['totp_segredo']);
        $passo = $segredo ? Totp::conferir($segredo, $codigo, (int) $r['totp_passo']) : null;
        if ($passo !== null) {
            Db::q('UPDATE usuarios SET totp_passo = ? WHERE id = ?', [$passo, $r['id']]);
        } else {
            $resto = Totp::usarRecuperacao(json_decode((string) $r['totp_recuperacao'], true) ?: [], $codigo);
            if ($resto === null) {
                Limite::somar($chave, 900);
                Auditoria::registrar($r['id'], 'login.codigo-falha', 'usuario', $r['id']);
                throw new Erro('Código incorreto. Confira no aplicativo e digite os 6 números de agora.', 422, 'codigo');
            }
            Db::q('UPDATE usuarios SET totp_recuperacao = ? WHERE id = ?', [json_encode($resto), $r['id']]);
            Auditoria::registrar($r['id'], 'login.recuperacao', 'usuario', $r['id'], ['restam' => count($resto)]);
        }
        Limite::zerar($chave);
        Db::q('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?', [Tempo::agoraMs(), $r['id']]);
        Sessao::entrarAdmin($r['id'], $p['v']);
        Auditoria::registrar($r['id'], 'login', 'usuario', $r['id']);
        return self::linha($r);
    }

    /* ------------------------------------------------------------------ verificação em duas etapas (Meu perfil) */

    /** Gera o segredo novo (ainda não vale): o painel mostra a chave e o link para o aplicativo. */
    public static function iniciar2fa(array $u): array
    {
        $s = Totp::novoSegredo();
        Sessao::guardarSegredoNovo($s);
        $loja = (string) (((array) Config::obter('loja', []))['nome'] ?? '');
        return ['segredo' => trim(chunk_split($s, 4, ' ')), 'uri' => Totp::uri($s, $u['email'], $loja !== '' ? $loja : 'Painel')];
    }

    /** Confirma o primeiro código e liga as duas etapas. Devolve os códigos de recuperação (mostrados uma vez só). */
    public static function ativar2fa(array $u, mixed $codigo, mixed $senha): array
    {
        self::confirmarSenha($u, $senha, 'para ativar a verificação em duas etapas');
        $s = Sessao::segredoNovo();
        if (!$s) throw new Erro('Comece de novo: toque em Ativar verificação em duas etapas.', 422, 'codigo');
        $passo = Totp::conferir($s, is_string($codigo) ? $codigo : '');
        if ($passo === null) throw new Erro('Código incorreto. Confira se o aplicativo mostra a conta certa e digite os 6 números de agora.', 422, 'codigo');
        [$mostrar, $guardar] = Totp::codigosRecuperacao();
        Db::q('UPDATE usuarios SET totp_segredo = ?, totp_ativo = 1, totp_passo = ?, totp_recuperacao = ? WHERE id = ?', [Totp::fechar($s), $passo, json_encode($guardar), $u['id']]);
        Sessao::guardarSegredoNovo(null);
        Auditoria::registrar($u['id'], '2fa.ativar', 'usuario', $u['id']);
        self::$atual = null;
        return $mostrar;
    }

    public static function desativar2fa(array $u, mixed $senha): void
    {
        self::confirmarSenha($u, $senha, 'para desligar a verificação em duas etapas');
        if (!empty(((array) Config::obter('seguranca', []))['exigir2fa']) && self::administrador($u)) {
            throw new Erro('A loja exige a verificação em duas etapas para administradores. Só o proprietário pode desligar essa regra, em Configurações › Segurança.', 403);
        }
        Db::q('UPDATE usuarios SET totp_segredo = NULL, totp_ativo = 0, totp_passo = 0, totp_recuperacao = NULL WHERE id = ?', [$u['id']]);
        Auditoria::registrar($u['id'], '2fa.desativar', 'usuario', $u['id']);
        self::$atual = null;
    }

    public static function sair(): void
    {
        $u = self::atual();
        if ($u) Auditoria::registrar($u['id'], 'logout', 'usuario', $u['id']);
        Sessao::sairAdmin();
        self::$atual = null;
    }

    /** Cabeçalho do painel (estado.admin). */
    public static function paraPainel(array $u): array
    {
        return ['id' => $u['id'], 'nome' => $u['nome'], 'iniciais' => self::iniciais($u['nome']), 'funcao' => $u['funcao'], 'email' => $u['email'],
            'telefone' => $u['telefone'], 'permissoes' => $u['permissoes'], 'proprietario' => $u['id'] === self::proprietarioId(),
            'gerente' => self::gerente($u), 'doisFatores' => !empty($u['doisFatores']), 'precisa2fa' => self::precisa2fa($u)];
    }

    private static function acesso(?int $ms): string
    {
        if (!$ms) return '—';
        $d = Tempo::deMs($ms);
        $hoje = Tempo::hojeIso();
        $ontem = Tempo::agora()->modify('-1 day')->format('Y-m-d');
        $dia = $d->format('Y-m-d');
        return ($dia === $hoje ? 'Hoje' : ($dia === $ontem ? 'Ontem' : $d->format('d/m/Y'))) . ', ' . $d->format('H:i');
    }

    /** Lista de usuários para Configurações › Usuários. */
    public static function lista(): array
    {
        $dono = self::proprietarioId();
        return array_map(static function (array $r) use ($dono): array {
            $u = self::linha($r);
            return ['id' => $u['id'], 'nome' => $u['nome'], 'email' => $u['email'], 'funcao' => $u['funcao'], 'status' => $u['status'],
                'permissoes' => $u['permissoes'], 'acesso' => self::acesso($u['ultimoAcesso']), 'proprietario' => $u['id'] === $dono, 'doisFatores' => $u['doisFatores']];
        }, Db::todos("SELECT * FROM usuarios WHERE status <> 'removido' ORDER BY ordem, criado_em"));
    }

    /**
     * Senha nova: 12 caracteres ou mais, fora da lista de senhas vazadas e sem repetir o e-mail ou o nome da loja.
     * $loja: nome da loja quando o banco ainda não existe (instalador, que usa o da semente); sem ele, vem das configurações.
     */
    public static function validarSenha(mixed $s, string $rotulo = 'a senha', array $evitar = [], ?string $loja = null): string
    {
        if (!is_string($s) || mb_strlen($s) < self::SENHA_MIN) throw new Erro(ucfirst($rotulo) . ' precisa ter pelo menos ' . self::SENHA_MIN . ' caracteres.', 422, 'senha');
        if (mb_strlen($s) > 200) throw new Erro(ucfirst($rotulo) . ' é longa demais.', 422, 'senha');
        $so = static fn (string $x): string => mb_strtolower(preg_replace('/[^\p{L}\p{N}]/u', '', $x) ?? '');
        $simples = mb_strtolower(preg_replace('/\s+/u', '', $s) ?? '');
        $fraca = in_array($simples, self::PROIBIDAS, true) || count(array_unique(mb_str_split($simples))) < 4;
        // o nome da loja inteiro e cada palavra dele com 4 letras ou mais ("brasa", "burger")
        $loja ??= (string) (((array) Config::obter('loja', []))['nome'] ?? '');
        foreach (array_merge($evitar, [$loja], preg_split('/\s+/u', $loja) ?: []) as $x) {
            $x = $so((string) $x);
            if (mb_strlen($x) >= 4 && str_contains($so($s), $x)) $fraca = true;
        }
        if ($fraca) throw new Erro(ucfirst($rotulo) . ' é fácil de adivinhar. Misture palavras, números e símbolos, sem usar o e-mail ou o nome da loja.', 422, 'senha');
        return $s;
    }

    /** Confirmação de senha para ações sensíveis (anonimizar dados de cliente, por exemplo). */
    public static function confirmar(array $u, mixed $senha, string $para): void
    {
        self::confirmarSenha($u, $senha, $para);
    }

    /** Pede a senha de quem está mexendo nos acessos: protege a loja se a sessão de alguém for roubada. */
    private static function confirmarSenha(array $eu, mixed $senha, string $para = 'para mudar os acessos'): void
    {
        $chave = 'confirmar-senha:' . $eu['id'];
        Limite::verificar($chave, 5, 900, 'Muitas confirmações de senha erradas. Espere 15 minutos e tente de novo.');
        $hash = (string) Db::valor('SELECT senha_hash FROM usuarios WHERE id = ?', [$eu['id']]);
        if (!is_string($senha) || $senha === '') throw new Erro("Confirme com a sua senha $para.", 422, 'confirmar-senha');
        if (!password_verify($senha, $hash)) {
            Limite::somar($chave, 900);
            throw new Erro('A senha de confirmação não confere. Nada foi alterado.', 422, 'confirmar-senha');
        }
    }

    /**
      Grava a lista inteira vinda do painel (criar, editar, desativar, remover), com a senha de quem altera.
      Regras do proprietário: só ele altera o próprio acesso, o de outros administradores (quem tem Usuários)
      e dá a permissão Usuários; ninguém aumenta as próprias permissões.
    */
    public static function salvarLista(mixed $dados, array $eu, mixed $senhaAtual = null): array
    {
        self::confirmarSenha($eu, $senhaAtual);
        $lista = V::lista($dados, 'os usuários', 50);
        $atuais = array_column(array_map([self::class, 'linha'], Db::todos("SELECT * FROM usuarios WHERE status <> 'removido'")), null, 'id');
        $dono = self::proprietarioId();
        $souDono = $eu['id'] === $dono;
        $mesmas = static fn (array $a, array $b): bool => !array_diff($a, $b) && !array_diff($b, $a);
        $ids = [];
        $emails = [];
        $novos = [];
        $mudou = ['criou' => [], 'removeu' => [], 'senha' => [], 'acesso' => []];
        $minhaSenha = null;
        foreach ($lista as $i => $item) {
            $item = V::objeto($item, 'um usuário');
            $id = V::id($item['id'] ?? null, 'o usuário');
            if (isset($ids[$id])) throw new Erro('Há dois usuários com o mesmo identificador.', 422);
            $ids[$id] = true;
            $velho = $atuais[$id] ?? null;
            $email = $velho ? $velho['email'] : V::email($item['email'] ?? '');
            if (isset($emails[$email])) throw new Erro("O e-mail $email aparece duas vezes.", 422);
            $emails[$email] = true;
            $perm = array_values(array_intersect(self::PERMISSOES, is_array($item['permissoes'] ?? null) ? $item['permissoes'] : []));
            if (!$perm) throw new Erro('Marque pelo menos uma permissão para ' . ($item['nome'] ?? 'o usuário') . '.', 422);
            $status = V::opcao($item['status'] ?? 'ativo', ['ativo', 'inativo', 'convite'], 'o status');
            if ($status === 'convite') $status = 'ativo';
            $u = [
                'id' => $id, 'nome' => V::texto($item['nome'] ?? '', 'o nome', 2, 80), 'email' => $email,
                'funcao' => V::opcao($item['funcao'] ?? '', self::FUNCOES, 'a função'), 'permissoes' => $perm, 'status' => $status, 'ordem' => $i,
            ];
            $senha = $item['senha'] ?? '';
            if (!$velho) {
                $u['hash'] = password_hash(self::validarSenha($senha, 'a senha inicial', [explode('@', $email)[0]]), PASSWORD_DEFAULT);
                if (Db::valor("SELECT COUNT(*) FROM usuarios WHERE email = ? AND status <> 'removido'", [$email])) throw new Erro("O e-mail $email já tem acesso.", 422);
            } elseif (is_string($senha) && $senha !== '') {
                $u['hash'] = password_hash(self::validarSenha($senha, 'a nova senha', [explode('@', $email)[0]]), PASSWORD_DEFAULT);
            }
            // o proprietário pode desligar as duas etapas de alguém que perdeu o celular
            if ($velho && V::bool($item['zerar2fa'] ?? false) && $velho['doisFatores']) {
                if (!$souDono) throw new Erro('Só o proprietário da loja desliga a verificação em duas etapas de outra pessoa.', 403);
                $u['zerar2fa'] = true;
            }
            $alterou = $velho && ($velho['nome'] !== $u['nome'] || $velho['funcao'] !== $u['funcao'] || $velho['status'] !== $u['status']
                || !$mesmas($velho['permissoes'], $u['permissoes']) || isset($u['hash']) || isset($u['zerar2fa']));
            if (!$souDono) {
                if ($id === $dono && $alterou) throw new Erro('Só o proprietário da loja pode alterar o próprio acesso.', 403);
                if ($id !== $eu['id'] && $alterou && in_array('usuarios', $velho['permissoes'], true)) {
                    throw new Erro('Só o proprietário da loja altera o acesso de outro administrador.', 403);
                }
                if (in_array('usuarios', $u['permissoes'], true) && !($velho && in_array('usuarios', $velho['permissoes'], true))) {
                    throw new Erro('Só o proprietário da loja pode dar a permissão Usuários.', 403);
                }
                if ($id === $eu['id'] && array_diff($u['permissoes'], $velho['permissoes'] ?? [])) {
                    throw new Erro('Você não pode aumentar as próprias permissões.', 403);
                }
            }
            if ($id === $dono) {
                // o proprietário fica sempre ativo e com todas as permissões
                $u['status'] = 'ativo';
                $u['permissoes'] = self::PERMISSOES;
            } elseif ($id === $eu['id']) {
                // ninguém se tranca para fora
                $u['status'] = 'ativo';
                if (!in_array('usuarios', $u['permissoes'], true)) $u['permissoes'][] = 'usuarios';
            }
            if (!$velho) $mudou['criou'][] = $u['nome'];
            elseif (isset($u['hash'])) $mudou['senha'][] = $u['nome'];
            if ($velho && ($velho['status'] !== $u['status'] || !$mesmas($velho['permissoes'], $u['permissoes']) || $velho['funcao'] !== $u['funcao'])) $mudou['acesso'][] = $u['nome'];
            if ($id === $eu['id'] && isset($u['hash'])) $minhaSenha = $u['hash'];
            $novos[] = [$u, $velho];
        }
        if (!isset($ids[$eu['id']])) throw new Erro('Você não pode remover o seu próprio usuário.', 422);
        if ($dono !== '' && !isset($ids[$dono])) throw new Erro('O proprietário da loja não pode ser removido.', 403);
        foreach (array_diff(array_keys($atuais), array_keys($ids)) as $sai) {
            if (!$souDono && in_array('usuarios', $atuais[$sai]['permissoes'], true)) throw new Erro('Só o proprietário da loja remove outro administrador.', 403);
            $mudou['removeu'][] = $atuais[$sai]['nome'];
        }
        Db::tx(static function () use ($novos, $ids, $atuais, $eu, $mudou): void {
            foreach (array_diff(array_keys($atuais), array_keys($ids)) as $sai) {
                // o usuário sai da lista, mas a linha fica: etapas, pagamentos e auditoria continuam dizendo quem fez o quê
                Db::q("UPDATE usuarios SET status = 'removido', removido_em = ?, email = LEFT(CONCAT('#', id, '#', email), 120), totp_segredo = NULL, totp_ativo = 0, totp_recuperacao = NULL WHERE id = ?", [Tempo::agoraMs(), $sai]);
                Auditoria::registrar($eu['id'], 'usuario.remover', 'usuario', (string) $sai, ['email' => $atuais[$sai]['email']]);
            }
            foreach ($novos as [$u, $velho]) {
                $perm = json_encode($u['permissoes']);
                if (!$velho) {
                    // identificador de um usuário removido (a linha dele continua, com o histórico): o novo ganha outro
                    while (Db::valor('SELECT COUNT(*) FROM usuarios WHERE id = ?', [$u['id']])) $u['id'] = substr($u['id'], 0, 50) . '-' . bin2hex(random_bytes(3));
                    Db::q('INSERT INTO usuarios (id, nome, email, senha_hash, funcao, permissoes, status, ordem, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [$u['id'], $u['nome'], $u['email'], $u['hash'], $u['funcao'], $perm, $u['status'], $u['ordem'], Tempo::agoraMs()]);
                    Auditoria::registrar($eu['id'], 'usuario.criar', 'usuario', $u['id']);
                    continue;
                }
                Db::q('UPDATE usuarios SET nome = ?, funcao = ?, permissoes = ?, status = ?, ordem = ? WHERE id = ?', [$u['nome'], $u['funcao'], $perm, $u['status'], $u['ordem'], $u['id']]);
                if (isset($u['hash'])) {
                    Db::q('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [$u['hash'], $u['id']]);
                    Auditoria::registrar($eu['id'], 'usuario.senha', 'usuario', $u['id']);
                }
                if (!empty($u['zerar2fa'])) {
                    Db::q('UPDATE usuarios SET totp_segredo = NULL, totp_ativo = 0, totp_passo = 0, totp_recuperacao = NULL WHERE id = ?', [$u['id']]);
                    Auditoria::registrar($eu['id'], 'usuario.2fa-desligar', 'usuario', $u['id']);
                }
                if ($velho['status'] !== $u['status'] || $velho['permissoes'] !== $u['permissoes'] || $velho['funcao'] !== $u['funcao']) {
                    Auditoria::registrar($eu['id'], 'usuario.editar', 'usuario', $u['id'], ['status' => $u['status'], 'funcao' => $u['funcao']]);
                }
            }
            // aviso no painel para quem cuida dos acessos
            $partes = array_filter([
                $mudou['criou'] ? 'criou ' . implode(', ', $mudou['criou']) : '',
                $mudou['removeu'] ? 'removeu ' . implode(', ', $mudou['removeu']) : '',
                $mudou['senha'] ? 'trocou a senha de ' . implode(', ', $mudou['senha']) : '',
                $mudou['acesso'] ? 'mudou o acesso de ' . implode(', ', $mudou['acesso']) : '',
            ]);
            if ($partes) {
                Db::q('INSERT INTO notificacoes (icone, cor, titulo, texto, rota, pedido, lida, em) VALUES (?, ?, ?, ?, ?, NULL, 0, ?)',
                    ['shield', '', 'Acessos alterados', mb_substr($eu['nome'] . ' ' . implode('; ', $partes) . '.', 0, 200), self::ROTA_ACESSOS, Tempo::agoraMs()]);
            }
        });
        // quem trocou a própria senha nesta lista continua dentro (as outras sessões dele caem)
        if ($minhaSenha !== null) Sessao::definirVersao(self::versaoSenha($minhaSenha));
        self::$atual = null;
        return self::lista();
    }

    /** "Meu perfil": nome, e-mail, celular e troca de senha (pede a senha atual). */
    public static function salvarPerfil(array $d, array $u): array
    {
        $nome = V::texto($d['nome'] ?? '', 'o seu nome', 2, 80, 'pf-nome');
        $email = V::email($d['email'] ?? '', 'o seu e-mail');
        $tel = V::texto($d['telefone'] ?? '', 'o celular', 0, 20, 'pf-fone');
        if (Db::valor("SELECT COUNT(*) FROM usuarios WHERE email = ? AND id <> ? AND status <> 'removido'", [$email, $u['id']])) throw new Erro('Esse e-mail já é de outro usuário.', 422, 'pf-email');
        $nova = $d['senha'] ?? '';
        $hash = null;
        if (is_string($nova) && $nova !== '') {
            $atual = (string) Db::valor('SELECT senha_hash FROM usuarios WHERE id = ?', [$u['id']]);
            if (!password_verify(is_string($d['senhaAtual'] ?? null) ? $d['senhaAtual'] : '', $atual)) throw new Erro('A senha atual não confere.', 422, 'pf-atual');
            $hash = password_hash(self::validarSenha($nova, 'a nova senha', [explode('@', $email)[0], $nome]), PASSWORD_DEFAULT);
        }
        Db::q('UPDATE usuarios SET nome = ?, email = ?, telefone = ? WHERE id = ?', [$nome, $email, $tel, $u['id']]);
        if ($hash) {
            Db::q('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [$hash, $u['id']]);
            Sessao::entrarAdmin($u['id'], self::versaoSenha($hash)); // novo ID de sessão; as outras sessões desta pessoa caem
        }
        Auditoria::registrar($u['id'], $hash ? 'perfil.senha' : 'perfil.editar', 'usuario', $u['id']);
        self::$atual = null;
        return self::paraPainel(self::atual() ?? $u);
    }
}
