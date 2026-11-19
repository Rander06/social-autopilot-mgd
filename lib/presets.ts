export interface LuminousThemePreset {
  id: string;
  name: string;
  description: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  bg_color: string;
  text_color: string;
}

export const LUMINOUS_THEME_PRESETS: LuminousThemePreset[] = [
  {
    id: "luminoso-tech",
    name: "Luminoso Tech & Agência",
    description: "Índigo vibrante, ciano luminoso e esmeralda sobre fundo cristal.",
    primary_color: "#4F46E5",
    secondary_color: "#06B6D4",
    accent_color: "#10B981",
    bg_color: "#F8FAFC",
    text_color: "#0F172A",
  },
  {
    id: "moda-clean",
    name: "Moda & Varejo Clean",
    description: "Branco puro luminoso com rosa coral e detalhes em esmeralda.",
    primary_color: "#EC4899",
    secondary_color: "#F43F5E",
    accent_color: "#10B981",
    bg_color: "#FFFFFF",
    text_color: "#0F172A",
  },
  {
    id: "solar-eventos",
    name: "Solar & Lazer Vibrante",
    description: "Azul turquesa luminoso com âmbar solar e verde vivo.",
    primary_color: "#0284C7",
    secondary_color: "#F59E0B",
    accent_color: "#10B981",
    bg_color: "#F8FAFC",
    text_color: "#0F172A",
  },
  {
    id: "saude-mint",
    name: "Saúde, Estética & Clínicas",
    description: "Ciano suave, verde esmeralda e base ultra limpa.",
    primary_color: "#0891B2",
    secondary_color: "#14B8A6",
    accent_color: "#059669",
    bg_color: "#F0FDFA",
    text_color: "#0F172A",
  },
  {
    id: "neon-criativo",
    name: "Violeta Criativo",
    description: "Violeta elétrico, azul céu e verde neon sobre branco gelo.",
    primary_color: "#7C3AED",
    secondary_color: "#0EA5E9",
    accent_color: "#10B981",
    bg_color: "#F5F3FF",
    text_color: "#1E1B4B",
  },
  {
    id: "personalizado",
    name: "Personalizado da Marca",
    description: "Escolha livremente suas próprias cores abaixo.",
    primary_color: "#4F46E5",
    secondary_color: "#06B6D4",
    accent_color: "#10B981",
    bg_color: "#F8FAFC",
    text_color: "#0F172A",
  },
];

export const AI_PHOTO_PROMPT_EXAMPLES: Array<{
  label: string;
  prompt: string;
}> = [
  {
    label: "Na mão de uma pessoa",
    prompt:
      "Colocar o produto na mão de uma pessoa em ambiente moderno e iluminado",
  },
  {
    label: "Modelo em estúdio",
    prompt: "Modelo usando o produto em cenário elegante de estúdio",
  },
  {
    label: "Bancada profissional",
    prompt:
      "Produto sobre bancada premium com iluminação fotográfica profissional",
  },
  {
    label: "Foto original + moldura",
    prompt:
      "Usar foto original apenas aplicando moldura e layout publicitário da marca",
  },
];

export interface NicheTopicTemplate {
  id: string;
  label: string;
  title: string;
  offer_price: string;
  benefits: string[];
  prompt_instructions: string;
  ai_photo_prompt: string;
}

