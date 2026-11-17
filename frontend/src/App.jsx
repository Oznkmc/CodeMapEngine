import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Position,
  ReactFlowProvider,
  useNodesState,
  useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';

const API_URL = 'http://127.0.0.1:8000/api/analyze';
const TIMEOUT_MS = 120000; // Büyük repolar için 2 dakika

/* ------------------------------------------------------------------ */
/*  Görsel kimlik                                                      */
/* ------------------------------------------------------------------ */
const INK = '#14202E';
const CANVAS = '#EDF0F3';
const BLAST_COLOR = '#D1432B';

const KINDS = {
  file: { label: 'Dosya', color: '#1F6F78', bg: '#E3F1F2' },
  class: { label: 'Sınıf', color: '#5A4BB5', bg: '#ECE9F8' },
  function: { label: 'Fonksiyon', color: '#B2740F', bg: '#FBF0DA' },
  unknown: { label: 'Tanımsız', color: '#6B7683', bg: '#EEF0F3' },
  focus: { label: 'Odak düğüm', color: BLAST_COLOR, bg: BLAST_COLOR }
};

const RELATIONS = {
  calls: { label: 'çağırır', color: '#3E6FD8' },
  contains: { label: 'içerir', color: '#9AA5B4' },
  has_method: { label: 'metodu', color: '#9AA5B4' },
  imports_file: { label: 'içe aktarır', color: '#1F8A8F' },
  renders_component: { label: 'bileşeni çizer', color: '#A24FC9' },
  uses: { label: 'kullanır', color: '#6B7683' }
};
const FALLBACK_RELATION = { label: '', color: '#6B7683' };
const LEGEND_RELATIONS = ['calls', 'contains', 'imports_file', 'renders_component'];

const RING_SELECTED = '0 0 0 5px rgba(209, 67, 43, 0.3)';
const RING_AFFECTED = '0 0 0 3px rgba(209, 67, 43, 0.18)';

const NODE_W = 230;
const COL_W = 330;
const ROW_H = 92;
const MAX_CHIPS = 8;

const FILE_RE = /\.(jsx?|py)$/;

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;700&display=swap');

