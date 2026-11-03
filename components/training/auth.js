"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function TrainingLogin({ brand }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (new URLSearchParams(location.search).get("cadastro") === "1") setMode("signup");
    if (new URLSearchParams(location.hash.slice(1)).get("error")) {
      setError("Esse link não pôde ser usado. Entre com sua senha ou use ‘Esqueci minha senha’ para pedir outro.");
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, []);
  function change(next) {
    setMode(next); setError(""); setNotice(""); setPassword(""); setConfirmPassword("");
  }
  async function submit(e) {
    e.preventDefault(); setError(""); setNotice("");
    if (mode === "signup" && (!consent || password.length < 12 || password !== confirmPassword)) {
      setError(!consent ? "Confirme que é maior de 18 anos para continuar." : "Use pelo menos 12 caracteres e repita a mesma senha nos dois campos."); return;
    }
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/treino?redefinir=1` });
        if (error) throw error;
        setNotice("Se houver uma conta para esse e-mail, você receberá um link para escolher uma senha nova. Verifique também o spam. Não enviamos uma senha pronta.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: {
          emailRedirectTo: `${location.origin}/treino`,
          data: { training_pilot: true, training_password_set: true, training_adult_consent: true }
        } });
        if (error) throw error;
        if (!data.session) setNotice("Confira seu e-mail para concluir o cadastro. Se já tinha uma conta ou convite, use ‘Já tenho conta’ ou ‘Esqueci minha senha’.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (e) {
      if (e.code === "signup_disabled") setError("O cadastro está temporariamente indisponível. O responsável precisa ativar novos cadastros.");
      else if (e.code === "email_not_confirmed") setError("Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada e o spam.");
      else if (e.code === "user_already_exists" || e.code === "email_exists") setError("Esse e-mail já tem uma conta. Use ‘Já tenho conta’ ou ‘Esqueci minha senha’.");
      else if (e.status === 429) setError("Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.");
      else setError(mode === "login" ? "Não consegui entrar. Confira seu e-mail e sua senha; se ainda não tem uma senha, use ‘Esqueci minha senha’." : "Não consegui concluir agora. Confira os dados e tente novamente em alguns minutos.");
    } finally { setBusy(false); }
  }
  return <main className="training">{brand}<div className="tr-hero"><span className="tr-eyebrow">SEU RITMO. SEU TREINO.</span><h1>Um plano que<br />cabe na sua vida.</h1><p>Crie sua conta, conte sua rotina e comece pelo próximo passo.</p></div>
    <form className="tr-card" onSubmit={submit}>
      <h2>{mode === "signup" ? "Crie seu espaço" : mode === "reset" ? "Escolha uma senha nova" : "Entre no seu espaço"}</h2>
      <p>{mode === "signup" ? "Você escolhe a própria senha. Não precisa pedir convite." : mode === "reset" ? "Informe o e-mail usado no cadastro ou no convite anterior." : "Se já tem conta, entre com seu e-mail e senha."}</p>
      <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      {mode !== "reset" && <label>{mode === "signup" ? "Crie sua senha (mínimo de 12 caracteres)" : "Senha"}<input type="password" minLength={mode === "signup" ? 12 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} required value={password} onChange={e => setPassword(e.target.value)} /></label>}
      {mode === "signup" && <><label>Repita sua senha<input type="password" minLength={12} autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label><label className="tr-check"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} />Tenho 18 anos ou mais. Entendo que o treino é uma proposta inicial e que as respostas e fotos opcionais terão consentimentos próprios.</label></>}
      {error && <p className="tr-alert" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <button className="tr-primary" disabled={busy}>{busy ? "Aguarde…" : mode === "signup" ? "Criar minha conta" : mode === "reset" ? "Enviar link para trocar a senha" : "Entrar"}</button>
      {mode !== "signup" && <button type="button" onClick={() => change("signup")}>Criar minha conta</button>}
      {mode !== "login" && <button type="button" onClick={() => change("login")}>Já tenho conta</button>}
      {mode !== "reset" && <button type="button" className="tr-text-button" onClick={() => change("reset")}>Esqueci minha senha</button>}
      {mode === "signup" && <p className="tr-small">Seu acesso ao treino é individual. Não há cobrança automática nesta versão.</p>}
    </form></main>;
}

export function SetPassword({ onDone, brand }) {
  const [value, setValue] = useState(""), [confirmation, setConfirmation] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (value !== confirmation) { setError("As senhas precisam ser iguais."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: value, data: { training_password_set: true } });
      if (error) throw error;
      history.replaceState(null, "", "/treino"); onDone();
    } catch { setError("Não consegui salvar a senha. Use pelo menos 12 caracteres e tente novamente."); }
    finally { setBusy(false); }
  }
  return <main className="training">{brand}<form className="tr-card" onSubmit={save}><h1>Defina sua senha.</h1><p>Escolha uma senha para acessar o aplicativo sempre que quiser.</p><label>Nova senha<input type="password" minLength={12} autoComplete="new-password" required value={value} onChange={e => setValue(e.target.value)} /></label><label>Repita sua nova senha<input type="password" minLength={12} autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>{error && <p role="alert">{error}</p>}<button className="tr-primary" disabled={busy}>{busy ? "Salvando…" : "Salvar minha senha"}</button></form></main>;
}
