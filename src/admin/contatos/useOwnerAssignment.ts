import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { TeamMember } from './types';

/** Seleção de contatos e atribuição de responsável em massa (somente administradores). */
export function useOwnerAssignment(isAdmin: boolean, onAssigned: () => Promise<void>) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignTarget, setAssignTarget] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    void api
      .get<TeamMember[]>('/users')
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [isAdmin]);

  const ownerName = (ownerId?: number | null) =>
    ownerId ? members.find((m) => m.id === Number(ownerId))?.name ?? `Usuário #${ownerId}` : null;

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = (ids: string[]) => setSelectedIds(new Set(ids));
  // Estável: a tela a usa como dependência de um efeito que limpa a seleção quando os filtros mudam.
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const assignSelected = async () => {
    if (!assignTarget || selectedIds.size === 0) return;
    setAssigning(true);
    setAssignError('');
    try {
      await api.put('/crm/contacts/assign-owner', {
        ids: [...selectedIds].map(Number),
        userId: assignTarget === 'none' ? null : Number(assignTarget),
      });
      setSelectedIds(new Set());
      setAssignTarget('');
      await onAssigned();
    } catch (err: unknown) {
      setAssignError(err instanceof Error ? err.message : 'Não foi possível atribuir os contatos');
    } finally {
      setAssigning(false);
    }
  };

  return {
    members,
    selectedIds,
    toggleSelected,
    selectAll,
    clearSelection,
    assignTarget,
    setAssignTarget,
    assigning,
    assignError,
    assignSelected,
    ownerName,
  };
}
