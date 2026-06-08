import { useState } from 'react';
import CrmLayout from '../components/crm/CrmLayout';
import { api } from '../services/api';

type ScrapeResult = {
  nome: string;
  telefone: string;
  site: string;
  endereco?: string;
};

const Scraping = () => {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(30);
  const [headless, setHeadless] = useState(true);
  const [onlyWithPhone, setOnlyWithPhone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<ScrapeResult[]>([]);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStatus('');
    setLoading(true);
    setResults([]);

    try {
      const data = await api.post<{ total: number; results: ScrapeResult[]; source?: string }>(
        '/scraping/maps',
        {
          query: query.trim(),
          limit: Number(limit) || 30,
          headless,
          onlyWithPhone,
        }
      );
      setResults(data.results || []);
      const via = data.source === 'python-playwright' ? ' (scraper Python)' : '';
      setStatus(`Concluído: ${data.total} empresa(s)${via}.`);
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
                max={60}
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
        <div className="crm-card-header" style={{ marginBottom: 12 }}>
          <i className="ti ti-list" style={{ color: 'var(--vesk-orange)', fontSize: 16 }} aria-hidden="true" />
          <div className="crm-card-title">Resultados</div>
          {results.length > 0 ? <span className="pipeline-badge">{results.length}</span> : null}
        </div>

        {results.length === 0 ? (
          <div className="kanban-empty">
            {loading ? 'Aguarde, o Chrome está coletando empresas no Maps…' : 'Nenhum resultado ainda. Execute uma busca acima.'}
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
