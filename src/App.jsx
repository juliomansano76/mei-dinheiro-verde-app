import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================
// CONSTANTES
// ============================================================
const CATEGORIAS_RECEITA_PADRAO = ["Vendas", "Serviços Prestados", "Comissões", "Outros"];
const CATEGORIAS_DESPESA_PADRAO = ["Material", "Transporte", "Alimentação", "Internet / Telefone", "Aluguel", "Marketing", "Contador", "DAS - Simples Nacional", "Outros"];
const MESES_NOME = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

// ============================================================
// HOOKS
// ============================================================
function lerStorage(chave, padrao) {
  try { const d = localStorage.getItem(chave); return d ? JSON.parse(d) : padrao; } catch { return padrao; }
}
function salvarStorage(chave, dados) { localStorage.setItem(chave, JSON.stringify(dados)); }

function useFinancas() {
  const [lancamentos, setLancamentos] = useState([]);
  const [registrosDAS, setRegistrosDAS] = useState([]);
  const [config, setConfig] = useState(() => lerStorage("mei_config", {
    nome: "", cnpj: "", limiteAnual: 81000, diaDAS: 20,
    categoriasReceita: CATEGORIAS_RECEITA_PADRAO,
    categoriasDespesa: CATEGORIAS_DESPESA_PADRAO,
  }));

  useEffect(() => {
    setLancamentos(lerStorage("mei_lancamentos", []));
    setRegistrosDAS(lerStorage("mei_das", []));
  }, []);

  const adicionarLancamento = useCallback((dados) => {
    const novo = { ...dados, id: Date.now().toString() };
    setLancamentos(prev => { const a = [novo, ...prev]; salvarStorage("mei_lancamentos", a); return a; });
    return novo;
  }, []);
  const editarLancamento = useCallback((id, dados) => {
    setLancamentos(prev => { const a = prev.map(l => l.id === id ? { ...l, ...dados } : l); salvarStorage("mei_lancamentos", a); return a; });
  }, []);
  const removerLancamento = useCallback((id) => {
    setLancamentos(prev => { const a = prev.filter(l => l.id !== id); salvarStorage("mei_lancamentos", a); return a; });
  }, []);
  const adicionarDAS = useCallback((dados) => {
    const novo = { ...dados, id: Date.now().toString() };
    setRegistrosDAS(prev => { const a = [novo, ...prev]; salvarStorage("mei_das", a); return a; });
    return novo;
  }, []);
  const atualizarStatusDAS = useCallback((id, status) => {
    setRegistrosDAS(prev => { const a = prev.map(d => d.id === id ? { ...d, status } : d); salvarStorage("mei_das", a); return a; });
  }, []);
  const removerDAS = useCallback((id) => {
    setRegistrosDAS(prev => { const a = prev.filter(d => d.id !== id); salvarStorage("mei_das", a); return a; });
  }, []);
  const salvarConfig = useCallback((novaConfig) => {
    setConfig(prev => { const a = { ...prev, ...novaConfig }; salvarStorage("mei_config", a); return a; });
  }, []);
  const limparTudo = useCallback(() => {
    setLancamentos([]); setRegistrosDAS([]);
    salvarStorage("mei_lancamentos", []); salvarStorage("mei_das", []);
  }, []);

  // Funções para mês/ano específico
  function lancamentosDoMesAno(mes, ano) {
    return lancamentos.filter(l => { const d = new Date(l.data); return d.getMonth() === mes && d.getFullYear() === ano; });
  }
  function receitasDoMesAno(mes, ano) { return lancamentosDoMesAno(mes, ano).filter(l => l.tipo === "receita").reduce((s, l) => s + l.valor, 0); }
  function despesasDoMesAno(mes, ano) { return lancamentosDoMesAno(mes, ano).filter(l => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0); }

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const faturamentoAnual = lancamentos.filter(l => l.tipo === "receita" && new Date(l.data).getFullYear() === anoAtual).reduce((s, l) => s + l.valor, 0);
  const percentualFaturamento = Math.min((faturamentoAnual / config.limiteAnual) * 100, 100);

  // Despesas recorrentes: soma mensal
  const recorrentes = lancamentos.filter(l => l.recorrente && l.tipo === "despesa");
  const custoFixoMensal = (() => {
    const cats = {};
    recorrentes.forEach(l => { if (!cats[l.categoria] || l.valor > cats[l.categoria]) cats[l.categoria] = l.valor; });
    return Object.values(cats).reduce((s, v) => s + v, 0);
  })();

  // Backup
  function exportarDados() {
    return JSON.stringify({ lancamentos, registrosDAS, config, versao: 1, exportadoEm: new Date().toISOString() }, null, 2);
  }
  function importarDados(json) {
    try {
      const dados = JSON.parse(json);
      if (dados.lancamentos) { setLancamentos(dados.lancamentos); salvarStorage("mei_lancamentos", dados.lancamentos); }
      if (dados.registrosDAS) { setRegistrosDAS(dados.registrosDAS); salvarStorage("mei_das", dados.registrosDAS); }
      if (dados.config) { setConfig(dados.config); salvarStorage("mei_config", dados.config); }
      return true;
    } catch { return false; }
  }

  return {
    lancamentos, registrosDAS, config, adicionarLancamento, editarLancamento, removerLancamento,
    adicionarDAS, atualizarStatusDAS, removerDAS, salvarConfig, limparTudo,
    lancamentosDoMesAno, receitasDoMesAno, despesasDoMesAno,
    faturamentoAnual, percentualFaturamento, custoFixoMensal,
    exportarDados, importarDados, anoAtual,
  };
}

