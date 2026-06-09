export type WaMessageTemplate = {
  id: string;
  title: string;
  body: string;
};

export const WA_MESSAGE_TEMPLATES: WaMessageTemplate[] = [
  {
    id: 'welcome',
    title: 'Boas-vindas',
    body: 'Olá! Tudo bem? Como posso ajudar você hoje?',
  },
  {
    id: 'intro',
    title: 'Apresentação',
    body: 'Olá! Sou da equipe VESK e estou entrando em contato. Podemos conversar agora?',
  },
  {
    id: 'followup',
    title: 'Retorno de contato',
    body: 'Olá! Estou retornando o contato conforme combinado. Fico à disposição para ajudar.',
  },
  {
    id: 'proposal',
    title: 'Proposta comercial',
    body: 'Olá! Gostaria de apresentar uma proposta para você. Posso enviar os detalhes por aqui?',
  },
  {
    id: 'meeting',
    title: 'Agendar reunião',
    body: 'Olá! Gostaria de agendar uma conversa rápida. Qual horário funciona melhor para você?',
  },
];
