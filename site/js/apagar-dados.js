/* "Apagar meus dados deste aparelho" (LGPD-05): tira do navegador a sacola, os dados do pedido e a lista de pedidos feitos.
   Os pedidos continuam na loja; aqui some só o que ficou guardado neste aparelho. */
export function apagarDadosLocais() {
  for (const area of [localStorage, sessionStorage]) {
    try {
      Object.keys(area).filter(k => k.startsWith('brasa:')).forEach(k => area.removeItem(k));
    } catch { /* navegador sem armazenamento: não há o que apagar */ }
  }
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-apagar-dados]');
  if (!b) return;
  apagarDadosLocais();
  const msg = document.querySelector('[data-apagar-msg]');
  const texto = 'Pronto. A sacola, os dados do pedido e a lista de pedidos deste aparelho foram apagados.';
  if (msg) { msg.textContent = texto; msg.hidden = false; }
  else alert(texto);
  b.disabled = true;
  setTimeout(() => location.reload(), 1800);
});