function useArquivos() {
  const [arquivos, setArquivos] = useState({});
  const salvarArquivo = useCallback((file) => {
    const id = `arq_${Date.now()}`;
    const url = URL.createObjectURL(file);
    setArquivos(prev => ({ ...prev, [id]: { id, nome: file.name, tipo: file.type, url } }));
    return id;
  }, []);
  const obterArquivo = useCallback((id) => arquivos[id] || null, [arquivos]);
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
function hojeISO() { return new Date().toISOString().split("T")[0]; }
function nomeMes(ref) { const [a, m] = ref.split("-").map(Number); return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(a, m-1, 1)); }

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
// DASHBOARD
// ============================================================
function Dashboard({ fin, nav, onNav }) {
  const lancs = fin.lancamentosDoMesAno(nav.mes, nav.ano);
  const receitas = fin.receitasDoMesAno(nav.mes, nav.ano);
  const despesas = fin.despesasDoMesAno(nav.mes, nav.ano);
  const saldo = receitas - despesas;
  const nomeDisplay = fin.config.nome || "MEI";

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

      {/* Termômetro */}
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
          <p className="text-xs text-red-500 font-medium mt-2">⚠ Atenção: próximo do limite de desenquadramento!</p>
        )}
      </div>

      {/* DAS */}
      {nav.isAtual && (
        dasEmDia ? (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
            <Ic.Check s={20} c="#059669"/>
            <div><p className="text-sm font-medium text-emerald-800">DAS em dia</p>
              <p className="text-xs text-emerald-600 mt-0.5">{dasDoMes ? `${nomeMes(dasDoMes.mesReferencia)} — ${fmt(dasDoMes.valor)}` : ""}</p></div>
          </div>
        ) : (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 cursor-pointer active:bg-amber-100" onClick={() => onNav("novo-das")}>
            <span className="text-amber-500 text-xl leading-none">⚠</span>
            <div><p className="text-sm font-medium text-amber-800">DAS pendente</p>
              <p className="text-xs text-amber-600 mt-0.5">Vence dia {fin.config.diaDAS} — Toque para registrar</p></div>
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
                          <button onClick={() => { const a = arq.obterArquivo(l.arquivoId); if (a) setPreview(a); }}
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
                    <button onClick={() => fin.removerLancamento(l.id)} className="text-gray-300 active:text-red-500 p-1"><Ic.Trash s={13}/></button>
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
function NovoLancamento({ fin, arq, onVoltar, modoInicial, lancamentoEditando }) {
  const editando = lancamentoEditando || null;
  const [modo, setModo] = useState(modoInicial || "lancamento");
  const [tipo, setTipo] = useState(editando?.tipo || "receita");
  const [valor, setValor] = useState(editando ? String(editando.valor).replace(".", ",") : "");
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
      const v = parseFloat(valor.replace(/\./g, "").replace(",", ".")) || 0;
      if (v <= 0) e.valor = "Informe um valor";
    } else { if (!dasValor || parseFloat(dasValor) <= 0) e.dasValor = "Informe o valor"; }
    setErros(e); if (Object.keys(e).length > 0) return;

    if (modo === "das") {
      const vDAS = parseFloat(dasValor) || 0;
      let arquivoId = null;
      if (dasArquivoFile) arquivoId = arq.salvarArquivo(dasArquivoFile);
      fin.adicionarDAS({ mesReferencia: dasMes, valor: vDAS, status: dasStatus, dataVencimento: `${dasMes}-20`, arquivoId });
      if (dasStatus === "pago" && vDAS > 0) fin.adicionarLancamento({ tipo: "despesa", valor: vDAS, categoria: "DAS - Simples Nacional", data: hojeISO(), descricao: `DAS ref. ${dasMes}`, arquivoId, recorrente: false });
    } else {
      const v = parseFloat(valor.replace(/\./g, "").replace(",", ".")) || 0;
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
      {!editando && <div className="flex gap-2 mt-4">
        {[{ id: "lancamento", label: "Lançamento", emoji: "💰" }, { id: "das", label: "DAS", emoji: "📋" }].map(m => (
          <button key={m.id} onClick={() => setModo(m.id)}
            className={`flex-1 py-3 rounded-xl text-center text-sm font-medium transition-all ${modo === m.id ? "bg-emerald-600 text-white shadow-md" : "bg-white border border-gray-200 text-gray-600"}`}>
            <span className="block text-lg mb-0.5">{m.emoji}</span>{m.label}</button>
        ))}
      </div>}

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
          <BotaoAnexo arquivo={dasArquivo} onAnexar={(f) => { setDasArquivo({ nome: f.name, tipo: f.type }); setDasArquivoFile(f); }} onRemover={() => { setDasArquivo(null); setDasArquivoFile(null); }}/>
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
            <input type="text" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)}
              className={`w-full border rounded-xl px-4 py-3 text-lg font-semibold bg-white ${erros.valor ? "border-red-400" : "border-gray-200"}`} placeholder="0,00"/>
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
            <div className="flex items-center gap-2"><Ic.Repeat s={16}/> Despesa recorrente (mensal)</div>
            <div className={`w-10 h-6 rounded-full transition-all flex items-center px-0.5 ${recorrente ? "bg-blue-500 justify-end" : "bg-gray-300 justify-start"}`}>
              <div className="w-5 h-5 bg-white rounded-full shadow"/>
            </div>
          </button>

          <BotaoAnexo arquivo={arquivo} onAnexar={(f) => { setArquivo({ nome: f.name, tipo: f.type }); setArquivoFile(f); }} onRemover={() => { setArquivo(null); setArquivoFile(null); }}/>
          <button onClick={salvar} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-semibold text-base active:bg-emerald-700 active:scale-[0.98] transition-all mt-2">{editando ? "Salvar alterações" : "Salvar lançamento"}</button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GRÁFICO DE PIZZA
// ============================================================
function GraficoPizza({ dados, tamanho = 180 }) {
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
  return (
    <div className="flex items-center gap-4">
      <svg width={tamanho} height={tamanho} viewBox="0 0 100 100">
        {fatias.map((f, i) => <path key={i} d={f.path} fill={f.cor} stroke="white" strokeWidth="1"/>)}
        <circle cx="50" cy="50" r="22" fill="white"/>
        <text x="50" y="48" textAnchor="middle" className="text-[8px] font-bold fill-gray-800">{fmt(total)}</text>
        <text x="50" y="57" textAnchor="middle" className="text-[5px] fill-gray-400">total</text>
      </svg>
      <div className="flex-1 space-y-1.5">{fatias.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.cor }}/>
          <span className="text-xs text-gray-600 flex-1 truncate">{f.categoria}</span>
          <span className="text-xs font-medium text-gray-800">{Math.round(f.pct*100)}%</span>
        </div>))}</div>
    </div>
  );
}

