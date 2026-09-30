import { useEffect, useState } from 'react';
import { api } from '../../services/api';

export type TeamMember = { id: number; name: string };

/** Integrantes do workspace (para escolher o responsável de uma atividade). Disponível para todos os usuários. */
export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<TeamMember[]>('/whatsapp/team-members')
      .then((list) => {
        if (!cancelled) setMembers(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return members;
}