.cm-root { position: relative; width: 100vw; height: 100vh; background: ${CANVAS};
  font-family: 'Schibsted Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif; color: ${INK}; }

.cm-panel { position: absolute; z-index: 10; top: 12px; left: 12px; width: min(680px, calc(100% - 24px));
  background: #fff; border: 1px solid #D5DBE2; border-radius: 14px; padding: 16px 18px;
  box-shadow: 0 8px 24px rgba(20, 32, 46, 0.08); }
.cm-panel h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
.cm-panel p.cm-sub { margin: 2px 0 14px; font-size: 14px; color: #52606F; line-height: 1.4; }

.cm-form { display: flex; flex-wrap: wrap; gap: 8px; }
.cm-input { flex: 1 1 220px; min-width: 0; padding: 10px 12px; font: inherit; font-size: 14px; color: ${INK};
  background: #F6F8FA; border: 1px solid #CBD3DC; border-radius: 8px; }
.cm-input.cm-input-sm { flex: 0 1 200px; }
.cm-input::placeholder { color: #7D8A98; }
.cm-input:focus-visible, .cm-btn:focus-visible, .cm-check input:focus-visible, .cm-close:focus-visible {
  outline: 3px solid #8FB1F2; outline-offset: 1px; }

.cm-btn { padding: 10px 18px; font: inherit; font-size: 14px; font-weight: 700; color: #fff; background: ${INK};
  border: 0; border-radius: 8px; cursor: pointer; }
.cm-btn:hover:not(:disabled) { background: #22364B; }
.cm-btn:disabled { opacity: 0.6; cursor: progress; }

.cm-error { margin-top: 12px; padding: 10px 12px; font-size: 14px; line-height: 1.4; color: #8A2412;
  background: #FCEBE7; border-left: 4px solid ${BLAST_COLOR}; border-radius: 6px; }

.cm-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px;
  margin-top: 12px; padding-top: 12px; border-top: 1px solid #E3E8ED; font-size: 13px; color: #52606F; }
.cm-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }

.cm-legend { position: absolute; z-index: 10; top: 12px; right: 12px; background: #fff; border: 1px solid #D5DBE2;
  border-radius: 14px; padding: 12px 14px; font-size: 13px; box-shadow: 0 8px 24px rgba(20, 32, 46, 0.08); }
.cm-legend h2 { margin: 0 0 8px; font-size: 13px; font-weight: 700; }
.cm-legend h2:not(:first-child) { margin-top: 12px; }
.cm-legend-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; color: #3A4756; }
.cm-swatch { width: 14px; height: 14px; border-radius: 4px; flex: none; }
.cm-line { width: 22px; height: 0; border-top: 3px solid; flex: none; border-radius: 2px; }

.cm-detail { position: absolute; z-index: 10; bottom: 16px; left: 50%; transform: translateX(-50%);
  width: min(560px, calc(100% - 24px)); background: #fff; border: 1px solid #D5DBE2; border-radius: 14px;
  padding: 14px 44px 14px 16px; box-shadow: 0 8px 24px rgba(20, 32, 46, 0.14); }
.cm-detail-name { font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
.cm-detail-path { margin-top: 1px; font-size: 13px; color: #6B7683; overflow-wrap: anywhere; }
.cm-detail p { margin: 10px 0 0; font-size: 14px; line-height: 1.45; color: #2B3846; }
.cm-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.cm-chip { max-width: 100%; padding: 3px 9px; font-size: 12px; color: #8A2412; background: #FCEBE7;
  border-radius: 999px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-chip.cm-chip-more { color: #52606F; background: #E9EDF1; }
.cm-close { position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; font-size: 20px; line-height: 1;
  color: #52606F; background: transparent; border: 0; border-radius: 8px; cursor: pointer; }
.cm-close:hover { background: #EDF0F3; }

.cm-empty { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
  padding: 24px; pointer-events: none; }
.cm-empty div { max-width: 460px; text-align: center; color: #52606F; font-size: 15px; line-height: 1.55; }
.cm-empty strong { display: block; margin-bottom: 6px; font-size: 18px; color: ${INK}; }

.cm-loading { position: absolute; inset: 0; z-index: 20; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 14px; background: rgba(237, 240, 243, 0.86); font-size: 17px; }
.cm-spinner { width: 34px; height: 34px; border: 4px solid #C5CED8; border-top-color: ${INK}; border-radius: 50%;
  animation: cm-spin 0.9s linear infinite; }
@keyframes cm-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .cm-spinner { animation-duration: 2.4s; } }

.cm-name { font-size: 14px; font-weight: 700; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cm-meta { margin-top: 2px; font-size: 12px; line-height: 1.2; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.react-flow__node { cursor: pointer; transition: opacity 0.15s; }
.react-flow__controls { box-shadow: 0 4px 14px rgba(20, 32, 46, 0.1); border-radius: 10px; overflow: hidden; }
.react-flow__minimap { border-radius: 10px; border: 1px solid #D5DBE2; overflow: hidden; }

@media (max-width: 760px) { .cm-legend, .react-flow__minimap { display: none; } }
`;

/* ------------------------------------------------------------------ */
/*  Yardımcı fonksiyonlar                                              */
/* ------------------------------------------------------------------ */
function kindOf(id, type) {
  if (type === 'file' || FILE_RE.test(id)) return 'file';
  if (type === 'class') return 'class';
  if (type === 'function') return 'function';
  return 'unknown';
}

function splitPath(id) {
  const i = id.lastIndexOf('/');
  return i >= 0 ? { name: id.slice(i + 1), dir: id.slice(0, i) } : { name: id, dir: '' };
}

/**
 * Katmanlı yerleşim: çağıran/içe aktaran düğümler solda, etkilenenler sağda.
 * Döngülere karşı güvenli (Kahn algoritması; döngüdekiler son sütuna gider).
 */
function computeLayout(ids, links) {
  const out = new Map(ids.map((id) => [id, []]));
  const incoming = new Map(ids.map((id) => [id, []]));
  const remaining = new Map(ids.map((id) => [id, 0]));

  links.forEach(([s, t]) => {
    if (s === t || !out.has(s) || !out.has(t)) return;
    out.get(s).push(t);
    incoming.get(t).push(s);
    remaining.set(t, remaining.get(t) + 1);
  });

  // Hiç bağlantı yoksa düz bir ızgara
  if (links.length === 0) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
    const pos = new Map();
    ids.forEach((id, i) =>
      pos.set(id, { x: (i % cols) * (NODE_W + 40), y: Math.floor(i / cols) * ROW_H })
    );
    return pos;
  }

  const depth = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => remaining.get(id) === 0);
  const done = new Set();
  let head = 0;

  while (head < queue.length) {
    const u = queue[head++];
    done.add(u);
    for (const v of out.get(u)) {
      depth.set(v, Math.max(depth.get(v), depth.get(u) + 1));
      remaining.set(v, remaining.get(v) - 1);
      if (remaining.get(v) === 0) queue.push(v);
    }
  }

  let maxDepth = 0;
  depth.forEach((d) => {
    if (d > maxDepth) maxDepth = d;
  });
  if (done.size !== ids.length) {
    maxDepth += 1;
    ids.forEach((id) => {
      if (!done.has(id)) depth.set(id, maxDepth);
    });
  }

  const columns = Array.from({ length: maxDepth + 1 }, () => []);
  ids.forEach((id) => columns[depth.get(id)].push(id));

  // Sütun içi sıralama: ebeveynlerin ortalama satırına göre (çizgi kesişimlerini azaltır)
  const row = new Map();
  columns.forEach((col, d) => {
    if (d === 0) {
      col.sort((a, b) => a.localeCompare(b));
    } else {
      const keys = new Map(
        col.map((id) => {
          const rows = incoming.get(id).filter((p) => row.has(p)).map((p) => row.get(p));
          return [id, rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : Infinity];
        })
      );
      col.sort((a, b) => keys.get(a) - keys.get(b) || a.localeCompare(b));
    }
    col.forEach((id, i) => row.set(id, i));
  });

  let longest = 0;
  columns.forEach((c) => {
    if (c.length > longest) longest = c.length;
  });

  const pos = new Map();
  columns.forEach((col, d) => {
    const offset = ((longest - col.length) * ROW_H) / 2; // sütunları dikeyde ortala
    col.forEach((id, i) => pos.set(id, { x: d * COL_W, y: offset + i * ROW_H }));
  });
  return pos;
}

function buildNodeLabel(id, kind, isFocus) {
  const { name, dir } = splitPath(id);
  const meta = isFocus ? 'Odak düğüm' : kind === 'file' ? dir || 'Dosya' : KINDS[kind].label;
  return (
    <div title={id}>
      <div className="cm-name">{name}</div>
      <div className="cm-meta">{meta}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ana bileşen                                                        */
/* ------------------------------------------------------------------ */
function Flow() {
  const { fitView } = useReactFlow();
  // fitView'u ref'te tutuyoruz: efekt bağımlılığına girip gereksiz yeniden çalışmasın
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges] = useState([]);
  const [graph, setGraph] = useState(null); // { nodeMap, edgeList, focusId }
  const [selectedId, setSelectedId] = useState(null);
  const [showIsolated, setShowIsolated] = useState(false);

  const [repoUrl, setRepoUrl] = useState('');
  const [targetNode, setTargetNode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyzeClick = async () => {
    if (loading) return;
    if (!repoUrl.trim()) {
      setError('Lütfen bir GitHub repo adresi girin.');
      return;
    }

    setLoading(true);
    setError('');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_url: repoUrl.trim(),
          target_node: targetNode.trim()
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || `API Hatası: ${response.status}`);
      }

      const data = await response.json();
      const graphData = data.graph_data;

      if (!graphData || !Array.isArray(graphData.node_list)) {
        throw new Error(data.message || 'graph_data bulunamadı veya biçimi hatalı.');
      }

      const edgeList = Array.isArray(graphData.edge_list) ? graphData.edge_list : [];

      // networkx, add_edge ile eklenen düğümlere node_type vermez; eksikleri kenarlardan tamamlıyoruz.
      const nodeMap = new Map();
      graphData.node_list.forEach(([id, attrs]) => {
        nodeMap.set(String(id), attrs?.node_type ?? 'unknown');
      });
      edgeList.forEach(([source, target]) => {
        if (!nodeMap.has(String(source))) nodeMap.set(String(source), 'unknown');
        if (!nodeMap.has(String(target))) nodeMap.set(String(target), 'unknown');
      });

      setSelectedId(null);
      setGraph({ nodeMap, edgeList, focusId: targetNode.trim() });
    } catch (err) {
      console.error('Analiz hatası:', err);

      if (err.name === 'AbortError') {
        setError(`İstek ${TIMEOUT_MS / 1000} saniye içinde tamamlanmadı.`);
      } else if (err instanceof TypeError) {
        // fetch ağ/CORS hatalarında TypeError fırlatır
        setError('Sunucuya ulaşılamadı. Backend çalışıyor mu ve CORS izni var mı?');
      } else {
        setError(err.message || 'Bir hata oluştu.');
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  // Ham grafikten ekrandaki düğüm ve kenarları üret
  useEffect(() => {
    if (!graph) {
      setNodes([]);
      setEdges([]);
      return undefined;
    }

    const { nodeMap, edgeList, focusId } = graph;

    const degree = new Map();
    edgeList.forEach(([s, t]) => {
      degree.set(String(s), (degree.get(String(s)) || 0) + 1);
      degree.set(String(t), (degree.get(String(t)) || 0) + 1);
    });

    let ids = Array.from(nodeMap.keys());
    const hasConnected = ids.some((id) => degree.get(id) > 0);
    if (!showIsolated && hasConnected) {
      ids = ids.filter((id) => degree.get(id) > 0 || id === focusId);
    }
    const idSet = new Set(ids);

    const seen = new Set();
    const links = [];
    const flowEdges = [];
    edgeList.forEach(([source, target, attrs]) => {
      const s = String(source);
      const t = String(target);
      const relation = attrs?.relation_type ?? 'uses';
      const key = `${s}|${t}|${relation}`;
      if (!idSet.has(s) || !idSet.has(t) || seen.has(key)) return;
      seen.add(key);
      links.push([s, t]);
      flowEdges.push({ id: `e-${key}`, source: s, target: t, type: 'smoothstep', data: { relation } });
    });

    const positions = computeLayout(ids, links);

    const flowNodes = ids.map((id) => {
      const isFocus = id === focusId;
      const baseKind = kindOf(id, nodeMap.get(id));
      const kind = isFocus ? 'focus' : baseKind;
      const k = KINDS[kind];
      return {
        id,
        position: positions.get(id) || { x: 0, y: 0 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { kind, baseKind, label: buildNodeLabel(id, baseKind, isFocus) },
        style: {
          width: NODE_W,
          padding: '9px 12px',
          textAlign: 'left',
          borderRadius: 10,
          borderStyle: 'solid',
          borderWidth: '1px 1px 1px 6px',
          borderColor: k.color,
          background: k.bg,
          color: isFocus ? '#fff' : INK,
          boxShadow: isFocus ? RING_SELECTED : '0 1px 2px rgba(20, 32, 46, 0.1)'
        }
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);

    const timer = setTimeout(() => fitViewRef.current({ padding: 0.2, duration: 500 }), 60);
    return () => clearTimeout(timer);
  }, [graph, showIsolated, setNodes]);

  // Esc tuşu seçimi kaldırır
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setSelectedId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Etki alanı: seçili düğümü kullanan (yani ondan etkilenen) tüm yapılar
  const blast = useMemo(() => {
    if (!selectedId) return null;

    const callers = new Map();
    edges.forEach((e) => {
      if (!callers.has(e.target)) callers.set(e.target, []);
      callers.get(e.target).push(e.source);
    });

    const affected = new Set();
    const stack = [selectedId];
    while (stack.length) {
      const current = stack.pop();
      (callers.get(current) || []).forEach((source) => {
        if (source !== selectedId && !affected.has(source)) {
          affected.add(source);
          stack.push(source);
        }
      });
    }
    return { affected };
  }, [edges, selectedId]);

  // Vurgulama: konumlara dokunmadan sadece stil değişir
  const view = useMemo(() => {
    const styledNodes = nodes.map((n) => {
      if (!blast) return n;
      if (n.id === selectedId) return { ...n, style: { ...n.style, boxShadow: RING_SELECTED } };
      if (blast.affected.has(n.id)) return { ...n, style: { ...n.style, boxShadow: RING_AFFECTED } };
      return { ...n, style: { ...n.style, opacity: 0.25 } };
    });

    const styledEdges = edges.map((e) => {
      const rel = RELATIONS[e.data.relation] || FALLBACK_RELATION;
      const hot = !!blast && (e.target === selectedId || blast.affected.has(e.target));
      const touching = e.source === selectedId || e.target === selectedId;
      const color = hot ? BLAST_COLOR : rel.color;
      return {
        ...e,
        label: touching ? rel.label : undefined,
        labelStyle: { fontSize: 12, fontWeight: 500, fill: INK },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.95 },
        labelBgPadding: [6, 3],
        labelBgBorderRadius: 4,
        zIndex: hot ? 10 : 0,
        style: {
          stroke: color,
          strokeWidth: hot ? 2.4 : 1.5,
          opacity: !blast || hot ? 1 : 0.1
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
      };
    });

    return { styledNodes, styledEdges };
  }, [nodes, edges, selectedId, blast]);

  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const hiddenCount = graph ? graph.nodeMap.size - nodes.length : 0;

  const affectedNames = blast ? Array.from(blast.affected).map((id) => splitPath(id).name) : [];

  return (
    <div className="cm-root">
      <style>{CSS}</style>

      {/* Üst panel */}
      <div className="cm-panel">
        <h1>CodeMap</h1>
        <p className="cm-sub">Bir kod parçasını değiştirirseniz hangi yapıların etkileneceğini görün.</p>

        <div className="cm-form">
          <input
            className="cm-input"
            type="text"
            aria-label="GitHub repo adresi"
            placeholder="GitHub repo adresi"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeClick()}
          />
          <input
            className="cm-input cm-input-sm"
            type="text"
            aria-label="Odak düğüm"
            placeholder="Odak düğüm (örn. APIRouter)"
            value={targetNode}
            onChange={(e) => setTargetNode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyzeClick()}
          />
          <button className="cm-btn" onClick={handleAnalyzeClick} disabled={loading}>
            {loading ? 'Analiz ediliyor…' : 'Etki analizi yap'}
          </button>
        </div>

        {error && (
          <div className="cm-error" role="alert">
            {error}
          </div>
        )}

        {graph && nodes.length > 0 && (
          <div className="cm-tools">
            <span>
              {nodes.length} düğüm, {edges.length} bağlantı gösteriliyor
              {hiddenCount > 0 ? ` (${hiddenCount} bağlantısız düğüm gizli)` : ''}
            </span>
            <label className="cm-check">
              <input
                type="checkbox"
                checked={showIsolated}
                onChange={(e) => setShowIsolated(e.target.checked)}
              />
              Bağlantısız düğümleri göster
            </label>
          </div>
        )}
      </div>

      {/* Gösterge */}
      <div className="cm-legend" aria-label="Gösterge">
        <h2>Düğümler</h2>
        {['file', 'class', 'function', 'focus'].map((k) => (
          <div className="cm-legend-row" key={k}>
            <span className="cm-swatch" style={{ background: KINDS[k].color }} />
            {KINDS[k].label}
          </div>
        ))}
        <h2>Bağlantılar</h2>
        {LEGEND_RELATIONS.map((r) => (
          <div className="cm-legend-row" key={r}>
            <span className="cm-line" style={{ borderColor: RELATIONS[r].color }} />
            {RELATIONS[r].label}
          </div>
        ))}
        <div className="cm-legend-row">
          <span className="cm-line" style={{ borderColor: BLAST_COLOR }} />
          etkilenen yol
        </div>
      </div>

      {/* Seçili düğümün etki özeti */}
      {selectedNode && blast && (
        <div className="cm-detail" role="region" aria-label="Seçili düğüm">
          <button className="cm-close" aria-label="Seçimi kaldır" onClick={() => setSelectedId(null)}>
            ×
          </button>
          <div className="cm-detail-name">{splitPath(selectedNode.id).name}</div>
          <div className="cm-detail-path">
            {splitPath(selectedNode.id).dir || KINDS[selectedNode.data.baseKind].label}
          </div>
          <p>
            {affectedNames.length === 0
              ? 'Bu düğümü başka hiçbir yapı kullanmıyor; değiştirmek başka bir yeri etkilemez.'
              : `Bunu değiştirirseniz ${affectedNames.length} yapı etkilenir.`}
          </p>
          {affectedNames.length > 0 && (
            <div className="cm-chips">
              {affectedNames.slice(0, MAX_CHIPS).map((name, i) => (
                <span className="cm-chip" key={`${name}-${i}`}>
                  {name}
                </span>
              ))}
              {affectedNames.length > MAX_CHIPS && (
                <span className="cm-chip cm-chip-more">+{affectedNames.length - MAX_CHIPS} daha</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Boş durum */}
      {!graph && !loading && (
        <div className="cm-empty">
          <div>
            <strong>Henüz bir harita yok</strong>
            Bir GitHub repo adresi girin. Odak düğümü boş bırakırsanız tüm yapı, doluysa yalnızca o düğümden
            etkilenen yapılar gösterilir. Haritada bir düğüme tıklarsanız, onu değiştirmenin neleri
            etkileyeceği anında öne çıkar.
          </div>
        </div>
      )}

      {/* Harita */}
      <ReactFlow
        nodes={view.styledNodes}
        edges={view.styledEdges}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => setSelectedId((cur) => (cur === node.id ? null : node.id))}
        onPaneClick={() => setSelectedId(null)}
        nodesConnectable={false}
        onlyRenderVisibleElements
        minZoom={0.05}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" gap={18} size={1.4} color="#C3CCD6" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => KINDS[n.data?.kind]?.color || '#9AA5B4'}
          maskColor="rgba(237, 240, 243, 0.7)"
        />
      </ReactFlow>

      {/* Yükleme katmanı: haritayı kaldırmadan üstüne biner */}
      {loading && (
        <div className="cm-loading" role="status">
          <div className="cm-spinner" />
          Repo indiriliyor ve analiz ediliyor, lütfen bekleyin…
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}