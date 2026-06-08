import { useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import { useCrmData, type PipelineStage } from '../contexts/CrmDataContext';
import { api } from '../services/api';
import { stageToContactEtapa } from '../utils/crmStage';

type ScrapeResult = {
  nome: string;
  telefone: string;
  site: string;
  endereco?: string;
};

type StartResponse = {
  mode?: 'async' | 'sync';
  jobId?: string;
  status?: string;
  total?: number;
  results?: ScrapeResult[];
  source?: string;
  message?: string;
};

type JobStatus = {
  status: 'running' | 'done' | 'error';
  total?: number;
  results?: ScrapeResult[];
  source?: string;
  message?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizePhone = (phone: string) => {
  const value = (phone || '').trim();
  return value === '—' || value === '-' ? '' : value;
};

const Scraping = () => {
  const { refreshCrmData, pipelines, activePipelineId, stages } = useCrmData();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(10);
  const [headless, setHeadless] = useState(true);
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingContacts, setSavingContacts] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<ScrapeResult[]>([]);

  const defaultPipelineId = activePipelineId ?? pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? '';

  const resolveFirstStage = async (): Promise<{ pipelineId: string; stage: PipelineStage }> => {
    if (!defaultPipelineId) {
      throw new Error('Nenhum funil configurado. Crie um funil antes de salvar contatos.');
    }

    let pipelineStages = stages.filter((s) => s.pipelineId === defaultPipelineId);
    if (pipelineStages.length === 0) {
      const rows = await api.get<Array<{ id: number; pipelineId: number; stageKey: string; titulo: string; cor: string; pos: number }>>(
        `/crm/pipelines/${defaultPipelineId}/stages`
      );
      pipelineStages = rows.map((s) => ({
        id: String(s.id),
        pipelineId: String(s.pipelineId),
        stageKey: String(s.stageKey),
        titulo: s.titulo,
        cor: s.cor,
        pos: s.pos,
      }));
    }

    const firstStage = [...pipelineStages].sort((a, b) => a.pos - b.pos)[0];
    if (!firstStage) {
      throw new Error('O funil não possui etapas. Configure etapas no pipeline antes de salvar.');
    }

    return { pipelineId: defaultPipelineId, stage: firstStage };
  };

  const saveResultsToContacts = async () => {
    if (results.length === 0 || savingContacts) return;

    setSavingContacts(true);
    setError('');

    try {
      const { pipelineId, stage } = await resolveFirstStage();
      const etapa = stageToContactEtapa(stage.stageKey, stage.titulo);

      const items = results
        .map((row) => {
          const nome = row.nome.trim();
          if (!nome) return null;

          return {
            nome,
            telefone: normalizePhone(row.telefone),
            site: (row.site || '').trim(),
            etapa,
            ultimaInteracao: 'Google Maps',
          };
        })
        .filter(Boolean);

      if (items.length === 0) {
        setStatus('Nenhum contato válido para salvar.');
        return;
      }

      const data = await api.post<{ saved: number; skipped: number }>('/crm/contacts/bulk-import', {
        pipelineId,
        stageKey: stage.stageKey,
        etapa,
        items,
      });

      await refreshCrmData();

      if (data.saved === 0) {
        setStatus(
          data.skipped > 0
            ? 'Nenhum contato novo para salvar (todos já existiam ou estavam vazios).'
            : 'Nenhum contato foi salvo.'
        );
      } else {
        setStatus(
          `${data.saved} contato(s) salvo(s) em Contatos${data.skipped > 0 ? ` · ${data.skipped} ignorado(s) (duplicados ou vazios)` : ''}.`
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar os contatos.');
    } finally {
      setSavingContacts(false);
    }
  };

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);
    setResults([]);

    try {
      const started = await api.post<StartResponse>('/scraping/maps/start', {
        query: query.trim(),
        limit: Number(limit) || 10,
        headless,
        onlyWithPhone,
      });

      if (started.mode === 'sync' || started.status === 'done') {
        setResults(started.results || []);
        const via = started.source === 'python-playwright' ? ' (scraper Python)' : '';
        setStatus(`Concluído: ${started.total ?? started.results?.length ?? 0} empresa(s)${via}.`);
        return;
      }

      setStatus('Buscando no Google Maps… pode levar 1–3 min (serviço acordando no Render).');

      const jobId = started.jobId;
      if (!jobId) throw new Error('Não foi possível iniciar a busca.');

      for (let attempt = 0; attempt < 120; attempt += 1) {
        await sleep(3000);
        const job = await api.get<JobStatus>(`/scraping/maps/status/${jobId}`);

        if (job.status === 'running') {
          setStatus(`Coletando empresas… (${Math.floor((attempt + 1) * 3 / 60)} min)`);
          continue;
        }

        if (job.status === 'error') {
          throw new Error(job.message || 'Erro ao executar busca');
        }

        setResults(job.results || []);
        const via = job.source === 'python-playwright' ? ' (scraper Python)' : '';
        setStatus(`Concluído: ${job.total ?? job.results?.length ?? 0} empresa(s)${via}.`);
        return;
      }

      throw new Error('A busca excedeu o tempo limite. Tente com menos resultados.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao executar busca');
    } finally {
      setLoading(false);
    }
  };

  const showPythonSetup =
    error.includes('MAPS_SCRAPER_URL') ||
    error.includes('Scraper Python') ||
    error.includes('Python não encontrado') ||
    error.includes('Playwright');

  return (
    <CrmLayout>
      <div className="crm-page-header">
        <div>
          <div className="crm-page-title">Google Maps Scraping</div>
          <div style={{ fontSize: 12, color: 'var(--vesk-muted)', marginTop: 2 }}>
            Busque empresas e visualize nome, telefone e site em uma tabela — gratuito via Python + Playwright
          </div>
        </div>
      </div>

      <div className="crm-card scrape-search-card">
        <form className="scrape-search-form" onSubmit={(e) => void runSearch(e)}>
          <div className="scrape-search-fields">
            <div className="crm-field scrape-field-query">
              <label htmlFor="scrape_query">Termo de busca</label>
              <input
                id="scrape_query"
                type="text"
                required
                placeholder="Ex.: dentistas em Curitiba"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="crm-field scrape-field-limit">
              <label htmlFor="scrape_limit">Quantidade</label>
              <input
                id="scrape_limit"
                type="number"
                min={1}
                max={30}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                disabled={loading}
              />
            </div>
          </div>

          <div className="scrape-search-actions">
            <button type="submit" className="crm-btn-primary scrape-run-btn" disabled={loading}>
              <i className="ti ti-search" aria-hidden="true" />
              {loading ? 'Buscando…' : 'Rodar busca'}
            </button>
            <label className="crm-checkbox-label scrape-headless">
              <input
                type="checkbox"
                checked={headless}
                onChange={(e) => setHeadless(e.target.checked)}
                disabled={loading}
              />
              Rodar sem abrir janela do Chrome
            </label>
            <label className="crm-checkbox-label scrape-headless">
              <input
                type="checkbox"
                checked={onlyWithPhone}
                onChange={(e) => setOnlyWithPhone(e.target.checked)}
                disabled={loading}
              />
              Somente com telefone
            </label>
          </div>

          {error ? (
            <div className="integration-hint scrape-status scrape-status-error">
              <i className="ti ti-alert-circle" aria-hidden="true" />
              <div>
                <span>{error}</span>
                {showPythonSetup ? (
                  <ol className="scrape-setup-steps">
                    <li>
                      Instale Python 3.10+ e no terminal do projeto execute:
                      <br />
                      <code>pip install -r scraper/requirements.txt</code>
                      <br />
                      <code>playwright install chromium</code>
                    </li>
                    <li>
                      Inicie o serviço scraper:
                      <br />
                      <code>npm run scraper</code>
                    </li>
                    <li>
                      No <code>server/.env</code> (ou Vercel) adicione:
                      <br />
                      <code>MAPS_SCRAPER_URL=http://localhost:8765</code>
                    </li>
                    <li>Reinicie o servidor da API e rode a busca novamente.</li>
                  </ol>
                ) : null}
              </div>
            </div>
          ) : null}

          {status && !error ? (
            <div className="integration-hint scrape-status scrape-status-ok">
              <i className="ti ti-check" aria-hidden="true" />
              <span>{status}</span>
            </div>
          ) : null}

          <p className="scrape-api-hint">
            Motor gratuito: <strong>Python + Playwright</strong> (sem API paga do Google). Em produção na Vercel,
            hospede o serviço em <code>scraper/</code> (Railway, Render, VPS) e configure{' '}
            <code>MAPS_SCRAPER_URL</code>.
          </p>
        </form>
      </div>

      <div className="crm-card scrape-results-card">
        <div className="crm-card-header scrape-results-header">
          <i className="ti ti-list" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
          <div className="crm-card-title">Resultados</div>
          {results.length > 0 ? <span className="pipeline-badge">{results.length}</span> : null}
          {results.length > 0 ? (
            <button
              type="button"
              className="crm-btn-primary scrape-save-contacts-btn"
              disabled={savingContacts || loading}
              onClick={() => void saveResultsToContacts()}
            >
              <i className="ti ti-user-plus" aria-hidden="true" />
              {savingContacts ? 'Salvando…' : 'Salvar em contatos'}
            </button>
          ) : null}
        </div>

        {results.length === 0 ? (
          <div className="kanban-empty">
            {loading ? 'Aguarde, coletando empresas no Maps (pode levar alguns minutos)…' : 'Nenhum resultado ainda. Execute uma busca acima.'}
          </div>
        ) : (
          <div className="scrape-table-wrap">
            <table className="crm-table scrape-table" aria-label="Resultados do Google Maps">
              <thead>
                <tr>
                  <th className="scrape-col-num">#</th>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Site</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row, index) => (
                  <tr key={`${row.nome}-${index}`}>
                    <td className="scrape-col-num">{index + 1}</td>
                    <td>
                      <div className="scrape-name">{row.nome}</div>
                      {row.endereco ? <div className="scrape-address">{row.endereco}</div> : null}
                    </td>
                    <td>{row.telefone || '—'}</td>
                    <td>
                      {row.site ? (
                        <a href={row.site} target="_blank" rel="noopener noreferrer" className="scrape-site-link">
                          {row.site.replace(/^https?:\/\//, '').slice(0, 48)}
                          {row.site.length > 56 ? '…' : ''}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CrmLayout>
  );
};

export default Scraping;
