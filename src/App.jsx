import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// SUPABASE CLIENT
// ============================================================
const supabase = createClient(
  "https://teeewsteahiysykyckxy.supabase.co",
  "sb_publishable_D9u0niTRyzY4JrBMm1mHYQ_nKGlJV2N"
);

// ============================================================
// HOOK: Autenticação
// ============================================================
function useAuth() {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    // Verifica sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUsuario(session?.user || null);
      setCarregando(false);
    });
    // Escuta mudanças de login/logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUsuario(session?.user || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function login(email, senha) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return error;
  }

  async function cadastrar(email, senha) {
    const { error } = await supabase.auth.signUp({ email, password: senha });
    return error;
  }

  async function logout() {
    localStorage.clear();
    await supabase.auth.signOut();
  }

  async function deletarConta() {
    await supabase.rpc("deletar_minha_conta");
    localStorage.clear();
    await supabase.auth.signOut();
  }

  async function loginGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
    return error;
  }

  return { usuario, carregando, login, cadastrar, loginGoogle, logout, deletarConta };
}

// ============================================================
// CONSTANTES
// ============================================================
const CATEGORIAS_RECEITA_PADRAO = ["Vendas", "Serviços Prestados", "Comissões", "Outros"];
const CATEGORIAS_DESPESA_PADRAO = ["Material", "Transporte", "Alimentação", "Internet / Telefone", "Aluguel", "Marketing", "Contador", "DAS-MEI", "Outros"];

const CATEGORIAS_PF_RECEITA = ["Salário", "Freelance", "Aluguel Recebido", "Investimentos", "Outros"];
const CATEGORIAS_PF_DESPESA = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Lazer", "Contas / Serviços", "Outros"];

const MESES_NOME = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function categoriasParaRegime(regime) {
  if (regime === "Pessoa Física") return { receita: CATEGORIAS_PF_RECEITA, despesa: CATEGORIAS_PF_DESPESA };
  return { receita: CATEGORIAS_RECEITA_PADRAO, despesa: CATEGORIAS_DESPESA_PADRAO };
}


// ============================================================
// HOOKS
// ============================================================
function lerStorage(chave, padrao) {
  try { const d = localStorage.getItem(chave); return d ? JSON.parse(d) : padrao; } catch { return padrao; }
}
function salvarStorage(chave, dados) { localStorage.setItem(chave, JSON.stringify(dados)); }

function useFinancas(userId) {
  const [lancamentos, setLancamentos] = useState([]);
  const [registrosDAS, setRegistrosDAS] = useState([]);
  const [config, setConfig] = useState({
    nome: "", cnpj: "", limiteAnual: 81000, diaDAS: 20,
    categoriasReceita: CATEGORIAS_RECEITA_PADRAO,
    categoriasDespesa: CATEGORIAS_DESPESA_PADRAO, bancoPreferido: "", premium: false, premiumAte: null, onboardingCompleto: false, termosAceitosEm: null, regime: "MEI",
  });
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setCarregando(true);
    Promise.all([
      supabase.from("lancamentos").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("registros_das").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("config_mei").select("*").eq("user_id", userId).single(),
    ]).then(([lancRes, dasRes, cfgRes]) => {
      if (lancRes.data) {
        setLancamentos(lancRes.data.map(l => ({
          id: l.id, tipo: l.tipo, valor: Number(l.valor), categoria: l.categoria,
          data: l.data, descricao: l.descricao || "", arquivoId: l.arquivo_url, recorrente: l.recorrente || false,
        })));
      }
      if (dasRes.data) {
        setRegistrosDAS(dasRes.data.map(d => ({
          id: d.id, mesReferencia: d.mes_referencia, valor: Number(d.valor),
          status: d.status, dataVencimento: d.data_vencimento, arquivoId: d.arquivo_url,
        })));
      }
      if (cfgRes.data) {
        setConfig({
          nome: cfgRes.data.nome || "", cnpj: cfgRes.data.cnpj || "",
          limiteAnual: Number(cfgRes.data.limite_anual) || 81000, diaDAS: cfgRes.data.dia_das || 20,
          categoriasReceita: cfgRes.data.categorias_receita || CATEGORIAS_RECEITA_PADRAO,
          categoriasDespesa: cfgRes.data.categorias_despesa || CATEGORIAS_DESPESA_PADRAO, bancoPreferido: cfgRes.data.banco_preferido || "", premium: cfgRes.data.premium || false, premiumAte: cfgRes.data.premium_ate || null, onboardingCompleto: cfgRes.data.onboarding_completo || false, termosAceitosEm: cfgRes.data.termos_aceitos_em || null, regime: cfgRes.data.regime || "MEI",
        });
      }
      setCarregando(false);
    });
  }, [userId]);

  const adicionarLancamento = useCallback(async (dados) => {
    const novo = { ...dados, id: crypto.randomUUID() };
    setLancamentos(prev => [novo, ...prev]);
    await supabase.from("lancamentos").insert({
      id: novo.id, user_id: userId, tipo: novo.tipo, valor: novo.valor, categoria: novo.categoria,
      data: novo.data, descricao: novo.descricao, arquivo_url: novo.arquivoId, recorrente: novo.recorrente,
    });
    return novo;
  }, [userId]);

  const editarLancamento = useCallback(async (id, dados) => {
    setLancamentos(prev => prev.map(l => l.id === id ? { ...l, ...dados } : l));
    const u = {};
    if (dados.tipo !== undefined) u.tipo = dados.tipo;
    if (dados.valor !== undefined) u.valor = dados.valor;
    if (dados.categoria !== undefined) u.categoria = dados.categoria;
    if (dados.data !== undefined) u.data = dados.data;
    if (dados.descricao !== undefined) u.descricao = dados.descricao;
    if (dados.arquivoId !== undefined) u.arquivo_url = dados.arquivoId;
    if (dados.recorrente !== undefined) u.recorrente = dados.recorrente;
    await supabase.from("lancamentos").update(u).eq("id", id).eq("user_id", userId);
  }, [userId]);

  const removerLancamento = useCallback(async (id) => {
    setLancamentos(prev => prev.filter(l => l.id !== id));
    const { error } = await supabase.from("lancamentos").delete().eq("id", id).eq("user_id", userId);
    if (error) console.error("Erro ao remover lançamento:", error);
  }, [userId]);

  const adicionarDAS = useCallback(async (dados) => {
    const novo = { ...dados, id: crypto.randomUUID() };
    setRegistrosDAS(prev => [novo, ...prev]);
    await supabase.from("registros_das").insert({
      id: novo.id, user_id: userId, mes_referencia: novo.mesReferencia, valor: novo.valor,
      status: novo.status, data_vencimento: novo.dataVencimento, arquivo_url: novo.arquivoId,
    });
    return novo;
  }, [userId]);

  const atualizarStatusDAS = useCallback(async (id, status) => {
    setRegistrosDAS(prev => prev.map(d => d.id === id ? { ...d, status } : d));
    await supabase.from("registros_das").update({ status }).eq("id", id).eq("user_id", userId);
  }, [userId]);

  const existeLancamentoDAS = useCallback((mesRef) => {
    return lancamentos.some(l => l.categoria === "DAS-MEI" && l.descricao === `DAS ref. ${mesRef}`);
  }, [lancamentos]);

  const removerLancamentoDAS = useCallback(async (mesRef) => {
    const ids = lancamentos.filter(l => l.categoria === "DAS-MEI" && l.descricao === `DAS ref. ${mesRef}`).map(l => l.id);
    setLancamentos(prev => prev.filter(l => !(l.categoria === "DAS-MEI" && l.descricao === `DAS ref. ${mesRef}`)));
    for (const id of ids) { await supabase.from("lancamentos").delete().eq("id", id).eq("user_id", userId); }
  }, [lancamentos]);

  const removerDAS = useCallback(async (id) => {
    setRegistrosDAS(prev => prev.filter(d => d.id !== id));
    await supabase.from("registros_das").delete().eq("id", id).eq("user_id", userId);
  }, []);

  const salvarConfig = useCallback(async (novaConfig) => {
    const atualizada = { ...config, ...novaConfig };
    setConfig(atualizada);
    // Salva no Supabase fora do setState
    const { error } = await supabase.from("config_mei").upsert({
      user_id: userId, nome: atualizada.nome, cnpj: atualizada.cnpj,
      limite_anual: atualizada.limiteAnual, dia_das: atualizada.diaDAS,
      categorias_receita: atualizada.categoriasReceita, categorias_despesa: atualizada.categoriasDespesa,
      banco_preferido: atualizada.bancoPreferido || "", onboarding_completo: atualizada.onboardingCompleto || false, termos_aceitos_em: atualizada.termosAceitosEm || null, regime: atualizada.regime || "MEI",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" }).select();
    if (error) console.error("Erro ao salvar config:", error);
  }, [userId, config]);

  const limparTudo = useCallback(async () => {
    setLancamentos([]); setRegistrosDAS([]);
    await supabase.from("lancamentos").delete().eq("user_id", userId);
    await supabase.from("registros_das").delete().eq("user_id", userId);
  }, [userId]);

  function lancamentosDoMesAno(mes, ano) {
    return lancamentos.filter(l => { const [a, m] = l.data.split("-").map(Number); return (m - 1) === mes && a === ano; });
  }
  function receitasDoMesAno(mes, ano) { return lancamentosDoMesAno(mes, ano).filter(l => l.tipo === "receita").reduce((s, l) => s + l.valor, 0); }
  function despesasDoMesAno(mes, ano) { return lancamentosDoMesAno(mes, ano).filter(l => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0); }

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const faturamentoAnual = lancamentos.filter(l => l.tipo === "receita" && l.data.startsWith(String(anoAtual))).reduce((s, l) => s + l.valor, 0);
  const percentualFaturamento = Math.min((faturamentoAnual / config.limiteAnual) * 100, 100);

  const recorrentes = lancamentos.filter(l => l.recorrente && l.tipo === "despesa");
  const custoFixoMensal = (() => {
    const itens = {};
    [...recorrentes].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
      .forEach(l => { itens[`${l.categoria}::${l.descricao || "sem-desc"}`] = l.valor; });
    return Object.values(itens).reduce((s, v) => s + v, 0);
  })();

  function exportarDados() {
    return JSON.stringify({ lancamentos, registrosDAS, config, versao: 1, exportadoEm: new Date().toISOString() }, null, 2);
  }
  async function importarDados(json) {
    try {
      const dados = JSON.parse(json);
      if (dados.lancamentos) {
        setLancamentos(dados.lancamentos);
        for (const l of dados.lancamentos) {
          await supabase.from("lancamentos").upsert({
            id: l.id || crypto.randomUUID(), user_id: userId, tipo: l.tipo, valor: l.valor,
            categoria: l.categoria, data: l.data, descricao: l.descricao, arquivo_url: l.arquivoId, recorrente: l.recorrente,
          });
        }
      }
      if (dados.registrosDAS) {
        setRegistrosDAS(dados.registrosDAS);
        for (const d of dados.registrosDAS) {
          await supabase.from("registros_das").upsert({
            id: d.id || crypto.randomUUID(), user_id: userId, mes_referencia: d.mesReferencia,
            valor: d.valor, status: d.status, data_vencimento: d.dataVencimento, arquivo_url: d.arquivoId,
          });
        }
      }
      if (dados.config) { salvarConfig(dados.config); }
      return true;
    } catch { return false; }
  }

  return {
    lancamentos, registrosDAS, config, carregando, adicionarLancamento, editarLancamento, removerLancamento,
    adicionarDAS, atualizarStatusDAS, removerDAS, existeLancamentoDAS, removerLancamentoDAS, salvarConfig, limparTudo,
    lancamentosDoMesAno, receitasDoMesAno, despesasDoMesAno,
    faturamentoAnual, percentualFaturamento, custoFixoMensal,
    exportarDados, importarDados, anoAtual,
  };
}

function useArquivos(userId) {
  const [arquivos, setArquivos] = useState({});

  const salvarArquivo = useCallback(async (file) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Salva no Supabase Storage
    const caminho = `${userId}/${id}_${file.name}`;
    const { error } = await supabase.storage.from("comprovantes").upload(caminho, file);
    if (error) {
      console.error("Erro upload:", error);
      // Fallback: salva localmente
      const url = URL.createObjectURL(file);
      setArquivos(prev => ({ ...prev, [caminho]: { id: caminho, nome: file.name, tipo: file.type, url } }));
      return caminho;
    }
    // Gera URL temporária assinada para visualização (bucket privado)
    const { data: signedData } = await supabase.storage.from("comprovantes").createSignedUrl(caminho, 3600);
    const fileUrl = signedData?.signedUrl || "";
    setArquivos(prev => ({ ...prev, [caminho]: { id: caminho, nome: file.name, tipo: file.type, url: fileUrl } }));
    return caminho;
  }, [userId]);

  const obterArquivo = useCallback(async (id) => {
    if (arquivos[id]) return arquivos[id];
    if (!id || !userId) return null;
    // Tenta buscar URL assinada do Supabase
    try {
      const { data } = await supabase.storage.from("comprovantes").createSignedUrl(id, 3600);
      if (data?.signedUrl) {
        const arq = { id, nome: id.split("/").pop(), tipo: "image/jpeg", url: data.signedUrl };
        setArquivos(prev => ({ ...prev, [id]: arq }));
        return arq;
      }
    } catch {}
    return null;
  }, [userId, arquivos]);

  return { salvarArquivo, obterArquivo };
}
// Hook para navegação entre meses
function useMesNavegacao() {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const anterior = () => { if (mes === 0) { setMes(11); setAno(a => a - 1); } else setMes(m => m - 1); };
  const proximo = () => {
    const h = new Date();
    if (ano > h.getFullYear() || (ano === h.getFullYear() && mes >= h.getMonth())) return;
    if (mes === 11) { setMes(0); setAno(a => a + 1); } else setMes(m => m + 1);
  };
  const isAtual = mes === hoje.getMonth() && ano === hoje.getFullYear();
  return { mes, ano, anterior, proximo, isAtual };
}

// ============================================================
// FORMATADORES
// ============================================================
function fmt(v) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v); }
function fmtData(iso) {
  const d = new Date(iso + "T12:00:00"); const h = new Date(); h.setHours(12,0,0,0);
  const o = new Date(h); o.setDate(o.getDate()-1);
  if (d.toDateString() === h.toDateString()) return "Hoje";
  if (d.toDateString() === o.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(d);
}
function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function nomeMes(ref) { const [a, m] = ref.split("-").map(Number); const s = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(a, m-1, 1)); return s.charAt(0).toUpperCase() + s.slice(1).replace(/ De /g, " de "); }