// ============================================================
// RELATÓRIOS
// ============================================================
function Relatorios({ fin, nav, filtroInicial }) {
  const [pacoteGerado, setPacoteGerado] = useState(false);
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

      {/* Projeção */}
      {nav.isAtual && (
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
      <div className="mt-4 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-3"><Ic.Send s={20} c="#059669"/><p className="text-sm font-medium text-gray-700">Pacote para o Contador</p></div>
        <p className="text-xs text-gray-500 mb-1">{lancs.length} lançamento{lancs.length !== 1 ? "s" : ""}</p>
        <p className="text-xs text-gray-500 mb-3">{comAnexo.length} comprovante{comAnexo.length !== 1 ? "s" : ""}</p>
        {pacoteGerado ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <Ic.Check s={24} c="#059669"/><p className="text-sm text-emerald-700 font-medium mt-2">Pacote gerado!</p>
            <p className="text-xs text-emerald-600 mt-1">Na versão final: PDF resumo + comprovantes via WhatsApp/e-mail</p>
          </div>
        ) : (
          <button onClick={() => { setPacoteGerado(true); setTimeout(() => setPacoteGerado(false), 3000); }}
            className="w-full bg-emerald-600 text-white py-3 rounded-xl font-medium text-sm active:bg-emerald-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
            <Ic.Send s={16} c="white"/> Gerar pacote do mês</button>
        )}
      </div>

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
function Configuracoes({ fin }) {
  const [editando, setEditando] = useState(null);
  const [valorEdit, setValorEdit] = useState("");
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const importRef = useRef(null);

  function iniciarEdicao(campo, val) { setEditando(campo); setValorEdit(val); }
  function salvarEdicao() {
    if (editando === "nome") fin.salvarConfig({ nome: valorEdit });
    else if (editando === "cnpj") fin.salvarConfig({ cnpj: valorEdit });
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

  const campos = [
    { id: "nome", rotulo: "Nome do MEI", valor: fin.config.nome || "Toque para configurar" },
    { id: "cnpj", rotulo: "CNPJ", valor: fin.config.cnpj || "00.000.000/0001-00" },
    { id: "limiteAnual", rotulo: "Limite anual", valor: fmt(fin.config.limiteAnual) },
    { id: "diaDAS", rotulo: "Dia do DAS", valor: String(fin.config.diaDAS) },
  ];
  const dasHistorico = [...fin.registrosDAS].sort((a,b) => b.mesReferencia.localeCompare(a.mesReferencia));

  return (
    <div className="px-5 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900">Ajustes</h1>

      <div className="mt-6 space-y-3">
        {campos.map(c => (
          <div key={c.id}>{editando === c.id ? (
            <div className="bg-white border-2 border-emerald-400 rounded-xl p-4 shadow-sm">
              <p className="text-xs text-emerald-600 mb-1">{c.rotulo}</p>
              <input type={c.id === "limiteAnual" || c.id === "diaDAS" ? "number" : "text"}
                value={valorEdit} onChange={e => setValorEdit(e.target.value)} autoFocus
                className="w-full text-sm font-medium text-gray-800 border-b border-gray-200 pb-1 outline-none focus:border-emerald-400"
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

      {dasHistorico.length > 0 && (
        <div className="mt-6"><h2 className="text-lg font-semibold text-gray-900 mb-3">Histórico DAS</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {dasHistorico.map((d, i) => (
              <div key={d.id} className={`flex justify-between items-center px-4 py-3 ${i < dasHistorico.length - 1 ? "border-b border-gray-50" : ""}`}>
                <div><p className="text-sm text-gray-800 capitalize">{nomeMes(d.mesReferencia)}</p><p className="text-xs text-gray-400">{fmt(d.valor)}</p></div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { const ns = d.status === "pago" ? "pendente" : "pago"; fin.atualizarStatusDAS(d.id, ns);
                    if (ns === "pago") fin.adicionarLancamento({ tipo: "despesa", valor: d.valor, categoria: "DAS - Simples Nacional", data: hojeISO(), descricao: `DAS ref. ${d.mesReferencia}`, arquivoId: null, recorrente: false }); }}
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
    </div>
  );
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const [pagina, setPagina] = useState("dashboard");
  const [lancParaEditar, setLancParaEditar] = useState(null);
  const [relFiltro, setRelFiltro] = useState(null);
  const fin = useFinancas();
  const arq = useArquivos();
  const nav = useMesNavegacao();

  function navegar(p, dados) {
    if (p === "editar" && dados) { setLancParaEditar(dados); setPagina("editar"); }
    else if (p === "relatorios-desp") { setRelFiltro("despesa"); setPagina("relatorios"); }
    else if (p === "relatorios-rec") { setRelFiltro("receita"); setPagina("relatorios"); }
    else { setLancParaEditar(null); setRelFiltro(null); setPagina(p); }
    window.scrollTo(0, 0);
  }

  function renderPagina() {
    switch (pagina) {
      case "dashboard": return <Dashboard fin={fin} nav={nav} onNav={navegar}/>;
      case "lancamentos": return <Lancamentos fin={fin} arq={arq} nav={nav} onNav={navegar}/>;
      case "novo": return <NovoLancamento fin={fin} arq={arq} onVoltar={() => navegar("lancamentos")}/>;
      case "editar": return <NovoLancamento fin={fin} arq={arq} onVoltar={() => navegar("lancamentos")} lancamentoEditando={lancParaEditar}/>;
      case "novo-das": return <NovoLancamento fin={fin} arq={arq} onVoltar={() => navegar("dashboard")} modoInicial="das"/>;
      case "relatorios": return <Relatorios fin={fin} nav={nav} filtroInicial={relFiltro}/>;
      case "config": return <Configuracoes fin={fin}/>;
      default: return <Dashboard fin={fin} nav={nav} onNav={navegar}/>;
    }
  }

  const semNav = pagina === "novo" || pagina === "novo-das" || pagina === "editar";
  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50">
      {renderPagina()}
      {!semNav && <BottomNav pagina={pagina} onNav={navegar}/>}
    </div>
  );
}
