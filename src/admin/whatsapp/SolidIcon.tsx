// Ícones preenchidos embutidos: o CSS "filled" do Tabler substitui a fonte de todos os ícones, então não pode ser importado junto.
export const SolidIcon = ({ path }: { path: string }) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
    <path d={path} />
  </svg>
);
export const PATH_PLAY = 'M6 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 6 4.5z';
export const PATH_PAUSE = 'M7 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm7 0h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z';
export const PATH_MIC =
  'M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4zm-7 9a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 0 1 2 0 7 7 0 0 1-6 6.92V21a1 1 0 0 1-2 0v-3.08A7 7 0 0 1 5 11z';
export const PATH_ALERT =
  'M12 2.5c.7 0 1.4.4 1.8 1l8.1 14a2.1 2.1 0 0 1-1.8 3.1H3.9a2.1 2.1 0 0 1-1.8-3.1l8.1-14c.4-.6 1.1-1 1.8-1zM12 8a1 1 0 0 0-1 1v4a1 1 0 0 0 2 0V9a1 1 0 0 0-1-1zm0 8a1.2 1.2 0 1 0 0 2.4A1.2 1.2 0 0 0 12 16z';