// Máscara de moeda: transforma input em "1.500,00"
function mascaraMoeda(valor) {
  let nums = valor.replace(/\D/g, "");
  if (!nums) return "";
  nums = nums.replace(/^0+/, "") || "0";
  while (nums.length < 3) nums = "0" + nums;
  const inteiro = nums.slice(0, -2);
  const decimal = nums.slice(-2);
  const comPonto = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${comPonto},${decimal}`;
}

// Parse de moeda mascarada para número
function parseMoedaMascarada(valor) {
  if (!valor) return 0;
  const limpo = valor.replace(/\./g, "").replace(",", ".");
  return parseFloat(limpo) || 0;
}

// Máscara de CNPJ: 00.000.000/0001-00
function mascaraCNPJ(valor) {
  const nums = valor.replace(/\D/g, "").slice(0, 14);
  return nums
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

// ============================================================
// ÍCONES
// ============================================================
const Ic = {
  Home: ({s=22,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  List: ({s=22,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Chart: ({s=22,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Gear: ({s=22,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Plus: ({s=22,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Back: ({s=22,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  Fwd: ({s=22,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Check: ({s=16,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Trash: ({s=18,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Eye: ({s=18,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Clip: ({s=16,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
  Send: ({s=18,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  X: ({s=18,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  File: ({s=16,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Cam: ({s=18,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Repeat: ({s=14,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>,
  Down: ({s=16,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Up: ({s=16,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Edit: ({s=14,c="currentColor"}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
};

// ============================================================
// NAVEGADOR DE MÊS (componente reutilizável)
// ============================================================
function NavMes({ nav }) {
  return (
    <div className="flex items-center justify-between mt-4 bg-white rounded-xl border border-gray-100 px-4 py-2.5 shadow-sm">
      <button onClick={nav.anterior} className="p-1 text-gray-500 active:text-emerald-600"><Ic.Back s={20}/></button>
      <p className="text-sm font-medium text-gray-800">{MESES_NOME[nav.mes]} {nav.ano}</p>
      <button onClick={nav.proximo} className={`p-1 ${nav.isAtual ? "text-gray-200" : "text-gray-500 active:text-emerald-600"}`} disabled={nav.isAtual}><Ic.Fwd s={20}/></button>
    </div>
  );
}

// ============================================================
// HOOK: IA (Gemini)
// ============================================================
function useIA() {
  const [carregando, setCarregando] = useState(false);

  async function chamarIA(tipo, mensagem, contexto, imagem) {
    setCarregando(true);
    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, mensagem, contexto, imagem }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data.resposta;
    } catch (err) {
      console.error("Erro IA:", err);
      return null;
    } finally {
      setCarregando(false);
    }
  }

  return { chamarIA, carregando };
}

// ============================================================
// ASSISTENTE MEI (Chatbot)
// ============================================================
function AssistenteChat({ fin, onFechar }) {
  const [mensagens, setMensagens] = useState([
    { de: "bot", texto: "Olá! Sou o assistente do Dinheiro Verde. Pode me perguntar qualquer dúvida sobre finanças, impostos, controle de gastos... 😊" }
  ]);
  const [input, setInput] = useState("");
  const ia = useIA();
  const listRef = useRef(null);

  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  const lancsMes = fin.lancamentosDoMesAno(mesAtual, anoAtual);
  const receitasMes = fin.receitasDoMesAno(mesAtual, anoAtual);
  const despesasMes = fin.despesasDoMesAno(mesAtual, anoAtual);
  const saldoMes = receitasMes - despesasMes;

  // Detalhamento por categoria
  const recPorCat = {};
  const despPorCat = {};
  lancsMes.forEach(l => {
    if (l.tipo === "receita") recPorCat[l.categoria] = (recPorCat[l.categoria] || 0) + l.valor;
    else despPorCat[l.categoria] = (despPorCat[l.categoria] || 0) + l.valor;
  });
  const detalheRec = Object.entries(recPorCat).map(([c, v]) => `${c}: ${fmt(v)}`).join(", ") || "Nenhuma";
  const detalheDesp = Object.entries(despPorCat).map(([c, v]) => `${c}: ${fmt(v)}`).join(", ") || "Nenhuma";

  // Últimos lançamentos
  const ultimos = [...lancsMes].sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5)
    .map(l => `${l.tipo === "receita" ? "+" : "-"}${fmt(l.valor)} ${l.categoria}${l.descricao ? ` (${l.descricao})` : ""} em ${l.data}`).join("; ");

  const contexto = `Nome: ${fin.config.nome || "Não informado"}.
Perfil: ${fin.config.regime || "MEI"}.
Mês atual: ${MESES_NOME[mesAtual]}/${anoAtual}.
Receitas deste mês: ${fmt(receitasMes)}. Detalhamento: ${detalheRec}.
Despesas deste mês: ${fmt(despesasMes)}. Detalhamento: ${detalheDesp}.
Saldo deste mês: ${fmt(saldoMes)}.${fin.config.regime !== "Pessoa Física" && fin.config.limiteAnual > 0 ? `
Faturamento anual acumulado: ${fmt(fin.faturamentoAnual)}.
Limite anual: ${fmt(fin.config.limiteAnual)}.
Percentual do limite usado: ${Math.round(fin.percentualFaturamento)}%.` : ""}
Custos fixos mensais: ${fmt(fin.custoFixoMensal)}.
Total de lançamentos: ${fin.lancamentos.length}.
Últimos lançamentos: ${ultimos || "Nenhum"}.`;

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [mensagens]);

  // Remove markdown simples da resposta
  function limparMarkdown(texto) {
    return texto.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
  }

  async function enviar() {
    const texto = input.trim();
    if (!texto || ia.carregando) return;
    setInput("");
    setMensagens(prev => [...prev, { de: "user", texto }]);

    const resposta = await ia.chamarIA("chat", texto, contexto);
    setMensagens(prev => [...prev, { de: "bot", texto: resposta ? limparMarkdown(resposta) : "Desculpe, não consegui processar. Tente novamente." }]);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-gray-50 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="bg-emerald-600 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">🤖</span>
          <div>
            <p className="font-semibold text-sm">Assistente Financeiro</p>
            <p className="text-emerald-200 text-xs">Tire suas dúvidas</p>
          </div>
        </div>
        <button onClick={onFechar} className="text-emerald-200 active:text-white"><Ic.X s={22}/></button>
      </div>

      {/* Mensagens */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {mensagens.map((msg, i) => (
          <div key={i} className={`flex ${msg.de === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.de === "user" ? "bg-emerald-600 text-white rounded-br-md" : "bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm"
            }`}>
              {msg.texto.split("\n").map((linha, j) => <p key={j} className={j > 0 ? "mt-1.5" : ""}>{linha}</p>)}
            </div>
          </div>
        ))}
        {ia.carregando && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay:"0ms"}}/>
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay:"150ms"}}/>
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{animationDelay:"300ms"}}/>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3 flex gap-2">
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") enviar(); }}
          placeholder="Digite sua dúvida..."
          className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-emerald-400"/>
        <button onClick={enviar} disabled={!input.trim() || ia.carregando}
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${input.trim() && !ia.carregando ? "bg-emerald-600 active:bg-emerald-700" : "bg-gray-200"}`}>
          <Ic.Send s={18} c={input.trim() && !ia.carregando ? "white" : "#9ca3af"}/>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// INPUT POR TEXTO NATURAL (IA)