export const NICHE_TOPIC_TEMPLATES: NicheTopicTemplate[] = [
  {
    id: "chacaras-saloes",
    label: "Sites p/ Chácaras & Salões (12x R$149,90)",
    title: "Sites para Chácaras, Ranchos e Salões de Festas",
    offer_price: "12x de R$149,90",
    benefits: [
      "Simulador de Orçamento em Tempo Real",
      "Calendário Online de Disponibilidade",
      "PIX com Baixa Automática (0% Taxa)",
      "Contrato Digital em PDF Automático",
      "IA no WhatsApp 24h (Você assume quando quiser)",
    ],
    prompt_instructions:
      'Venda sites completos para donos de chácaras, ranchos, casas de temporada e salões de festas pelo valor de 12x de R$149,90, sem taxas por reserva. Nunca cite nomes de clientes como "Espaço Lazer". Destaque o fim de curiosos, fechamento no PIX automático, contrato em PDF e atendimento com IA no WhatsApp onde o dono assume quando quiser.',
    ai_photo_prompt:
      "Usar foto original apenas aplicando moldura e layout publicitário da marca",
  },
  {
    id: "criacao-sites",
    label: "Agência: Criação de Sites Variados",
    title: "Criação de Sites Profissionais e Landing Pages",
    offer_price: "Sob medida • Parcelamento em 12x",
    benefits: [
      "Design moderno e rápido para celular",
      "Integração direta com WhatsApp e Pixel Meta",
      "Estrutura otimizada para aparecer no Google",
      "Domínio próprio e certificado SSL inclusos",
    ],
    prompt_instructions:
      "Crie um post vendendo criação de sites profissionais, institucionais e landing pages de alta conversão para empresas locais, clínicas, prestadores de serviço e comércios. Mostre que quem não tem site profissional perde credibilidade e vendas no Google e nos anúncios.",
    ai_photo_prompt:
      "Produto sobre bancada premium com iluminação fotográfica profissional",
  },
  {
    id: "trafego-pago",
    label: "Agência: Tráfego Pago (Meta & Google Ads)",
    title: "Gestão de Tráfego Pago & Anúncios",
    offer_price: "Planos Mensais para Empresas",
    benefits: [
      "Campanhas no Instagram, Facebook e Google",
      "Segmentação para clientes da sua região",
      "Otimização semanal de ROI e custo por lead",
      "Relatórios claros direto no WhatsApp",
    ],
    prompt_instructions:
      "Crie um post educativo e persuasivo vendendo gestão profissional de tráfego pago (Meta Ads e Google Ads). Ataque a dor de empresários que clicam em 'Impulsionar' sem estratégia e perdem dinheiro com curiosos. Convide a comentar 'EU QUERO' para receber diagnóstico.",
    ai_photo_prompt:
      "Usar foto original apenas aplicando moldura e layout publicitário da marca",
  },
  {
    id: "redes-sociais-ia",
    label: "Agência: Redes Sociais & Automação IA",
    title: "Gestão de Redes Sociais & Automação com IA",
    offer_price: "Presença Digital Completa",
    benefits: [
      "Conteúdos estratégicos que geram autoridade",
      "Calendário editorial consistente toda semana",
      "Atendimento automatizado com IA no WhatsApp",
      "Foco em transformar seguidores em clientes",
    ],
    prompt_instructions:
      "Crie um post vendendo gestão estratégica de redes sociais combinada com automação de atendimento com IA para empresas que não têm tempo de postar todo dia nem de responder dezenas de mensagens manualmente.",
    ai_photo_prompt:
      "Usar foto original apenas aplicando moldura e layout publicitário da marca",
  },
  {
    id: "calcados",
    label: "Loja: Calçados",
    title: "Calçados Confortáveis & Lançamentos",
    offer_price: "Até 6x sem juros • Envio para todo Brasil",
    benefits: [
      "Acabamento premium e conforto o dia todo",
      "Numeração completa disponível em estoque",
      "Troca fácil garantida e atendimento rápido",
      "Desconto especial pagando no PIX",
    ],
    prompt_instructions:
      "Crie um post desejável para loja de calçados destacando conforto, estilo, versatilidade para o dia a dia ou eventos, e convidando a comentar 'EU QUERO' ou chamar no WhatsApp para garantir o tamanho antes que acabe.",
    ai_photo_prompt:
      "Colocar o produto na mão de uma pessoa em ambiente moderno e iluminado",
  },
  {
    id: "roupas-intimas",
    label: "Loja: Roupas Íntimas / Lingerie",
    title: "Moda Íntima & Lingerie Exclusiva",
    offer_price: "Kits promocionais • Entrega discreta",
    benefits: [
      "Tecido macio que não marca na roupa",
      "Modelagem anatômica com sustentação perfeita",
      "Cores clássicas e novidades da coleção",
      "Atendimento reservado pelo WhatsApp",
    ],
    prompt_instructions:
      "Crie um post elegante, respeitoso e envolvente para loja de roupas íntimas / lingerie, destacando conforto extremo, autoestima, caimento perfeito e qualidade do tecido. CTA convidando a comentar 'EU QUERO' ou clicar no link da bio.",
    ai_photo_prompt:
      "Modelo usando o produto em cenário elegante de estúdio",
  },
  {
    id: "calca-jeans",
    label: "Loja: Calças Jeans",
    title: "Calças Jeans Premium com Caimento Perfeito",
    offer_price: "10% OFF no PIX • Tamanhos 34 ao 48",
    benefits: [
      "Jeans com elastano que modela sem apertar",
      "Lavagens modernas que não desbotam fácil",
      "Cintura perfeita e costura reforçada",
      "Combina com looks casuais ou sociais",
    ],
    prompt_instructions:
      "Crie um post focado na venda de calças jeans destacando caimento impecável, conforto do elastano, durabilidade e facilidade de combinar no dia a dia ou à noite.",
    ai_photo_prompt:
      "Modelo usando o produto em cenário elegante de estúdio",
  },
];

export const WEEKDAY_LABELS = [
  { value: 0, short: "Dom", full: "Domingo" },
  { value: 1, short: "Seg", full: "Segunda" },
  { value: 2, short: "Ter", full: "Terça" },
  { value: 3, short: "Qua", full: "Quarta" },
  { value: 4, short: "Qui", full: "Quinta" },
  { value: 5, short: "Sex", full: "Sexta" },
  { value: 6, short: "Sáb", full: "Sábado" },
];

export const SCHEDULE_TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let hour = 7; hour <= 23; hour++) {
    const hh = String(hour).padStart(2, "0");
    slots.push(`${hh}:00`);
    slots.push(`${hh}:30`);
  }
  return slots;
})();
