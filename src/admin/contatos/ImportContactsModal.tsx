import { useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import Modal from '../../components/crm/Modal';
import { api } from '../../services/api';

type SheetRow = {
  nome: string;
  email: string;
  telefone: string;
  site: string;
  empresa: string;
  tipo: string;
  funil: string;
  etapa: string;
};

type ImportResult = {
  saved: number;
  skipped: number;
  errors: { linha: number; nome: string; motivo: string }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Chamado depois de importar ao menos um contato, para recarregar a lista. */
  onImported: () => void | Promise<void>;
};

const SHEET_NAME = 'IMPORTAR_CONTATOS';
const MODEL_URL = '/modelo-importacao-contatos.xlsx';

// Cabeçalho da planilha padrão → campo enviado ao servidor.
const COLUMNS: Record<string, keyof SheetRow> = {
  nome: 'nome',
  'e-mail': 'email',
  email: 'email',
  telefone: 'telefone',
  site: 'site',
  empresa: 'empresa',
  tipo: 'tipo',
  funil: 'funil',
  'etapa do funil': 'etapa',
};

const normHeader = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

async function parseSpreadsheet(file: File): Promise<SheetRow[]> {
  let table: unknown[][];
  try {
    table = (await readSheet(file, SHEET_NAME)) as unknown[][];
  } catch {
    table = (await readSheet(file)) as unknown[][]; // planilha sem a aba padrão: usa a primeira
  }
  const [header = [], ...body] = table;
  const fields = header.map((h) => COLUMNS[normHeader(h)]);
  if (!fields.includes('nome')) {
    throw new Error('Não encontrei a coluna NOME. Use a planilha padrão (link "Baixar planilha padrão").');
  }
  return body
    .map((line) => {
      const row: SheetRow = { nome: '', email: '', telefone: '', site: '', empresa: '', tipo: '', funil: '', etapa: '' };
      fields.forEach((field, i) => {
        if (field) row[field] = cell(line[i]);
      });
      return row;
    })
    .filter((row) => Object.values(row).some(Boolean));
}

const ImportContactsModal = ({ open, onClose, onImported }: Props) => {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setFileName('');
    setRows([]);
    setError('');
    setResult(null);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed = await parseSpreadsheet(file);
      if (parsed.length === 0) throw new Error('A planilha não tem nenhum contato preenchido.');
      setRows(parsed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler a planilha (use um arquivo .xlsx).');
    }
  };

  const submit = async () => {
    if (rows.length === 0 || busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await api.post<ImportResult>('/crm/contacts/import-sheet', { rows });
      setResult(data);
      setRows([]);
      if (data.saved > 0) await onImported();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível importar os contatos.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Importar contatos por planilha"
      description="Envie a planilha padrão (.xlsx). Cada contato entra no funil e na etapa indicados nela."
      onClose={close}
    >
      <div className="crm-form" style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--vesk-muted)', lineHeight: 1.5 }}>
          Colunas: NOME, E-MAIL, TELEFONE, SITE, EMPRESA, TIPO (Lead, Cliente ou Prospect), FUNIL e ETAPA DO FUNIL.
          Só o nome é obrigatório; funil e etapa vazios usam o funil padrão e a primeira etapa. Contatos com telefone
          já cadastrado são ignorados.{' '}
          <a href={MODEL_URL} download="modelo-importacao-contatos.xlsx">
            Baixar planilha padrão
          </a>
        </div>

        {!result ? (
          <div className="crm-field">
            <label htmlFor="import_file">Planilha</label>
            <input
              id="import_file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={busy}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="integration-hint scrape-status scrape-status-ok">
            <i className="ti ti-file-spreadsheet" aria-hidden="true" />
            <span>
              {fileName}: {rows.length} contato(s) pronto(s) para importar.
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="integration-hint scrape-status scrape-status-error">
            <i className="ti ti-alert-circle" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {result ? (
          <div className="integration-hint scrape-status scrape-status-ok" style={{ display: 'block' }}>
            <div>
              {result.saved} contato(s) importado(s)
              {result.skipped > 0 ? ` · ${result.skipped} ignorado(s) (já cadastrados)` : ''}
              {result.errors.length > 0 ? ` · ${result.errors.length} com problema` : ''}.
            </div>
            {result.errors.length > 0 ? (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, maxHeight: 160, overflow: 'auto', fontSize: 12 }}>
                {result.errors.map((e) => (
                  <li key={`${e.linha}-${e.nome}`}>
                    Linha {e.linha} ({e.nome}): {e.motivo}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="crm-form-actions">
          <button type="button" className="crm-btn-secondary" onClick={close} disabled={busy}>
            {result ? 'Fechar' : 'Cancelar'}
          </button>
          {!result ? (
            <button
              type="button"
              className="crm-btn-primary"
              style={{ marginLeft: 'auto' }}
              disabled={rows.length === 0 || busy}
              onClick={() => void submit()}
            >
              {busy ? 'Importando…' : `Importar ${rows.length || ''} contatos`.trim()}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
};

export default ImportContactsModal;