// ============================================================
function InputTextoNatural({ onLancamentoCriado }) {
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const ia = useIA();

  async function processar() {
    if (!texto.trim() || ia.carregando) return;
    setErro("");
    setResultado(null);
    const resposta = await ia.chamarIA("lancamento", texto.trim());
    if (!resposta) {
      setErro("Não consegui processar. Verifique sua conexão.");
      return;
    }
    try {
      const limpo = resposta.replace(/```json|```/g, "").replace(/[\r\n]/g, "").trim();
      const match = limpo.match(/\{[\s\S]*\}/);
      if (match) {
        const dados = JSON.parse(match[0]);
        if (dados.tipo && dados.valor) {
          setResultado(dados);
        } else {
          setErro("Não entendi. Tente algo como: 'recebi 3 mil de consultoria'");
        }
      } else {
        setErro("Não entendi. Tente ser mais específico.");
      }
    } catch (e) {
      console.error("Erro ao parsear:", e, resposta);
      setErro("Erro ao interpretar. Tente reformular.");
    }
  }

  function confirmar() {
    if (resultado) {
      onLancamentoCriado(resultado);
      setTexto("");
      setResultado(null);
    }
  }

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🤖</span>
        <p className="text-sm font-medium text-emerald-800">Lançamento rápido por texto</p>
      </div>
      <p className="text-xs text-emerald-600 mb-3">Descreva o lançamento em linguagem natural:</p>

      <div className="flex gap-2">
        <input type="text" value={texto} onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") processar(); }}
          placeholder="Ex: recebi 3 mil de consultoria hoje"
          className="flex-1 border border-emerald-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-emerald-400"/>
        <button onClick={processar} disabled={!texto.trim() || ia.carregando}
          className={`px-4 rounded-xl text-sm font-medium transition-colors ${!texto.trim() || ia.carregando ? "bg-gray-200 text-gray-400" : "bg-emerald-600 text-white active:bg-emerald-700"}`}>
          {ia.carregando ? "..." : "Criar"}
        </button>
      </div>

      {erro && <p className="mt-2 text-xs text-red-500 bg-red-50 rounded-lg p-2 text-center">{erro}</p>}

      {resultado && (
        <div className="mt-3 bg-white border border-emerald-200 rounded-xl p-3">
          <p className="text-xs text-gray-500 mb-2">A IA entendeu:</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Tipo</span>
              <span className={`font-medium ${resultado.tipo === "receita" ? "text-emerald-600" : "text-red-500"}`}>
                {resultado.tipo === "receita" ? "↑ Receita" : "↓ Despesa"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Valor</span>
              <span className="font-medium text-gray-800">{fmt(resultado.valor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Categoria</span>
              <span className="text-gray-800">{resultado.categoria}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Data</span>
              <span className="text-gray-800">{resultado.data}</span>
            </div>
            {resultado.descricao && <div className="flex justify-between">
              <span className="text-gray-500">Descrição</span>
              <span className="text-gray-800">{resultado.descricao}</span>
            </div>}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={confirmar}
              className="flex-1 bg-emerald-600 text-white py-2.5 rounded-lg text-sm font-medium active:bg-emerald-700">
              ✓ Confirmar
            </button>
            <button onClick={() => setResultado(null)}
              className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-lg text-sm font-medium">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BANNER INSTALAR APP
// ============================================================
function BannerInstalar() {
  const [mostrar, setMostrar] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [passoIOS, setPassoIOS] = useState(false);

  useEffect(() => {
    // Não mostra se já está instalado (standalone)
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (window.navigator.standalone === true) return;

    // Verifica se já foi dispensado nos últimos 7 dias
    const dispensado = localStorage.getItem("pwa_banner_dispensado");
    if (dispensado && Date.now() - Number(dispensado) < 7 * 24 * 60 * 60 * 1000) return;

    // Detecta iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    if (ios) {
      // iOS não tem beforeinstallprompt, mostra instruções manuais
      setTimeout(() => setMostrar(true), 3000);
    } else {
      // Android/Desktop: escuta o evento nativo
      const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setMostrar(true); };
      window.addEventListener("beforeinstallprompt", handler);
      // Se o evento não disparar em 5s, mostra instruções genéricas
      const timer = setTimeout(() => setMostrar(true), 5000);
      return () => { window.removeEventListener("beforeinstallprompt", handler); clearTimeout(timer); };
    }
  }, []);

  async function instalar() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === "accepted") { dispensar(); }
    } else if (isIOS) {
      setPassoIOS(true);
    }
  }

  // Esconde quando o app é instalado
  useEffect(() => {
    const handler = () => { dispensar(); };
    window.addEventListener("appinstalled", handler);
    return () => window.removeEventListener("appinstalled", handler);
  }, []);

  function dispensar() {
    localStorage.setItem("pwa_banner_dispensado", String(Date.now()));
    setMostrar(false);
  }

  if (!mostrar) return null;

  if (passoIOS) {
    return (
      <div className="fixed inset-0 bg-black/60 z-[80] flex items-end justify-center" onClick={() => setPassoIOS(false)}>
        <div className="bg-white rounded-t-3xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-bold text-gray-900 text-center">Como instalar no iPhone</h3>
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-4">
              <span className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-sm font-bold text-emerald-600 flex-shrink-0">1</span>
              <p className="text-sm text-gray-700">Toque no botão <strong>Compartilhar</strong> (ícone ↑) na barra do Safari</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-sm font-bold text-emerald-600 flex-shrink-0">2</span>
              <p className="text-sm text-gray-700">Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong></p>
            </div>
            <div className="flex items-center gap-4">
              <span className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-sm font-bold text-emerald-600 flex-shrink-0">3</span>
              <p className="text-sm text-gray-700">Toque em <strong>"Adicionar"</strong>. Pronto! O ícone aparece na tela.</p>
            </div>
          </div>
          <button onClick={() => setPassoIOS(false)}
            className="mt-6 w-full bg-emerald-600 text-white py-3 rounded-xl font-medium text-sm">Entendi</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 left-3 right-3 max-w-md mx-auto bg-white border border-emerald-200 rounded-2xl p-4 shadow-lg z-50 animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-xl font-bold text-white">$</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">Instalar o app</p>
          <p className="text-xs text-gray-500 mt-0.5">Adicione à tela inicial para acessar mais rápido</p>
        </div>
        <button onClick={dispensar} className="text-gray-300 p-1"><Ic.X s={16}/></button>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={instalar}
          className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-medium active:bg-emerald-700">
          {isIOS ? "Ver como instalar" : "Instalar"}
        </button>
        <button onClick={dispensar}
          className="flex-1 bg-gray-100 text-gray-500 py-2.5 rounded-xl text-xs font-medium">
          Agora não
        </button>
      </div>
    </div>
  );
}

// ============================================================
// BOTTOM NAV
// ============================================================
function BottomNav({ pagina, onNav }) {
  const itens = [
    { id: "dashboard", label: "Início", icon: Ic.Home },
    { id: "lancamentos", label: "Lançamentos", icon: Ic.List },
    { id: "relatorios", label: "Relatórios", icon: Ic.Chart },
    { id: "config", label: "Ajustes", icon: Ic.Gear },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-2 z-50">
      <div className="flex justify-around items-center pt-2">
        {itens.map(it => {
          const ativo = pagina === it.id;
          return (
            <button key={it.id} onClick={() => onNav(it.id)}
              className={`flex flex-col items-center min-w-[64px] min-h-[48px] transition-colors ${ativo ? "text-emerald-600" : "text-gray-400"}`}>
              <it.icon s={21} c={ativo ? "#059669" : "#9ca3af"} />
              <span className={`text-[11px] mt-1 ${ativo ? "font-semibold" : ""}`}>{it.label}</span>
              {ativo && <span className="w-1 h-1 rounded-full bg-emerald-600 mt-0.5"/>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ============================================================
// BOTÃO ANEXO (câmera + arquivo)
// ============================================================
function BotaoAnexo({ arquivo, onAnexar, onRemover }) {
  const inputFileRef = useRef(null);
  const inputCamRef = useRef(null);
  if (arquivo) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <Ic.File s={16} c="#059669"/>
        <span className="text-sm text-emerald-700 flex-1 truncate">{arquivo.nome}</span>
        <button onClick={onRemover} className="text-emerald-400 active:text-red-500"><Ic.X s={16}/></button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <input ref={inputCamRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onAnexar(e.target.files[0]); }}/>
      <input ref={inputFileRef} type="file" accept="application/pdf,image/*" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onAnexar(e.target.files[0]); }}/>
      <div className="flex gap-2">
        <button onClick={() => inputCamRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 bg-white border border-dashed border-gray-300 rounded-xl px-3 py-3 text-sm text-gray-500 active:border-emerald-400 active:text-emerald-600 transition-colors">
          <Ic.Cam s={16}/> Tirar foto
        </button>
        <button onClick={() => inputFileRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 bg-white border border-dashed border-gray-300 rounded-xl px-3 py-3 text-sm text-gray-500 active:border-emerald-400 active:text-emerald-600 transition-colors">
          <Ic.Clip s={16}/> Arquivo
        </button>
      </div>
    </div>
  );
}

// ============================================================
// ASSISTENTE FINANCEIRO CONTEXTUAL
// ============================================================
function AssistenteFinanceiro({ fin, nav, receitas, despesas, saldo }) {
  const mensagens = [];
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();
  const mesesPassados = mesAtual + 1;
  const mesesRestantes = Math.max(1, 12 - mesAtual);
  const saldoLimite = fin.config.limiteAnual - fin.faturamentoAnual;
  const isPF = fin.config.regime === "Pessoa Física";
  const temLimite = !isPF && fin.config.limiteAnual > 0;

  // 1. Projeção de faturamento anual (só MEI/Simples)
  if (temLimite && fin.faturamentoAnual > 0 && mesesPassados >= 2) {
    const mediaMensal = fin.faturamentoAnual / mesesPassados;
    const projecaoAnual = mediaMensal * 12;
    if (projecaoAnual > fin.config.limiteAnual) {
      const mesEstouro = Math.ceil(fin.config.limiteAnual / mediaMensal);
      const nomeMesEstouro = MESES_NOME[Math.min(mesEstouro - 1, 11)];
      mensagens.push({
        tipo: "vermelho",
        icone: "🚨",
        titulo: "Risco de ultrapassar o limite",
        texto: `Seu faturamento médio é ${fmt(mediaMensal)}/mês. Nesse ritmo, você ultrapassa o limite em ${nomeMesEstouro}.`,
      });
    } else if (projecaoAnual > fin.config.limiteAnual * 0.85) {
      mensagens.push({
        tipo: "amarelo",
        icone: "⚡",
        titulo: "Fique atento ao limite",
        texto: `Projeção anual: ${fmt(projecaoAnual)}. Está chegando perto dos ${fmt(fin.config.limiteAnual)}. Pode faturar até ${fmt(saldoLimite / mesesRestantes)}/mês até dezembro.`,
      });
    } else {
      mensagens.push({
        tipo: "verde",
        icone: "✅",
        titulo: "Faturamento tranquilo",
        texto: `Projeção anual: ${fmt(projecaoAnual)}. Você está dentro do limite com folga.`,
      });
    }
  }

  // 2. Comparativo com mês anterior
  const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
  const anoMesAnterior = mesAtual === 0 ? anoAtual - 1 : anoAtual;
  const receitasAnterior = fin.receitasDoMesAno(mesAnterior, anoMesAnterior);
  if (receitasAnterior > 0 && receitas > 0) {
    const variacao = ((receitas - receitasAnterior) / receitasAnterior) * 100;
    if (Math.abs(variacao) >= 10) {
      mensagens.push({
        tipo: variacao > 0 ? "verde" : "amarelo",
        icone: variacao > 0 ? "📈" : "📉",
        titulo: variacao > 0 ? "Receita crescendo" : "Receita caiu",
        texto: variacao > 0
          ? `Suas receitas subiram ${Math.round(variacao)}% em relação a ${MESES_NOME[mesAnterior].toLowerCase()}.`
          : `Suas receitas caíram ${Math.round(Math.abs(variacao))}% em relação a ${MESES_NOME[mesAnterior].toLowerCase()}.`,
      });
    }
  }

  // 3. Análise de custos fixos vs receita
  if (fin.custoFixoMensal > 0 && receitas > 0) {
    const percentualFixo = (fin.custoFixoMensal / receitas) * 100;
    if (percentualFixo > 70) {
      mensagens.push({
        tipo: "vermelho",
        icone: "💸",
        titulo: "Custos fixos altos",
        texto: `Seus custos fixos (${fmt(fin.custoFixoMensal)}) consomem ${Math.round(percentualFixo)}% da receita. Sobra pouco para imprevistos.`,
      });
    } else if (percentualFixo > 50) {
      mensagens.push({
        tipo: "amarelo",
        icone: "📊",
        titulo: "Atenção aos custos",
        texto: `Custos fixos representam ${Math.round(percentualFixo)}% da receita. O ideal é manter abaixo de 50%.`,
      });
    }
  }

  // 4. DAS com contagem regressiva (só MEI/Simples)
  if (!isPF) {
    const diaDAS = fin.config.diaDAS || 20;
    const mesAtualStr = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}`;
    const dasDoMes = fin.registrosDAS.find(d => d.mesReferencia === mesAtualStr);
    if (!dasDoMes || dasDoMes.status !== "pago") {
      const diasParaDAS = diaDAS - diaHoje;
      if (diasParaDAS > 0 && diasParaDAS <= 5) {
        mensagens.push({
          tipo: "amarelo",
          icone: "⏰",
          titulo: `DAS vence em ${diasParaDAS} dia${diasParaDAS > 1 ? "s" : ""}`,
          texto: `O boleto do DAS-MEI vence dia ${diaDAS}. Pague para manter seu INSS em dia.`,
        });
      } else if (diasParaDAS <= 0 && diasParaDAS >= -10) {
        mensagens.push({
          tipo: "vermelho",
          icone: "🚨",
          titulo: "DAS vencido!",
          texto: `O DAS venceu há ${Math.abs(diasParaDAS)} dia${Math.abs(diasParaDAS) > 1 ? "s" : ""}. Pague o quanto antes para evitar multa e juros.`,
        });
      }
    }
  }

  // 5. Saldo negativo
  if (saldo < 0 && receitas > 0) {
    mensagens.push({
      tipo: "vermelho",
      icone: "🔴",
      titulo: "Mês no vermelho",
      texto: `Suas despesas superaram as receitas em ${fmt(Math.abs(saldo))}. Revise seus gastos.`,
    });
  }

  // 6. Incentivo quando começa a usar
  if (fin.lancamentos.length > 0 && fin.lancamentos.length <= 5) {
    mensagens.push({
      tipo: "azul",
      icone: "💡",
      titulo: "Dica",
      texto: "Registre todas as receitas para o termômetro calcular seu limite anual corretamente. Quanto mais completo, melhor a projeção.",
    });
  }

  // Limita a 3 mensagens mais relevantes (prioridade: vermelho > amarelo > verde > azul)
  const prioridade = { vermelho: 0, amarelo: 1, verde: 2, azul: 3 };
  const exibir = mensagens
    .sort((a, b) => prioridade[a.tipo] - prioridade[b.tipo])
    .slice(0, 3);

  if (exibir.length === 0) return null;

  const cores = {
    vermelho: "bg-red-50 border-red-200",
    amarelo: "bg-amber-50 border-amber-200",
    verde: "bg-emerald-50 border-emerald-200",
    azul: "bg-blue-50 border-blue-200",
  };
  const coresTitulo = {
    vermelho: "text-red-800",
    amarelo: "text-amber-800",
    verde: "text-emerald-800",
    azul: "text-blue-800",
  };
  const coresTexto = {
    vermelho: "text-red-600",
    amarelo: "text-amber-600",
    verde: "text-emerald-600",
    azul: "text-blue-600",
  };

  return (
    <div className="mt-4 space-y-3">
      {exibir.map((msg, i) => (
        <div key={i} className={`${cores[msg.tipo]} border rounded-2xl p-4`}>
          <div className="flex items-start gap-3">
            <span className="text-lg leading-none mt-0.5">{msg.icone}</span>
            <div>
              <p className={`text-sm font-medium ${coresTitulo[msg.tipo]}`}>{msg.titulo}</p>
              <p className={`text-xs ${coresTexto[msg.tipo]} mt-1 leading-relaxed`}>{msg.texto}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================

// ============================================================
// BANCOS BRASILEIROS (deep links)
// ============================================================
const BANCOS = [
  { id: "nubank", nome: "Nubank", cor: "#820AD1", link: "https://nubank.com.br/pagar" },
  { id: "inter", nome: "Inter", cor: "#FF7A00", link: "https://internetbanking.bancointer.com.br" },
  { id: "itau", nome: "Itaú", cor: "#003399", link: "https://www.itau.com.br" },
  { id: "bb", nome: "Banco do Brasil", cor: "#FFFF00", txtCor: "#003366", link: "https://www.bb.com.br" },
  { id: "caixa", nome: "Caixa", cor: "#005CA9", link: "https://www.caixa.gov.br" },
  { id: "bradesco", nome: "Bradesco", cor: "#CC092F", link: "https://banco.bradesco" },
  { id: "santander", nome: "Santander", cor: "#EC0000", link: "https://www.santander.com.br" },
  { id: "mercadopago", nome: "Mercado Pago", cor: "#009EE3", link: "https://www.mercadopago.com.br" },
  { id: "c6", nome: "C6 Bank", cor: "#242424", link: "https://www.c6bank.com.br" },
  { id: "picpay", nome: "PicPay", cor: "#21C25E", link: "https://picpay.com" },
];

// ============================================================
// WIZARD DE PAGAMENTO DAS
// ============================================================
function WizardPagarDAS({ fin, onVoltar, onConcluir }) {
  const [passo, setPasso] = useState(0);
  const [codigoBarras, setCodigoBarras] = useState("");
  const [scanning, setScanning] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [bancoSelecionado, setBancoSelecionado] = useState(() => fin.config.bancoPreferido || "");
  const scannerRef = useRef(null);
  const scannerDivId = "scanner-das";

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => { if (scannerRef.current) { try { scannerRef.current.stop(); } catch {} } };
  }, []);

  const hoje = new Date();
  const mesRef = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const dasDoMes = fin.registrosDAS.find(d => d.mesReferencia === mesRef);

  // Formata código de barras em blocos
  function formatarCodigo(cod) {
    const nums = cod.replace(/\D/g, "").slice(0, 47);
    if (nums.length <= 12) return nums;
    return nums.replace(/(.{5})(.{5})(.{5})(.{6})(.{5})(.{6})(.{1})(.{14})/, "$1.$2 $3.$4 $5.$6 $7 $8");
  }

  async function iniciarScanner() {
    setScanning(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      // Aguarda o DOM renderizar o div
      await new Promise(r => setTimeout(r, 300));
      const scanner = new Html5Qrcode(scannerDivId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 100 } },
        (decodedText) => {
          const nums = decodedText.replace(/\D/g, "");
          if (nums.length >= 44) {
            setCodigoBarras(nums.slice(0, 47));
            pararScanner();
          }
        },
        () => {} // ignore errors
      );
    } catch (err) {
      console.error("Erro ao iniciar câmera:", err);
      setScanning(false);
    }
  }

  async function pararScanner() {
    setScanning(false);
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
  }

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(codigoBarras.replace(/\D/g, ""));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = codigoBarras.replace(/\D/g, "");
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    }
  }

  function abrirBanco() {
    const banco = BANCOS.find(b => b.id === bancoSelecionado);
    if (banco) window.open(banco.link, "_blank");
  }

  async function confirmarPagamento() {
    // Registra DAS como pago
    const valor = dasDoMes?.valor || 75.90;
    if (!dasDoMes) {
      await fin.adicionarDAS({ mesReferencia: mesRef, valor, status: "pago", dataVencimento: `${mesRef}-20`, arquivoId: null });
    } else {
      await fin.atualizarStatusDAS(dasDoMes.id, "pago");
    }
    // Cria lançamento de despesa se não existir
    if (!fin.existeLancamentoDAS(mesRef)) {
      await fin.adicionarLancamento({ tipo: "despesa", valor, categoria: "DAS-MEI", data: `${mesRef}-20`, descricao: `DAS ref. ${mesRef}`, arquivoId: null, recorrente: false });
    }
    // Salva banco preferido
    if (bancoSelecionado) fin.salvarConfig({ bancoPreferido: bancoSelecionado });
    onConcluir();
  }

  const passos = [
    // Passo 0: Início
    () => (
      <div className="px-6 pt-6 pb-10">
        <div className="text-center mt-8">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📋</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Vamos pagar seu DAS</h2>
          <p className="text-sm text-gray-500 mt-2">Mês de referência: <span className="font-semibold">{nomeMes(mesRef)}</span></p>
          {dasDoMes && <p className="text-lg font-bold text-emerald-600 mt-2">{fmt(dasDoMes.valor)}</p>}
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-sm font-medium text-blue-800">Você tem o boleto do DAS?</p>
          <p className="text-xs text-blue-600 mt-1">Pode ser impresso, em PDF, ou na tela do celular/computador.</p>
        </div>

        <div className="mt-6 space-y-3">
          <button onClick={() => setPasso(1)}
            className="w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold text-base active:bg-emerald-700">
            Sim, tenho o boleto
          </button>
          <a href="https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao"
            target="_blank" rel="noopener noreferrer"
            className="w-full bg-white border border-gray-200 text-gray-700 py-4 rounded-xl font-medium text-base text-center block active:bg-gray-50">
            Não tenho — Abrir PGMEI para gerar ↗
          </a>
        </div>
      </div>
    ),

    // Passo 1: Escanear ou digitar código
    () => (
      <div className="px-6 pt-6 pb-10">
        <p className="text-xs text-emerald-600 font-medium">Passo 1 de 3</p>
        <h2 className="text-xl font-bold text-gray-900 mt-1">Código de barras do boleto</h2>
        <p className="text-sm text-gray-500 mt-2">Escaneie com a câmera ou digite os 47 números que ficam na parte de baixo do boleto.</p>

        {scanning ? (
          <div className="mt-4">
            <div id={scannerDivId} className="rounded-xl overflow-hidden"/>
            <button onClick={pararScanner}
              className="mt-3 w-full bg-red-100 text-red-600 py-3 rounded-xl text-sm font-medium active:bg-red-200">
              Cancelar câmera
            </button>
          </div>
        ) : (
          <button onClick={iniciarScanner}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-emerald-50 border-2 border-emerald-200 text-emerald-700 py-4 rounded-xl font-medium text-base active:bg-emerald-100">
            <Ic.Cam s={20}/> Escanear com a câmera
          </button>
        )}

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200"/><span className="text-xs text-gray-400">ou digite</span><div className="flex-1 h-px bg-gray-200"/>
        </div>

        <input type="text" inputMode="numeric" value={formatarCodigo(codigoBarras)}
          onChange={e => setCodigoBarras(e.target.value.replace(/\D/g, "").slice(0, 47))}
          className="mt-4 w-full border border-gray-200 rounded-xl px-4 py-4 text-center text-base tracking-wider bg-white outline-none focus:border-emerald-400 font-mono"
          placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"/>

        {codigoBarras.replace(/\D/g, "").length === 47 && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
            <Ic.Check s={16} c="#059669"/>
            <p className="text-sm text-emerald-700">47 dígitos — código completo!</p>
          </div>
        )}

        <button onClick={() => setPasso(2)} disabled={codigoBarras.replace(/\D/g, "").length < 44}
          className={`mt-6 w-full py-4 rounded-xl font-semibold text-base transition-colors ${codigoBarras.replace(/\D/g, "").length >= 44 ? "bg-emerald-600 text-white active:bg-emerald-700" : "bg-gray-200 text-gray-400"}`}>
          Continuar
        </button>
      </div>
    ),

    // Passo 2: Copiar e abrir banco
    () => (
      <div className="px-6 pt-6 pb-10">
        <p className="text-xs text-emerald-600 font-medium">Passo 2 de 3</p>
        <h2 className="text-xl font-bold text-gray-900 mt-1">Copie e pague no seu banco</h2>

        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-2">Código de barras:</p>
          <p className="text-sm font-mono text-gray-800 break-all leading-relaxed">{formatarCodigo(codigoBarras)}</p>
        </div>

        <button onClick={copiarCodigo}
          className={`mt-3 w-full py-4 rounded-xl font-semibold text-base transition-all ${copiado ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-400" : "bg-emerald-600 text-white active:bg-emerald-700"}`}>
          {copiado ? "✓ Código copiado!" : "Copiar código"}
        </button>

        <p className="text-sm text-gray-600 font-medium mt-6 mb-3">Qual seu banco?</p>
        <div className="grid grid-cols-3 gap-2">
          {BANCOS.map(b => (
            <button key={b.id} onClick={() => setBancoSelecionado(b.id)}
              className={`py-3 px-2 rounded-xl text-xs font-medium text-center transition-all ${bancoSelecionado === b.id ? "ring-2 ring-emerald-500 bg-emerald-50" : "bg-white border border-gray-200"}`}>
              <div className="w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center text-white text-[10px] font-bold"
                style={{ background: b.cor, color: b.txtCor || "white" }}>
                {b.nome.slice(0, 2)}
              </div>
              {b.nome}
            </button>
          ))}
        </div>

        {bancoSelecionado && (
          <button onClick={() => { copiarCodigo(); setTimeout(abrirBanco, 500); }}
            className="mt-4 w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-base active:bg-blue-700 flex items-center justify-center gap-2">
            Copiar e abrir {BANCOS.find(b => b.id === bancoSelecionado)?.nome} ↗
          </button>
        )}

        <button onClick={() => setPasso(3)}
          className="mt-3 w-full bg-white border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-medium active:bg-gray-50">
          Já paguei, continuar →
        </button>
      </div>
    ),

    // Passo 3: Confirmar pagamento
    () => (
      <div className="px-6 pt-6 pb-10">
        <p className="text-xs text-emerald-600 font-medium">Passo 3 de 3</p>
        <h2 className="text-xl font-bold text-gray-900 mt-1">Confirme o pagamento</h2>

        <div className="mt-6 text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">💸</span>
          </div>
          <p className="text-sm text-gray-600">Você pagou o DAS de <span className="font-semibold">{nomeMes(mesRef)}</span>?</p>
        </div>

        <div className="mt-6 space-y-3">
          <button onClick={confirmarPagamento}
            className="w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold text-base active:bg-emerald-700">
            ✓ Sim, paguei!
          </button>
          <button onClick={onVoltar}
            className="w-full bg-white border border-gray-200 text-gray-500 py-3 rounded-xl text-sm font-medium active:bg-gray-50">
            Ainda não paguei
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">O app vai registrar o DAS como pago e criar o lançamento de despesa automaticamente.</p>
      </div>
    ),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <button onClick={() => { pararScanner(); onVoltar(); }} className="flex items-center gap-1 text-gray-500 text-sm px-6 pt-4">
        <Ic.Back s={18}/> Voltar
      </button>
      {passos[passo]()}
    </div>
  );
}

// ============================================================
// PAYWALL PREMIUM
// ============================================================
// ============================================================
// PIX PAYLOAD GENERATOR
// ============================================================
function gerarPixPayload(chave, nome, cidade, valor) {
  function f(id, val) { return id + val.length.toString().padStart(2, "0") + val; }
  let p = "";
  p += f("00", "01");
  p += f("26", f("00", "br.gov.bcb.pix") + f("01", chave));
  p += f("52", "0000");
  p += f("53", "986");
  if (valor) p += f("54", valor.toFixed(2));
  p += f("58", "BR");
  p += f("59", nome.substring(0, 25));
  p += f("60", cidade.substring(0, 15));
  p += f("62", f("05", "***"));
  p += "6304";
  let crc = 0xFFFF;
  for (let i = 0; i < p.length; i++) {
    crc ^= p.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
  }
  return p + (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
}

// ============================================================
// CHECKOUT PIX
// ============================================================
function CheckoutPIX({ plano, onVoltar, onConfirmar, userEmail }) {
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const valor = plano === "anual" ? 119.90 : 14.90;
  const pixPayload = gerarPixPayload("65076198000132", "JCM Consultoria", "Americana", valor);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixPayload)}`;

  // IMPORTANTE: substitua pelo seu número real de WhatsApp
  const WHATSAPP_ADMIN = "5519999999999";

  function notificarAdmin() {
    const planoNome = plano === "anual" ? "Anual (R$ 119,90)" : "Mensal (R$ 14,90)";
    const msg = `🔔 *Nova assinatura Premium*\n\n`
      + `📧 E-mail: ${userEmail}\n`
      + `📋 Plano: ${planoNome}\n`
      + `📅 Data: ${new Date().toLocaleDateString("pt-BR")} ${new Date().toLocaleTimeString("pt-BR")}\n\n`
      + `Ativar no Supabase → config_mei → premium = true`;
    window.open(`https://wa.me/${WHATSAPP_ADMIN}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  // Também registra na tabela para controle
  async function registrarAssinatura() {
    try {
      await supabase.from("config_mei").update({
        premium_ate: null, // será preenchido pelo admin ao ativar
        updated_at: new Date().toISOString(),
      }).eq("user_id", (await supabase.auth.getUser()).data.user?.id);
    } catch {}
  }

  async function copiarPix() {
    try { await navigator.clipboard.writeText(pixPayload); } catch {
      const ta = document.createElement("textarea"); ta.value = pixPayload;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopiado(true); setTimeout(() => setCopiado(false), 3000);
  }

  return (
    <div className="min-h-screen bg-gray-50 px-5 pt-4 pb-10">
      <button onClick={onVoltar} className="flex items-center gap-1 text-gray-500 text-sm mb-4"><Ic.Back s={18}/> Voltar</button>
      <div className="text-center mb-5">
        <p className="text-sm text-gray-500">Plano Premium {plano === "anual" ? "Anual" : "Mensal"}</p>
        <p className="text-3xl font-bold text-emerald-700 mt-1">{fmt(valor)}</p>
        {plano === "anual" && <p className="text-xs text-gray-400 mt-1">R$ 9,99/mês — economia de 33%</p>}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm text-center">
        <p className="text-sm font-medium text-gray-700 mb-4">Escaneie o QR Code no app do banco</p>
        <img src={qrUrl} alt="QR Code PIX" className="w-44 h-44 mx-auto rounded-lg border border-gray-100"
          onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}/>
        <div className="w-44 h-44 mx-auto rounded-lg border border-gray-200 bg-gray-50 items-center justify-center text-center" style={{display:"none"}}>
          <div><p className="text-sm text-gray-500 font-medium">QR indisponível</p><p className="text-xs text-gray-400 mt-1">Use a chave PIX abaixo</p></div>
        </div>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-gray-200"/><span className="text-xs text-gray-400">ou copie o código</span><div className="flex-1 h-px bg-gray-200"/>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-left mb-3">
          <p className="text-[10px] text-gray-400">Chave PIX (CNPJ)</p>
          <p className="text-sm text-gray-800 font-mono mt-0.5">65.076.198/0001-32</p>
        </div>

        <button onClick={copiarPix}
          className={`w-full py-3 rounded-xl text-sm font-medium transition-all ${copiado ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-400" : "bg-emerald-50 text-emerald-600 border border-emerald-200 active:bg-emerald-100"}`}>
          {copiado ? "✓ Código PIX copiado!" : "Copiar código PIX Copia e Cola"}
        </button>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 mt-4 shadow-sm">
        <p className="text-xs text-gray-400 mb-2">Dados do recebedor</p>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Empresa</span><span className="text-gray-800 font-medium">JCM Consultoria</span></div>
          <div className="flex justify-between"><span className="text-gray-500">CNPJ</span><span className="text-gray-800">65.076.198/0001-32</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Valor</span><span className="text-emerald-600 font-medium">{fmt(valor)}</span></div>
        </div>
      </div>

      {!confirmando ? (
        <button onClick={() => { setConfirmando(true); notificarAdmin(); registrarAssinatura(); }}
          className="mt-4 w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold text-base active:bg-emerald-700">
          Já paguei
        </button>
      ) : (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Ic.Check s={24} c="#059669"/>
          </div>
          <p className="text-sm font-medium text-emerald-800">Pagamento informado!</p>
          <p className="text-xs text-emerald-600 mt-2 leading-relaxed">Seu Premium será ativado em até 2 horas após a confirmação do pagamento. Você receberá uma notificação quando estiver ativo.</p>
          <button onClick={onConfirmar} className="mt-4 w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-medium active:bg-emerald-700">Voltar ao app</button>
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 mt-4">
        <Ic.Check s={12} c="#9ca3af"/>
        <p className="text-[11px] text-gray-400">Pagamento seguro via PIX • Cancelamento a qualquer momento</p>
      </div>
    </div>
  );
}

// ============================================================
// MODAL PREMIUM
// ============================================================
function ModalPremium({ onFechar, onAssinar, regime }) {
  const [plano, setPlano] = useState("mensal");
  const isPF = regime === "Pessoa Física";

  const beneficios = [
    { icone: "📦", texto: isPF ? "Relatório mensal em PDF" : "Pacote do contador em PDF com comprovantes" },
    ...(!isPF ? [{ icone: "📋", texto: "Assistente de pagamento do DAS com scanner" }] : []),
    { icone: "🤖", texto: "Assistente financeiro com IA" },
    { icone: "💬", texto: "Lançamento rápido por texto com IA" },
    { icone: "📷", texto: "Anexar fotos e documentos aos lançamentos" },
    { icone: "🏷️", texto: "Categorias personalizáveis" },
    { icone: "📊", texto: "Relatórios avançados e evolução mensal" },
    { icone: "📤", texto: "Compartilhar resumo via WhatsApp" },
    { icone: "💾", texto: "Backup e exportação de dados" },
    ...(!isPF ? [{ icone: "📈", texto: "Projeção de faturamento até dezembro" }] : []),
  ];

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center" onClick={onFechar}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-600 rounded-t-3xl sm:rounded-t-2xl p-6 text-white text-center">
          <span className="text-3xl">⭐</span>
          <h2 className="text-xl font-bold mt-2">Dinheiro Verde Premium</h2>
          <p className="text-emerald-100 text-sm mt-1">{isPF ? "Controle total das suas finanças" : "Deixe o app cuidar do seu negócio"}</p>
        </div>
        <div className="p-6">
          <div className="space-y-3">
            {beneficios.map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-gray-700">
                <span className="text-lg">{item.icone}</span><span>{item.texto}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex gap-3">
            <button onClick={() => setPlano("mensal")}
              className={`flex-1 rounded-2xl p-4 text-center transition-all ${plano === "mensal" ? "bg-emerald-50 border-2 border-emerald-500" : "bg-gray-50 border border-gray-200"}`}>
              <p className="text-[10px] text-emerald-600 font-medium">MENSAL</p>
              <p className="text-2xl font-bold text-emerald-800 mt-1">R$ 14,90</p>
              <p className="text-[11px] text-gray-400">/mês</p>
            </button>
            <button onClick={() => setPlano("anual")}
              className={`flex-1 rounded-2xl p-4 text-center transition-all relative ${plano === "anual" ? "bg-emerald-50 border-2 border-emerald-500" : "bg-gray-50 border border-gray-200"}`}>
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] px-2.5 py-0.5 rounded-full font-medium">-33%</span>
              <p className="text-[10px] text-emerald-600 font-medium">ANUAL</p>
              <p className="text-2xl font-bold text-emerald-800 mt-1">R$ 119,90</p>
              <p className="text-[11px] text-gray-400">R$ 9,99/mês</p>
            </button>
          </div>

          <button onClick={() => onAssinar(plano)}
            className="mt-4 w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold text-base active:bg-emerald-700">
            Assinar Premium
          </button>

          <div className="flex items-center justify-center gap-1.5 mt-3">
            <Ic.Check s={12} c="#9ca3af"/>
            <p className="text-[11px] text-gray-400">Pagamento seguro via PIX • CNPJ 65.076.198/0001-32</p>
          </div>

          <button onClick={onFechar} className="mt-2 w-full text-sm text-gray-400 text-center py-2">Agora não</button>
        </div>
      </div>
    </div>
  );
}

function usePremium(config) {
  const agora = new Date();
  const premiumAte = config.premiumAte ? new Date(config.premiumAte) : null;
  const isPremium = config.premium === true && premiumAte && premiumAte > agora;
  const vencido = config.premium === true && premiumAte && premiumAte <= agora;
  const diasRestantes = isPremium ? Math.ceil((premiumAte - agora) / (1000 * 60 * 60 * 24)) : 0;
  const [modalAberto, setModalAberto] = useState(false);

  function verificarPremium() {
    if (isPremium) return true;
    setModalAberto(true);
    return false;
  }

  return { isPremium, vencido, diasRestantes, premiumAte, modalAberto, setModalAberto, verificarPremium };
}
function Dashboard({ fin, nav, onNav, premium }) {
  const lancs = fin.lancamentosDoMesAno(nav.mes, nav.ano);
  const receitas = fin.receitasDoMesAno(nav.mes, nav.ano);
  const despesas = fin.despesasDoMesAno(nav.mes, nav.ano);
  const saldo = receitas - despesas;
  const isPF = fin.config.regime === "Pessoa Física";
  const temLimite = !isPF && fin.config.limiteAnual > 0;
  const nomeDisplay = fin.config.nome || (isPF ? "você" : "MEI");

  const mesAtualStr = `${nav.ano}-${String(nav.mes + 1).padStart(2, "0")}`;
  const dasDoMes = fin.registrosDAS.find(d => d.mesReferencia === mesAtualStr);
  const dasEmDia = dasDoMes?.status === "pago";

  const ultimos = [...lancs].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).slice(0, 3);

  // Projeção: quanto ainda pode faturar por mês
  const mesesRestantes = Math.max(1, 12 - nav.mes);
  const saldoFaturamento = fin.config.limiteAnual - fin.faturamentoAnual;
  const maxPorMes = Math.max(0, saldoFaturamento / mesesRestantes);

  return (
    <div className="px-5 pt-6 pb-24">
      <p className="text-sm text-gray-500">Olá, {nomeDisplay}</p>
      <NavMes nav={nav}/>

      {/* Saldo */}
      <div className="mt-4 bg-emerald-600 rounded-2xl p-5 text-white shadow-lg">
        <p className="text-emerald-100 text-sm">Saldo do mês</p>
        <p className="text-3xl font-bold mt-1">{fmt(saldo)}</p>
        <div className="flex justify-between mt-4 text-sm">
          <div onClick={() => onNav("relatorios-rec")} className="cursor-pointer active:opacity-70"><p className="text-emerald-200">Receitas ›</p><p className="font-semibold">{fmt(receitas)}</p></div>
          <div onClick={() => onNav("relatorios-desp")} className="cursor-pointer active:opacity-70"><p className="text-emerald-200">Despesas ›</p><p className="font-semibold">{fmt(despesas)}</p></div>
        </div>
      </div>

      {/* Compartilhar resumo */}
      {nav.isAtual && lancs.length > 0 && (
        <button onClick={() => {
          if (!premium.verificarPremium()) return;
          const texto = `📊 *Resumo ${MESES_NOME[nav.mes]}/${nav.ano}*\n\n`
            + `💰 Receitas: ${fmt(receitas)}\n`
            + `💸 Despesas: ${fmt(despesas)}\n`
            + `${saldo >= 0 ? "✅" : "🔴"} Saldo: ${fmt(saldo)}\n\n`
            + (isPF ? "" : `📈 Faturamento anual: ${fmt(fin.faturamentoAnual)} de ${fmt(fin.config.limiteAnual)} (${Math.round(fin.percentualFaturamento)}%)\n\n`)
            + `_Enviado pelo Dinheiro Verde_\n`
            + `mei-dinheiro-verde-app.vercel.app`;
          const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
          window.open(url, "_blank");
        }}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 font-medium active:bg-gray-50 transition-colors">
          <Ic.Send s={14} c="#059669"/> Compartilhar resumo
        </button>
      )}

      {/* Termômetro — só MEI e Simples */}
      {temLimite && (
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex justify-between items-baseline">
            <p className="text-sm font-medium text-gray-700">Faturamento anual</p>
            <p className="text-sm font-semibold text-emerald-600">{Math.round(fin.percentualFaturamento)}%</p>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{fmt(fin.faturamentoAnual)} de {fmt(fin.config.limiteAnual)}</p>
          <div className="mt-3 w-full bg-gray-100 rounded-full h-3">
            <div className={`h-3 rounded-full transition-all duration-700 ${fin.percentualFaturamento > 80 ? "bg-red-500" : fin.percentualFaturamento > 60 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${fin.percentualFaturamento}%` }}/>
          </div>
          {saldoFaturamento > 0 && nav.isAtual && (
            <p className="text-xs text-gray-500 mt-2">Pode faturar até <span className="font-semibold text-emerald-600">{fmt(maxPorMes)}</span>/mês até dezembro</p>
          )}
          {fin.percentualFaturamento >= 80 && (
            <p className="text-xs text-red-500 font-medium mt-2">⚠ Atenção: próximo do limite de faturamento!</p>
          )}
        </div>
      )}

      {/* Assistente financeiro contextual */}
      {nav.isAtual && <AssistenteFinanceiro fin={fin} nav={nav} receitas={receitas} despesas={despesas} saldo={saldo}/>}

      {/* DAS — só MEI e Simples */}
      {!isPF && nav.isAtual && (
        dasEmDia ? (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
            <Ic.Check s={20} c="#059669"/>
            <div><p className="text-sm font-medium text-emerald-800">DAS em dia</p>
              <p className="text-xs text-emerald-600 mt-0.5">{dasDoMes ? `${nomeMes(dasDoMes.mesReferencia)} — ${fmt(dasDoMes.valor)}` : ""}</p></div>
          </div>
        ) : (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-amber-500 text-xl leading-none">⚠</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">DAS pendente</p>
                <p className="text-xs text-amber-600 mt-0.5">Vence dia {fin.config.diaDAS} deste mês</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { if (premium.verificarPremium()) onNav("wizard-das"); }}
                className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-medium active:bg-emerald-700 transition-colors">
                Pagar DAS
              </button>
              <button onClick={() => onNav("novo-das")}
                className="flex-1 bg-white border border-amber-300 text-amber-700 py-2.5 rounded-xl text-xs font-medium active:bg-amber-50 transition-colors">
                Registrar manual
              </button>
            </div>
          </div>
        )
      )}

      {/* Custo fixo mensal */}
      {fin.custoFixoMensal > 0 && nav.isAtual && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-sm font-medium text-blue-800">Custos fixos mensais</p>
          <p className="text-xs text-blue-600 mt-0.5">Despesas recorrentes somam <span className="font-semibold">{fmt(fin.custoFixoMensal)}</span>/mês</p>
          <p className="text-xs text-blue-500 mt-1">Faturamento mínimo necessário para cobrir</p>
        </div>
      )}

      {/* Últimos lançamentos */}
      {ultimos.length > 0 && (
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-medium text-gray-700">Últimos lançamentos</p>
            <button onClick={() => onNav("lancamentos")} className="text-xs text-emerald-600 font-medium">Ver todos</button>
          </div>
          {ultimos.map(l => (
            <div key={l.id} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-2">
                <div><p className="text-sm text-gray-800">{l.categoria}</p><p className="text-xs text-gray-400 mt-0.5">{fmtData(l.data)}</p></div>
                {l.arquivoId && <Ic.Clip s={12} c="#9ca3af"/>}
                {l.recorrente && <Ic.Repeat s={12} c="#3b82f6"/>}
              </div>
              <p className={`text-sm font-semibold ${l.tipo === "receita" ? "text-emerald-600" : "text-red-500"}`}>
                {l.tipo === "receita" ? "+" : "-"} {fmt(l.valor)}</p>
            </div>
          ))}
        </div>
      )}

      {lancs.length === 0 && (
        <div className="mt-10 text-center"><p className="text-gray-400 text-sm">Nenhum lançamento neste mês</p>
          {nav.isAtual && <button onClick={() => onNav("novo")} className="mt-3 text-emerald-600 text-sm font-medium">+ Adicionar primeiro lançamento</button>}</div>
      )}

      {/* Botão flutuante do Assistente IA */}
      {premium.isPremium && (
        <button onClick={() => onNav("assistente")}
          className="fixed bottom-24 right-5 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-lg flex items-center justify-center active:bg-emerald-700 active:scale-95 transition-all z-40">
          <span className="text-xl">🤖</span>
        </button>
      )}
    </div>
  );
}

// ============================================================
// LANÇAMENTOS
// ============================================================
function Lancamentos({ fin, arq, nav, onNav }) {
  const [preview, setPreview] = useState(null);
  const lancs = fin.lancamentosDoMesAno(nav.mes, nav.ano);
  const agrupados = {};
  [...lancs].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    .forEach(l => { if (!agrupados[l.data]) agrupados[l.data] = []; agrupados[l.data].push(l); });

  return (
    <div className="px-5 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900">Lançamentos</h1>
      <NavMes nav={nav}/>
      <p className="text-sm text-gray-500 mt-2">{lancs.length} registro{lancs.length !== 1 ? "s" : ""}</p>

      {Object.keys(agrupados).length > 0 ? (
        Object.entries(agrupados).map(([data, itens]) => (
          <div key={data} className="mt-4">
            <p className="text-xs font-medium text-gray-400 uppercase mb-2">{fmtData(data)}</p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {itens.map((l, i) => (
                <div key={l.id} className={`flex justify-between items-center px-4 py-3 ${i < itens.length - 1 ? "border-b border-gray-50" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${l.tipo === "receita" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                      {l.tipo === "receita" ? "↑" : "↓"}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-gray-800">{l.categoria}</p>
                        {l.recorrente && <Ic.Repeat s={11} c="#3b82f6"/>}
                        {l.arquivoId && (
                          <button onClick={() => { arq.obterArquivo(l.arquivoId).then(a => { if (a) setPreview(a); }); }}
                            className="text-emerald-500"><Ic.Clip s={13}/></button>
                        )}
                      </div>
                      {l.descricao && <p className="text-xs text-gray-400 mt-0.5">{l.descricao}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className={`text-sm font-semibold ${l.tipo === "receita" ? "text-emerald-600" : "text-red-500"}`}>
                      {l.tipo === "receita" ? "+" : "-"} {fmt(l.valor)}</p>
                    <button onClick={() => onNav("editar", l)} className="text-gray-300 active:text-emerald-600 p-1"><Ic.Edit s={13}/></button>
                    <button onClick={() => { if (confirm("Excluir este lançamento?")) fin.removerLancamento(l.id); }} className="text-gray-300 active:text-red-500 p-1"><Ic.Trash s={13}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="flex flex-col items-center justify-center mt-16 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"><Ic.List s={28} c="#9ca3af"/></div>
          <p className="text-gray-500 text-sm">Nenhum lançamento neste mês</p>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-5" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-medium text-gray-800 truncate">{preview.nome}</p>
              <button onClick={() => setPreview(null)}><Ic.X s={20} c="#6b7280"/></button>
            </div>
            {preview.tipo?.startsWith("image") ? <img src={preview.url} alt={preview.nome} className="w-full rounded-lg"/>
              : <div className="bg-gray-50 rounded-lg p-8 text-center"><Ic.File s={40} c="#9ca3af"/>
                <p className="text-sm text-gray-500 mt-3">{preview.nome}</p>
                <a href={preview.url} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-emerald-600 text-sm font-medium">Abrir arquivo</a></div>}
          </div>
        </div>
      )}

      <button onClick={() => onNav("novo")}
        className="fixed bottom-24 right-5 w-14 h-14 bg-emerald-600 text-white rounded-full shadow-lg flex items-center justify-center active:bg-emerald-700 active:scale-95 transition-all z-40">
        <Ic.Plus s={24}/></button>
    </div>
  );
}

// ============================================================
// NOVO LANÇAMENTO
// ============================================================
function NovoLancamento({ fin, arq, onVoltar, modoInicial, lancamentoEditando, premium }) {
  const editando = lancamentoEditando || null;
  const [modo, setModo] = useState(modoInicial || "lancamento");
  const [tipo, setTipo] = useState(editando?.tipo || "receita");
  const [valor, setValor] = useState(editando ? mascaraMoeda(String(Math.round(editando.valor * 100))) : "");
  const [categoria, setCategoria] = useState(editando?.categoria || "Serviços Prestados");
  const [data, setData] = useState(editando?.data || hojeISO());
  const [descricao, setDescricao] = useState(editando?.descricao || "");
  const [recorrente, setRecorrente] = useState(editando?.recorrente || false);
  const [arquivo, setArquivo] = useState(null);
  const [arquivoFile, setArquivoFile] = useState(null);
  const [dasMes, setDasMes] = useState(() => { const h = new Date(); return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,"0")}`; });
  const [dasValor, setDasValor] = useState("75.90");
  const [dasStatus, setDasStatus] = useState("pago");
  const [dasArquivo, setDasArquivo] = useState(null);
  const [dasArquivoFile, setDasArquivoFile] = useState(null);
  const [salvo, setSalvo] = useState(false);
  const [erros, setErros] = useState({});
  const [primeiroRender, setPrimeiroRender] = useState(true);
  const categorias = tipo === "receita"
    ? (fin.config.categoriasReceita || CATEGORIAS_RECEITA_PADRAO)
    : (fin.config.categoriasDespesa || CATEGORIAS_DESPESA_PADRAO);

  // Bug fix #1 e #2: Só reseta a categoria quando o tipo muda PELO USUÁRIO,
  // não no primeiro render (que sobrescreveria a categoria do item sendo editado)
  useEffect(() => {
    if (primeiroRender) { setPrimeiroRender(false); return; }
    setCategoria(categorias[0]);
  }, [tipo]);

  function salvar() {
    const e = {};
    if (modo === "lancamento") {
      const v = parseMoedaMascarada(valor);
      if (v <= 0) e.valor = "Informe um valor";
    } else { if (!dasValor || parseFloat(dasValor) <= 0) e.dasValor = "Informe o valor"; }
    setErros(e); if (Object.keys(e).length > 0) return;

    if (modo === "das") {
      const vDAS = parseFloat(dasValor) || 0;
      let arquivoId = null;
      if (dasArquivoFile) arquivoId = arq.salvarArquivo(dasArquivoFile);
      fin.adicionarDAS({ mesReferencia: dasMes, valor: vDAS, status: dasStatus, dataVencimento: `${dasMes}-20`, arquivoId });
      if (dasStatus === "pago" && vDAS > 0 && !fin.existeLancamentoDAS(dasMes)) fin.adicionarLancamento({ tipo: "despesa", valor: vDAS, categoria: "DAS-MEI", data: `${dasMes}-20`, descricao: `DAS ref. ${dasMes}`, arquivoId, recorrente: false });
    } else {
      const v = parseMoedaMascarada(valor);
      let arquivoId = editando?.arquivoId || null;
      if (arquivoFile) arquivoId = arq.salvarArquivo(arquivoFile);
      if (editando) {
        fin.editarLancamento(editando.id, { tipo, valor: v, categoria, data, descricao, arquivoId, recorrente });
      } else {
        fin.adicionarLancamento({ tipo, valor: v, categoria, data, descricao, arquivoId, recorrente });
      }
    }
    setSalvo(true);
    setTimeout(() => { setSalvo(false); onVoltar(); }, 1000);
  }

  if (salvo) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4"><Ic.Check s={32} c="#059669"/></div>
      <p className="text-lg font-semibold text-emerald-700">{modo === "das" ? "DAS registrado!" : "Lançamento salvo!"}</p>
    </div>
  );

  return (
    <div className="px-5 pt-4 pb-10 min-h-screen bg-gray-50">
      <button onClick={onVoltar} className="flex items-center gap-1 text-gray-500 text-sm mb-4"><Ic.Back s={18}/> Voltar</button>
      <h1 className="text-2xl font-bold text-gray-900">{editando ? "Editar lançamento" : "Novo registro"}</h1>
      {!editando && fin.config.regime !== "Pessoa Física" && <div className="flex gap-2 mt-4">
        {[{ id: "lancamento", label: "Lançamento", emoji: "💰" }, { id: "das", label: "DAS", emoji: "📋" }].map(m => (
          <button key={m.id} onClick={() => setModo(m.id)}
            className={`flex-1 py-3 rounded-xl text-center text-sm font-medium transition-all ${modo === m.id ? "bg-emerald-600 text-white shadow-md" : "bg-white border border-gray-200 text-gray-600"}`}>
            <span className="block text-lg mb-0.5">{m.emoji}</span>{m.label}</button>
        ))}
      </div>}

      {/* Input por texto natural (IA) — só para Premium */}
      {premium?.isPremium && !editando && modo === "lancamento" && (
        <div className="mt-4">
          <InputTextoNatural onLancamentoCriado={async (dados) => {
            await fin.adicionarLancamento({ ...dados, arquivoId: null, recorrente: false });
            onVoltar();
          }}/>
        </div>
      )}

      {modo === "das" && !editando ? (
        <div className="mt-6 space-y-4">
          <div><label className="text-xs text-gray-500 block mb-1">Mês de referência</label>
            <input type="month" value={dasMes} onChange={e => setDasMes(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white"/></div>
          <div><label className="text-xs text-gray-500 block mb-1">Valor do DAS</label>
            <input type="number" step="0.01" value={dasValor} onChange={e => setDasValor(e.target.value)}
              className={`w-full border rounded-xl px-4 py-3 text-sm bg-white ${erros.dasValor ? "border-red-400" : "border-gray-200"}`}/>
            {erros.dasValor && <p className="text-xs text-red-500 mt-1">{erros.dasValor}</p>}</div>
          <div><label className="text-xs text-gray-500 block mb-1">Status</label>
            <div className="flex gap-2">{["pago", "pendente"].map(s => (
              <button key={s} onClick={() => setDasStatus(s)}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${dasStatus === s ? (s === "pago" ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-500" : "bg-amber-100 text-amber-700 border-2 border-amber-500") : "bg-white border border-gray-200 text-gray-500"}`}>
                {s === "pago" ? "✅ Pago" : "⏳ Pendente"}</button>))}</div></div>
          {premium?.isPremium ? (
            <BotaoAnexo arquivo={dasArquivo} onAnexar={(f) => { setDasArquivo({ nome: f.name, tipo: f.type }); setDasArquivoFile(f); }} onRemover={() => { setDasArquivo(null); setDasArquivoFile(null); }}/>
          ) : (
            <button onClick={() => premium?.verificarPremium()} className="w-full flex items-center justify-center gap-2 bg-gray-50 border border-dashed border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-400">
              ⭐ Anexar comprovante (Premium)
            </button>
          )}
          <button onClick={salvar} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold text-base active:bg-emerald-700 active:scale-[0.98] transition-all mt-2">Registrar DAS</button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div><label className="text-xs text-gray-500 block mb-1">Tipo</label>
            <div className="flex gap-2">
              <button onClick={() => setTipo("receita")} className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${tipo === "receita" ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-500" : "bg-white border border-gray-200 text-gray-500"}`}>↑ Receita</button>
              <button onClick={() => setTipo("despesa")} className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${tipo === "despesa" ? "bg-red-100 text-red-600 border-2 border-red-400" : "bg-white border border-gray-200 text-gray-500"}`}>↓ Despesa</button>
            </div></div>
          <div><label className="text-xs text-gray-500 block mb-1">Valor (R$)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-gray-400">R$</span>
              <input type="text" inputMode="numeric" value={valor} onChange={e => { setValor(mascaraMoeda(e.target.value)); if (erros.valor) setErros(prev => ({ ...prev, valor: null })); }}
              className={`w-full border rounded-xl pl-12 pr-4 py-3 text-lg font-semibold bg-white ${erros.valor ? "border-red-400" : "border-gray-200"}`} placeholder="0,00"/>
            </div>
            {erros.valor && <p className="text-xs text-red-500 mt-1">{erros.valor}</p>}</div>
          <div><label className="text-xs text-gray-500 block mb-1">Categoria</label>
            <div className="flex flex-wrap gap-2">{categorias.map(cat => (
              <button key={cat} onClick={() => setCategoria(cat)}
                className={`px-3 py-2 rounded-lg text-sm transition-all ${categoria === cat ? "bg-emerald-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>{cat}</button>))}</div></div>
          <div><label className="text-xs text-gray-500 block mb-1">Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white"/></div>
          <div><label className="text-xs text-gray-500 block mb-1">Descrição (opcional)</label>
            <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white" placeholder="Ex: NF 1234 — Consultoria"/></div>
          
          {/* Toggle recorrente */}
          <button onClick={() => setRecorrente(!recorrente)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all ${recorrente ? "bg-blue-50 border-2 border-blue-400 text-blue-700" : "bg-white border border-gray-200 text-gray-500"}`}>
            <div className="flex items-center gap-2"><Ic.Repeat s={16}/> {tipo === "receita" ? "Receita" : "Despesa"} recorrente (mensal)</div>
            <div className={`w-10 h-6 rounded-full transition-all flex items-center px-0.5 ${recorrente ? "bg-blue-500 justify-end" : "bg-gray-300 justify-start"}`}>
              <div className="w-5 h-5 bg-white rounded-full shadow"/>
            </div>
          </button>

          {premium?.isPremium ? (
            <BotaoAnexo arquivo={arquivo} onAnexar={(f) => { setArquivo({ nome: f.name, tipo: f.type }); setArquivoFile(f); }} onRemover={() => { setArquivo(null); setArquivoFile(null); }}/>
          ) : (
            <button onClick={() => premium?.verificarPremium()} className="w-full flex items-center justify-center gap-2 bg-gray-50 border border-dashed border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-400">
              ⭐ Anexar comprovante (Premium)
            </button>
          )}
          <button onClick={salvar} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold text-base active:bg-emerald-700 active:scale-[0.98] transition-all mt-2">{editando ? "Salvar alterações" : "Salvar lançamento"}</button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GRÁFICO DE PIZZA
// ============================================================
function GraficoPizza({ dados, tamanho = 160 }) {
  if (!dados.length) return null;
  const total = dados.reduce((s, d) => s + d.valor, 0);
  const cores = ["#059669","#3b82f6","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#ef4444","#6366f1"];
  let ang = -90;
  const fatias = dados.map((d, i) => {
    const pct = d.valor / total; const a = pct * 360; const ini = ang; ang += a;
    const x1 = 50+40*Math.cos(ini*Math.PI/180); const y1 = 50+40*Math.sin(ini*Math.PI/180);
    const x2 = 50+40*Math.cos((ini+a)*Math.PI/180); const y2 = 50+40*Math.sin((ini+a)*Math.PI/180);
    const path = pct >= 0.999 ? "M 50 10 A 40 40 0 1 1 49.99 10 Z" : `M 50 50 L ${x1} ${y1} A 40 40 0 ${a>180?1:0} 1 ${x2} ${y2} Z`;
    return { ...d, cor: cores[i%cores.length], path, pct };
  });

  // Formata valor curto para o centro (sem "R$" se muito grande)
  const valorCurto = total >= 10000
    ? `${(total/1000).toFixed(1).replace(".",",")}k`
    : total.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: 140, height: 140 }}>
        <svg width={140} height={140} viewBox="0 0 100 100">
          {fatias.map((f, i) => <path key={i} d={f.path} fill={f.cor} stroke="white" strokeWidth="1.5"/>)}
          <circle cx="50" cy="50" r="24" fill="white"/>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] text-gray-400 leading-none">Total</span>
          <span className="text-sm font-bold text-gray-800 leading-tight mt-0.5">{fmt(total)}</span>
        </div>
      </div>
      <div className="w-full space-y-2">{fatias.map((f, i) => (
        <div key={i} className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.cor }}/>
          <span className="text-xs text-gray-600 flex-1 truncate">{f.categoria}</span>
          <span className="text-xs text-gray-500 flex-shrink-0">{fmt(f.valor)}</span>
          <span className="text-[11px] font-semibold text-gray-800 flex-shrink-0 w-8 text-right">{Math.round(f.pct*100)}%</span>
        </div>))}</div>
    </div>
  );
}

// ============================================================
// RELATÓRIOS
// ============================================================
// ============================================================
// PACOTE DO CONTADOR — PDF real
// ============================================================
function PacoteContador({ fin, nav, lancs, receitas, despesas, comAnexo, arq, premium }) {
  const [status, setStatus] = useState("idle"); // idle | gerando | pronto | erro

  function carregarImagem(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d").drawImage(img, 0, 0);
        try { resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.85), w: img.width, h: img.height }); }
        catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function gerarPDF() {
    setStatus("gerando");
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw = doc.internal.pageSize.getWidth();
      const margem = 20;
      const largura = pw - margem * 2;
      let y = 20;

      const nomeUsuario = fin.config.nome || "Usuário";
      const cnpjUsuario = fin.config.cnpj || "Não informado";
      const mesRef = `${MESES_NOME[nav.mes]} / ${nav.ano}`;
      const saldo = receitas - despesas;

      // Agrupamento por categoria
      const recPorCat = {};
      const despPorCat = {};
      lancs.forEach(l => {
        if (l.tipo === "receita") recPorCat[l.categoria] = (recPorCat[l.categoria] || 0) + l.valor;
        else despPorCat[l.categoria] = (despPorCat[l.categoria] || 0) + l.valor;
      });

      // DAS do mês
      const mesStr = `${nav.ano}-${String(nav.mes + 1).padStart(2, "0")}`;
      const dasDoMes = fin.registrosDAS.find(d => d.mesReferencia === mesStr);

      // Helper para adicionar texto
      function texto(t, x, tamanho, estilo, cor) {
        doc.setFontSize(tamanho);
        doc.setFont("helvetica", estilo || "normal");
        doc.setTextColor(...(cor || [51, 51, 51]));
        doc.text(t, x, y);
      }
      function linha() {
        doc.setDrawColor(220, 220, 220);
        doc.line(margem, y, pw - margem, y);
        y += 4;
      }
      function checkPage(espaco) {
        if (y + espaco > 280) { doc.addPage(); y = 20; }
      }

      // ─── CABEÇALHO ───
      doc.setFillColor(5, 150, 105);
      doc.rect(0, 0, pw, 40, "F");
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Dinheiro Verde", margem, 18);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text(`Relatório Financeiro — ${mesRef}`, margem, 28);
      doc.setFontSize(9);
      doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")}`, margem, 35);
      y = 50;

      // ─── DADOS CADASTRAIS ───
      texto("Dados Cadastrais", margem, 12, "bold");
      y += 7;
      texto(`Nome: ${nomeUsuario}`, margem, 10); y += 5;
      if (fin.config.regime !== "Pessoa Física" && cnpjUsuario !== "Não informado") {
        texto(`CNPJ: ${cnpjUsuario}`, margem, 10); y += 5;
      }
      if (fin.config.regime !== "Pessoa Física" && fin.config.limiteAnual > 0) {
        texto(`Limite anual: ${fmt(fin.config.limiteAnual)}`, margem, 10); y += 5;
      }
      texto(`Perfil: ${fin.config.regime || "MEI"}`, margem, 10); y += 8;
      linha();

      // ─── RESUMO FINANCEIRO ───
      texto("Resumo do Mês", margem, 12, "bold");
      y += 8;

      // Box receitas
      doc.setFillColor(236, 253, 245);
      doc.roundedRect(margem, y, largura / 2 - 2, 18, 3, 3, "F");
      doc.setFontSize(8); doc.setTextColor(5, 150, 105); doc.setFont("helvetica", "normal");
      doc.text("RECEITAS", margem + 4, y + 6);
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text(fmt(receitas), margem + 4, y + 14);

      // Box despesas
      const xDesp = margem + largura / 2 + 2;
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(xDesp, y, largura / 2 - 2, 18, 3, 3, "F");
      doc.setFontSize(8); doc.setTextColor(220, 38, 38); doc.setFont("helvetica", "normal");
      doc.text("DESPESAS", xDesp + 4, y + 6);
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text(fmt(despesas), xDesp + 4, y + 14);
      y += 24;

      // Saldo
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
      doc.text("Saldo do mês:", margem, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(saldo >= 0 ? 5 : 220, saldo >= 0 ? 150 : 38, saldo >= 0 ? 105 : 38);
      doc.text(fmt(saldo), margem + 35, y);
      y += 6;

      // Faturamento anual (só MEI/Simples)
      if (fin.config.regime !== "Pessoa Física" && fin.config.limiteAnual > 0) {
        doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
        doc.text(`Faturamento anual: ${fmt(fin.faturamentoAnual)} de ${fmt(fin.config.limiteAnual)} (${Math.round(fin.percentualFaturamento)}%)`, margem, y);
        y += 4;

        // Barra de progresso
        doc.setFillColor(229, 231, 235);
        doc.roundedRect(margem, y, largura, 4, 2, 2, "F");
        const pctW = Math.min(fin.percentualFaturamento / 100, 1) * largura;
        const corBarra = fin.percentualFaturamento > 80 ? [220, 38, 38] : fin.percentualFaturamento > 60 ? [245, 158, 11] : [5, 150, 105];
        doc.setFillColor(...corBarra);
        if (pctW > 0) doc.roundedRect(margem, y, pctW, 4, 2, 2, "F");
        y += 10;
      }
      linha();

      // ─── DAS (só MEI/Simples) ───
      if (fin.config.regime !== "Pessoa Física") {
        texto("DAS-MEI", margem, 12, "bold"); y += 7;
        if (dasDoMes) {
          const statusDAS = dasDoMes.status === "pago" ? "✓ Pago" : "✗ Pendente";
          const corDAS = dasDoMes.status === "pago" ? [5, 150, 105] : [220, 38, 38];
          texto(`Mês: ${mesRef}`, margem, 10); y += 5;
          texto(`Valor: ${fmt(dasDoMes.valor)}`, margem, 10); y += 5;
          doc.setTextColor(...corDAS);
          texto(`Status: ${statusDAS}`, margem, 10, "bold", corDAS); y += 8;
        } else {
          texto("Nenhum registro de DAS para este mês.", margem, 10, "normal", [150, 150, 150]); y += 8;
        }
        linha();
      }

      // ─── RECEITAS POR CATEGORIA ───
      if (Object.keys(recPorCat).length > 0) {
        checkPage(30);
        texto("Receitas por Categoria", margem, 12, "bold"); y += 8;
        Object.entries(recPorCat).sort(([, a], [, b]) => b - a).forEach(([cat, val]) => {
          checkPage(7);
          doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
          doc.text(cat, margem + 2, y);
          doc.setFont("helvetica", "bold"); doc.setTextColor(5, 150, 105);
          doc.text(fmt(val), pw - margem, y, { align: "right" });
          y += 6;
        });
        y += 4; linha();
      }

      // ─── DESPESAS POR CATEGORIA ───
      if (Object.keys(despPorCat).length > 0) {
        checkPage(30);
        texto("Despesas por Categoria", margem, 12, "bold"); y += 8;
        Object.entries(despPorCat).sort(([, a], [, b]) => b - a).forEach(([cat, val]) => {
          checkPage(7);
          doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
          doc.text(cat, margem + 2, y);
          doc.setFont("helvetica", "bold"); doc.setTextColor(220, 38, 38);
          doc.text(fmt(val), pw - margem, y, { align: "right" });
          y += 6;
        });
        y += 4; linha();
      }

      // ─── LISTA DETALHADA ───
      checkPage(20);
      texto("Lançamentos Detalhados", margem, 12, "bold"); y += 8;

      // Header da tabela
      doc.setFillColor(245, 245, 245);
      doc.rect(margem, y - 4, largura, 7, "F");
      doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(100, 100, 100);
      doc.text("Data", margem + 2, y);
      doc.text("Tipo", margem + 25, y);
      doc.text("Categoria", margem + 45, y);
      doc.text("Descrição", margem + 90, y);
      doc.text("Valor", pw - margem, y, { align: "right" });
      y += 6;

      const lancOrdenados = [...lancs].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
      lancOrdenados.forEach((l, i) => {
        checkPage(7);
        if (i % 2 === 0) { doc.setFillColor(250, 250, 250); doc.rect(margem, y - 4, largura, 6, "F"); }
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80);
        const dataFmt = new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR");
        doc.text(dataFmt, margem + 2, y);
        doc.setTextColor(l.tipo === "receita" ? 5 : 220, l.tipo === "receita" ? 150 : 38, l.tipo === "receita" ? 105 : 38);
        doc.text(l.tipo === "receita" ? "Receita" : "Despesa", margem + 25, y);
        doc.setTextColor(80, 80, 80);
        doc.text((l.categoria || "").substring(0, 22), margem + 45, y);
        doc.text((l.descricao || "-").substring(0, 25), margem + 90, y);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(l.tipo === "receita" ? 5 : 220, l.tipo === "receita" ? 150 : 38, l.tipo === "receita" ? 105 : 38);
        doc.text(fmt(l.valor), pw - margem, y, { align: "right" });
        y += 6;
      });

      // ─── COMPROVANTES ANEXADOS ───
      try {
        const lancComAnexo = lancs.filter(l => l.arquivoId);
        const pdfsAnexos = [];

        if (lancComAnexo.length > 0 && arq) {
          doc.addPage();
          y = 20;
          doc.setFillColor(5, 150, 105);
          doc.rect(0, 0, pw, 25, "F");
          doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
          doc.text("Comprovantes Anexados", margem, 17);
          y = 35;

          let temAlgumAnexo = false;

          for (const l of lancComAnexo) {
            const arquivo = arq.obterArquivo(l.arquivoId);
            if (!arquivo || !arquivo.url) continue;

            if (arquivo.tipo && arquivo.tipo.startsWith("image")) {
              try {
                const imgData = await carregarImagem(arquivo.url);
                if (imgData && imgData.dataUrl) {
                  temAlgumAnexo = true;
                  if (y + 80 > 280) { doc.addPage(); y = 20; }
                  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(80, 80, 80);
                  const dataFmt = new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR");
                  doc.text(`${l.categoria} — ${dataFmt} — ${fmt(l.valor)}`, margem, y);
                  y += 3;
                  doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(150, 150, 150);
                  doc.text(arquivo.nome, margem, y);
                  y += 4;
                  const maxW = largura;
                  const maxH = 180;
                  const ratio = Math.min(maxW / imgData.w, maxH / imgData.h);
                  const imgW = imgData.w * ratio;
                  const imgH = imgData.h * ratio;
                  if (y + imgH + 10 > 280) { doc.addPage(); y = 20; }
                  doc.addImage(imgData.dataUrl, "JPEG", margem, y, imgW, imgH);
                  y += imgH + 10;
                }
              } catch { /* imagem falhou, pular */ }
            } else {
              pdfsAnexos.push({ lancamento: l, arquivo });
            }
          }

          if (pdfsAnexos.length > 0) {
            if (y + 20 > 280) { doc.addPage(); y = 20; }
            doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(80, 80, 80);
            doc.text("Arquivos PDF anexados (enviar separadamente):", margem, y);
            y += 6;
            pdfsAnexos.forEach(({ lancamento: l2, arquivo: a2 }) => {
              if (y + 7 > 280) { doc.addPage(); y = 20; }
              const dataFmt2 = new Date(l2.data + "T12:00:00").toLocaleDateString("pt-BR");
              doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
              doc.text(`• ${a2.nome} — ${l2.categoria} — ${dataFmt2} — ${fmt(l2.valor)}`, margem + 2, y);
              y += 5;
            });
          }

          // Se nenhum anexo foi adicionado, remover a página extra
          if (!temAlgumAnexo && pdfsAnexos.length === 0) {
            doc.deletePage(doc.internal.getNumberOfPages());
          }
        }
      } catch (anexoErr) {
        console.warn("Erro ao anexar comprovantes, gerando PDF sem eles:", anexoErr);
      }

      // ─── RODAPÉ ───
      const totalPaginas = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPaginas; p++) {
        doc.setPage(p);
        doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(180, 180, 180);
        doc.text(`Dinheiro Verde — ${mesRef} — Página ${p}/${totalPaginas}`, pw / 2, 290, { align: "center" });
      }

      // Salvar / compartilhar
      const nomeArquivo = `Financeiro-${MESES_NOME[nav.mes]}-${nav.ano}.pdf`;
      const blob = doc.output("blob");

      // Tenta usar Web Share API (mobile)
      if (navigator.share && navigator.canShare) {
        const file = new File([blob], nomeArquivo, { type: "application/pdf" });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: `Relatório ${mesRef}`, text: `Relatório financeiro — ${mesRef}` });
            setStatus("pronto");
            return;
          } catch (e) { /* user cancelled share, fall through to download */ }
        }
      }

      // Fallback: download direto
      doc.save(nomeArquivo);
      setStatus("pronto");

    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      setStatus("erro");
    }
  }

  return (
    <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <Ic.Send s={20} c="#059669"/>
        <p className="text-sm font-medium text-gray-700">{fin.config.regime === "Pessoa Física" ? "Relatório Mensal PDF" : "Pacote para o Contador"}</p>
      </div>
      <p className="text-xs text-gray-500 mb-1">{lancs.length} lançamento{lancs.length !== 1 ? "s" : ""} no mês</p>
      <p className="text-xs text-gray-500 mb-3">{comAnexo.length} comprovante{comAnexo.length !== 1 ? "s" : ""} anexado{comAnexo.length !== 1 ? "s" : ""}</p>

      {status === "pronto" ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <Ic.Check s={24} c="#059669"/>
          <p className="text-sm text-emerald-700 font-medium mt-2">PDF gerado com sucesso!</p>
          <button onClick={() => setStatus("idle")} className="text-xs text-emerald-600 mt-2 underline">Gerar novamente</button>
        </div>
      ) : status === "erro" ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-sm text-red-700 font-medium">Erro ao gerar PDF</p>
          <button onClick={() => setStatus("idle")} className="text-xs text-red-600 mt-2 underline">Tentar novamente</button>
        </div>
      ) : (
        <div className="space-y-2">
          <button onClick={() => { if (premium.verificarPremium()) gerarPDF(); }} disabled={status === "gerando" || lancs.length === 0}
            className={`w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${lancs.length === 0 ? "bg-gray-200 text-gray-400" : status === "gerando" ? "bg-emerald-400 text-white" : "bg-emerald-600 text-white active:bg-emerald-700 active:scale-[0.98]"}`}>
            {status === "gerando" ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Gerando PDF...</>
            ) : (
              <><Ic.File s={16} c="white"/> Gerar PDF do mês</>
            )}
          </button>
          {lancs.length === 0 && <p className="text-xs text-gray-400 text-center">Registre lançamentos para gerar o pacote</p>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// RELATÓRIOS
// ============================================================
function Relatorios({ fin, nav, filtroInicial, arq, premium }) {
  const [evolucaoCat, setEvolucaoCat] = useState(null);
  const despRef = useRef(null);
  const recRef = useRef(null);
  const lancs = fin.lancamentosDoMesAno(nav.mes, nav.ano);
  const receitas = fin.receitasDoMesAno(nav.mes, nav.ano);
  const despesas = fin.despesasDoMesAno(nav.mes, nav.ano);

  const despPorCat = {}; lancs.filter(l => l.tipo === "despesa").forEach(l => { despPorCat[l.categoria] = (despPorCat[l.categoria]||0) + l.valor; });
  const dadosDesp = Object.entries(despPorCat).sort(([,a],[,b]) => b - a).map(([categoria, valor]) => ({ categoria, valor }));
  const recPorCat = {}; lancs.filter(l => l.tipo === "receita").forEach(l => { recPorCat[l.categoria] = (recPorCat[l.categoria]||0) + l.valor; });
  const dadosRec = Object.entries(recPorCat).sort(([,a],[,b]) => b - a).map(([categoria, valor]) => ({ categoria, valor }));
  const comAnexo = lancs.filter(l => l.arquivoId);

  const mesesRestantes = Math.max(1, 12 - nav.mes);
  const saldoLimite = fin.config.limiteAnual - fin.faturamentoAnual;

  // Scroll automático quando vem do Dashboard
  useEffect(() => {
    setTimeout(() => {
      if (filtroInicial === "despesa" && despRef.current) despRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      if (filtroInicial === "receita" && recRef.current) recRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [filtroInicial]);

  // Evolução mensal: últimos 6 meses de uma categoria
  const dadosEvolucao = evolucaoCat ? (() => {
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      let m = nav.mes - i;
      let a = nav.ano;
      while (m < 0) { m += 12; a--; }
      const total = fin.lancamentosDoMesAno(m, a)
        .filter(l => l.categoria === evolucaoCat.categoria && l.tipo === evolucaoCat.tipo)
        .reduce((s, l) => s + l.valor, 0);
      meses.push({ mes: MESES_NOME[m].slice(0, 3), ano: a, total });
    }
    return meses;
  })() : [];
  const maxEvolucao = Math.max(...dadosEvolucao.map(d => d.total), 1);

  // Todas as categorias usadas para o seletor de evolução
  const todasCategorias = [...new Set(fin.lancamentos.map(l => `${l.tipo}:${l.categoria}`))].map(c => {
    const [tipo, categoria] = c.split(":");
    return { tipo, categoria };
  });

  return (
    <div className="px-5 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
      <NavMes nav={nav}/>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 rounded-2xl p-4 text-center"><p className="text-xs text-emerald-600">Receitas</p><p className="text-lg font-bold text-emerald-700 mt-1">{fmt(receitas)}</p></div>
        <div className="bg-red-50 rounded-2xl p-4 text-center"><p className="text-xs text-red-500">Despesas</p><p className="text-lg font-bold text-red-600 mt-1">{fmt(despesas)}</p></div>
      </div>

      {dadosDesp.length > 0 && <div ref={despRef} className={`mt-4 bg-white rounded-2xl border p-5 shadow-sm ${filtroInicial === "despesa" ? "border-red-300 ring-2 ring-red-100" : "border-gray-100"}`}><p className="text-sm font-medium text-gray-700 mb-4">Despesas por categoria</p><GraficoPizza dados={dadosDesp}/></div>}
      {dadosRec.length > 0 && <div ref={recRef} className={`mt-4 bg-white rounded-2xl border p-5 shadow-sm ${filtroInicial === "receita" ? "border-emerald-300 ring-2 ring-emerald-100" : "border-gray-100"}`}><p className="text-sm font-medium text-gray-700 mb-4">Receitas por categoria</p><GraficoPizza dados={dadosRec}/></div>}

      {/* Evolução mensal */}
      {premium.isPremium ? (
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-3">Evolução mensal</p>
        {!evolucaoCat ? (
          <div>
            <p className="text-xs text-gray-500 mb-3">Escolha uma categoria para ver a evolução dos últimos 6 meses:</p>
            <div className="flex flex-wrap gap-2">
              {todasCategorias.map((c, i) => (
                <button key={i} onClick={() => setEvolucaoCat(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all active:scale-95 ${c.tipo === "receita" ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-red-200 text-red-600 bg-red-50"}`}>
                  {c.categoria}
                </button>
              ))}
            </div>
            {todasCategorias.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Registre lançamentos para acompanhar a evolução</p>}
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs text-gray-600">
                <span className={`inline-block w-2 h-2 rounded-full mr-1 ${evolucaoCat.tipo === "receita" ? "bg-emerald-500" : "bg-red-500"}`}/>
                {evolucaoCat.categoria}
              </p>
              <button onClick={() => setEvolucaoCat(null)} className="text-xs text-emerald-600 font-medium">Trocar</button>
            </div>
            <div className="flex items-end gap-2 h-32">
              {dadosEvolucao.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                  <p className="text-[10px] font-semibold text-gray-700 mb-1">{d.total > 0 ? fmt(d.total) : ""}</p>
                  <div className={`w-full rounded-t-md transition-all duration-500 ${evolucaoCat.tipo === "receita" ? "bg-emerald-400" : "bg-red-400"}`}
                    style={{ height: `${Math.max((d.total / maxEvolucao) * 100, d.total > 0 ? 8 : 2)}%`, minHeight: "2px" }}/>
                  <p className="text-[10px] text-gray-400 mt-1">{d.mes}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      ) : (
        <button onClick={() => premium.verificarPremium()} className="mt-4 w-full bg-gray-50 border border-gray-200 rounded-xl py-4 text-center active:bg-gray-100">
          <p className="text-sm text-gray-600">⭐ Evolução mensal e projeção</p>
          <p className="text-xs text-gray-400 mt-0.5">Disponível no plano Premium</p>
        </button>
      )}

      {/* Projeção — só MEI/Simples */}
      {premium.isPremium && nav.isAtual && fin.config.regime !== "Pessoa Física" && fin.config.limiteAnual > 0 && (
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-700 mb-3">Projeção até dezembro</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Faturamento restante</span><span className="font-semibold text-emerald-600">{fmt(saldoLimite)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Máximo por mês ({mesesRestantes} meses)</span><span className="font-semibold text-gray-800">{fmt(saldoLimite / mesesRestantes)}</span></div>
            {fin.custoFixoMensal > 0 && (
              <>
                <div className="border-t border-gray-100 my-2"/>
                <div className="flex justify-between"><span className="text-gray-500">Custos fixos mensais</span><span className="font-semibold text-red-500">{fmt(fin.custoFixoMensal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Margem livre por mês</span><span className="font-semibold text-blue-600">{fmt(saldoLimite / mesesRestantes - fin.custoFixoMensal)}</span></div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Pacote do Contador */}
      <PacoteContador fin={fin} nav={nav} lancs={lancs} receitas={receitas} despesas={despesas} comAnexo={comAnexo} arq={arq} premium={premium}/>

      {lancs.length === 0 && <div className="mt-10 text-center"><p className="text-gray-400 text-sm">Registre lançamentos para ver relatórios</p></div>}
    </div>
  );
}

// ============================================================
// CONFIGURAÇÕES
// ============================================================
// ============================================================
// EDITOR DE CATEGORIAS
// ============================================================
function EditorCategorias({ titulo, categorias, onSalvar, cor }) {
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState("");
  const [editandoIdx, setEditandoIdx] = useState(null);
  const [editandoVal, setEditandoVal] = useState("");

  function adicionar() {
    const nome = nova.trim();
    if (!nome || categorias.includes(nome)) return;
    onSalvar([...categorias, nome]);
    setNova("");
  }

  function remover(idx) {
    if (categorias.length <= 1) return;
    onSalvar(categorias.filter((_, i) => i !== idx));
  }

  function iniciarEdicao(idx) {
    setEditandoIdx(idx);
    setEditandoVal(categorias[idx]);
  }

  function salvarEdicao() {
    const nome = editandoVal.trim();
    if (!nome) { setEditandoIdx(null); return; }
    onSalvar(categorias.map((c, i) => i === editandoIdx ? nome : c));
    setEditandoIdx(null);
  }

  function mover(idx, direcao) {
    const novas = [...categorias];
    const novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= novas.length) return;
    [novas[idx], novas[novoIdx]] = [novas[novoIdx], novas[idx]];
    onSalvar(novas);
  }

  const corBg = cor === "emerald" ? "bg-emerald-50" : "bg-red-50";
  const corBorder = cor === "emerald" ? "border-emerald-200" : "border-red-200";
  const corText = cor === "emerald" ? "text-emerald-700" : "text-red-600";
  const corBtn = cor === "emerald" ? "bg-emerald-600" : "bg-red-500";

  return (
    <div className="mt-6">
      <button onClick={() => setAberto(!aberto)} className="flex items-center justify-between w-full">
        <h2 className="text-lg font-semibold text-gray-900">{titulo}</h2>
        <span className={`text-xs ${corText} font-medium`}>{aberto ? "Fechar" : "Editar"} ({categorias.length})</span>
      </button>

      {aberto && (
        <div className={`mt-3 ${corBg} border ${corBorder} rounded-2xl p-4`}>
          {/* Lista de categorias */}
          <div className="space-y-2">
            {categorias.map((cat, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm">
                {editandoIdx === idx ? (
                  <>
                    <input value={editandoVal} onChange={e => setEditandoVal(e.target.value)} autoFocus
                      className="flex-1 text-sm outline-none border-b border-gray-300 focus:border-emerald-400 pb-0.5"
                      onKeyDown={e => { if (e.key === "Enter") salvarEdicao(); if (e.key === "Escape") setEditandoIdx(null); }}/>
                    <button onClick={salvarEdicao} className="text-emerald-600 text-xs font-medium">OK</button>
                    <button onClick={() => setEditandoIdx(null)} className="text-gray-400 text-xs">✕</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-800">{cat}</span>
                    <button onClick={() => mover(idx, -1)} className="text-gray-300 active:text-gray-600 text-xs p-1">▲</button>
                    <button onClick={() => mover(idx, 1)} className="text-gray-300 active:text-gray-600 text-xs p-1">▼</button>
                    <button onClick={() => iniciarEdicao(idx)} className="text-gray-400 active:text-emerald-600 p-1"><Ic.Edit s={12}/></button>
                    <button onClick={() => remover(idx)} className="text-gray-300 active:text-red-500 p-1"><Ic.Trash s={12}/></button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Adicionar nova */}
          <div className="flex gap-2 mt-3">
            <input value={nova} onChange={e => setNova(e.target.value)} placeholder="Nova categoria..."
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-emerald-400"
              onKeyDown={e => { if (e.key === "Enter") adicionar(); }}/>
            <button onClick={adicionar}
              className={`${corBtn} text-white px-4 py-2 rounded-lg text-sm font-medium active:opacity-80`}>+</button>
          </div>

          {/* Restaurar padrão */}
          <button onClick={() => {
              onSalvar(cor === "emerald" ? CATEGORIAS_RECEITA_PADRAO : CATEGORIAS_DESPESA_PADRAO);
            }}
            className="w-full mt-3 text-xs text-gray-400 active:text-gray-600 text-center py-1">
            Restaurar categorias padrão
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CONFIGURAÇÕES
// ============================================================
function Configuracoes({ fin, auth, premium }) {
  const [editando, setEditando] = useState(null);
  const [valorEdit, setValorEdit] = useState("");
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const importRef = useRef(null);

  function iniciarEdicao(campo, val) { setEditando(campo); setValorEdit(val); }
  function salvarEdicao() {
    if (editando === "nome") fin.salvarConfig({ nome: valorEdit });
    else if (editando === "cnpj") {
      const nums = valorEdit.replace(/\D/g, "");
      if (nums.length > 0 && nums.length < 14) { alert("CNPJ precisa ter 14 dígitos."); return; }
      fin.salvarConfig({ cnpj: nums.length === 14 ? mascaraCNPJ(valorEdit) : "" });
    }
    else if (editando === "limiteAnual") fin.salvarConfig({ limiteAnual: parseFloat(valorEdit) || 81000 });
    else if (editando === "diaDAS") fin.salvarConfig({ diaDAS: parseInt(valorEdit) || 20 });
    setEditando(null);
  }

  function exportar() {
    const dados = fin.exportarDados();
    const blob = new Blob([dados], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `mei-backup-${hojeISO()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  function importar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const ok = fin.importarDados(ev.target.result);
      setImportStatus(ok ? "ok" : "erro");
      setTimeout(() => setImportStatus(null), 3000);
    };
    reader.readAsText(file);
  }

  const isPFConfig = fin.config.regime === "Pessoa Física";
  const campos = [
    { id: "nome", rotulo: isPFConfig ? "Nome" : "Nome do negócio", valor: fin.config.nome || "Toque para configurar" },
    ...(!isPFConfig ? [
      { id: "cnpj", rotulo: "CNPJ", valor: fin.config.cnpj ? mascaraCNPJ(fin.config.cnpj) : "Toque para configurar" },
      { id: "limiteAnual", rotulo: "Limite anual", valor: fmt(fin.config.limiteAnual) },
      { id: "diaDAS", rotulo: "Dia do DAS", valor: String(fin.config.diaDAS) },
    ] : []),
  ];
  const dasHistorico = [...fin.registrosDAS].sort((a,b) => b.mesReferencia.localeCompare(a.mesReferencia));

  return (
    <div className="px-5 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900">Ajustes</h1>

      {/* Regime / Perfil */}
      <div className="mt-4 bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <p className="text-xs text-gray-400 mb-2">Perfil</p>
        <div className="flex gap-2">
          {["MEI", "Simples Nacional", "Pessoa Física"].map(r => (
            <button key={r} onClick={() => {
              if (fin.config.regime === r) return;
              if (fin.lancamentos.length > 0) {
                if (!confirm(`Alterar para "${r}" vai redefinir suas categorias padrão.\n\nSeus lançamentos existentes serão mantidos.\n\nDeseja continuar?`)) return;
              }
              const cats = categoriasParaRegime(r);
              fin.salvarConfig({ regime: r, categoriasReceita: cats.receita, categoriasDespesa: cats.despesa, limiteAnual: r === "Pessoa Física" ? 0 : (r === "MEI" ? 81000 : fin.config.limiteAnual) });
            }}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${fin.config.regime === r ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600"}`}>
              {r === "Simples Nacional" ? "Simples" : r === "Pessoa Física" ? "Pessoal" : r}
            </button>
          ))}
        </div>
      </div>

      {/* Indicador de plano */}
      {premium.isPremium ? (
        <div className="mt-4 bg-emerald-600 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⭐</span>
            <div><p className="text-sm font-semibold text-white">Plano Premium</p>
              <p className="text-xs text-emerald-200">{premium.diasRestantes} dia{premium.diasRestantes !== 1 ? "s" : ""} restante{premium.diasRestantes !== 1 ? "s" : ""} — vence em {new Date(premium.premiumAte).toLocaleDateString("pt-BR")}</p></div>
          </div>
        </div>
      ) : premium.vencido ? (
        <button onClick={() => premium.verificarPremium()}
          className="mt-4 w-full bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between active:bg-red-100 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⏰</span>
            <div className="text-left"><p className="text-sm font-semibold text-red-800">Premium vencido</p>
              <p className="text-xs text-red-500">Renove para continuar usando as funcionalidades Premium</p></div>
          </div>
          <Ic.Fwd s={16} c="#ef4444"/>
        </button>
      ) : (
        <button onClick={() => premium.verificarPremium()}
          className="mt-4 w-full bg-gray-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between active:bg-emerald-50 transition-colors">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💚</span>
            <div className="text-left"><p className="text-sm font-semibold text-gray-800">Plano Free</p>
              <p className="text-xs text-gray-500">Toque para ver os benefícios Premium</p></div>
          </div>
          <Ic.Fwd s={16} c="#059669"/>
        </button>
      )}

      <div className="mt-6 space-y-3">
        {campos.map(c => (
          <div key={c.id}>{editando === c.id ? (
            <div className="bg-white border-2 border-emerald-400 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-emerald-600 mb-1">{c.rotulo}</p>
              <input type={c.id === "limiteAnual" || c.id === "diaDAS" ? "number" : "text"}
                inputMode={c.id === "cnpj" ? "numeric" : undefined}
                value={valorEdit}
                onChange={e => setValorEdit(c.id === "cnpj" ? mascaraCNPJ(e.target.value) : e.target.value)}
                autoFocus
                className="w-full text-sm font-medium text-gray-800 border-b border-gray-200 pb-1 outline-none focus:border-emerald-400"
                placeholder={c.id === "cnpj" ? "00.000.000/0001-00" : ""}
                onKeyDown={e => { if (e.key === "Enter") salvarEdicao(); }}/>
              <div className="flex gap-2 mt-3">
                <button onClick={salvarEdicao} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg text-xs font-medium">Salvar</button>
                <button onClick={() => setEditando(null)} className="flex-1 bg-gray-100 text-gray-600 py-2 rounded-lg text-xs font-medium">Cancelar</button>
              </div>
            </div>
          ) : (
            <div onClick={() => iniciarEdicao(c.id, c.id === "limiteAnual" ? String(fin.config.limiteAnual) : c.id === "diaDAS" ? String(fin.config.diaDAS) : (fin.config[c.id] || ""))}
              className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm active:bg-gray-50 cursor-pointer">
              <p className="text-xs text-gray-400">{c.rotulo}</p><p className="text-sm text-gray-800 mt-0.5 font-medium">{c.valor}</p>
            </div>
          )}</div>
        ))}
      </div>

      {/* Editor de Categorias */}
      {premium.isPremium ? (
        <>
          <EditorCategorias
            titulo="Categorias de Receita"
            categorias={fin.config.categoriasReceita || CATEGORIAS_RECEITA_PADRAO}
            onSalvar={(cats) => fin.salvarConfig({ categoriasReceita: cats })}
            cor="emerald"
          />
          <EditorCategorias
            titulo="Categorias de Despesa"
            categorias={fin.config.categoriasDespesa || CATEGORIAS_DESPESA_PADRAO}
            onSalvar={(cats) => fin.salvarConfig({ categoriasDespesa: cats })}
            cor="red"
          />
        </>
      ) : (
        <div className="mt-6">
          <button onClick={() => premium.verificarPremium()} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-4 text-center active:bg-gray-100">
            <p className="text-sm text-gray-600">⭐ Categorias personalizáveis</p>
            <p className="text-xs text-gray-400 mt-0.5">Disponível no plano Premium</p>
          </button>
        </div>
      )}

      {!isPFConfig && dasHistorico.length > 0 && (
        <div className="mt-6"><h2 className="text-lg font-semibold text-gray-900 mb-3">Histórico DAS</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {dasHistorico.map((d, i) => (
              <div key={d.id} className={`flex justify-between items-center px-4 py-3 ${i < dasHistorico.length - 1 ? "border-b border-gray-50" : ""}`}>
                <div><p className="text-sm text-gray-800 capitalize">{nomeMes(d.mesReferencia)}</p><p className="text-xs text-gray-400">{fmt(d.valor)}</p></div>
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                      const ns = d.status === "pago" ? "pendente" : "pago";
                      fin.atualizarStatusDAS(d.id, ns);
                      if (ns === "pago" && !fin.existeLancamentoDAS(d.mesReferencia)) {
                        fin.adicionarLancamento({ tipo: "despesa", valor: d.valor, categoria: "DAS-MEI", data: `${d.mesReferencia}-20`, descricao: `DAS ref. ${d.mesReferencia}`, arquivoId: null, recorrente: false });
                      } else if (ns === "pendente") {
                        fin.removerLancamentoDAS(d.mesReferencia);
                      }
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${d.status === "pago" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {d.status === "pago" ? "✅ Pago" : "⏳ Pendente"}</button>
                  <button onClick={() => fin.removerDAS(d.id)} className="text-gray-300 active:text-red-500 p-1"><Ic.Trash s={14}/></button>
                </div>
              </div>))}
          </div>
        </div>
      )}

      {/* Backup */}
      <div className="mt-6"><h2 className="text-lg font-semibold text-gray-900 mb-3">Backup</h2>
        {premium.isPremium ? (
          <div className="space-y-2">
            <button onClick={exportar}
              className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl text-sm font-medium active:bg-gray-50">
              <Ic.Down s={16}/> Exportar dados (JSON)</button>
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={importar}/>
            <button onClick={() => importRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl text-sm font-medium active:bg-gray-50">
              <Ic.Up s={16}/> Importar backup</button>
            {importStatus === "ok" && <p className="text-xs text-emerald-600 text-center">✅ Dados restaurados com sucesso!</p>}
            {importStatus === "erro" && <p className="text-xs text-red-500 text-center">❌ Erro ao importar. Verifique o arquivo.</p>}
          </div>
        ) : (
          <button onClick={() => premium.verificarPremium()} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-4 text-center active:bg-gray-100">
            <p className="text-sm text-gray-600">⭐ Backup e exportação de dados</p>
            <p className="text-xs text-gray-400 mt-0.5">Disponível no plano Premium</p>
          </button>
        )}
      </div>

      {/* Limpar */}
      <div className="mt-6"><h2 className="text-lg font-semibold text-gray-900 mb-3">Dados</h2>
        {!confirmarLimpar ? (
          <button onClick={() => setConfirmarLimpar(true)} className="w-full bg-white border border-red-200 text-red-500 py-3 rounded-xl text-sm font-medium active:bg-red-50">Limpar todos os dados</button>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm text-red-700 font-medium">Tem certeza?</p><p className="text-xs text-red-500 mt-1">Todos os lançamentos e registros DAS serão excluídos.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { fin.limparTudo(); setConfirmarLimpar(false); }} className="flex-1 bg-red-500 text-white py-2.5 rounded-lg text-sm font-medium">Sim, limpar</button>
              <button onClick={() => setConfirmarLimpar(false)} className="flex-1 bg-white border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm font-medium">Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* Legal */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Legal</h2>
        <div className="space-y-2">
          <a href="/privacidade.html" onClick={(e) => { e.preventDefault(); window.open("/privacidade.html", "_blank"); }}
            className="w-full flex items-center justify-between bg-white border border-gray-100 rounded-xl p-4 shadow-sm active:bg-gray-50">
            <span className="text-sm text-gray-700">Política de Privacidade</span>
            <Ic.Fwd s={14} c="#9ca3af"/>
          </a>
          <a href="/termos.html" onClick={(e) => { e.preventDefault(); window.open("/termos.html", "_blank"); }}
            className="w-full flex items-center justify-between bg-white border border-gray-100 rounded-xl p-4 shadow-sm active:bg-gray-50">
            <span className="text-sm text-gray-700">Termos de Uso</span>
            <Ic.Fwd s={14} c="#9ca3af"/>
          </a>
        </div>
      </div>

      {/* Conta */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Conta</h2>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-3">
          <p className="text-xs text-gray-400">Logado como</p>
          <p className="text-sm font-medium text-gray-800 mt-0.5">{auth.usuario?.email || "—"}</p>
        </div>
        <div className="space-y-2">
          <button onClick={() => auth.logout()}
            className="w-full bg-white border border-gray-200 text-gray-700 py-3 rounded-xl text-sm font-medium active:bg-gray-50 transition-colors">
            Sair da conta
          </button>
          <button onClick={async () => { if (confirm("Tem certeza? Isso apaga TODOS os seus dados permanentemente.")) { await auth.deletarConta(); } }}
            className="w-full bg-white border border-red-200 text-red-500 py-3 rounded-xl text-sm font-medium active:bg-red-50 transition-colors">
            Excluir minha conta e dados
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// APP
// ============================================================
// ============================================================
// ONBOARDING (primeira vez)
// ============================================================
function Onboarding({ onConcluir }) {
  const [passo, setPasso] = useState(0);
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [regime, setRegime] = useState("MEI");

  const isPF = regime === "Pessoa Física";

  const passos = [
    // Passo 0: Boas-vindas
    () => (
      <div className="flex flex-col items-center justify-center min-h-screen bg-emerald-600 text-white px-8 text-center">
        <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mb-6">
          <span className="text-4xl font-bold text-white">$</span>
        </div>
        <h1 className="text-3xl font-bold">MEI Dinheiro Verde</h1>
        <p className="text-emerald-100 mt-3 text-base leading-relaxed">Seu controle financeiro simplificado</p>
        <div className="mt-8 space-y-3 text-left w-full">
          {["Controle receitas e despesas", "Relatórios e gráficos por categoria", "Pacote organizado para o contador", "Assistente financeiro com IA"].map((t, i) => (
            <div key={i} className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3">
              <Ic.Check s={16} c="#a7f3d0"/>
              <p className="text-sm text-emerald-50">{t}</p>
            </div>
          ))}
        </div>
        <button onClick={() => setPasso(1)}
          className="mt-8 w-full bg-white text-emerald-700 py-4 rounded-xl font-semibold text-base active:bg-emerald-50 transition-colors">
          Começar
        </button>
      </div>
    ),

    // Passo 1: Perfil / Regime
    () => (
      <div className="flex flex-col justify-center min-h-screen bg-gray-50 px-8">
        <p className="text-sm text-emerald-600 font-medium">Passo 1 de {isPF ? "3" : "4"}</p>
        <h2 className="text-2xl font-bold text-gray-900 mt-2">Qual seu perfil?</h2>
        <p className="text-sm text-gray-500 mt-2">O app se adapta às suas necessidades.</p>
        <div className="mt-6 space-y-3">
          {[
            { id: "MEI", emoji: "🏪", titulo: "MEI", desc: "Microempreendedor Individual" },
            { id: "Simples Nacional", emoji: "🏢", titulo: "Simples Nacional", desc: "PJ do Simples Nacional" },
            { id: "Pessoa Física", emoji: "👤", titulo: "Pessoa Física", desc: "Controle pessoal" },
          ].map(r => (
            <button key={r.id} onClick={() => { setRegime(r.id); setPasso(2); }}
              className="w-full flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4 text-left active:bg-emerald-50 active:border-emerald-300 transition-colors">
              <span className="text-3xl">{r.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{r.titulo}</p>
                <p className="text-xs text-gray-500">{r.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    ),

    // Passo 2: Nome
    () => (
      <div className="flex flex-col justify-center min-h-screen bg-gray-50 px-8">
        <p className="text-sm text-emerald-600 font-medium">Passo 2 de {isPF ? "3" : "4"}</p>
        <h2 className="text-2xl font-bold text-gray-900 mt-2">{isPF ? "Como podemos te chamar?" : "Nome do seu negócio"}</h2>
        <p className="text-sm text-gray-500 mt-2">{isPF ? "Esse nome aparece no seu dashboard." : "Pode ser seu nome ou nome fantasia."}</p>
        <input type="text" value={nome} onChange={e => setNome(e.target.value)} autoFocus
          placeholder={isPF ? "Seu nome" : "Nome ou nome do negócio"}
          className="mt-6 w-full border border-gray-200 rounded-xl px-4 py-4 text-base bg-white outline-none focus:border-emerald-400"
          onKeyDown={e => { if (e.key === "Enter" && nome.trim()) setPasso(isPF ? 4 : 3); }}/>
        <button onClick={() => setPasso(isPF ? 4 : 3)} disabled={!nome.trim()}
          className={`mt-4 w-full py-4 rounded-xl font-semibold text-base transition-colors ${nome.trim() ? "bg-emerald-600 text-white active:bg-emerald-700" : "bg-gray-200 text-gray-400"}`}>
          Continuar
        </button>
        <button onClick={() => setPasso(isPF ? 4 : 3)} className="mt-3 text-sm text-gray-400 text-center">Pular</button>
      </div>
    ),

    // Passo 3: CNPJ (só para MEI e Simples — PF pula direto para 4)
    () => (
      <div className="flex flex-col justify-center min-h-screen bg-gray-50 px-8">
        <p className="text-sm text-emerald-600 font-medium">Passo 3 de 4</p>
        <h2 className="text-2xl font-bold text-gray-900 mt-2">Qual seu CNPJ?</h2>
        <p className="text-sm text-gray-500 mt-2">Opcional — ajuda a organizar seus dados.</p>
        <input type="text" inputMode="numeric" value={cnpj} onChange={e => setCnpj(mascaraCNPJ(e.target.value))} placeholder="00.000.000/0001-00"
          className="mt-6 w-full border border-gray-200 rounded-xl px-4 py-4 text-base bg-white outline-none focus:border-emerald-400 tracking-wide"
          onKeyDown={e => { if (e.key === "Enter") setPasso(4); }}/>
        {cnpj && cnpj.replace(/\D/g, "").length > 0 && cnpj.replace(/\D/g, "").length < 14 && (
          <p className="text-xs text-amber-500 mt-2">CNPJ precisa ter 14 dígitos. Você pode pular se preferir.</p>
        )}
        <button onClick={() => {
            const nums = cnpj.replace(/\D/g, "");
            if (nums.length > 0 && nums.length < 14) return;
            setPasso(4);
          }}
          className="mt-4 w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold text-base active:bg-emerald-700">
          Continuar
        </button>
        <button onClick={() => { setCnpj(""); setPasso(4); }} className="mt-3 text-sm text-gray-400 text-center">Pular</button>
      </div>
    ),

    // Passo 4: Pronto!
    () => (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-8 text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
          <Ic.Check s={40} c="#059669"/>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Tudo pronto, {nome || (isPF ? "você" : "MEI")}!</h2>
        <p className="text-sm text-gray-500 mt-3 leading-relaxed">
          {isPF
            ? "Agora registre seu primeiro lançamento. Acompanhe para onde vai seu dinheiro com gráficos e relatórios."
            : `Agora registre seu primeiro lançamento. Cada receita aparece no termômetro de faturamento — assim você acompanha o limite${regime === "MEI" ? " de R$ 81 mil" : ""} em tempo real.`}
        </p>

        {!isPF && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 w-full text-left">
            <p className="text-sm font-medium text-amber-800">O que é DAS-MEI?</p>
            <p className="text-xs text-amber-700 mt-1 leading-relaxed">É o boleto mensal do MEI (R$ 81,10 em 2026). Vence todo dia 20. O app te avisa quando está pendente para você não esquecer.</p>
          </div>
        )}

        <button onClick={() => onConcluir(nome, cnpj, regime)}
          className="mt-8 w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold text-base active:bg-emerald-700 transition-colors">
          Começar a usar
        </button>
      </div>
    ),
  ];

  return passos[passo]();
}

// ============================================================
// TELA DE LOGIN
// ============================================================
function TelaLogin({ auth }) {
  const [modo, setModo] = useState("login"); // login | cadastro
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  async function handleSubmit() {
    if (modo === "cadastro" && !aceitouTermos) {
      setErro("Você precisa aceitar a Política de Privacidade e os Termos de Uso para criar sua conta.");
      return;
    }
    if (modo === "cadastro") {
      if (senha.length < 8) { setErro("A senha precisa ter pelo menos 8 caracteres."); return; }
      if (!/[A-Z]/.test(senha)) { setErro("A senha precisa ter pelo menos uma letra maiúscula."); return; }
      if (!/[a-z]/.test(senha)) { setErro("A senha precisa ter pelo menos uma letra minúscula."); return; }
      if (!/[0-9]/.test(senha)) { setErro("A senha precisa ter pelo menos um número."); return; }
      if (!/[^A-Za-z0-9]/.test(senha)) { setErro("A senha precisa ter pelo menos um caractere especial (!@#$%&*)."); return; }
      const senhasFracas = ["12345678","password","senha123","teste123","qwerty12","abcd1234","abc12345","11111111","00000000"];
      if (senhasFracas.includes(senha.toLowerCase())) { setErro("Essa senha é muito comum. Escolha uma senha mais forte."); return; }
    }
    setErro(""); setEnviando(true);
    const error = modo === "login" ? await auth.login(email, senha) : await auth.cadastrar(email, senha);
    setEnviando(false);
    if (error) {
      const msgs = {
        "Invalid login credentials": "E-mail ou senha incorretos",
        "User already registered": "Este e-mail já está cadastrado",
        "Password should be at least 6 characters": "A senha precisa ter pelo menos 6 caracteres",
        "Unable to validate email address: invalid format": "Formato de e-mail inválido",
      };
      setErro(msgs[error.message] || error.message);
    } else if (modo === "cadastro") {
      setSucesso(true);
    }
  }

  if (sucesso) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4"><Ic.Check s={32} c="#059669"/></div>
        <h2 className="text-xl font-bold text-gray-900">Conta criada!</h2>
        <p className="text-sm text-gray-500 mt-3">Verifique seu e-mail para confirmar o cadastro. Depois volte aqui e faça login.</p>
        <button onClick={() => { setModo("login"); setSucesso(false); setErro(""); }}
          className="mt-6 w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold active:bg-emerald-700">Fazer login</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center min-h-screen bg-gray-50 px-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl font-bold text-white">$</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">MEI Dinheiro Verde</h1>
        <p className="text-sm text-gray-500 mt-1">{modo === "login" ? "Entre na sua conta" : "Crie sua conta gratuita"}</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-base bg-white outline-none focus:border-emerald-400"
            placeholder="seu@email.com" autoComplete="email"/>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Senha</label>
          <div className="relative">
            <input type={mostrarSenha ? "text" : "password"} value={senha} onChange={e => setSenha(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 pr-12 py-3.5 text-base bg-white outline-none focus:border-emerald-400"
              placeholder={modo === "cadastro" ? "Mín. 8 caracteres, maiúscula, especial" : "Sua senha"}
              autoComplete={modo === "login" ? "current-password" : "new-password"}
              onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}/>
            <button type="button" onClick={() => setMostrarSenha(!mostrarSenha)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600 p-1">
              {mostrarSenha ? <Ic.X s={18}/> : <Ic.Eye s={18}/>}
            </button>
          </div>
        </div>

        {erro && <p className="text-sm text-red-500 text-center bg-red-50 rounded-xl p-3">{erro}</p>}

        {modo === "cadastro" && (
          <label className="flex items-start gap-3 cursor-pointer">
            <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${aceitouTermos ? "bg-emerald-600 border-emerald-600" : "border-gray-300 bg-white"}`}
              onClick={() => setAceitouTermos(!aceitouTermos)}>
              {aceitouTermos && <Ic.Check s={12} c="white"/>}
            </div>
            <span className="text-xs text-gray-600 leading-relaxed">
              Li e aceito a <a href="/privacidade.html" onClick={(e) => { e.preventDefault(); window.open("/privacidade.html", "_blank"); }} className="text-emerald-600 underline">Política de Privacidade</a> e os <a href="/termos.html" onClick={(e) => { e.preventDefault(); window.open("/termos.html", "_blank"); }} className="text-emerald-600 underline">Termos de Uso</a>
            </span>
          </label>
        )}

        <button onClick={handleSubmit} disabled={enviando || !email || !senha || (modo === "cadastro" && !aceitouTermos)}
          className={`w-full py-4 rounded-xl font-semibold text-base transition-colors ${enviando || !email || !senha ? "bg-gray-200 text-gray-400" : "bg-emerald-600 text-white active:bg-emerald-700"}`}>
          {enviando ? "Aguarde..." : modo === "login" ? "Entrar" : "Criar conta"}
        </button>

        <div className="flex items-center gap-3 mt-4">
          <div className="flex-1 h-px bg-gray-200"/><span className="text-xs text-gray-400">ou</span><div className="flex-1 h-px bg-gray-200"/>
        </div>

        <button onClick={() => auth.loginGoogle()}
          className="mt-4 w-full flex items-center justify-center gap-3 bg-white border border-gray-200 py-3.5 rounded-xl font-medium text-sm text-gray-700 active:bg-gray-50 transition-colors">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continuar com Google
        </button>
      </div>

      <button onClick={() => { setModo(modo === "login" ? "cadastro" : "login"); setErro(""); }}
        className="mt-6 text-sm text-center text-emerald-600 font-medium">
        {modo === "login" ? "Não tem conta? Cadastre-se" : "Já tem conta? Faça login"}
      </button>

      <div className="mt-6 flex items-center justify-center gap-3 text-xs text-gray-400">
        <a href="/privacidade.html" onClick={(e) => { e.preventDefault(); window.open("/privacidade.html", "_blank"); }} className="underline">Política de Privacidade</a>
        <span>•</span>
        <a href="/termos.html" onClick={(e) => { e.preventDefault(); window.open("/termos.html", "_blank"); }} className="underline">Termos de Uso</a>
      </div>
    </div>
  );
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const auth = useAuth();
  const [pagina, setPagina] = useState("dashboard");
  const [lancParaEditar, setLancParaEditar] = useState(null);
  const [relFiltro, setRelFiltro] = useState(null);
  const [checkoutPlano, setCheckoutPlano] = useState(null);
  const fin = useFinancas(auth.usuario?.id);
  const arq = useArquivos(auth.usuario?.id);
  const nav = useMesNavegacao();
  const premium = usePremium(fin.config);

  // Tela de carregamento inicial
  if (auth.carregando) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center mb-4 animate-pulse">
          <span className="text-2xl font-bold text-white">$</span>
        </div>
        <p className="text-sm text-gray-500">Carregando...</p>
      </div>
    );
  }

  // Se não está logado, mostra tela de login
  if (!auth.usuario) {
    return <div className="max-w-md mx-auto min-h-screen"><TelaLogin auth={auth}/></div>;
  }

  // Se está logado mas ainda carregando dados
  if (fin.carregando) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4"/>
        <p className="text-sm text-gray-500">Carregando seus dados...</p>
      </div>
    );
  }

  function concluirOnboarding(nome, cnpj, regime) {
    const cats = categoriasParaRegime(regime);
    const dados = {
      onboardingCompleto: true, termosAceitosEm: new Date().toISOString(),
      regime: regime || "MEI",
      categoriasReceita: cats.receita, categoriasDespesa: cats.despesa,
    };
    if (regime === "Pessoa Física") dados.limiteAnual = 0;
    if (nome.trim()) dados.nome = nome.trim();
    if (cnpj.trim()) dados.cnpj = mascaraCNPJ(cnpj);
    fin.salvarConfig(dados);
  }

  if (!fin.config.onboardingCompleto) {
    return <div className="max-w-md mx-auto min-h-screen"><Onboarding onConcluir={concluirOnboarding}/></div>;
  }

  // Tela de aceite para usuários existentes que ainda não aceitaram
  if (!fin.config.termosAceitosEm) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 flex flex-col justify-center px-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold text-white">$</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Atualizamos nossas políticas</h1>
          <p className="text-sm text-gray-500 mt-2">Para continuar usando o Dinheiro Verde, leia e aceite nossos termos atualizados.</p>
        </div>

        <div className="space-y-3 mb-6">
          <a href="/privacidade.html" onClick={(e) => { e.preventDefault(); window.open("/privacidade.html", "_blank"); }}
            className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 active:bg-gray-50">
            <span className="text-sm text-gray-700">Política de Privacidade</span>
            <Ic.Fwd s={14} c="#059669"/>
          </a>
          <a href="/termos.html" onClick={(e) => { e.preventDefault(); window.open("/termos.html", "_blank"); }}
            className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 active:bg-gray-50">
            <span className="text-sm text-gray-700">Termos de Uso</span>
            <Ic.Fwd s={14} c="#059669"/>
          </a>
        </div>

        <button onClick={() => fin.salvarConfig({ termosAceitosEm: new Date().toISOString() })}
          className="w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold text-base active:bg-emerald-700">
          Li e aceito os termos
        </button>

        <button onClick={() => auth.logout()}
          className="mt-3 w-full text-sm text-gray-400 text-center py-2">
          Sair
        </button>
      </div>
    );
  }

  function navegar(p, dados) {
    if (p === "editar" && dados) { setLancParaEditar(dados); setPagina("editar"); }
    else if (p === "relatorios-desp") { setRelFiltro("despesa"); setPagina("relatorios"); }
    else if (p === "relatorios-rec") { setRelFiltro("receita"); setPagina("relatorios"); }
    else { setLancParaEditar(null); setRelFiltro(null); setPagina(p); }
    window.scrollTo(0, 0);
  }

  function renderPagina() {
    switch (pagina) {
      case "dashboard": return <Dashboard fin={fin} nav={nav} onNav={navegar} premium={premium}/>;
      case "lancamentos": return <Lancamentos fin={fin} arq={arq} nav={nav} onNav={navegar}/>;
      case "novo": return <NovoLancamento fin={fin} arq={arq} onVoltar={() => navegar("lancamentos")} premium={premium}/>;
      case "editar": return <NovoLancamento fin={fin} arq={arq} onVoltar={() => navegar("lancamentos")} lancamentoEditando={lancParaEditar} premium={premium}/>;
      case "wizard-das": return <WizardPagarDAS fin={fin} onVoltar={() => navegar("dashboard")} onConcluir={() => navegar("dashboard")}/>;
      case "novo-das": return <NovoLancamento fin={fin} arq={arq} onVoltar={() => navegar("dashboard")} modoInicial="das" premium={premium}/>;
      case "relatorios": return <Relatorios fin={fin} nav={nav} filtroInicial={relFiltro} arq={arq} premium={premium}/>;
      case "config": return <Configuracoes fin={fin} auth={auth} premium={premium}/>;
      case "assistente": return <AssistenteChat fin={fin} onFechar={() => navegar("dashboard")}/>;
      default: return <Dashboard fin={fin} nav={nav} onNav={navegar} premium={premium}/>;
    }
  }

  const semNav = pagina === "novo" || pagina === "novo-das" || pagina === "editar" || pagina === "assistente";
  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50">
      {renderPagina()}
      {!semNav && <BottomNav pagina={pagina} onNav={navegar}/>}
      <BannerInstalar/>
      {premium.modalAberto && <ModalPremium regime={fin.config.regime} onFechar={() => premium.setModalAberto(false)} onAssinar={(plano) => { premium.setModalAberto(false); setCheckoutPlano(plano); setPagina("checkout"); }}/>}
      {pagina === "checkout" && <div className="fixed inset-0 z-[60] bg-gray-50"><CheckoutPIX plano={checkoutPlano} userEmail={auth.usuario?.email} onVoltar={() => { setCheckoutPlano(null); setPagina("dashboard"); }} onConfirmar={() => { setCheckoutPlano(null); setPagina("dashboard"); }}/></div>}
    </div>
  );
}
