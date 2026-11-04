// Falha permanente: o servidor recusou o conteúdo da sessão; repetir não adianta.
// 401/403 (login/acesso), 408/425/429 (tempo/limite) e 5xx/rede continuam na fila para nova tentativa.
export const isPermanentFailure = status => Number.isInteger(status) && status >= 400 && status < 500 && ![401, 403, 408, 425, 429].includes(status);
// Remove dados locais deste usuário (cache, fila, rascunhos, cronômetros) ao sair ou excluir a conta.
export function clearUserStorage(storage, uid) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.includes(uid)) keys.push(k); }
  for (const k of keys) storage.removeItem(k);
  return keys.length;
}
