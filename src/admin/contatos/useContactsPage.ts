import { useEffect, useState } from 'react';
import type { Contact } from '../../contexts/CrmDataContext';
import { api } from '../../services/api';
import { PAGE_SIZE, type ContactTab } from './types';

type Options = {
  query: string;
  tab: ContactTab;
  onlyUnowned: boolean;
  /** Muda quando um contato é criado, editado, excluído ou atribuído: recarrega a página atual. */
  refreshKey: unknown;
};

/**
 * Lista de contatos paginada no servidor: a busca (com espera de 300 ms após digitar), o filtro por tipo e
 * "sem responsável" são aplicados no banco.
 */
export function useContactsPage({ query, tab, onlyUnowned, refreshKey }: Options) {
  const [page, setPage] = useState(1);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [unownedTotal, setUnownedTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Mudou a busca ou um filtro: volta para a primeira página.
  useEffect(() => {
    setPage(1);
  }, [tab, debouncedQuery, onlyUnowned]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (tab !== 'Todos') params.set('tipo', tab);
    if (onlyUnowned) params.set('unowned', '1');
    api
      .get<{ items: Contact[]; total: number; unownedTotal?: number }>(`/crm/contacts?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        // A última página ficou vazia (ex.: contatos excluídos): volta para a última que existe.
        if (data.items.length === 0 && page > 1 && data.total > 0) {
          setPage(Math.ceil(data.total / PAGE_SIZE));
          return;
        }
        setItems(
          data.items.map((c) => ({
            ...c,
            id: String((c as { id: unknown }).id),
            empresaId: c.empresaId ? String(c.empresaId) : undefined,
          }))
        );
        setTotal(data.total);
        if (data.unownedTotal !== undefined) setUnownedTotal(data.unownedTotal);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, debouncedQuery, tab, onlyUnowned, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return { items, total, unownedTotal, page, setPage, totalPages, loading, debouncedQuery };
}
