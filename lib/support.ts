export const SUPPORT_EMAIL = "contato@pilotflow.com.br";
export const SUPPORT_WHATSAPP_DISPLAY = "+55 34 9 9947-6879";
export const SUPPORT_WHATSAPP_NUMBER = "5534999476879";

export const TIP_ENCOURAGEMENT_TEXT =
  "Compartilhe dicas, ideias ou necessidades do seu dia a dia para avaliarmos no futuro. Quanto mais detalhes você enviar, maior a possibilidade de implantação no sistema.";

export const TIP_COMPLETED_DEFAULT_MESSAGE =
  "Sua dica foi atendida! Obrigado por ajudar a melhorar o PilotFlow.";

export function buildSupportWhatsappPreviewText(
  companyName?: string | null
): string {
  const cleanCompany = companyName?.trim();
  return cleanCompany
    ? `Olá! Estou no Suporte do PilotFlow (Empresa: ${cleanCompany}) e preciso de ajuda.`
    : "Olá! Estou no Suporte do PilotFlow e preciso de ajuda.";
}

export function buildSupportWhatsappUrl(companyName?: string | null): string {
  const text = buildSupportWhatsappPreviewText(companyName);
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    text
  )}`;
}
